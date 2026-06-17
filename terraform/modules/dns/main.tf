# =============================================================================
# Route53 Zone (data source — assumes zone already exists)
# =============================================================================
data "aws_route53_zone" "main" {
  name         = var.zone_name
  private_zone = false
}

# =============================================================================
# API Endpoint Record
# =============================================================================
resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.api_subdomain != "" ? "${var.api_subdomain}.${var.zone_name}" : var.zone_name
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# =============================================================================
# Frontend Record (via CloudFront)
# =============================================================================
resource "aws_route53_record" "frontend" {
  count   = var.deploy_frontend_cdn ? 1 : 0
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.frontend_subdomain != "" ? "${var.frontend_subdomain}.${var.zone_name}" : var.zone_name
  type    = "A"

  alias {
    name                   = var.frontend_cdn_domain_name
    zone_id                = var.frontend_cdn_zone_id
    evaluate_target_health = false
  }
}

# =============================================================================
# Video CDN Record
# =============================================================================
resource "aws_route53_record" "cdn" {
  count   = var.video_cdn_domain_name != "" ? 1 : 0
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "cdn.${var.zone_name}"
  type    = "A"

  alias {
    name                   = var.video_cdn_domain_name
    zone_id                = var.video_cdn_zone_id
    evaluate_target_health = false
  }
}

# =============================================================================
# ACM Certificate Validation Records
# =============================================================================
resource "aws_route53_record" "cert_validation" {
  for_each = var.cert_validation_records
  zone_id  = data.aws_route53_zone.main.zone_id
  name     = each.value.name
  type     = each.value.type
  records  = [each.value.record]
  ttl      = 60
}
