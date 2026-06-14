# =============================================================================
# Application Load Balancer
# =============================================================================
resource "aws_lb" "main" {
  name               = "${var.environment}-yt-player-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.security_group_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.enable_deletion_protection
  idle_timeout               = var.idle_timeout

  tags = { Name = "${var.environment}-yt-player-alb" }
}

# =============================================================================
# HTTPS Listener (default — forwards to API)
# =============================================================================
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  tags = { Name = "${var.environment}-https-listener" }
}

# =============================================================================
# HTTP Listener (redirects to HTTPS)
# =============================================================================
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = { Name = "${var.environment}-http-redirect" }
}

# =============================================================================
# API Target Group
# =============================================================================
resource "aws_lb_target_group" "api" {
  name        = "${var.environment}-api-tg"
  port        = var.api_container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    enabled             = true
    path                = var.api_health_check_path
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200-399"
  }

  stickiness {
    enabled = false
    type    = "lb_cookie"
  }

  tags = { Name = "${var.environment}-api-tg" }
}

# =============================================================================
# Frontend Target Group (if deploying frontend via ECS instead of S3)
# =============================================================================
resource "aws_lb_target_group" "frontend" {
  count       = var.deploy_frontend_ecs ? 1 : 0
  name        = "${var.environment}-frontend-tg"
  port        = 80
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    enabled             = true
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200-399"
  }

  tags = { Name = "${var.environment}-frontend-tg" }
}

# =============================================================================
# Listener Rules for path-based routing
# =============================================================================
# API routes
resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}

# Frontend (if using ECS)
resource "aws_lb_listener_rule" "frontend" {
  count       = var.deploy_frontend_ecs ? 1 : 0
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend[0].arn
  }

  condition {
    path_pattern {
      values = ["/*"]
    }
  }
}

# =============================================================================
# WAFv2 Web ACL (optional — basic rate limiting and protection)
# =============================================================================
resource "aws_wafv2_web_acl" "main" {
  count       = var.enable_waf ? 1 : 0
  name        = "${var.environment}-yt-player-waf"
  description = "WAF for YT Player ALB"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # Rate limiting: max 2000 requests per 5 minutes per IP
  rule {
    name     = "rate-limit"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_requests
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-RateLimit"
      sampled_requests_enabled   = true
    }
  }

  # AWS managed rules
  rule {
    name     = "aws-managed-common"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-AWSCommonRules"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.environment}-WAF"
    sampled_requests_enabled   = true
  }

  tags = { Name = "${var.environment}-yt-player-waf" }
}

resource "aws_wafv2_web_acl_association" "alb" {
  count        = var.enable_waf ? 1 : 0
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main[0].arn
}

# =============================================================================
# CloudWatch alarms for ALB
# =============================================================================
resource "aws_cloudwatch_metric_alarm" "high_5xx" {
  alarm_name          = "${var.environment}-alb-high-5xx"
  alarm_description   = "ALB 5xx error rate > 5% for 5 minutes"
  metric_name         = "HTTPCode_Target_5xx_Count"
  namespace           = "AWS/ApplicationELB"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.alarm_5xx_threshold
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  alarm_actions = var.alarm_sns_topic_arns
  ok_actions    = var.alarm_sns_topic_arns
}

resource "aws_cloudwatch_metric_alarm" "high_latency" {
  alarm_name          = "${var.environment}-alb-high-latency"
  alarm_description   = "ALB target response time > 5s for 5 minutes"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  alarm_actions = var.alarm_sns_topic_arns
  ok_actions    = var.alarm_sns_topic_arns
}
