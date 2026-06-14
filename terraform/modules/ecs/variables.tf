variable "environment" { type = string }
variable "aws_region" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "api_security_group_id" { type = string }
variable "worker_security_group_id" { type = string }
variable "execution_role_arn" { type = string }
variable "task_role_arn" { type = string }
variable "api_target_group_arn" { type = string }
variable "api_target_group_arn_suffix" { type = string }
variable "alb_arn_suffix" { type = string }
variable "database_connection_secret_arn" { type = string }
variable "redis_connection_secret_arn" { type = string }
variable "video_storage_bucket" { type = string }
variable "api_cors_origin" { type = string; default = "https://ytplayer.example.com" }

# Container images
variable "api_image" { type = string }
variable "worker_image" { type = string }

# API sizing
variable "api_cpu" { type = number; default = 1024 }
variable "api_memory" { type = number; default = 2048 }
variable "api_desired_count" { type = number; default = 2 }
variable "api_min_count" { type = number; default = 2 }
variable "api_max_count" { type = number; default = 6 }

# Worker sizing
variable "worker_cpu" { type = number; default = 4096 }
variable "worker_memory" { type = number; default = 8192 }
variable "worker_desired_count" { type = number; default = 2 }
variable "worker_min_count" { type = number; default = 2 }
variable "worker_max_count" { type = number; default = 10 }

# Config
variable "whisper_model" { type = string; default = "base" }
variable "description_provider" { type = string; default = "openai" }
variable "log_retention_days" { type = number; default = 90 }
