variable "environment" { type = string }
variable "s3_bucket_domain" { type = string }
variable "frontend_bucket_website_endpoint" { type = string; default = "" }
variable "certificate_arn" { type = string }
variable "domain_names" { type = list(string); default = [] }
variable "price_class" { type = string; default = "PriceClass_All" }
variable "default_ttl" { type = number; default = 86400 }
variable "max_ttl" { type = number; default = 31536000 }
variable "geo_restriction_type" { type = string; default = "none" }
variable "geo_restriction_locations" { type = list(string); default = [] }
variable "logging_bucket_domain" { type = string; default = "" }
variable "deploy_frontend_cdn" { type = bool; default = true }
