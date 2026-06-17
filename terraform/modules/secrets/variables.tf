variable "environment" { type = string }
variable "ecs_execution_role_arn" { type = string }
variable "vlm_api_key" { type = string; default = "" }
variable "api_cors_origin" { type = string; default = "https://ytplayer.example.com" }
