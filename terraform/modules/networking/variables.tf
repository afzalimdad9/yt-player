variable "environment" { type = string }
variable "aws_region" { type = string }
variable "vpc_cidr" { type = string }
variable "availability_zones" { type = list(string) }
variable "public_subnet_cidrs" { type = list(string) }
variable "private_subnet_cidrs" { type = list(string) }
variable "isolated_subnet_cidrs" { type = list(string) }
variable "single_nat_gateway" { type = bool; default = true }
variable "enable_vpc_endpoints" { type = bool; default = true }
variable "enable_flow_logs" { type = bool; default = false }
variable "log_retention_days" { type = number; default = 90 }
