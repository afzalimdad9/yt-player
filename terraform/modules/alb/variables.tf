variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "security_group_id" { type = string }
variable "certificate_arn" { type = string }
variable "api_container_port" { type = number; default = 4000 }
variable "api_health_check_path" { type = string; default = "/api/health" }
variable "idle_timeout" { type = number; default = 60 }
variable "deploy_frontend_ecs" { type = bool; default = false }
variable "enable_waf" { type = bool; default = true }
variable "enable_deletion_protection" { type = bool; default = true }
variable "rate_limit_requests" { type = number; default = 2000 }
variable "alarm_5xx_threshold" { type = number; default = 50 }
variable "alarm_sns_topic_arns" { type = list(string); default = [] }
