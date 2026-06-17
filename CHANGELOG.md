# Changelog

All notable changes to YT Player will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-06-18

### Initial Release

YT Player is a full-stack, YouTube-style video streaming platform. It ingests video URLs, transcodes them into multiple quality levels (HLS + DASH), generates AI-powered captions/descriptions, detects chapters, creates thumbnail sprites, and serves everything through a polished YouTube-inspired player.

#### Added

**Core Platform**
- Multi-protocol streaming with HLS (primary) and DASH (fallback) support
- Adaptive bitrate streaming via hls.js with automatic quality selection
- Manual override for quality levels (144p → 2160p)
- Video URL submission from YouTube, Twitter/X, TikTok, and other supported platforms
- Direct file upload via drag-and-drop with multi-file queue (up to 5GB per file)
- Real-time upload progress tracking with speed and ETA indicators
- YouTube-inspired UI with dark/light theme support (persisted to localStorage)
- Responsive video grid layout (1–4 columns) on the home page
- Skip-to-content accessibility link and focus-visible keyboard navigation

**AI-Powered Pipeline**
- Dual-backend speech-to-text via whisper.cpp (GGML) or Python openai-whisper fallback
- Word-level caption timestamps with per-word VTT cue generation
- Caption VTT (with sound effect markers) and clean subtitle VTT variant
- AI audio descriptions using vision-language models (GPT-4o, Claude Sonnet, or local Ollama)
- Frame extraction at configurable intervals, sent in batches to VLM for description generation
- Scene detection and chapter generation using FFmpeg's scene detection filter
- Automatic chapter VTT creation with timeline markers
- Thumbnail sprite sheets with VTT coordinate mapping for precise seek previews
- Configurable pipeline steps with 6 specialized BullMQ queues

**API Server (Fastify 5)**
- `POST /api/videos` — Submit video URL for processing (Zod-validated)
- `POST /api/videos/upload` — Upload video files with multipart support
- `GET /api/videos` — Paginated video listing with all relations
- `GET /api/videos/:id` — Full video details with renditions, tracks, chapters, manifests
- `GET /api/videos/:id/status` — Processing status endpoint
- `DELETE /api/videos/:id` — Video deletion with cascade
- `GET /api/stream/:id` — Streaming session with HLS/DASH manifests and tracks
- `GET /api/stream/:id/tracks` — VTT track listing
- `GET /api/health` — Health check (database + Redis)
- Graceful shutdown handling (SIGTERM/SIGINT)
- Pino structured logging with pino-pretty in development

**Video Processing Pipeline**
- Multi-stage transcoding with FFmpeg (HLS segments + DASH segments)
- 8 quality configurations: 144p through 2160p (dev mode limits to 360p + 720p)
- Sequential quality encoding to avoid CPU saturation
- HLS master playlist and DASH MPD generation
- Video downloading via yt-dlp with metadata extraction
- Local file support for direct uploads
- Audio extraction to 16kHz mono WAV for Whisper processing
- Automatic temp file cleanup on completion or failure

**Frontend (React 19 + Vite + Tailwind CSS 4)**
- Custom video player with controls: play/pause, seek, volume, fullscreen
- Playback speed control: 0.25× – 2×
- Quality selector (Auto / manual per-level)
- Chapter navigation with visual timeline indicators
- Captions/subtitles/descriptions via WebVTT tracks
- Thumbnail sprite seek previews
- Loading, buffering, and error states
- Upload page with URL form and drag-and-drop file queue
- File preview thumbnails with play/pause overlay
- Status badges for upload queue items (pending, uploading, done, failed, cancelled)
- Retry and cancel support for individual uploads
- Word-level captions toggle per video
- Processing pipeline visualization step indicator
- Empty states and error states with retry buttons

**Database (PostgreSQL + Prisma)**
- Complete schema with 7 models: Video, Rendition, AudioRendition, Track, Chapter, Manifest, ThumbnailSprite
- Video status enum: PENDING → DOWNLOADING → DOWNLOADED → PROCESSING → READY | FAILED
- Cascade delete from Video to all related models
- Indexed foreign keys for performance
- Prisma adapter with connection pooling (PgBouncer-compatible)

**Storage (S3/MinIO)**
- Unified StorageClient abstraction over AWS SDK S3
- Automatic bucket initialization
- Upload/download/delete/list operations
- Pre-signed URL generation for temporary access
- Public URL construction
- MinIO local development support with forcePathStyle
- Multi-part upload support via @aws-sdk/lib-storage
- Recursive directory upload for streaming assets
- Content-type detection by file extension

