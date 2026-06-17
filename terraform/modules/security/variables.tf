variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "vpc_cidr" { type = string; default = null }
variable "deploy_frontend_ecs" { type = bool; default = false }
