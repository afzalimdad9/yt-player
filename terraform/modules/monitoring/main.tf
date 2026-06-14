# =============================================================================
# SNS Topic for Alerts
# =============================================================================
resource "aws_sns_topic" "alerts" {
  name = "${var.environment}-yt-player-alerts"

  tags = { Name = "${var.environment}-yt-player-alerts" }
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# =============================================================================
# CloudWatch Dashboard
# =============================================================================
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.environment}-YTPlayer"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        x = 0; y = 0; width = 12; height = 6
        properties = {
          metrics = [
            ["ECS/ContainerInsights", "CpuUtilized", { stat = "Average", label = "API CPU" }],
            ["ECS/ContainerInsights", "MemoryUtilized", { stat = "Average", label = "API Memory" }],
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "ECS API Resource Utilization"
        }
      },
      {
        type = "metric"
        x = 12; y = 0; width = 12; height = 6
        properties = {
          metrics = [
            ["ECS/ContainerInsights", "CpuUtilized", { stat = "Average", label = "Worker CPU" }],
            ["ECS/ContainerInsights", "MemoryUtilized", { stat = "Average", label = "Worker Memory" }],
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "ECS Worker Resource Utilization"
        }
      },
      {
        type = "metric"
        x = 0; y = 6; width = 8; height = 6
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", { stat = "Average" }],
            ["AWS/RDS", "DatabaseConnections", { stat = "Average" }],
            ["AWS/RDS", "FreeableMemory", { stat = "Average" }],
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "RDS PostgreSQL"
        }
      },
      {
        type = "metric"
        x = 8; y = 6; width = 8; height = 6
        properties = {
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", { stat = "Average" }],
            ["AWS/ElastiCache", "CurrConnections", { stat = "Average" }],
            ["AWS/ElastiCache", "FreeableMemory", { stat = "Average" }],
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "ElastiCache Redis"
        }
      },
      {
        type = "metric"
        x = 16; y = 6; width = 8; height = 6
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", { stat = "Sum" }],
            ["AWS/ApplicationELB", "TargetResponseTime", { stat = "Average" }],
            ["AWS/ApplicationELB", "HTTPCode_Target_5xx_Count", { stat = "Sum" }],
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "ALB / API Metrics"
        }
      },
      {
        type = "log"
        x = 0; y = 12; width = 24; height = 6
        properties = {
          query = "SOURCE '/ecs/${var.environment}-api' | fields @timestamp, @message | filter @message like /error|Error|ERROR|failed|Failed/ | sort @timestamp desc | limit 50"
          region = var.aws_region
          title   = "API Error Logs"
          view    = "table"
        }
      },
      {
        type = "log"
        x = 0; y = 18; width = 24; height = 6
        properties = {
          query = "SOURCE '/ecs/${var.environment}-worker' | fields @timestamp, @message | filter @message like /Pipeline] Complete|Pipeline] Failed/ | sort @timestamp desc | limit 50"
          region = var.aws_region
          title   = "Pipeline Events"
          view    = "table"
        }
      },
    ]
  })
}

# =============================================================================
# ECS Service CPU Alarms
# =============================================================================
resource "aws_cloudwatch_metric_alarm" "api_high_cpu" {
  alarm_name          = "${var.environment}-api-high-cpu"
  alarm_description   = "API ECS service CPU > 80% for 5 minutes"
  metric_name         = "CPUUtilization"
  namespace           = "ECS/ContainerInsights"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"

  dimensions = { ServiceName = "${var.environment}-yt-player-api" }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = { Name = "${var.environment}-alarm-api-cpu" }
}

resource "aws_cloudwatch_metric_alarm" "worker_high_cpu" {
  alarm_name          = "${var.environment}-worker-high-cpu"
  alarm_description   = "Worker ECS service CPU > 80% for 5 minutes"
  metric_name         = "CPUUtilization"
  namespace           = "ECS/ContainerInsights"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"

  dimensions = { ServiceName = "${var.environment}-yt-player-worker" }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = { Name = "${var.environment}-alarm-worker-cpu" }
}

# =============================================================================
# RDS Alarms
# =============================================================================
resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${var.environment}-rds-connections"
  alarm_description   = "RDS connections > 100"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 100
  comparison_operator = "GreaterThanThreshold"

  dimensions = { DBInstanceIdentifier = var.rds_instance_id }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${var.environment}-rds-free-storage"
  alarm_description   = "RDS free storage < 10GB"
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 10_737_418_240 # 10GB in bytes
  comparison_operator = "LessThanThreshold"

  dimensions = { DBInstanceIdentifier = var.rds_instance_id }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# =============================================================================
# BullMQ Queue Depth Alarm (custom metric)
# =============================================================================
resource "aws_cloudwatch_metric_alarm" "queue_backlog" {
  alarm_name          = "${var.environment}-queue-backlog"
  alarm_description   = "BullMQ waiting jobs > 50 for 5 minutes"
  metric_name         = "BullMQWaiting"
  namespace           = "YTPlayer"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 50
  comparison_operator = "GreaterThanThreshold"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = { Name = "${var.environment}-alarm-queue-backlog" }
}

# =============================================================================
# Log Metric Filters
# =============================================================================
resource "aws_cloudwatch_log_metric_filter" "pipeline_failures" {
  name           = "${var.environment}-pipeline-failures"
  pattern        = "[w1=*Pipeline*][w2=*Failed*]"
  log_group_name = var.worker_log_group_name

  metric_transformation {
    name          = "PipelineFailureCount"
    namespace     = "YTPlayer"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "pipeline_failures" {
  alarm_name          = "${var.environment}-pipeline-failures"
  alarm_description   = "Pipeline failures detected in worker logs"
  metric_name         = "PipelineFailureCount"
  namespace           = "YTPlayer"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# =============================================================================
# Cost Anomaly Detection (optional)
# =============================================================================
resource "aws_ce_anomaly_monitor" "cost" {
  count        = var.enable_cost_monitor ? 1 : 0
  name         = "${var.environment}-yt-player-cost"
  monitor_type = "DIMENSIONAL"

  monitor_dimension {
    key          = "LINKED_ACCOUNT"
    values       = [data.aws_caller_identity.current.account_id]
  }
}

resource "aws_ce_anomaly_subscription" "cost" {
  count     = var.enable_cost_monitor ? 1 : 0
  name      = "${var.environment}-yt-player-cost-alerts"
  frequency = "IMMEDIATE"

  monitor_arn_list = [aws_ce_anomaly_monitor.cost[0].arn]

  subscriber {
    address = var.alert_email
    type    = "EMAIL"
  }

  threshold_expression {
    and {
      dimension {
        key    = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
        values = [var.cost_anomaly_threshold]
      }
    }
  }
}

data "aws_caller_identity" "current" {}
