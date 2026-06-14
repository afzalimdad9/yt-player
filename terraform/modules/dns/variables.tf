variable "zone_name" { type = string }
variable "alb_dns_name" { type = string }
variable "alb_zone_id" { type = string }
variable "api_subdomain" { type = string; default = "api" }
variable "frontend_subdomain" { type = string; default = "www" }
variable "deploy_frontend_cdn" { type = bool; default = true }
variable "frontend_cdn_domain_name" { type = string; default = "" }
variable "frontend_cdn_zone_id" { type = string; default = "" }
variable "video_cdn_domain_name" { type = string; default = "" }
variable "video_cdn_zone_id" { type = string; default = "" }
variable "cert_validation_records" { type = map(object({ name = string, type = string, record = string })); default = {} }
