output "video_distribution_id" {
  value = aws_cloudfront_distribution.video.id
}

output "video_distribution_domain" {
  value = aws_cloudfront_distribution.video.domain_name
}

output "frontend_distribution_id" {
  value = var.deploy_frontend_cdn ? aws_cloudfront_distribution.frontend[0].id : null
}

output "frontend_distribution_domain" {
  value = var.deploy_frontend_cdn ? aws_cloudfront_distribution.frontend[0].domain_name : null
}

output "oai_arn" {
  value = aws_cloudfront_origin_access_identity.main.iam_arn
}
