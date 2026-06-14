#!/bin/bash
# Initialize MinIO buckets for local development

set -euo pipefail

MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin}"
BUCKET="${STORAGE_BUCKET:-yt-player}"

echo "Initializing MinIO bucket: $BUCKET"

# Configure mc client
mc alias set local "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"

# Create bucket (ignore if exists)
mc mb "local/$BUCKET" --ignore-existing 2>/dev/null || true

# Set public policy
mc policy set public "local/$BUCKET" 2>/dev/null || true

echo "MinIO bucket '$BUCKET' initialized successfully!"