**Queue Infrastructure (BullMQ + Redis)**
- 6 specialized queues: video-ingest, video-process, caption-generate, thumbnail-generate, manifest-generate, cleanup
- Exponential backoff retry strategy
- Configurable concurrency per worker type
- Long-running job support (10-minute lock, 5-minute stalled interval)
- Automatic job cleanup (24h completed, 7d failed)
- Graceful shutdown with pending job completion

**AI Vision Module**
- Multi-provider VLM client supporting OpenAI GPT-4o, Anthropic Claude, and local Ollama
- Frame extraction via FFmpeg at configurable intervals
- Batched frame submission to VLM for scene descriptions
- Custom system prompt optimized for accessibility description generation
- Lazy base64 loading to avoid memory spikes
- API cost estimation for cloud providers
- Graceful fallback when no API key is configured

**Docker Infrastructure**
- Multi-stage Dockerfile for API (whisper.cpp build → deps → TypeScript build → production)
- Multi-stage Dockerfile for Worker (identical to API, runs worker entry point)
- Two-stage Dockerfile for Web (Vite build → Nginx static serve)
- Docker Compose with PostgreSQL 16, Redis 7, MinIO, API, Worker, Web services
- Health checks on all infrastructure services
- Development overrides with hot-reload volume mounts
- Production overrides for AWS S3 and Nginx reverse proxy
- Nginx configuration with SSL, rate limiting, HLS/DASH caching
- MinIO bucket initialization with public access policy

**CI/CD (GitHub Actions)**
- Test job: TypeScript typecheck + build on Node.js 22
- Build & Push: Docker images to ECR (3 images: API, Worker, Web)
- Migrate: Database migrations via ECS run-task
- Deploy: Force new ECS deployments + S3 frontend sync with CloudFront invalidation
- Health Check: API endpoint + frontend availability + ECS service stability verification
- Notify: Slack notification with deployment status and commit details
- Concurrency group to prevent parallel production deployments
- Manual workflow dispatch with optional image tag and skip-migration inputs
- Deployment circuit breaker with automatic rollback

**Terraform (AWS IaC)**
- 12 reusable modules: networking, ecs, database, redis, storage, alb, cdn, dns, iam, security, secrets, monitoring
- Production environment: Multi-AZ, ECS Fargate, RDS Multi-AZ, ElastiCache, CloudFront, WAF
- Staging environment: Single-AZ, t4g instances, no WAF, ~$150/month
- VPC with public, private, and isolated subnets across 2 AZs
- Security groups, IAM roles, Secrets Manager for sensitive data
- Auto-scaling policies (CPU, request count, queue depth)
- CloudWatch dashboards and alarms
- Route53 DNS with ACM SSL certificates

**Documentation**
- Comprehensive README with architecture diagram, setup guides, API reference
- 50+ page AWS deployment guide with CLI commands, Terraform, and runbook
- Steering configuration for deployment environments and pipeline definitions
- AGENTS.md with development guidelines for AI-assisted coding
- Custom agent skills for video pipeline, Docker setup, and stream debugging

#### Technical Details

- **Monorepo**: pnpm workspaces (8 packages), Turborepo for parallel builds
- **Language**: TypeScript 6 with strict mode across all packages
- **API**: Fastify 5 with Zod validation, CORS, multipart uploads
- **Frontend**: React 19 + Vite 8 + Tailwind CSS 4 + Radix UI primitives
- **Streaming**: hls.js for HLS, native dash.js support
- **Database**: Prisma ORM with PostgreSQL adapter (PgBouncer-compatible)
- **Queue**: BullMQ 5 with Redis 7 connection
- **Audio**: whisper.cpp (GGML) with Python openai-whisper fallback
- **Computer Vision**: GPT-4o, Claude Sonnet, or local Ollama (LLaVA)
- **Container**: Docker multi-stage builds, Docker Compose
- **Cloud**: AWS ECS Fargate, RDS, ElastiCache, S3, CloudFront, ALB
- **IaC**: Terraform with modular architecture
- **CI/CD**: GitHub Actions with 6-stage deployment pipeline

[1.0.0]: https://github.com/afzalimdad9/yt-player/releases/tag/v1.0.0
