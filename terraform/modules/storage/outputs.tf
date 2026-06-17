output "video_storage_bucket_id" {
  value = aws_s3_bucket.video_storage.id
}

output "video_storage_bucket_arn" {
  value = aws_s3_bucket.video_storage.arn
}

output "video_storage_bucket_domain" {
  value = aws_s3_bucket.video_storage.bucket_regional_domain_name
}

output "frontend_bucket_id" {
  value = aws_s3_bucket.frontend.id
}

output "frontend_bucket_arn" {
  value = aws_s3_bucket.frontend.arn
}

output "frontend_bucket_website_endpoint" {
  value = aws_s3_bucket_website_configuration.frontend.website_endpoint
}
