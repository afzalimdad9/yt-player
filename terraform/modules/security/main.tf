# =============================================================================
# ALB Security Group
# =============================================================================
resource "aws_security_group" "alb" {
  name        = "${var.environment}-alb-sg"
  description = "Security group for the Application Load Balancer"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS from internet"
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP redirect to HTTPS"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }

  tags = { Name = "${var.environment}-alb-sg" }
}

# =============================================================================
# API ECS Task Security Group
# =============================================================================
resource "aws_security_group" "api" {
  name        = "${var.environment}-api-sg"
  description = "Security group for the API ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 4000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "API traffic from ALB"
  }

  ingress {
    from_port       = 4000
    to_port         = 4000
    protocol        = "tcp"
    cidr_blocks     = var.vpc_cidr != null ? [var.vpc_cidr] : []
    description     = "API traffic from within VPC (worker health checks)"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }

  tags = { Name = "${var.environment}-api-sg" }
}

# =============================================================================
# Worker ECS Task Security Group
# =============================================================================
resource "aws_security_group" "worker" {
  name        = "${var.environment}-worker-sg"
  description = "Security group for the Worker ECS tasks"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }

  tags = { Name = "${var.environment}-worker-sg" }
}

# =============================================================================
# Frontend ECS Task Security Group (if using ECS instead of S3)
# =============================================================================
resource "aws_security_group" "frontend" {
  count       = var.deploy_frontend_ecs ? 1 : 0
  name        = "${var.environment}-frontend-sg"
  description = "Security group for the Frontend ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "HTTP traffic from ALB"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.environment}-frontend-sg" }
}

# =============================================================================
# RDS Security Group
# =============================================================================
resource "aws_security_group" "rds" {
  name        = "${var.environment}-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id, aws_security_group.worker.id]
    description     = "PostgreSQL from API and Worker"
  }

  tags = { Name = "${var.environment}-rds-sg" }
}

# =============================================================================
# ElastiCache Redis Security Group
# =============================================================================
resource "aws_security_group" "redis" {
  name        = "${var.environment}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id, aws_security_group.worker.id]
    description     = "Redis from API and Worker"
  }

  tags = { Name = "${var.environment}-redis-sg" }
}
