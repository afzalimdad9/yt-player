output "alb_arn" {
  value = aws_lb.main.arn
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "alb_zone_id" {
  value = aws_lb.main.zone_id
}

output "alb_arn_suffix" {
  value = aws_lb.main.arn_suffix
}

output "api_target_group_arn" {
  value = aws_lb_target_group.api.arn
}

output "frontend_target_group_arn" {
  value = var.deploy_frontend_ecs ? aws_lb_target_group.frontend[0].arn : null
}

output "https_listener_arn" {
  value = aws_lb_listener.https.arn
}
