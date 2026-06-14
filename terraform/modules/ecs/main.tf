# =============================================================================
# ECS Cluster
# =============================================================================
resource "aws_ecs_cluster" "main" {
  name = "${var.environment}-yt-player"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "${var.environment}-yt-player-ecs" }
}

# =============================================================================
# CloudWatch Log Groups
# =============================================================================
resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.environment}-api"
  retention_in_days = var.log_retention_days
  tags              = { Name = "${var.environment}-api-logs" }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.environment}-worker"
  retention_in_days = var.log_retention_days
  tags              = { Name = "${var.environment}-worker-logs" }
}

resource "aws_cloudwatch_log_group" "migration" {
  name              = "/ecs/${var.environment}-migration"
  retention_in_days = var.log_retention_days
  tags              = { Name = "${var.environment}-migration-logs" }
}

# =============================================================================
# API Task Definition
# =============================================================================
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.environment}-yt-player-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.api_image
      essential = true

      portMappings = [
        {
          containerPort = 4000
          protocol      = "tcp"
          appProtocol   = "http"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "API_PORT", value = "4000" },
        { name = "API_HOST", value = "0.0.0.0" },
        { name = "API_CORS_ORIGIN", value = var.api_cors_origin },
        { name = "STORAGE_BUCKET", value = var.video_storage_bucket },
        { name = "STORAGE_REGION", value = var.aws_region },
        { name = "WHISPER_MODEL", value = var.whisper_model },
        { name = "TEMP_DIR", value = "/tmp/yt-player" },
        { name = "REDIS_PORT", value = "6379" },
      ]

      secrets = [
        { name = "DATABASE_URL",       valueFrom = "${var.database_connection_secret_arn}:DATABASE_URL::" },
        { name = "REDIS_HOST",         valueFrom = "${var.redis_connection_secret_arn}:REDIS_HOST::" },
        { name = "REDIS_PASSWORD",     valueFrom = "${var.redis_connection_secret_arn}:REDIS_PASSWORD::" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:4000/api/health || exit 1"]
        interval    = 10
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ])

  tags = { Name = "${var.environment}-api-task-def" }
}

# =============================================================================
# API ECS Service
# =============================================================================
resource "aws_ecs_service" "api" {
  name            = "${var.environment}-yt-player-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.api_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.api_target_group_arn
    container_name   = "api"
    container_port   = 4000
  }

  deployment_configuration {
    deployment_circuit_breaker {
      enable   = true
      rollback = true
    }
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  health_check_grace_period_seconds = 60

  enable_execute_command = true

  tags = { Name = "${var.environment}-api-service" }

  depends_on = [var.api_target_group_arn]
}

# =============================================================================
# API Auto-Scaling
# =============================================================================
resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.api_min_count
  max_capacity       = var.api_max_count
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${var.environment}-api-cpu-scaling"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0
    scale_in_cooldown  = 120
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "api_requests" {
  name               = "${var.environment}-api-requests-scaling"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value       = 1000.0
    scale_in_cooldown  = 120
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${var.alb_arn_suffix}/${var.api_target_group_arn_suffix}"
    }
  }
}

# =============================================================================
# Worker Task Definition (CPU-intensive)
# =============================================================================
resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.environment}-yt-player-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = var.worker_image
      essential = true

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "STORAGE_BUCKET", value = var.video_storage_bucket },
        { name = "STORAGE_REGION", value = var.aws_region },
        { name = "WHISPER_MODEL", value = var.whisper_model },
        { name = "TEMP_DIR", value = "/tmp/yt-player" },
        { name = "REDIS_PORT", value = "6379" },
        { name = "DESCRIPTION_PROVIDER", value = var.description_provider },
      ]

      secrets = [
        { name = "DATABASE_URL",       valueFrom = "${var.database_connection_secret_arn}:DATABASE_URL::" },
        { name = "REDIS_HOST",         valueFrom = "${var.redis_connection_secret_arn}:REDIS_HOST::" },
        { name = "REDIS_PASSWORD",     valueFrom = "${var.redis_connection_secret_arn}:REDIS_PASSWORD::" },
      ]

      linuxParameters = {
        initProcessEnabled = true
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.worker.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = { Name = "${var.environment}-worker-task-def" }
}

# =============================================================================
# Worker ECS Service (no load balancer)
# =============================================================================
resource "aws_ecs_service" "worker" {
  name            = "${var.environment}-yt-player-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.worker_security_group_id]
    assign_public_ip = false
  }

  deployment_configuration {
    deployment_circuit_breaker {
      enable   = true
      rollback = true
    }
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  enable_execute_command = true

  tags = { Name = "${var.environment}-worker-service" }
}

# =============================================================================
# Worker Auto-Scaling
# =============================================================================
resource "aws_appautoscaling_target" "worker" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.worker_min_count
  max_capacity       = var.worker_max_count
}

resource "aws_appautoscaling_policy" "worker_cpu" {
  name               = "${var.environment}-worker-cpu-scaling"
  service_namespace  = aws_appautoscaling_target.worker.service_namespace
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 120

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# Step scaling based on BullMQ queue depth (custom metric from monitoring module)
resource "aws_appautoscaling_policy" "worker_queue_depth" {
  name               = "${var.environment}-worker-queue-scaling"
  service_namespace  = aws_appautoscaling_target.worker.service_namespace
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  policy_type        = "StepScaling"

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    metric_aggregation_type = "Average"
    cooldown                = 300

    step_adjustment {
      metric_interval_lower_bound = 0
      metric_interval_upper_bound = 10
      scaling_adjustment          = 0
    }

    step_adjustment {
      metric_interval_lower_bound = 10
      metric_interval_upper_bound = 50
      scaling_adjustment          = 1
    }

    step_adjustment {
      metric_interval_lower_bound = 50
      scaling_adjustment          = 2
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "worker_queue_high" {
  alarm_name          = "${var.environment}-worker-queue-depth"
  alarm_description   = "Scale out worker when BullMQ waiting jobs > 10"
  metric_name         = "BullMQWaiting"
  namespace           = "YTPlayer"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"

  alarm_actions = [aws_appautoscaling_policy.worker_queue_depth.arn]

  tags = { Name = "${var.environment}-alarm-worker-queue" }
}

# Scale-in is handled by the CPU-based target tracking policy (worker_cpu)
# When workers are idle with empty queues, CPU drops and target tracking scales them in

# =============================================================================
# Migration Task Definition (one-off tasks)
# =============================================================================
resource "aws_ecs_task_definition" "migration" {
  family                   = "${var.environment}-yt-player-migration"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = "migration"
      image     = var.api_image  # Use API image (contains Prisma)
      essential = true

      command = ["npx", "prisma", "migrate", "deploy"]

      environment = [
        { name = "NODE_ENV", value = "production" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = "${var.database_connection_secret_arn}:DATABASE_URL::" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.migration.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = { Name = "${var.environment}-migration-task-def" }
}
