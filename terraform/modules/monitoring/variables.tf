variable "environment" { type = string }
variable "aws_region" { type = string }
variable "rds_instance_id" { type = string }
variable "worker_log_group_name" { type = string }
variable "alert_email" { type = string; default = "" }
variable "enable_cost_monitor" { type = bool; default = false }
variable "cost_anomaly_threshold" { type = string; default = "100" }
