# AWS Production Deployment Guide

> **Deploying YT Player to AWS** with S3 (storage), RDS (PostgreSQL), ElastiCache (Redis), and ECS (containers).

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [AWS Resource Provisioning](#3-aws-resource-provisioning)
   - 3.1 S3 for Video Storage
   - 3.2 RDS for PostgreSQL
   - 3.3 ElastiCache for Redis
   - 3.4 ECR for Container Registry
   - 3.5 IAM Roles & Policies
   - 3.6 Networking (VPC, Subnets, Security Groups)
   - 3.7 CloudFront CDN (Optional)
   - 3.8 Certificate Manager (SSL)
4. [Building & Pushing Docker Images](#4-building--pushing-docker-images)
5. [Deploying with ECS (Fargate)](#5-deploying-with-ecs-fargate)
   - 5.1 API Service
   - 5.2 Worker Service
   - 5.3 Frontend Service
   - 5.4 Nginx Reverse Proxy
6. [Database Migrations](#6-database-migrations)
7. [Environment Configuration](#7-environment-configuration)
8. [Auto Scaling](#8-auto-scaling)
9. [Monitoring & Alerting](#9-monitoring--alerting)
10. [CI/CD Pipeline](#10-cicd-pipeline)
11. [Cost Estimates](#11-cost-estimates)
12. [Runbook: Common Operations](#12-runbook-common-operations)
13. [Disaster Recovery](#13-disaster-recovery)

---

## 1. Architecture Overview

```
                          ┌──────────────┐
                          │   CloudFront  │
                          │   (CDN)       │
                          └──────┬───────┘
                                 │
                          ┌──────▼───────┐
                          │  ALB (HTTPS) │
                          │  port 443    │
                          └──────┬───────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
              ┌─────▼────┐ ┌────▼────┐ ┌────▼────┐
              │  Nginx   │ │  Nginx  │ │  Nginx  │
              │ (API)    │ │ (Web)   │ │(Worker) │
              └────┬─────┘ └────┬────┘ └────┬────┘
                   │            │            │
              ┌────▼────┐ ┌────▼────┐ ┌────▼──────────┐
              │ Fastify │ │  React  │ │ BullMQ Worker │
              │ API x2  │ │ (S3)    │ │ x2 (CPU-heavy)│
              └────┬────┘ └─────────┘ └────┬──────────┘
                   │                        │
        ┌──────────┼──────────┐             │
        │          │          │             │
   ┌────▼───┐ ┌────▼───┐ ┌───▼────┐  ┌─────▼──────┐
   │  RDS   │ │Elasti- │ │  S3    │  │  Secrets   │
   │(Post-  │ │Cache   │ │(Videos)│  │  Manager   │
   │greSQL) │ │(Redis) │ │        │  │            │
   └────────┘ └────────┘ └────────┘  └────────────┘
```

### Service Topology

| Service | Compute | Scaling | Notes |
|---------|---------|---------|-------|
| **API** | ECS Fargate | 2–6 tasks | Stateless, behind ALB |
| **Worker** | ECS Fargate | 2–4 tasks | CPU/memory-intensive, no load balancer |
| **Frontend** | S3 + CloudFront | Static files | Edge-cached via CloudFront |
| **Nginx** | ECS Fargate (sidecar) | Same as API | Rate limiting, SSL termination |
| **PostgreSQL** | RDS (db.r6g.large) | Single + Read replica | Multi-AZ for production |
| **Redis** | ElastiCache (cache.r6g.large) | Single node | Required for BullMQ |
| **S3** | Standard tier | Auto-scaling | Video assets storage |

---

## 2. Prerequisites

### Tools
- **AWS CLI v2** — configured with admin credentials
- **Docker** — for building images
- **AWS CDK** or **Terraform** (optional, for IaC)
- **jq** — for JSON parsing in scripts
- **Node.js 22+** — for local build verification

### AWS Account Setup
```bash
# Install & configure AWS CLI
aws configure
# AWS Access Key ID: AKIA...
# AWS Secret Access Key: ...
# Default region: us-east-1
# Default output: json

# Verify
aws sts get-caller-identity
```

### Required IAM Permissions
The deploying user/role needs:
- `AmazonECS_FullAccess`
- `AmazonRDSFullAccess`
- `AmazonElastiCacheFullAccess`
- `AmazonS3FullAccess`
- `IAMFullAccess`
- `AWSCloudFormationFullAccess`
- `AWSCertificateManagerFullAccess`

---

## 3. AWS Resource Provisioning

### 3.1 S3 for Video Storage

```bash
# Create bucket (bucket names must be globally unique)
BUCKET_NAME="yt-player-prod-$(aws sts get-caller-identity --query Account --output text)"
aws s3 mb "s3://$BUCKET_NAME" --region us-east-1

# Block public access
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Enable CORS for web player
aws s3api put-bucket-cors \
  --bucket "$BUCKET_NAME" \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": ["https://ytplayer.example.com"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": [],
      "MaxAgeSeconds": 3600
    }]
  }'

# Enable versioning (optional, for asset recovery)
aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled

# Lifecycle policy: move old assets to Glacier after 90 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET_NAME" \
  --lifecycle-configuration '{
    "Rules": [{
      "Id": "move-to-glacier",
      "Status": "Enabled",
      "Filter": {"Prefix": "videos/"},
      "Transitions": [{"Days": 90, "StorageClass": "GLACIER"}]
    }]
  }'
```

**Terraform equivalent:**
```hcl
resource "aws_s3_bucket" "video_storage" {
  bucket = "yt-player-prod-${data.aws_caller_identity.current.account_id}"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id
  cors_rule {
    allowed_origins = ["https://ytplayer.example.com"]
    allowed_methods = ["GET", "HEAD"]
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }
}
```

### 3.2 RDS for PostgreSQL

```bash
# Create subnet group (must have subnets in at least 2 AZs)
aws rds create-db-subnet-group \
  --db-subnet-group-name "yt-player-subnet-group" \
  --db-subnet-group-description "Subnet group for YT Player RDS" \
  --subnet-ids "subnet-xxx" "subnet-yyy"

# Create parameter group with optimized settings
aws rds create-db-parameter-group \
  --db-parameter-group-name "yt-player-pg" \
  --db-parameter-group-family "postgres16" \
  --description "YT Player PostgreSQL parameters"

aws rds modify-db-parameter-group \
  --db-parameter-group-name "yt-player-pg" \
  --parameters \
    "ParameterName=shared_buffers,ParameterValue={DBInstanceClassMemory*3/4},ApplyMethod=pending-reboot" \
    "ParameterName=effective_cache_size,ParameterValue={DBInstanceClassMemory*3/4*2},ApplyMethod=pending-reboot" \
    "ParameterName=work_mem,ParameterValue=65536,ApplyMethod=pending-reboot" \
    "ParameterName=maintenance_work_mem,ParameterValue=2097152,ApplyMethod=pending-reboot" \
    "ParameterName=wal_level,ParameterValue=logical,ApplyMethod=pending-reboot" \
    "ParameterName=max_replication_slots,ParameterValue=5,ApplyMethod=pending-reboot" \
    "ParameterName=max_wal_senders,ParameterValue=5,ApplyMethod=pending-reboot"

# Create the RDS instance
aws rds create-db-instance \
  --db-instance-identifier "yt-player-prod" \
  --db-instance-class "db.r6g.large" \
  --engine "postgres" \
  --engine-version "16.3" \
  --master-username "ytplayer_admin" \
  --master-user-password "$(openssl rand -base64 32)" \
  --db-name "ytplayer" \
  --db-subnet-group-name "yt-player-subnet-group" \
  --db-parameter-group-name "yt-player-pg" \
  --vpc-security-group-ids "sg-xxx" \
  --storage-type "gp3" \
  --allocated-storage 100 \
  --max-allocated-storage 500 \
  --multi-az \
  --backup-retention-period 30 \
  --preferred-backup-window "02:00-03:00" \
  --preferred-maintenance-window "sun:04:00-sun:05:00" \
  --deletion-protection \
  --storage-encrypted \
  --enable-performance-insights

# Store password in Secrets Manager
aws secretsmanager create-secret \
  --name "yt-player/rds/password" \
  --secret-string "$(aws rds describe-db-instances --db-instance-identifier yt-player-prod --query 'DBInstances[0].MasterUserPassword' --output text)"

# Create read replica for analytics queries
aws rds create-db-instance-read-replica \
  --db-instance-identifier "yt-player-prod-read" \
  --source-db-instance-identifier "yt-player-prod" \
  --db-instance-class "db.r6g.large" \
  --vpc-security-group-ids "sg-xxx"
```

**Connection string format:**
```
DATABASE_URL=postgresql://ytplayer_admin:<password>@yt-player-prod.xxxxx.us-east-1.rds.amazonaws.com:5432/ytplayer?sslmode=require
```

### 3.3 ElastiCache for Redis

```bash
# Create subnet group
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name "yt-player-redis" \
  --cache-subnet-group-description "Redis subnet group for YT Player" \
  --subnet-ids "subnet-xxx" "subnet-yyy"

# Create parameter group with BullMQ-optimized settings
aws elasticache create-cache-parameter-group \
  --cache-parameter-group-name "yt-player-redis-params" \
  --cache-parameter-group-family "redis7" \
  --description "YT Player Redis parameters"

aws elasticache modify-cache-parameter-group \
  --cache-parameter-group-name "yt-player-redis-params" \
  --parameter-name-values \
    "ParameterName=timeout,ParameterValue=0" \
    "ParameterName=tcp-keepalive,ParameterValue=300" \
    "ParameterName=maxmemory-policy,ParameterValue=allkeys-lru"

# Create Redis cluster (BullMQ needs at least Redis 7)
aws elasticache create-cache-cluster \
  --cache-cluster-id "yt-player-redis" \
  --cache-node-type "cache.r6g.large" \
  --engine "redis" \
  --engine-version "7.1" \
  --num-cache-nodes 1 \
  --cache-subnet-group-name "yt-player-redis" \
  --cache-parameter-group-name "yt-player-redis-params" \
  --vpc-security-group-ids "sg-yyy" \
  --preferred-maintenance-window "sun:05:00-sun:06:00" \
  --auto-minor-version-upgrade \
  --auth-token "$(openssl rand -base64 32)"

# Get the primary endpoint
REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id "yt-player-redis" \
  --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text)
```

**BullMQ notes:**
- BullMQ requires Redis 6.2+ (we use 7.1)
- The `max-retries-per-request` is set to `null` in our code (infinite retries)
- ElastiCache with cluster mode disabled is sufficient for BullMQ
- For high-throughput: enable cluster mode and use `REDIS_CLUSTER=true`

### 3.4 ECR for Container Registry

```bash
# Create ECR repositories
aws ecr create-repository --repository-name "yt-player/api" --image-scanning-configuration scanOnPush=true
aws ecr create-repository --repository-name "yt-player/worker" --image-scanning-configuration scanOnPush=true
aws ecr create-repository --repository-name "yt-player/web" --image-scanning-configuration scanOnPush=true

# Get repository URIs
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="us-east-1"
ECR_BASE="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

API_REPO="$ECR_BASE/yt-player/api"
WORKER_REPO="$ECR_BASE/yt-player/worker"
WEB_REPO="$ECR_BASE/yt-player/web"

# Login to ECR
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_BASE
```

### 3.5 IAM Roles & Policies

Create an **ECS task execution role** (`yt-player-ecs-execution-role`) with these policies:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:BatchCheckLayerAvailability",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "*"
    }
  ]
}
```

Create a **task role** (`yt-player-task-role`) for S3 access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::yt-player-prod-*",
        "arn:aws:s3:::yt-player-prod-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:yt-player/*"
    }
  ]
}
```

### 3.6 Networking (VPC)

```bash
# The VPC should have:
# - 2 public subnets (for ALB)
# - 2 private subnets (for ECS tasks)
# - 2 isolated subnets (for RDS + ElastiCache)
# - NAT Gateway for private subnets
# - VPC Endpoints for S3 and ECR (optional, cost-saving)

# Security Groups:
# - ALB_SG:  allows 443 from 0.0.0.0/0
# - ECS_API_SG: allows 4000 from ALB_SG
# - ECS_WORKER_SG: allows all outbound, no inbound
# - RDS_SG: allows 5432 from ECS_API_SG and ECS_WORKER_SG
# - REDIS_SG: allows 6379 from ECS_API_SG and ECS_WORKER_SG
```

**Terraform network example:**
```hcl
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  enable_dns_support = true
  enable_dns_hostnames = true

  tags = { Name = "yt-player-prod" }
}

# Public subnet (ALB)
resource "aws_subnet" "public_a" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
  availability_zone = "us-east-1a"
  map_public_ip_on_launch = true
}

# Private subnet (ECS tasks)
resource "aws_subnet" "private_a" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.10.0/24"
  availability_zone = "us-east-1a"
}

# Isolated subnet (RDS, Redis)
resource "aws_subnet" "isolated_a" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.20.0/24"
  availability_zone = "us-east-1a"
}
```

### 3.7 CloudFront CDN (Optional)

For serving video assets with low latency globally:

```bash
# Create CloudFront distribution for S3 bucket
aws cloudfront create-distribution \
  --origin-domain-name "$BUCKET_NAME.s3.us-east-1.amazonaws.com" \
  --default-root-object "index.html" \
  --origins '[{
    "Id": "S3Origin",
    "DomainName": "'$BUCKET_NAME'.s3.us-east-1.amazonaws.com",
    "S3OriginConfig": {
      "OriginAccessIdentity": ""
    }
  }]' \
  --default-cache-behavior '{
    "TargetOriginId": "S3Origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": ["GET", "HEAD", "OPTIONS"],
    "CachedMethods": ["GET", "HEAD"],
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": { "Forward": "none" }
    },
    "MinTTL": 86400,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "Compress": true
  }' \
  --enabled

# Add OAI (Origin Access Identity) for S3 security
aws cloudfront create-cloud-front-origin-access-identity \
  --cloud-front-origin-access-identity-config '{
    "CallerReference": "yt-player-oai",
    "Comment": "OAI for YT Player S3 bucket"
  }'
```

Update the S3 bucket policy to only allow CloudFront access:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity EXXXXXXXXXXXXXXXX"
    },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::yt-player-prod-*/*"
  }]
}
```

### 3.8 Certificate Manager (SSL)

```bash
# Request SSL certificate (for the domain/subdomain)
aws acm request-certificate \
  --domain-name "ytplayer.example.com" \
  --subject-alternative-names "*.ytplayer.example.com" \
  --validation-method DNS \
  --region us-east-1

# Note the CertificateArn output — you need to add the DNS
# validation CNAME records to your DNS provider (Route53, etc.)

# Verify certificate status
aws acm describe-certificate \
  --certificate-arn "arn:aws:acm:us-east-1:ACCOUNT:certificate/xxx" \
  --query 'Certificate.Status'
# Should show: "ISSUED"
```

---

## 4. Building & Pushing Docker Images

### Build Script

```bash
#!/bin/bash
# scripts/deploy/build-and-push.sh

set -euo pipefail

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="${AWS_REGION:-us-east-1}"
ECR_BASE="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"

echo "🔨 Building images with tag: $IMAGE_TAG"

# Login to ECR
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_BASE

# Build API image
echo "Building API..."
docker build \
  -f docker/Dockerfile.api \
  -t "$ECR_BASE/yt-player/api:$IMAGE_TAG" \
  -t "$ECR_BASE/yt-player/api:latest" \
  .

# Build Worker image
echo "Building Worker..."
docker build \
  -f docker/Dockerfile.worker \
  -t "$ECR_BASE/yt-player/worker:$IMAGE_TAG" \
  -t "$ECR_BASE/yt-player/worker:latest" \
  .

# Build Web image
echo "Building Web..."
docker build \
  -f docker/Dockerfile.web \
  -t "$ECR_BASE/yt-player/web:$IMAGE_TAG" \
  -t "$ECR_BASE/yt-player/web:latest" \
  .

# Push images
echo "📤 Pushing images to ECR..."
docker push "$ECR_BASE/yt-player/api:$IMAGE_TAG"
docker push "$ECR_BASE/yt-player/api:latest"
docker push "$ECR_BASE/yt-player/worker:$IMAGE_TAG"
docker push "$ECR_BASE/yt-player/worker:latest"
docker push "$ECR_BASE/yt-player/web:$IMAGE_TAG"
docker push "$ECR_BASE/yt-player/web:latest"

echo "✅ Images pushed successfully"
echo "  API:    $ECR_BASE/yt-player/api:$IMAGE_TAG"
echo "  Worker: $ECR_BASE/yt-player/worker:$IMAGE_TAG"
echo "  Web:    $ECR_BASE/yt-player/web:$IMAGE_TAG"
```

---

## 5. Deploying with ECS (Fargate)

### 5.1 API Service

**Task definition** (`ecs/api-task-def.json`):

```json
{
  "family": "yt-player-api",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/yt-player-task-role",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/yt-player-ecs-execution-role",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/yt-player/api:latest",
      "portMappings": [{ "containerPort": 4000, "protocol": "tcp" }],
      "essential": true,
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "API_PORT", "value": "4000" },
        { "name": "API_HOST", "value": "0.0.0.0" },
        { "name": "API_CORS_ORIGIN", "value": "https://ytplayer.example.com" },
        { "name": "STORAGE_BUCKET", "value": "yt-player-prod-ACCOUNT" },
        { "name": "STORAGE_REGION", "value": "us-east-1" },
        { "name": "WHISPER_MODEL", "value": "base" },
        { "name": "TEMP_DIR", "value": "/tmp/yt-player" }
      ],
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:yt-player/rds/connection" },
        { "name": "STORAGE_ACCESS_KEY", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:yt-player/s3/access-key" },
        { "name": "STORAGE_SECRET_KEY", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:yt-player/s3/secret-key" },
        { "name": "REDIS_HOST", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:yt-player/redis/host" },
        { "name": "REDIS_PASSWORD", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:yt-player/redis/auth-token" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/yt-player-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:4000/api/health || exit 1"],
        "interval": 10,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 30
      }
    }
  ]
}
```

**Service configuration:**

```bash
# Create CloudWatch log group
aws logs create-log-group --log-group-name "/ecs/yt-player-api"

# Register task definition
aws ecs register-task-definition --cli-input-json file://ecs/api-task-def.json

# Create ALB target group
aws elbv2 create-target-group \
  --name "yt-player-api-tg" \
  --protocol HTTP \
  --port 4000 \
  --vpc-id "vpc-xxx" \
  --health-check-path "/api/health" \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --target-type ip

# Create ECS service
aws ecs create-service \
  --cluster "yt-player-prod" \
  --service-name "yt-player-api" \
  --task-definition "yt-player-api" \
  --desired-count 2 \
  --launch-type "FARGATE" \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["subnet-private-a", "subnet-private-b"],
      "securityGroups": ["sg-api"],
      "assignPublicIp": "DISABLED"
    }
  }' \
  --load-balancers '[{
    "targetGroupArn": "arn:aws:elasticloadbalancing:...:targetgroup/yt-player-api-tg/xxx",
    "containerName": "api",
    "containerPort": 4000
  }]' \
  --health-check-grace-period-seconds 60 \
  --enable-execute-command
```

### 5.2 Worker Service

**Task definition** (`ecs/worker-task-def.json`):

```json
{
  "family": "yt-player-worker",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/yt-player-task-role",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/yt-player-ecs-execution-role",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "4096",
  "memory": "8192",
  "containerDefinitions": [
    {
      "name": "worker",
      "image": "ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/yt-player/worker:latest",
      "essential": true,
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "STORAGE_BUCKET", "value": "yt-player-prod-ACCOUNT" },
        { "name": "STORAGE_REGION", "value": "us-east-1" },
        { "name": "WHISPER_MODEL", "value": "base" },
        { "name": "TEMP_DIR", "value": "/tmp/yt-player" }
      ],
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:yt-player/rds/connection" },
        { "name": "STORAGE_ACCESS_KEY", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:yt-player/s3/access-key" },
        { "name": "STORAGE_SECRET_KEY", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:yt-player/s3/secret-key" },
        { "name": "REDIS_HOST", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:yt-player/redis/host" },
        { "name": "REDIS_PASSWORD", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:yt-player/redis/auth-token" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/yt-player-worker",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "linuxParameters": {
        "initProcessEnabled": true
      }
    }
  ]
}
```

**Worker service — no load balancer, just direct task count:**
```bash
aws ecs create-service \
  --cluster "yt-player-prod" \
  --service-name "yt-player-worker" \
  --task-definition "yt-player-worker" \
  --desired-count 2 \
  --launch-type "FARGATE" \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["subnet-private-a", "subnet-private-b"],
      "securityGroups": ["sg-worker"],
      "assignPublicIp": "DISABLED"
    }
  }'
```

### 5.3 Frontend Service

**Option A: S3 + CloudFront (Recommended)**

```bash
# Build the frontend locally
cd packages/web
pnpm build

# Sync to S3
aws s3 sync dist/ "s3://$BUCKET_NAME/frontend/" --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id "EXXXXXXXXXXXXX" \
  --paths "/*"
```

**Option B: ECS Fargate (for SSR or dynamic routing)**

```json
{
  "family": "yt-player-web",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [{
    "name": "web",
    "image": "ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/yt-player/web:latest",
    "portMappings": [{ "containerPort": 80, "protocol": "tcp" }],
    "essential": true,
    "environment": [
      { "name": "VITE_API_URL", "value": "https://api.ytplayer.example.com" }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/yt-player-web",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]
}
```

### 5.4 Nginx Reverse Proxy

For production, we recommend an **Application Load Balancer** → **Nginx sidecar** → **Fastify API**. This gives you:

1. **SSL termination** at the ALB
2. **Rate limiting** at the Nginx layer
3. **Request buffering** for large uploads
4. **Static asset caching** for the frontend

**Nginx deployment as sidecar** (in the same ECS task as the API):

```json
{
  "containerDefinitions": [
    {
      "name": "nginx",
      "image": "nginx:alpine",
      "portMappings": [{ "containerPort": 80, "protocol": "tcp" }],
      "essential": true,
      "mountPoints": [{
        "sourceVolume": "nginx-conf",
        "containerPath": "/etc/nginx/conf.d"
      }]
    },
    {
      "name": "api",
      "image": "...",
      "portMappings": [{ "containerPort": 4000, "protocol": "tcp" }],
      "essential": true
    }
  ],
  "volumes": [{
    "name": "nginx-conf",
    "host": {}
  }]
}
```

---

## 6. Database Migrations

### Initial Migration

Run migrations as an **ECS task** (one-off), not in the API container startup:

```bash
#!/bin/bash
# scripts/deploy/run-migrations.sh

aws ecs run-task \
  --cluster "yt-player-prod" \
  --task-definition "yt-player-api" \
  --launch-type "FARGATE" \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["subnet-private-a"],
      "securityGroups": ["sg-api"],
      "assignPublicIp": "DISABLED"
    }
  }' \
  --overrides '{
    "containerOverrides": [{
      "name": "api",
      "command": ["npx", "prisma", "migrate", "deploy"]
    }]
  }'
```

### Automated Migration Strategy

Integrate into CI/CD:

```yaml
# .github/workflows/deploy.yml
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run database migrations
        run: |
          aws ecs run-task \
            --cluster yt-player-prod \
            --task-definition yt-player-migration \
            --overrides '{
              "containerOverrides": [{
                "name": "migration",
                "command": ["npx", "prisma", "migrate", "deploy"]
              }]
            }'
      
      - name: Wait for migration to complete
        run: |
          TASK_ARN=$(aws ecs list-tasks --cluster yt-player-prod --family yt-player-migration --query 'taskArns[0]' --output text)
          aws ecs wait tasks-stopped --cluster yt-player-prod --tasks $TASK_ARN
          
          # Check exit code
          EXIT_CODE=$(aws ecs describe-tasks --cluster yt-player-prod --tasks $TASK_ARN --query 'tasks[0].containers[0].exitCode' --output text)
          if [ "$EXIT_CODE" != "0" ]; then
            echo "Migration failed!"
            exit 1
          fi
```

### Backup & Restore

```bash
# Automated backup (via RDS automated backups — enabled by default)
# Retention: 30 days (configured above)

# Manual snapshot before deployments
aws rds create-db-snapshot \
  --db-instance-identifier "yt-player-prod" \
  --db-snapshot-identifier "yt-player-prod-pre-deploy-$(date +%Y%m%d%H%M)"

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier "yt-player-prod-restored" \
  --db-snapshot-identifier "yt-player-prod-snapshot-xxx" \
  --vpc-security-group-ids "sg-xxx"
```

---

## 7. Environment Configuration

### Secrets Manager

Store all sensitive configuration in AWS Secrets Manager:

```bash
# Database URL
aws secretsmanager create-secret \
  --name "yt-player/rds/connection" \
  --secret-string '{"DATABASE_URL":"postgresql://ytplayer_admin:<password>@yt-player-prod.xxxxx.us-east-1.rds.amazonaws.com:5432/ytplayer?sslmode=require"}'

# S3 Credentials (using IAM roles is preferred, but if using access keys:)
aws secretsmanager create-secret \
  --name "yt-player/s3/access-key" \
  --secret-string '{"STORAGE_ACCESS_KEY":"AKIA..."}'
aws secretsmanager create-secret \
  --name "yt-player/s3/secret-key" \
  --secret-string '{"STORAGE_SECRET_KEY":"..."}'

# Redis
aws secretsmanager create-secret \
  --name "yt-player/redis/host" \
  --secret-string '{"REDIS_HOST":"yt-player-redis.xxxxx.ng.0001.use1.cache.amazonaws.com"}'
aws secretsmanager create-secret \
  --name "yt-player/redis/auth-token" \
  --secret-string '{"REDIS_PASSWORD":"..."}'
```

### Environment Variables Reference

| Variable | Source | Services | Notes |
|----------|--------|----------|-------|
| `DATABASE_URL` | Secrets Manager | API, Worker | With `sslmode=require` |
| `REDIS_HOST` | Secrets Manager | API, Worker | ElastiCache endpoint |
| `REDIS_PORT` | Hardcoded | API, Worker | `6379` |
| `REDIS_PASSWORD` | Secrets Manager | API, Worker | ElastiCache AUTH token |
| `STORAGE_ACCESS_KEY` | Secrets Manager | API, Worker | Not needed if using IAM roles |
| `STORAGE_SECRET_KEY` | Secrets Manager | API, Worker | Not needed if using IAM roles |
| `STORAGE_BUCKET` | Environment | API, Worker | `yt-player-prod-ACCOUNT` |
| `STORAGE_REGION` | Environment | API, Worker | `us-east-1` |
| `STORAGE_ENDPOINT` | Not set | API, Worker | Omit for AWS S3 (uses default) |
| `STORAGE_PUBLIC_URL` | Environment | API, Worker | `https://dxxx.cloudfront.net` |
| `API_CORS_ORIGIN` | Environment | API | `https://ytplayer.example.com` |
| `VITE_API_URL` | Environment | Web | `https://api.ytplayer.example.com` |
| `NODE_ENV` | Environment | All | `production` |
| `TEMP_DIR` | Environment | API, Worker | `/tmp/yt-player` |
| `WHISPER_MODEL` | Environment | Worker | `base` |
| `API_PORT` | Environment | API | `4000` (internal) |
| `API_HOST` | Environment | API | `0.0.0.0` |

### ECS Environment Injection

Use **AWS CDK** or **Terraform** to inject environment variables from Secrets Manager:

**CDK Example:**
```typescript
const taskDef = new ecs.FargateTaskDefinition(this, 'ApiTaskDef', {
  executionRole,
  taskRole,
});

taskDef.addContainer('api', {
  image: ecs.ContainerImage.fromEcrRepository(apiRepo),
  environment: {
    NODE_ENV: 'production',
    API_PORT: '4000',
    STORAGE_BUCKET: 'yt-player-prod',
    STORAGE_REGION: 'us-east-1',
  },
  secrets: {
    DATABASE_URL: ecs.Secret.fromSecretsManager(rdsSecret),
    REDIS_HOST: ecs.Secret.fromSecretsManager(redisHostSecret),
    REDIS_PASSWORD: ecs.Secret.fromSecretsManager(redisAuthSecret),
  },
});
```

---

## 8. Auto Scaling

### API Service — Target Tracking Scaling

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id "service/yt-player-prod/yt-player-api" \
  --scalable-dimension "ecs:service:DesiredCount" \
  --min-capacity 2 \
  --max-capacity 6

# Scale on CPU
aws application-autoscaling put-scaling-policy \
  --policy-name "yt-player-api-cpu" \
  --service-namespace ecs \
  --resource-id "service/yt-player-prod/yt-player-api" \
  --scalable-dimension "ecs:service:DesiredCount" \
  --policy-type "TargetTrackingScaling" \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleOutCooldown": 60,
    "ScaleInCooldown": 120
  }'

# Scale on request count (via ALB)
aws application-autoscaling put-scaling-policy \
  --policy-name "yt-player-api-requests" \
  --service-namespace ecs \
  --resource-id "service/yt-player-prod/yt-player-api" \
  --scalable-dimension "ecs:service:DesiredCount" \
  --policy-type "TargetTrackingScaling" \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 1000,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ALBRequestCountPerTarget"
    },
    "ScaleOutCooldown": 60,
    "ScaleInCooldown": 120
  }'
```

### Worker Service — Custom Scaling (BullMQ Queue Depth)

BullMQ doesn't have native AWS metrics, so use custom CloudWatch metrics:

```typescript
// packages/api/src/monitoring.ts
import { Queue } from 'bullmq'
import { CloudWatch } from '@aws-sdk/client-cloudwatch'

export async function reportQueueMetrics(queue: Queue) {
  const cw = new CloudWatch()
  const jobCounts = await queue.getJobCounts()

  await cw.putMetricData({
    Namespace: 'YTPlayer',
    MetricData: [
      {
        MetricName: 'BullMQWaiting',
        Value: jobCounts.waiting,
        Unit: 'Count',
        Dimensions: [{ Name: 'Queue', Value: queue.name }],
      },
      {
        MetricName: 'BullMQActive',
        Value: jobCounts.active,
        Unit: 'Count',
        Dimensions: [{ Name: 'Queue', Value: queue.name }],
      },
    ],
  })
}
```

Then create a scaling policy based on `BullMQWaiting` custom metric:

```bash
aws application-autoscaling put-scaling-policy \
  --policy-name "yt-player-worker-queue-depth" \
  --service-namespace ecs \
  --resource-id "service/yt-player-prod/yt-player-worker" \
  --scalable-dimension "ecs:service:DesiredCount" \
  --policy-type "StepScaling" \
  --step-scaling-policy-configuration '{
    "AdjustmentType": "ChangeInCapacity",
    "StepAdjustments": [
      {"MetricIntervalLowerBound": 0, "MetricIntervalUpperBound": 10, "ScalingAdjustment": 0},
      {"MetricIntervalLowerBound": 10, "MetricIntervalUpperBound": 50, "ScalingAdjustment": 1},
      {"MetricIntervalLowerBound": 50, "ScalingAdjustment": 2}
    ],
    "MetricAggregationType": "Average",
    "Cooldown": 300
  }'
```

---

## 9. Monitoring & Alerting

### CloudWatch Dashboards

```bash
aws cloudwatch put-dashboard \
  --dashboard-name "YTPlayer-Prod" \
  --dashboard-body '{
    "widgets": [
      {
        "type": "metric",
        "x": 0, "y": 0, "width": 12, "height": 6,
        "properties": {
          "metrics": [
            ["ECS/ContainerInsights", "CpuUtilized", {"stat": "Average"}],
            ["ECS/ContainerInsights", "MemoryUtilized", {"stat": "Average"}]
          ],
          "period": 300,
          "stat": "Average",
          "region": "us-east-1",
          "title": "ECS Resource Utilization"
        }
      },
      {
        "type": "metric",
        "x": 12, "y": 0, "width": 12, "height": 6,
        "properties": {
          "metrics": [
            ["AWS/RDS", "CPUUtilization", {"stat": "Average"}],
            ["AWS/RDS", "DatabaseConnections", {"stat": "Average"}]
          ],
          "period": 300,
          "stat": "Average",
          "region": "us-east-1",
          "title": "RDS Metrics"
        }
      },
      {
        "type": "metric",
        "x": 0, "y": 6, "width": 8, "height": 6,
        "properties": {
          "metrics": [
            ["AWS/ElastiCache", "CPUUtilization", {"stat": "Average"}],
            ["AWS/ElastiCache", "CurrConnections", {"stat": "Average"}],
            ["AWS/ElastiCache", "FreeableMemory", {"stat": "Average"}]
          ],
          "period": 300,
          "stat": "Average",
          "region": "us-east-1",
          "title": "ElastiCache Metrics"
        }
      },
      {
        "type": "metric",
        "x": 8, "y": 6, "width": 8, "height": 6,
        "properties": {
          "metrics": [
            ["AWS/ApplicationELB", "RequestCount", {"stat": "Sum"}],
            ["AWS/ApplicationELB", "TargetResponseTime", {"stat": "Average"}],
            ["AWS/ApplicationELB", "HTTPCode_Target_5xx_Count", {"stat": "Sum"}]
          ],
          "period": 300,
          "stat": "Sum",
          "region": "us-east-1",
          "title": "ALB Metrics"
        }
      },
      {
        "type": "metric",
        "x": 16, "y": 6, "width": 8, "height": 6,
        "properties": {
          "metrics": [
            ["YTPlayer", "BullMQWaiting", {"stat": "Sum"}],
            ["YTPlayer", "BullMQActive", {"stat": "Sum"}]
          ],
          "period": 300,
          "stat": "Sum",
          "region": "us-east-1",
          "title": "BullMQ Queue Depth"
        }
      }
    ]
  }'
```

### CloudWatch Alarms

```bash
# API high CPU
aws cloudwatch put-metric-alarm \
  --alarm-name "yt-player-api-high-cpu" \
  --alarm-description "API service CPU > 80% for 5 minutes" \
  --metric-name "CPUUtilization" \
  --namespace "ECS/ContainerInsights" \
  --statistic "Average" \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator "GreaterThanThreshold" \
  --dimensions '[{"Name":"ServiceName","Value":"yt-player-api"}]' \
  --alarm-actions "arn:aws:sns:us-east-1:ACCOUNT:yt-player-alerts"

# RDS connection spike
aws cloudwatch put-metric-alarm \
  --alarm-name "yt-player-rds-connections" \
  --alarm-description "RDS connections > 100" \
  --metric-name "DatabaseConnections" \
  --namespace "AWS/RDS" \
  --statistic "Average" \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 100 \
  --comparison-operator "GreaterThanThreshold" \
  --dimensions '[{"Name":"DBInstanceIdentifier","Value":"yt-player-prod"}]' \
  --alarm-actions "arn:aws:sns:us-east-1:ACCOUNT:yt-player-alerts"

# BullMQ queue depth (waiting jobs > 100)
aws cloudwatch put-metric-alarm \
  --alarm-name "yt-player-queue-backlog" \
  --alarm-description "More than 100 jobs waiting in queue" \
  --metric-name "BullMQWaiting" \
  --namespace "YTPlayer" \
  --statistic "Sum" \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 100 \
  --comparison-operator "GreaterThanThreshold" \
  --alarm-actions "arn:aws:sns:us-east-1:ACCOUNT:yt-player-alerts"
```

### Structured Logging

The project uses **pino** for structured JSON logging. In production, set up:

```bash
# CloudWatch Logs Insights query for errors
fields @timestamp, @message
| filter @message like /error|Error|ERROR|failed|Failed/
| sort @timestamp desc
| limit 100

# Monitor pipeline duration
parse @message "Pipeline] Complete for *" as videoId
| stats count(*) by bin(1h)

# Worker job failures
fields @timestamp, @message
| filter @logStream like /worker/
| filter @message like /Job.*failed/
| sort @timestamp desc
```

### Distributed Tracing with X-Ray

```bash
# Enable X-Ray on ECS tasks
aws ecs update-service \
  --cluster "yt-player-prod" \
  --service "yt-player-api" \
  --enable-tracing
```

Add AWS X-Ray SDK to the API:
```bash
pnpm add aws-xray-sdk-core
```

```typescript
// packages/api/src/middleware/tracing.ts
import AWSXRay from 'aws-xray-sdk-core'

export function setupTracing() {
  if (process.env.NODE_ENV === 'production') {
    AWSXRay.enable()
    AWSXRay.setDaemonAddress('0.0.0.0:2000')
  }
}
```

---

## 10. CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS Production

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  AWS_REGION: us-east-1
  ECR_BASE: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.us-east-1.amazonaws.com
  IMAGE_TAG: ${{ github.sha }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm build

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      - uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker images
        run: |
          docker build -f docker/Dockerfile.api \
            -t $ECR_BASE/yt-player/api:$IMAGE_TAG \
            -t $ECR_BASE/yt-player/api:latest .
          docker build -f docker/Dockerfile.worker \
            -t $ECR_BASE/yt-player/worker:$IMAGE_TAG \
            -t $ECR_BASE/yt-player/worker:latest .
          docker build -f docker/Dockerfile.web \
            -t $ECR_BASE/yt-player/web:$IMAGE_TAG \
            -t $ECR_BASE/yt-player/web:latest .
          docker push --all-tags $ECR_BASE/yt-player/api
          docker push --all-tags $ECR_BASE/yt-player/worker
          docker push --all-tags $ECR_BASE/yt-player/web

  migrate:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      - name: Run database migrations
        run: |
          aws ecs run-task \
            --cluster yt-player-prod \
            --task-definition yt-player-migration \
            --launch-type FARGATE \
            --network-configuration '{
              "awsvpcConfiguration": {
                "subnets": ["subnet-xxx"],
                "securityGroups": ["sg-yyy"]
              }
            }' \
            --overrides '{
              "containerOverrides": [{
                "name": "migration",
                "command": ["npx", "prisma", "migrate", "deploy"]
              }]
            }'

  deploy:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      - name: Deploy API
        run: |
          aws ecs update-service \
            --cluster yt-player-prod \
            --service yt-player-api \
            --force-new-deployment
      - name: Deploy Worker
        run: |
          aws ecs update-service \
            --cluster yt-player-prod \
            --service yt-player-worker \
            --force-new-deployment
      - name: Deploy Frontend
        run: |
          # Build and sync to S3
          cd packages/web
          pnpm install --frozen-lockfile
          pnpm build
          aws s3 sync dist/ s3://yt-player-frontend/ --delete
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DIST_ID }} \
            --paths "/*"

  health-check:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - name: Wait for deployment
        run: sleep 30
      - name: Check API health
        run: |
          curl -f https://api.ytplayer.example.com/api/health \
            || (echo "Health check failed!" && exit 1)
      - name: Check page loads
        run: |
          curl -f -o /dev/null -s -w "%{http_code}" https://ytplayer.example.com \
            | grep 200 || (echo "Frontend not responding" && exit 1)

  notify:
    needs: [deploy, health-check]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "YT Player deploy ${{ job.status == 'success' && '✅' || '❌' }} (${{ github.sha }})"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Rolling Update Strategy

```bash
# Minimum healthy percent: 100 (blue-green)
# Maximum percent: 200
aws ecs update-service \
  --cluster "yt-player-prod" \
  --service "yt-player-api" \
  --deployment-configuration '{
    "deploymentCircuitBreaker": {
      "enable": true,
      "rollback": true
    },
    "maximumPercent": 200,
    "minimumHealthyPercent": 100
  }'
```

---

## 11. Cost Estimates

Approximate monthly costs for a production deployment (us-east-1):

| Service | Configuration | Estimated Monthly |
|---------|---------------|-------------------|
| **ECS Fargate API** | 2 × 1vCPU/2GB | ~$60 |
| **ECS Fargate Worker** | 2 × 4vCPU/8GB | ~$240 |
| **ALB** | 1 ALB + data processing | ~$25 |
| **RDS PostgreSQL** | db.r6g.large × 2 (Multi-AZ) | ~$350 |
| **ElastiCache Redis** | cache.r6g.large × 1 | ~$130 |
| **S3 Standard** | 500GB data + requests | ~$15 |
| **CloudFront** | 1TB transfer + requests | ~$90 |
| **CloudWatch Logs** | 50GB ingest | ~$25 |
| **Secrets Manager** | 5 secrets | ~$2 |
| **NAT Gateway** | 1 NAT × data processing | ~$35 |
| **Total** | | **~$972/month** |

**Cost-saving tips:**
- Use **reserved instances** for RDS and ElastiCache (up to 60% savings)
- Use **S3 Intelligent-Tiering** for video assets (auto-moves to colder tiers)
- Set up **S3 lifecycle policies** to expire old video assets
- Use **spot instances** for worker tasks (if fault-tolerant)
- **Right-size**: start with smaller instances and scale up based on metrics
- Use **VPC Endpoints** for S3 and ECR (no NAT data processing costs)

---

## 12. Runbook: Common Operations

### 12.1 Deploy a new version

```bash
git tag v1.2.3
git push origin v1.2.3
# CI/CD pipeline triggers automatically
# Or manually:
./scripts/deploy/build-and-push.sh
aws ecs update-service --cluster yt-player-prod --service yt-player-api --force-new-deployment
aws ecs update-service --cluster yt-player-prod --service yt-player-worker --force-new-deployment
```

### 12.2 Rollback a deployment

```bash
# Rollback to previous task definition
PREVIOUS_TD=$(aws ecs describe-services \
  --cluster yt-player-prod \
  --services yt-player-api \
  --query 'services[0].deployments[-1].taskDefinition' \
  --output text)

aws ecs update-service \
  --cluster yt-player-prod \
  --service yt-player-api \
  --task-definition "$PREVIOUS_TD"

# Or rollback from deployment circuit breaker:
# (Automatically rolls back if health checks fail)
```

### 12.3 Scale workers for high demand

```bash
# Manually increase worker count
aws ecs update-service \
  --cluster yt-player-prod \
  --service yt-player-worker \
  --desired-count 10

# Wait for queue to drain, then scale back:
aws ecs update-service \
  --cluster yt-player-prod \
  --service yt-player-worker \
  --desired-count 2
```

### 12.4 View logs

```bash
# API logs
aws logs tail /ecs/yt-player-api --follow

# Worker logs
aws logs tail /ecs/yt-player-worker --follow

# Filter errors
aws logs filter-log-events \
  --log-group-name /ecs/yt-player-worker \
  --filter-pattern "error" \
  --limit 50
```

### 12.5 Connect to a running container

```bash
aws ecs execute-command \
  --cluster yt-player-prod \
  --task "arn:aws:ecs:...:task/..." \
  --container api \
  --command "/bin/sh" \
  --interactive
```

### 12.6 Check Redis/BullMQ status

```bash
# Connect to ElastiCache via SSM
aws ssm start-session \
  --target "i-xxx" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["yt-player-redis.xxxxx.ng.0001.use1.cache.amazonaws.com"],"portNumber":["6379"],"localPortNumber":["6379"]}'

# Then locally:
redis-cli -p 6379
> INFO stats
> LLEN bull:yt-player-queue:waiting
> ZCARD bull:yt-player-queue:active
```

### 12.7 Handle a failed video pipeline

```bash
# Check worker logs for errors
aws logs filter-log-events \
  --log-group-name /ecs/yt-player-worker \
  --filter-pattern "Failed" \
  --limit 20

# Retry a failed job
# Via API:
curl -X POST https://api.ytplayer.example.com/api/videos \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtube.com/watch?v=RETRY_VIDEO_ID"}'

# Or manually re-enqueue via BullMQ dashboard
```

### 12.8 Take a database snapshot before risky operations

```bash
SNAPSHOT_NAME="yt-player-prod-pre-$(date +%Y%m%d%H%M%S)"
aws rds create-db-snapshot \
  --db-instance-identifier "yt-player-prod" \
  --db-snapshot-identifier "$SNAPSHOT_NAME"
echo "Snapshot: $SNAPSHOT_NAME"
```

---

## 13. Disaster Recovery

### RTO / RPO Targets

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single AZ failure | 2 minutes | 0 (Multi-AZ RDS) |
| Full region failure | 30 minutes | 5 minutes (cross-region snapshot) |
| Accidental data deletion | 15 minutes | 30 days (RDS backups) |
| Corrupt deployment | 5 minutes | N/A (rollback) |

### Backup Strategy

| Component | Method | Frequency | Retention |
|-----------|--------|-----------|-----------|
| PostgreSQL | RDS automated snapshots | Daily | 30 days |
| PostgreSQL | RDS manual snapshots | Before each deployment | 7 days |
| Redis (BullMQ) | No native backup (ephemeral) | — | Jobs are retryable |
| S3 Assets | S3 versioning | Every write | 90 days + Glacier |
| Docker Images | ECR scanning | On push | 90 days |

### Recovery Procedures

**Full region recovery:**
```bash
# 1. Create cross-region RDS snapshot
aws rds modify-db-instance \
  --db-instance-identifier yt-player-prod \
  --backup-target region

# 2. Restore in new region
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier yt-player-prod \
  --target-db-instance-identifier yt-player-prod-dr \
  --restore-time "2024-01-15T02:00:00Z" \
  --region us-west-2

# 3. Replicate S3 bucket cross-region
aws s3api put-bucket-replication \
  --bucket yt-player-prod \
  --replication-configuration '{
    "Role": "arn:aws:iam::ACCOUNT:role/s3-cross-region-replication",
    "Rules": [{
      "Status": "Enabled",
      "Destination": {
        "Bucket": "arn:aws:s3:::yt-player-prod-dr",
        "StorageClass": "STANDARD"
      }
    }]
  }'

# 4. Update Route53 DNS
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.ytplayer.example.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "NEW_ALB_ZONE_ID",
          "DNSName": "new-alb-xxxx.elb.us-west-2.amazonaws.com",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'

# 5. Deploy infrastructure in new region
cd terraform/environments/production
terraform workspace select us-west-2
terraform apply
```

### Incident Response

For each incident level:

**P1 (Service Down)** — Page on-call immediately:
1. Check if it's a deployment issue → rollback
2. Check RDS → verify connectivity, connections
3. Check Redis → verify ElastiCache status
4. Check ECS → verify task counts, restart services

**P2 (Degraded Service)** — Page within 15 minutes:
1. Check BullMQ queue depth
2. Check S3 bucket for throttling
3. Scale up workers temporarily
4. Review CloudWatch metrics

**P3 (Minor Issue)** — Handle during business hours:
1. Check error logs
2. Investigate slow queries
3. Review performance metrics

---

## Quick Reference: Terraform Module Structure

For full infrastructure-as-code, organize your Terraform like this:

```
terraform/
├── environments/
│   ├── production/
│   │   ├── main.tf           # VPC, subnet, security groups
│   │   ├── rds.tf            # RDS PostgreSQL
│   │   ├── redis.tf          # ElastiCache Redis
│   │   ├── s3.tf             # S3 buckets
│   │   ├── ecs.tf            # ECS cluster, services, tasks
│   │   ├── alb.tf            # Application Load Balancer
│   │   ├── cloudfront.tf     # CDN distribution
│   │   ├── monitoring.tf     # CloudWatch dashboards, alarms
│   │   ├── iam.tf            # IAM roles and policies
│   │   ├── secrets.tf        # Secrets Manager entries
│   │   └── outputs.tf
│   └── staging/
│       └── main.tf
├── modules/
│   ├── networking/
│   ├── ecs-service/
│   └── monitoring/
└── versions.tf
```

---

> **Last updated:** June 2026
> **Maintainer:** DevOps Team
> **Slack:** #yt-player-ops
> **PagerDuty:** yt-player-prod
