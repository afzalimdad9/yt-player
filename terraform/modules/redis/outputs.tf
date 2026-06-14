output "cluster_id" {
  value = aws_elasticache_cluster.main.cluster_id
}

output "cache_nodes" {
  value = aws_elasticache_cluster.main.cache_nodes
}

output "primary_endpoint" {
  value = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "port" {
  value = aws_elasticache_cluster.main.cache_nodes[0].port
}

output "connection_secret_arn" {
  value = aws_secretsmanager_secret.connection.arn
}
