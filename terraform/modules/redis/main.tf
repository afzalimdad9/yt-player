# =============================================================================
# Redis Auth Token (random string for Redis AUTH)
# =============================================================================
resource "random_password" "auth_token" {
  length  = 32
  special = false
}

# =============================================================================
# Cache Subnet Group
# =============================================================================
resource "aws_elasticache_subnet_group" "main" {
  name        = "${var.environment}-redis-subnet-group"
  description = "Subnet group for ${var.environment} ElastiCache Redis"
  subnet_ids  = var.isolated_subnet_ids

  tags = { Name = "${var.environment}-redis-subnet-group" }
}

# =============================================================================
# Parameter Group (BullMQ-optimized Redis settings)
# =============================================================================
resource "aws_elasticache_parameter_group" "main" {
  name        = "${var.environment}-redis7"
  family      = "redis7"
  description = "BullMQ-optimized Redis parameters for ${var.environment}"

  parameter {
    name  = "timeout"
    value = "0"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = { Name = "${var.environment}-redis7-params" }
}

# =============================================================================
# Redis Cluster (single node, cluster mode disabled for BullMQ compatibility)
# =============================================================================
resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.environment}-yt-player-redis"
  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_nodes      = var.num_cache_nodes
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.main.name
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [var.security_group_id]

  auth_token                  = random_password.auth_token.result
  apply_immediately           = false
  auto_minor_version_upgrade  = true
  maintenance_window          = "sun:05:00-sun:06:00"

  tags = { Name = "${var.environment}-yt-player-redis" }
}

# =============================================================================
# Store Redis connection details in Secrets Manager
# =============================================================================
resource "aws_secretsmanager_secret" "connection" {
  name        = "${var.environment}/yt-player/redis/connection"
  description = "Redis connection details for ${var.environment}"

  tags = { Name = "${var.environment}-redis-connection-secret" }
}

resource "aws_secretsmanager_secret_version" "connection" {
  secret_id = aws_secretsmanager_secret.connection.id

  secret_string = jsonencode({
    REDIS_HOST     = aws_elasticache_cluster.main.cache_nodes[0].address
    REDIS_PORT     = aws_elasticache_cluster.main.cache_nodes[0].port
    REDIS_PASSWORD = random_password.auth_token.result
  })
}

# =============================================================================
# CloudWatch Metric alarm for Redis
# =============================================================================
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${var.environment}-redis-high-cpu"
  alarm_description   = "Redis CPU > 80% for 5 minutes"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"

  dimensions = {
    CacheClusterId = aws_elasticache_cluster.main.cluster_id
  }

  alarm_actions = var.alarm_sns_topic_arns
  ok_actions    = var.alarm_sns_topic_arns
}
