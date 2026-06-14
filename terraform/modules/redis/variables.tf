variable "environment" { type = string }
variable "isolated_subnet_ids" { type = list(string) }
variable "security_group_id" { type = string }
variable "node_type" { type = string; default = "cache.r6g.large" }
variable "num_cache_nodes" { type = number; default = 1 }
variable "engine_version" { type = string; default = "7.1" }
variable "alarm_sns_topic_arns" { type = list(string); default = [] }
