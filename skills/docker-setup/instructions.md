# Docker Setup Skill

This skill helps AI agents manage the Docker-based development environment.

## Architecture

```
Services:
├── postgres:16-alpine   (Database)
├── redis:7-alpine       (Queue + Cache)
├── minio/minio          (S3-compatible storage)
├── minio-init           (Bucket initialization)
├── api                  (Fastify server)
├── worker               (BullMQ workers)
└── web                  (Nginx + React frontend)
```

## Common Operations

```bash
# Start everything
docker compose -f docker/docker-compose.yml up -d

# Start with dev overrides (hot reload)
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up

# Start production stack
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up

# View logs
docker compose logs -f [service]

# Rebuild a service
docker compose build [service]

# Reset everything (destroys data)
docker compose down -v
```

## MinIO Setup

MinIO provides S3-compatible storage for local development.
- API: http://localhost:9000
- Console: http://localhost:9001 (login: minioadmin/minioadmin)
- Bucket: yt-player (auto-created)

## Production Migration

For production:
1. Replace MinIO with AWS S3
2. Set `STORAGE_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
3. Use `docker-compose.prod.yml` overrides
4. Add SSL certificates for Nginx
5. Configure proper secrets management
