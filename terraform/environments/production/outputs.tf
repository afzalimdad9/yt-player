output "vpc_id" {
  description = "ID of the production VPC"
  value       = module.networking.vpc_id
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = module.alb.alb_dns_name
}

output "api_endpoint" {
  description = "API endpoint URL"
  value       = "https://${var.api_subdomain}.${var.domain_name}"
}

output "frontend_url" {
  description = "Frontend application URL"
  value       = "https://${var.frontend_subdomain}.${var.domain_name}"
}

output "cdn_domain" {
  description = "CloudFront CDN domain for video streaming"
  value       = module.cdn.video_distribution_domain
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = module.ecs.cluster_name
}

output "database_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.database.db_endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = module.redis.primary_endpoint
  sensitive   = true
}

output "video_storage_bucket" {
  description = "S3 bucket for video assets"
  value       = module.storage.video_storage_bucket_id
}

output "frontend_bucket" {
  description = "S3 bucket for frontend hosting"
  value       = module.storage.frontend_bucket_id
}

output "api_service_name" {
  description = "Name of the API ECS service"
  value       = module.ecs.api_service_name
}

output "worker_service_name" {
  description = "Name of the Worker ECS service"
  value       = module.ecs.worker_service_name
}

output "migration_task_definition" {
  description = "ARN of the migration task definition"
  value       = module.ecs.migration_task_definition_arn
}

output "sns_alert_topic" {
  description = "ARN of the SNS alert topic"
  value       = module.monitoring.alarm_sns_topic_arn
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = module.monitoring.dashboard_name
}
