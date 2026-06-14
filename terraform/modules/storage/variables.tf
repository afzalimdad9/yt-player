variable "environment" { type = string }
variable "allowed_origins" { type = list(string); default = ["*"] }
variable "enable_versioning" { type = bool; default = true }
variable "glacier_transition_days" { type = number; default = 90 }
variable "video_expiration_days" { type = number; default = 0 }
variable "force_destroy_videos" { type = bool; default = false }
variable "force_destroy_frontend" { type = bool; default = true }
variable "cloudfront_oai_arn" { type = string; default = "" }
