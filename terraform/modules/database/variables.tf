variable "environment" { type = string }
variable "isolated_subnet_ids" { type = list(string) }
variable "security_group_id" { type = string }
variable "master_username" { type = string; default = "ytplayer_admin" }
variable "instance_class" { type = string; default = "db.r6g.large" }
variable "allocated_storage" { type = number; default = 100 }
variable "max_allocated_storage" { type = number; default = 500 }
variable "multi_az" { type = bool; default = true }
variable "backup_retention_days" { type = number; default = 30 }
variable "create_read_replica" { type = bool; default = true }
