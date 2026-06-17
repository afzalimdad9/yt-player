# =============================================================================
# YT Player — Production Environment Variables
# =============================================================================
# Override these values with your specific configuration:
#   terraform apply -var-file=terraform.tfvars -var="domain_name=ytplayer.example.com"
# =============================================================================

environment  = "production"
aws_region   = "us-east-1"

domain_name       = "ytplayer.example.com"
api_subdomain     = "api"
frontend_subdomain = "www"

# Networking
vpc_cidr            = "10.0.0.0/16"
availability_zones  = ["us-east-1a", "us-east-1b", "us-east-1c"]
public_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]
isolated_subnet_cidrs = ["10.0.20.0/24", "10.0.21.0/24", "10.0.22.0/24"]

# Database (RDS)
rds_instance_class        = "db.r6g.large"
rds_allocated_storage     = 100
rds_max_allocated_storage = 500
rds_multi_az              = true
rds_backup_retention_days = 30
database_username         = "ytplayer_admin"

# Cache (Redis)
redis_node_type     = "cache.r6g.large"
redis_num_cache_nodes = 1
redis_engine_version  = "7.1"

# ECS API Service
ecs_api_cpu           = 1024
ecs_api_memory        = 2048
ecs_api_desired_count = 2
ecs_api_max_count     = 6

# ECS Worker Service
ecs_worker_cpu           = 4096
ecs_worker_memory        = 8192
ecs_worker_desired_count = 2
ecs_worker_max_count     = 10

# Container Images (set via CI/CD or command line)
# api_image    = "ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/yt-player/api:latest"
# worker_image = "ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/yt-player/worker:latest"

# Image tag (overridden by CI/CD with git SHA)
image_tag = "latest"

# Features
enable_cdn         = true
enable_vpc_endpoints = true

# Monitoring
alert_email          = "ops@example.com"
log_retention_days   = 90

# Whisper model for captions
whisper_model = "base"

# VLM API key for AI audio descriptions (leave empty to disable)
# vlm_api_key_secret_arn = "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:..."
