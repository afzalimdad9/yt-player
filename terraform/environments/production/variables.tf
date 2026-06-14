variable "environment" {
  description = "Environment name (e.g., production, staging)"
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "AWS region for primary resources"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones to use"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (one per AZ)"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]
}

variable "isolated_subnet_cidrs" {
  description = "CIDR blocks for isolated subnets (one per AZ, for RDS/Redis)"
  type        = list(string)
  default     = ["10.0.20.0/24", "10.0.21.0/24", "10.0.22.0/24"]
}

variable "domain_name" {
  description = "Primary domain name for the application"
  type        = string
  default     = "ytplayer.example.com"
}

variable "api_subdomain" {
  description = "Subdomain for the API"
  type        = string
  default     = "api"
}

variable "frontend_subdomain" {
  description = "Subdomain for the frontend"
  type        = string
  default     = "www"
}

variable "rds_instance_class" {
  description = "RDS instance type"
  type        = string
  default     = "db.r6g.large"
}

variable "rds_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 100
}

variable "rds_max_allocated_storage" {
  description = "RDS maximum autoscaling storage in GB"
  type        = number
  default     = 500
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = true
}

variable "rds_backup_retention_days" {
  description = "RDS backup retention period in days"
  type        = number
  default     = 30
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r6g.large"
}

variable "redis_num_cache_nodes" {
  description = "Number of Redis cache nodes"
  type        = number
  default     = 1
}

variable "redis_engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.1"
}

variable "ecs_api_cpu" {
  description = "CPU units for API ECS task"
  type        = number
  default     = 1024
}

variable "ecs_api_memory" {
  description = "Memory in MB for API ECS task"
  type        = number
  default     = 2048
}

variable "ecs_api_desired_count" {
  description = "Desired count for API ECS service"
  type        = number
  default     = 2
}

variable "ecs_api_max_count" {
  description = "Maximum count for API auto-scaling"
  type        = number
  default     = 6
}

variable "ecs_worker_cpu" {
  description = "CPU units for Worker ECS task"
  type        = number
  default     = 4096
}

variable "ecs_worker_memory" {
  description = "Memory in MB for Worker ECS task"
  type        = number
  default     = 8192
}

variable "ecs_worker_desired_count" {
  description = "Desired count for Worker ECS service"
  type        = number
  default     = 2
}

variable "ecs_worker_max_count" {
  description = "Maximum count for Worker auto-scaling"
  type        = number
  default     = 10
}

variable "ecs_frontend_cpu" {
  description = "CPU units for Frontend ECS task (if using ECS instead of S3)"
  type        = number
  default     = 512
}

variable "ecs_frontend_memory" {
  description = "Memory in MB for Frontend ECS task"
  type        = number
  default     = 1024
}

variable "vlm_api_key_secret_arn" {
  description = "ARN of the VLM API key secret in Secrets Manager (for audio descriptions)"
  type        = string
  default     = ""
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for deployment notifications"
  type        = string
  default     = ""
  sensitive   = true
}

variable "whisper_model" {
  description = "Whisper model to use for caption generation"
  type        = string
  default     = "base"
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "enable_cdn" {
  description = "Enable CloudFront CDN for video streaming"
  type        = bool
  default     = true
}

variable "enable_vpc_endpoints" {
  description = "Enable VPC Endpoints for S3 and ECR/Docker"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 90
}

variable "database_username" {
  description = "Master username for RDS PostgreSQL"
  type        = string
  default     = "ytplayer_admin"
}
