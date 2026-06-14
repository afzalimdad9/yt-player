# =============================================================================
# CloudFront Origin Access Identity
# =============================================================================
resource "aws_cloudfront_origin_access_identity" "main" {
  comment = "OAI for ${var.environment} YT Player S3 bucket"
}

# =============================================================================
# CloudFront Distribution for Video Streaming
# =============================================================================
resource "aws_cloudfront_distribution" "video" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.environment} YT Player video streaming"
  price_class     = var.price_class
  aliases         = var.domain_names

  origin {
    domain_name = var.s3_bucket_domain
    origin_id   = "S3VideoOrigin"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    target_origin_id       = "S3VideoOrigin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = var.default_ttl
    max_ttl     = var.max_ttl
  }

  # Cache behavior for HLS segments (short TTL)
  ordered_cache_behavior {
    path_pattern           = "*.ts"
    target_origin_id       = "S3VideoOrigin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # Cache behavior for manifests (no cache)
  ordered_cache_behavior {
    path_pattern           = "*.m3u8"
    target_origin_id       = "S3VideoOrigin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = var.geo_restriction_type
      locations        = var.geo_restriction_locations
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  logging_config {
    include_cookies = false
    bucket          = var.logging_bucket_domain
    prefix          = "cdn/"
  }

  tags = { Name = "${var.environment}-yt-player-cdn" }
}

# =============================================================================
# CloudFront Distribution for Frontend (SPA)
# =============================================================================
resource "aws_cloudfront_distribution" "frontend" {
  count           = var.deploy_frontend_cdn ? 1 : 0
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.environment} YT Player frontend"
  price_class     = "PriceClass_100"
  default_root_object = "index.html"

  origin {
    domain_name = var.frontend_bucket_website_endpoint
    origin_id   = "S3FrontendOrigin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "S3FrontendOrigin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    allowed_methods = ["GET", "HEAD", "OPTIONS", "DELETE", "PATCH", "POST", "PUT"]
    cached_methods  = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  # Custom error response for SPA routing
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${var.environment}-yt-player-frontend-cdn" }
}
