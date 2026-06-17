output "zone_id" {
  value = data.aws_route53_zone.main.zone_id
}

output "api_record_fqdn" {
  value = aws_route53_record.api.fqdn
}

output "frontend_record_fqdn" {
  value = var.deploy_frontend_cdn ? aws_route53_record.frontend[0].fqdn : null
}

output "cert_validation_fqdns" {
  description = "FQDNs of ACM certificate validation DNS records"
  value       = [for r in aws_route53_record.cert_validation : r.fqdn]
}
