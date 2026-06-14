# =============================================================================
# S3 Bucket for Video Storage
# =============================================================================
resource "aws_s3_bucket" "video_storage" {
  bucket        = "${var.environment}-yt-player-videos-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.force_destroy_videos

  tags = { Name = "${var.environment}-yt-player-videos" }
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket_public_access_block" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CORS for direct video playback from the browser
resource "aws_s3_bucket_cors_configuration" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  cors_rule {
    allowed_origins = var.allowed_origins
    allowed_methods = ["GET", "HEAD"]
    allowed_headers = ["*"]
    expose_headers  = ["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type"]
    max_age_seconds = 3600
  }
}

# Lifecycle: transition old videos to Glacier after 90 days
# and expire incomplete multipart uploads after 7 days
resource "aws_s3_bucket_lifecycle_configuration" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  rule {
    id     = "transition-to-glacier"
    status = "Enabled"

    filter {
      prefix = "videos/"
    }

    transition {
      days          = var.glacier_transition_days
      storage_class = "GLACIER"
    }

    expiration {
      days = var.video_expiration_days
    }
  }

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# =============================================================================
# S3 Bucket for Frontend Hosting (static site)
# =============================================================================
resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.environment}-yt-player-frontend-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.force_destroy_frontend

  tags = { Name = "${var.environment}-yt-player-frontend" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Allow CloudFront OAI access (if using CDN) or public read (if direct)
resource "aws_s3_bucket_policy" "frontend" {
  count  = var.cloudfront_oai_arn != "" ? 1 : 0
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend[0].json
}

data "aws_iam_policy_document" "frontend" {
  count = var.cloudfront_oai_arn != "" ? 1 : 0

  statement {
    principals {
      type        = "AWS"
      identifiers = [var.cloudfront_oai_arn]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
  }
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html" # SPA routing
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}
