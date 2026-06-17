# =============================================================================
# Random password for RDS master user
# =============================================================================
resource "random_password" "master" {
  length  = 32
  special = false
}

# =============================================================================
# DB Subnet Group (must span at least 2 AZs in isolated subnets)
# =============================================================================
resource "aws_db_subnet_group" "main" {
  name        = "${var.environment}-rds-subnet-group"
  description = "Subnet group for ${var.environment} RDS PostgreSQL"
  subnet_ids  = var.isolated_subnet_ids

  tags = { Name = "${var.environment}-rds-subnet-group" }
}

# =============================================================================
# Parameter Group with optimized PostgreSQL settings
# =============================================================================
resource "aws_db_parameter_group" "main" {
  name        = "${var.environment}-postgres16"
  family      = "postgres16"
  description = "Optimized PostgreSQL parameters for ${var.environment}"

  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory*3/4}"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "effective_cache_size"
    value = "{DBInstanceClassMemory*3/4*2}"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "work_mem"
    value = "65536"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "2097152"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "wal_level"
    value = "logical"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "max_replication_slots"
    value = "5"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "max_wal_senders"
    value = "5"
    apply_method = "pending-reboot"
  }

  tags = { Name = "${var.environment}-postgres16-params" }
}

# =============================================================================
# RDS Instance
# =============================================================================
resource "aws_db_instance" "main" {
  identifier = "${var.environment}-yt-player"

  engine         = "postgres"
  engine_version = "16.3"
  instance_class = var.instance_class

  db_name  = "ytplayer"
  username = var.master_username
  password = random_password.master.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.main.name
  vpc_security_group_ids = [var.security_group_id]

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  multi_az               = var.multi_az
  backup_retention_period = var.backup_retention_days
  backup_window           = "02:00-03:00"
  maintenance_window      = "sun:04:00-sun:05:00"

  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.environment}-yt-player-final-${formatdate("YYYYMMDDHHmm", timestamp())}"

  performance_insights_enabled = true
  performance_insights_retention_period = 7

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = { Name = "${var.environment}-yt-player-rds" }
}

# =============================================================================
# Read Replica (for analytics queries)
# =============================================================================
resource "aws_db_instance" "replica" {
  count = var.create_read_replica ? 1 : 0

  identifier = "${var.environment}-yt-player-read"

  instance_class = var.instance_class

  replicate_source_db = aws_db_instance.main.identifier

  vpc_security_group_ids = [var.security_group_id]

  backup_retention_period = var.backup_retention_days
  backup_window            = "03:00-04:00"

  performance_insights_enabled = true
  performance_insights_retention_period = 7

  tags = { Name = "${var.environment}-yt-player-rds-read" }
}

# =============================================================================
# Store connection details in Secrets Manager
# =============================================================================
resource "aws_secretsmanager_secret" "connection" {
  name        = "${var.environment}/yt-player/rds/connection"
  description = "RDS PostgreSQL connection string for ${var.environment}"

  tags = { Name = "${var.environment}-rds-connection-secret" }
}

resource "aws_secretsmanager_secret_version" "connection" {
  secret_id = aws_secretsmanager_secret.connection.id

  secret_string = jsonencode({
    DATABASE_URL = "postgresql://${aws_db_instance.main.username}:${random_password.master.result}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}?sslmode=require"
  })
}
