output "db_instance_id" {
  value = aws_db_instance.main.id
}

output "db_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "db_name" {
  value = aws_db_instance.main.db_name
}

output "db_username" {
  value = aws_db_instance.main.username
}

output "db_connection_secret_arn" {
  value = aws_secretsmanager_secret.connection.arn
}

output "db_subnet_group_name" {
  value = aws_db_subnet_group.main.name
}

output "replica_endpoint" {
  value = var.create_read_replica ? aws_db_instance.replica[0].endpoint : null
}

output "read_replica_enabled" {
  value = var.create_read_replica
}
