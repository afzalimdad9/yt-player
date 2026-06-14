# =============================================================================
# KMS Key for Secrets Manager encryption
# =============================================================================
resource "aws_kms_key" "secrets" {
  description             = "KMS key for ${var.environment} YT Player secrets"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableIAMUserPermissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowECSSecretsAccess"
        Effect = "Allow"
        Principal = {
          AWS = var.ecs_execution_role_arn
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
        ]
        Resource = "*"
      },
    ]
  })

  tags = { Name = "${var.environment}-yt-player-secrets-kms" }
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${var.environment}-yt-player-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

data "aws_caller_identity" "current" {}

# =============================================================================
# Application Secrets
# =============================================================================

# VLM API Key (for AI audio descriptions)
resource "aws_secretsmanager_secret" "vlm_api_key" {
  count       = var.vlm_api_key != "" ? 1 : 0
  name        = "${var.environment}/yt-player/vlm/api-key"
  description = "Vision Language Model API key for AI audio descriptions"
  kms_key_id  = aws_kms_key.secrets.key_id

  tags = { Name = "${var.environment}-yt-player-vlm-api-key" }
}

resource "aws_secretsmanager_secret_version" "vlm_api_key" {
  count     = var.vlm_api_key != "" ? 1 : 0
  secret_id = aws_secretsmanager_secret.vlm_api_key[0].id
  secret_string = jsonencode({
    OPENAI_API_KEY  = var.vlm_api_key
    ANTHROPIC_API_KEY = var.vlm_api_key
  })
}

# API CORS origin
resource "aws_secretsmanager_secret" "api_config" {
  name        = "${var.environment}/yt-player/api/config"
  description = "API configuration secrets"
  kms_key_id  = aws_kms_key.secrets.key_id

  tags = { Name = "${var.environment}-yt-player-api-config" }
}

resource "aws_secretsmanager_secret_version" "api_config" {
  secret_id = aws_secretsmanager_secret.api_config.id

  secret_string = jsonencode({
    API_CORS_ORIGIN  = var.api_cors_origin
    JWT_SECRET       = random_password.jwt_secret.result
  })
}

# JWT secret
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

# =============================================================================
# Output secret ARNs for reference
# =============================================================================
output "kms_key_id" {
  value = aws_kms_key.secrets.key_id
}

output "kms_key_arn" {
  value = aws_kms_key.secrets.arn
}

output "vlm_api_key_secret_arn" {
  value = var.vlm_api_key != "" ? aws_secretsmanager_secret.vlm_api_key[0].arn : ""
}

output "api_config_secret_arn" {
  value = aws_secretsmanager_secret.api_config.arn
}
