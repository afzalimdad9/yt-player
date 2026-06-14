# =============================================================================
# YT Player — Production Environment
# =============================================================================
# This is the root module that instantiates all sub-modules to create the
# full production infrastructure for YT Player:
#   - Networking (VPC, subnets, NAT, VPC endpoints)
#   - Security groups
#   - IAM roles and policies
#   - RDS PostgreSQL database
#   - ElastiCache Redis for BullMQ
#   - S3 buckets for video storage and frontend hosting
#   - Secrets Manager for configuration
#   - Application Load Balancer with WAF
#   - ECS Fargate services (API + Worker + Migration)
#   - CloudWatch monitoring and alerts
#   - CloudFront CDN for video and frontend
#   - Route53 DNS records
# =============================================================================

# =============================================================================
# Networking
# =============================================================================
module "networking" {
  source = "../../modules/networking"

  environment         = var.environment
  aws_region          = var.aws_region
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  public_subnet_cidrs = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  isolated_subnet_cidrs = var.isolated_subnet_cidrs

  single_nat_gateway     = true
  enable_vpc_endpoints   = var.enable_vpc_endpoints
  enable_flow_logs       = false
  log_retention_days     = var.log_retention_days
}

# =============================================================================
# Security Groups
# =============================================================================
module "security" {
  source = "../../modules/security"

  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  vpc_cidr           = module.networking.vpc_cidr
  deploy_frontend_ecs = false
}

# =============================================================================
# IAM Roles and Policies
# =============================================================================
module "iam" {
  source = "../../modules/iam"

  environment    = var.environment
  s3_bucket_arn  = module.storage.video_storage_bucket_arn
  enable_xray    = false
}

# =============================================================================
# ACM Certificate (us-east-1 for CloudFront)
# =============================================================================
resource "aws_acm_certificate" "main" {
  provider = aws.us_east_1

  domain_name       = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "${var.environment}-yt-player-cert" }
}

# =============================================================================
# S3 Storage (videos + frontend)
# =============================================================================
module "storage" {
  source = "../../modules/storage"

  environment           = var.environment
  allowed_origins       = ["https://${var.domain_name}"]
  enable_versioning     = true
  glacier_transition_days = 90
  force_destroy_videos  = false
  force_destroy_frontend = true
  cloudfront_oai_arn    = module.cdn.oai_arn
}

# =============================================================================
# Secrets Manager
# =============================================================================
module "secrets" {
  source = "../../modules/secrets"

  environment           = var.environment
  ecs_execution_role_arn = module.iam.ecs_execution_role_arn
  vlm_api_key           = var.vlm_api_key_secret_arn
  api_cors_origin       = "https://${var.domain_name}"
}

# =============================================================================
# RDS PostgreSQL
# =============================================================================
module "database" {
  source = "../../modules/database"

  environment          = var.environment
  isolated_subnet_ids  = module.networking.isolated_subnet_ids
  security_group_id    = module.security.rds_sg_id
  master_username      = var.database_username
  instance_class       = var.rds_instance_class
  allocated_storage    = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  multi_az             = var.rds_multi_az
  backup_retention_days = var.rds_backup_retention_days
  create_read_replica  = true
}

# =============================================================================
# ElastiCache Redis
# =============================================================================
module "redis" {
  source = "../../modules/redis"

  environment         = var.environment
  isolated_subnet_ids = module.networking.isolated_subnet_ids
  security_group_id   = module.security.redis_sg_id
  node_type           = var.redis_node_type
  num_cache_nodes     = var.redis_num_cache_nodes
  engine_version      = var.redis_engine_version
}

# =============================================================================
# Application Load Balancer
# =============================================================================
module "alb" {
  source = "../../modules/alb"

  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  public_subnet_ids  = module.networking.public_subnet_ids
  security_group_id  = module.security.alb_sg_id
  certificate_arn    = aws_acm_certificate.main.arn

  deploy_frontend_ecs = false
  enable_waf          = true
  rate_limit_requests = 2000
}

# =============================================================================
# ECS Fargate Services
# =============================================================================
module "ecs" {
  source = "../../modules/ecs"

  environment        = var.environment
  aws_region         = var.aws_region
  private_subnet_ids = module.networking.private_subnet_ids
  api_security_group_id   = module.security.api_sg_id
  worker_security_group_id = module.security.worker_sg_id

  execution_role_arn = module.iam.ecs_execution_role_arn
  task_role_arn      = module.iam.ecs_task_role_arn

  api_target_group_arn       = module.alb.api_target_group_arn
  api_target_group_arn_suffix = module.alb.api_target_group_arn_suffix
  alb_arn_suffix              = module.alb.alb_arn_suffix

  database_connection_secret_arn = module.database.db_connection_secret_arn
  redis_connection_secret_arn    = module.redis.connection_secret_arn
  video_storage_bucket           = module.storage.video_storage_bucket_id

  # Container images (override via terraform.tfvars or CI/CD)
  api_image    = var.api_image
  worker_image = var.worker_image

  api_cpu              = var.ecs_api_cpu
  api_memory           = var.ecs_api_memory
  api_desired_count    = var.ecs_api_desired_count
  api_max_count        = var.ecs_api_max_count

  worker_cpu           = var.ecs_worker_cpu
  worker_memory        = var.ecs_worker_memory
  worker_desired_count = var.ecs_worker_desired_count
  worker_max_count     = var.ecs_worker_max_count

  whisper_model          = var.whisper_model
  description_provider   = "openai"
  log_retention_days     = var.log_retention_days
}

# =============================================================================
# CloudFront CDN
# =============================================================================
module "cdn" {
  source = "../../modules/cdn"

  environment        = var.environment
  s3_bucket_domain   = module.storage.video_storage_bucket_domain
  frontend_bucket_website_endpoint = module.storage.frontend_bucket_website_endpoint
  certificate_arn    = aws_acm_certificate.main.arn
  domain_names       = ["cdn.${var.domain_name}", var.domain_name]
  price_class        = "PriceClass_All"
  deploy_frontend_cdn = true
}

# =============================================================================
# DNS Records (includes ACM validation records)
# =============================================================================
module "dns" {
  source = "../../modules/dns"

  zone_name                 = var.domain_name
  api_subdomain             = var.api_subdomain
  frontend_subdomain        = var.frontend_subdomain

  alb_dns_name   = module.alb.alb_dns_name
  alb_zone_id    = module.alb.alb_zone_id

  deploy_frontend_cdn       = true
  frontend_cdn_domain_name  = module.cdn.frontend_distribution_domain
  frontend_cdn_zone_id      = "Z2FDTNDATAQYW2"  # CloudFront global zone ID

  video_cdn_domain_name     = module.cdn.video_distribution_domain
  video_cdn_zone_id         = "Z2FDTNDATAQYW2"  # CloudFront global zone ID

  cert_validation_records = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }
}

# Wait for certificate validation before using ALB/CloudFront
resource "aws_acm_certificate_validation" "main" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = module.dns.cert_validation_fqdns
}

# =============================================================================
# Monitoring
# =============================================================================
module "monitoring" {
  source = "../../modules/monitoring"

  environment          = var.environment
  aws_region           = var.aws_region
  rds_instance_id      = module.database.db_instance_id
  worker_log_group_name = module.ecs.worker_log_group_name
  alert_email          = var.alert_email
  enable_cost_monitor  = false
}


