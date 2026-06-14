locals {
  num_azs = length(var.availability_zones)
}

# =============================================================================
# VPC
# =============================================================================
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.environment}-vpc" }
}

# =============================================================================
# Public Subnets (ALB, NAT Gateway)
# =============================================================================
resource "aws_subnet" "public" {
  count             = local.num_azs
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.public_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  map_public_ip_on_launch = true

  tags = { Name = "${var.environment}-public-${count.index + 1}" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.environment}-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.environment}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = local.num_azs
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# =============================================================================
# Private Subnets (ECS tasks)
# =============================================================================
resource "aws_subnet" "private" {
  count             = local.num_azs
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = { Name = "${var.environment}-private-${count.index + 1}" }
}

# NAT Gateway for private subnets
resource "aws_eip" "nat" {
  count  = var.single_nat_gateway ? 1 : local.num_azs
  domain = "vpc"
  tags   = { Name = "${var.environment}-nat-eip-${count.index + 1}" }
}

resource "aws_nat_gateway" "main" {
  count         = var.single_nat_gateway ? 1 : local.num_azs
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = { Name = "${var.environment}-nat-${count.index + 1}" }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "private" {
  count  = local.num_azs
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = var.single_nat_gateway ? aws_nat_gateway.main[0].id : aws_nat_gateway.main[count.index].id
  }

  tags = { Name = "${var.environment}-private-rt-${count.index + 1}" }
}

resource "aws_route_table_association" "private" {
  count          = local.num_azs
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# =============================================================================
# Isolated Subnets (RDS, ElastiCache — no internet access)
# =============================================================================
resource "aws_subnet" "isolated" {
  count             = local.num_azs
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.isolated_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = { Name = "${var.environment}-isolated-${count.index + 1}" }
}

resource "aws_route_table" "isolated" {
  count  = local.num_azs
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.environment}-isolated-rt-${count.index + 1}" }
}

resource "aws_route_table_association" "isolated" {
  count          = local.num_azs
  subnet_id      = aws_subnet.isolated[count.index].id
  route_table_id = aws_route_table.isolated[count.index].id
}

# =============================================================================
# VPC Endpoints (cost savings — avoid NAT data processing for AWS services)
# =============================================================================
resource "aws_vpc_endpoint" "s3" {
  count        = var.enable_vpc_endpoints ? 1 : 0
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"

  route_table_ids = concat(
    [for rt in aws_route_table.private : rt.id],
    [for rt in aws_route_table.isolated : rt.id]
  )

  tags = { Name = "${var.environment}-s3-endpoint" }
}

resource "aws_vpc_endpoint" "ecr_api" {
  count             = var.enable_vpc_endpoints ? 1 : 0
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type = "Interface"

  subnet_ids = aws_subnet.private[*].id

  security_group_ids = [aws_security_group.vpc_endpoints[0].id]

  private_dns_enabled = true

  tags = { Name = "${var.environment}-ecr-api-endpoint" }
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  count             = var.enable_vpc_endpoints ? 1 : 0
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type = "Interface"

  subnet_ids = aws_subnet.private[*].id

  security_group_ids = [aws_security_group.vpc_endpoints[0].id]

  private_dns_enabled = true

  tags = { Name = "${var.environment}-ecr-dkr-endpoint" }
}

resource "aws_vpc_endpoint" "logs" {
  count             = var.enable_vpc_endpoints ? 1 : 0
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type = "Interface"

  subnet_ids = aws_subnet.private[*].id

  security_group_ids = [aws_security_group.vpc_endpoints[0].id]

  private_dns_enabled = true

  tags = { Name = "${var.environment}-logs-endpoint" }
}

resource "aws_vpc_endpoint" "secretsmanager" {
  count             = var.enable_vpc_endpoints ? 1 : 0
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type = "Interface"

  subnet_ids = aws_subnet.private[*].id

  security_group_ids = [aws_security_group.vpc_endpoints[0].id]

  private_dns_enabled = true

  tags = { Name = "${var.environment}-secretsmanager-endpoint" }
}

resource "aws_vpc_endpoint" "cloudwatch" {
  count             = var.enable_vpc_endpoints ? 1 : 0
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.monitoring"
  vpc_endpoint_type = "Interface"

  subnet_ids = aws_subnet.private[*].id

  security_group_ids = [aws_security_group.vpc_endpoints[0].id]

  private_dns_enabled = true

  tags = { Name = "${var.environment}-cloudwatch-endpoint" }
}

# =============================================================================
# VPC Endpoint Security Groups
# =============================================================================
resource "aws_security_group" "vpc_endpoints" {
  count       = var.enable_vpc_endpoints ? 1 : 0
  name        = "${var.environment}-vpc-ep-sg"
  description = "Security group for VPC endpoints (ECR, Logs, Secrets Manager, CloudWatch)"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "HTTPS from within VPC"
  }

  tags = { Name = "${var.environment}-vpc-ep-sg" }
}

# =============================================================================
# VPC Flow Logs (optional — for network auditing)
# =============================================================================
resource "aws_cloudwatch_log_group" "flow_logs" {
  count             = var.enable_flow_logs ? 1 : 0
  name              = "/aws/vpc-flow-logs/${var.environment}"
  retention_in_days = var.log_retention_days
  tags              = { Name = "${var.environment}-vpc-flow-logs" }
}

resource "aws_flow_log" "main" {
  count                = var.enable_flow_logs ? 1 : 0
  iam_role_arn         = aws_iam_role.flow_logs[0].arn
  log_destination_type = "cloud-watch-logs"
  log_group_name       = aws_cloudwatch_log_group.flow_logs[0].name
  traffic_type         = "ALL"
  vpc_id               = aws_vpc.main.id
  tags                 = { Name = "${var.environment}-vpc-flow-log" }
}

resource "aws_iam_role" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0
  name  = "${var.environment}-vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0
  name  = "${var.environment}-vpc-flow-logs-policy"
  role  = aws_iam_role.flow_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ]
      Resource = "*"
    }]
  })
}
