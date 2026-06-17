# =============================================================================
# ECS Task Execution Role (for ECS agent — pulling images, logs, secrets)
# =============================================================================
resource "aws_iam_role" "ecs_execution" {
  name = "${var.environment}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.environment}-ecs-execution-role" }
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_policy" "ecs_execution_extras" {
  name        = "${var.environment}-ecs-execution-extras"
  description = "Additional permissions for ECS execution: secrets and ECR"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ]
        Resource = [
          "arn:aws:secretsmanager:*:*:secret:${var.environment}/yt-player/*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:*:*:log-group:/ecs/${var.environment}-*:*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_extras" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = aws_iam_policy.ecs_execution_extras.arn
}

# =============================================================================
# ECS Task Role (for the application itself — S3 access)
# =============================================================================
resource "aws_iam_role" "ecs_task" {
  name = "${var.environment}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.environment}-ecs-task-role" }
}

# S3 access for video storage
resource "aws_iam_policy" "s3_access" {
  name        = "${var.environment}-s3-access"
  description = "S3 access for video storage"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetObjectTagging",
          "s3:PutObjectTagging",
        ]
        Resource = [
          var.s3_bucket_arn,
          "${var.s3_bucket_arn}/*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListAllMyBuckets",
        ]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "s3_access" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.s3_access.arn
}

# CloudWatch metrics access (for BullMQ queue depth reporting)
resource "aws_iam_policy" "cloudwatch_metrics" {
  name        = "${var.environment}-cloudwatch-metrics"
  description = "Allow publishing custom CloudWatch metrics"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "cloudwatch:PutMetricData",
      ]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "cloudwatch_metrics" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.cloudwatch_metrics.arn
}

# X-Ray tracing
resource "aws_iam_policy" "xray" {
  count       = var.enable_xray ? 1 : 0
  name        = "${var.environment}-xray-access"
  description = "Allow X-Ray tracing"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
        "xray:GetSamplingRules",
        "xray:GetSamplingTargets",
        "xray:GetSamplingStatisticSummaries",
      ]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "xray" {
  count      = var.enable_xray ? 1 : 0
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.xray[0].arn
}
