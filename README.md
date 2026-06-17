<div align="center">
  <br />
  <img src="https://raw.githubusercontent.com/afzalimdad9/yt-player/main/packages/web/public/vite.svg" alt="YT Player Logo" width="80" />
  <h1>YT Player</h1>
  <p>
    <strong>YouTube-style video streaming platform with an advanced AI-powered processing pipeline</strong>
  </p>
  <p>
    <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19" />
    <img src="https://img.shields.io/badge/Fastify-5-000000?logo=fastify" alt="Fastify 5" />
    <img src="https://img.shields.io/badge/Prisma-2D3748?logo=prisma" alt="Prisma" />
    <img src="https://img.shields.io/badge/BullMQ-FF6B35?logo=redis" alt="BullMQ" />
    <img src="https://img.shields.io/badge/Docker-2496ED?logo=docker" alt="Docker" />
    <img src="https://img.shields.io/badge/FFmpeg-007808?logo=ffmpeg" alt="FFmpeg" />
    <img src="https://img.shields.io/badge/AWS-232F3E?logo=amazonwebservices" alt="AWS" />
  </p>
</div>

---

## 📋 Overview

**YT Player** is a full-stack, YouTube-like video streaming platform that transforms raw video URLs (or uploaded files) into professionally processed, streaming-ready content. It downloads videos, transcodes them into multiple quality levels (HLS + DASH), generates AI-powered captions and descriptions, detects chapters, creates thumbnail sprites, and serves everything through a polished YouTube-inspired player.

> **Status:** Active Development  
> **Stack:** TypeScript, React 19, Fastify 5, PostgreSQL, Redis, FFmpeg, Whisper AI

---

## ✨ Features

### Core Platform
- **Multi-Protocol Streaming** — HLS (primary) and DASH (fallback) with up to 8 quality levels (144p → 2160p)
- **Adaptive Bitrate** — Player auto-selects quality based on network conditions; manual override available
- **Video Upload** — Paste a URL (YouTube, Twitter/X, TikTok, etc.) or drag-and-drop files (up to 5GB)
- **YouTube-Inspired UI** — Dark/light themes, responsive grid layout, search bar, and notification bell
- **Keyboard & Accessibility** — Skip-to-content links, focus-visible rings, ARIA labels, reduced-motion support

### AI-Powered Pipeline
- **Whisper Captions** — Automatic speech-to-text via whisper.cpp (GGML) or Python openai-whisper fallback
- **Word-Level Timing** — Per-word timestamp precision for caption/subtitle cues
- **AI Audio Descriptions** — Vision-language model (GPT-4o, Claude Sonnet, or local Ollama) generates accessibility descriptions from video frames
- **Scene Detection** — Automatic chapter markers via FFmpeg scene detection filter
- **Thumbnail Sprites** — Sprite sheets with VTT coordinate mapping for precise seek previews

### Infrastructure
- **Background Jobs** — BullMQ-powered queue with 6 specialized queues for parallel pipeline processing
- **S3-Compatible Storage** — MinIO for development, AWS S3 for production with pre-signed URLs
- **CI/CD** — GitHub Actions pipeline: test → build → migrate → deploy → health check → Slack notify
- **Terraform** — Infrastructure-as-Code for AWS production and staging environments
- **Docker Compose** — One-command local development with all dependencies

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User Browser                               │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  Home (grid) │  │  Watch Page  │  │  Upload (URL + File DnD) │  │
│  └─────────────┘  └──────┬───────┘  └───────────────────────────┘  │
│                          │ HLS.js / dash.js                         │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────────┐
│                 Fastify API (:4000)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐  │
│  │ /health  │ │ /videos  │ │ /stream  │ │  Zod Validation      │  │
│  └──────────┘ └────┬─────┘ └────┬─────┘ │  Error Middleware    │  │
│                    │             │       └──────────────────────┘  │
│              ┌─────▼─────┐      │                                   │
│              │   Prisma   │      │                                   │
│              └─────┬─────┘      │                                   │
└────────────────────┼────────────┼───────────────────────────────────┘
                     │            │
          ┌──────────▼──┐  ┌──────▼──────┐
          │ PostgreSQL  │  │   Redis     │
          │  (Prisma)   │  │  (BullMQ)   │
          └─────────────┘  └──────┬──────┘
                                  │
          ┌───────────────────────▼───────────────────────────────┐
          │               BullMQ Worker (Background)               │
          │                                                       │
          │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
          │  │ Download │  │Transcode │  │  Caption Gen     │    │
          │  │ (yt-dlp) │  │(FFmpeg)  │  │  (Whisper)       │    │
          │  └──────────┘  └────┬─────┘  └──────────────────┘    │
          │                     │                                 │
          │  ┌──────────────────▼────────────────────────────┐    │
          │  │  Scene Detection  │  Thumbnail Sprites        │    │
          │  │  (FFmpeg)         │  (FFmpeg tile + VTT)      │    │
          │  └───────────────────┴───────────────────────────┘    │
          │                     │                                 │
          │  ┌──────────────────▼────────────────────────────┐    │
          │  │   AI Vision (GPT-4o / Claude / Ollama)        │    │
          │  │   → Audio Descriptions from video frames      │    │
          │  └───────────────────────────────────────────────┘    │
          │                     │                                 │
          │                     ▼                                 │
          │           ┌─────────────────┐                        │
          │           │   Upload to S3  │                        │
          │           │  (HLS + DASH +  │                        │
          │           │   VTT + Sprites)│                        │
          │           └────────┬────────┘                        │
          └────────────────────┼─────────────────────────────────┘
                               │
                     ┌─────────▼─────────┐
                     │  S3 / MinIO       │
                     │  (Video Assets)   │
                     └───────────────────┘
```

### Package Dependency Graph

```
shared (types, enums, schemas — no deps)
    ↑
database ──┐
storage ───┤
queue ─────┼──→ pipeline ──→ api ──→ web
           │
           └─────────────────┘
```

---

## 🧩 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Language** | TypeScript 6 (strict) | End-to-end type safety |
| **Monorepo** | pnpm workspaces + Turborepo | Dependency management, parallel builds |
| **API Server** | Fastify 5 | High-performance HTTP server with Zod validation |
| **Database** | PostgreSQL 16 + Prisma ORM | Relational data + type-safe queries |
| **Queue** | BullMQ + Redis 7 | Durable background job processing |
| **Storage** | AWS SDK S3 / MinIO | Video asset storage with pre-signed URLs |
| **Video Processing** | FFmpeg (fluent-ffmpeg) | Transcoding, scene detection, thumbnail extraction |
| **Speech-to-Text** | whisper.cpp / openai-whisper | Caption/subtitle generation |
| **AI Vision** | GPT-4o / Claude / Ollama | Audio description generation from frames |
| **Frontend** | React 19 + Vite + Tailwind CSS 4 | YouTube-like UI with dark/light themes |
| **Streaming** | HLS.js + dash.js | Client-side adaptive bitrate streaming |
| **Container** | Docker + Docker Compose | Local development and production deployment |
| **Cloud** | AWS (ECS, RDS, ElastiCache, S3, CloudFront) | Production infrastructure |
| **IaC** | Terraform | Infrastructure-as-Code for AWS |
| **CI/CD** | GitHub Actions | Automated test, build, deploy pipeline |

---

## 📦 Project Structure

```
yt-player/
├── packages/
│   ├── shared/              # Shared TypeScript types, enums, interfaces
│   │   └── src/types/       # Video, stream, job type definitions
│   ├── database/            # Prisma ORM + PostgreSQL schema
│   │   ├── prisma/          # Schema, migrations
│   │   └── src/generated/   # Auto-generated Prisma client
│   ├── storage/             # S3/MinIO abstraction layer
│   │   └── src/             # StorageClient (upload, download, presigned URLs)
│   ├── queue/               # BullMQ + Redis queue infrastructure
│   │   └── src/             # Queue/Worker creation, Redis connection
│   ├── pipeline/            # Video processing pipeline
│   │   └── src/
│   │       ├── orchestrator.ts   # Pipeline coordinator (10 steps)
│   │       ├── downloader.ts     # yt-dlp + local file handling
│   │       ├── transcoder.ts     # FFmpeg HLS + DASH encoding
│   │       ├── chapter-detector.ts  # Scene change detection
│   │       ├── thumbnail-sprite.ts   # Sprite sheet + VTT generation
│   │       ├── manifest-generator.ts # Upload assets + generate manifests
│   │       ├── whisper/           # Speech-to-text (whisper.cpp + Python)
│   │       └── vision/            # AI description generation (VLM client)
│   ├── api/                 # Fastify REST API server
│   │   └── src/
│   │       ├── routes/      # videos, stream, health endpoints
│   │       ├── middleware/  # Error handling, Zod validation
│   │       └── workers.ts   # BullMQ worker definitions
│   └── web/                 # React frontend
│       └── src/
│           ├── components/  # VideoPlayer, Upload, Layout
│           ├── pages/       # Home, Watch, Upload pages
│           ├── services/    # API client
│           └── styles/      # Tailwind CSS + custom theme
├── docker/                  # Docker Compose, Dockerfiles, Nginx configs
│   ├── docker-compose.yml   # Main services (postgres, redis, minio, api, worker, web)
│   ├── docker-compose.dev.yml  # Dev overrides (hot-reload mounts)
│   ├── docker-compose.prod.yml # Production overrides (S3, Nginx proxy)
│   ├── Dockerfile.api       # Multi-stage: whisper.cpp build → deps → production
│   ├── Dockerfile.worker    # Multi-stage: whisper.cpp build → deps → production
│   ├── Dockerfile.web       # Nginx static serve
│   └── nginx/               # Nginx configs (reverse proxy, SPA routing)
├── terraform/               # AWS Infrastructure-as-Code
│   ├── environments/
│   │   ├── production/      # Main.tf, variables, outputs
│   │   └── staging/         # Lighter-weight staging deployment
│   └── modules/             # Reusable Terraform modules
│       ├── networking/      # VPC, subnets, NAT, endpoints
│       ├── ecs/             # Fargate task definitions + auto-scaling
│       ├── database/        # RDS PostgreSQL
│       ├── redis/           # ElastiCache Redis
│       ├── storage/         # S3 buckets
│       ├── alb/             # Application Load Balancer
│       ├── cdn/             # CloudFront distribution
│       ├── dns/             # Route53 records
│       ├── iam/             # IAM roles and policies
│       ├── security/        # Security groups
│       ├── secrets/         # AWS Secrets Manager
│       └── monitoring/      # CloudWatch dashboards + alarms
├── scripts/                 # Development and deployment scripts
│   ├── dev.sh               # One-command dev startup
│   ├── setup-whisper.sh     # whisper.cpp + model installation
│   └── deploy/              # Build & push Docker to ECR
├── steering/                # Build/deploy automation configs
│   ├── deploy.yml           # Environment-specific deployment settings
│   └── pipeline.yml         # Video pipeline step definitions
├── skills/                  # Custom AI agent skills for development
├── .github/workflows/       # CI/CD (test, build, migrate, deploy, health, notify)
└── docs/                    # Documentation
    └── aws-deployment-guide.md  # Comprehensive AWS deployment guide
```

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Node.js](https://nodejs.org/) | ≥ 22 | JavaScript runtime |
| [pnpm](https://pnpm.io/) | ≥ 9 | Package manager |
| [Docker](https://www.docker.com/) | Latest | PostgreSQL, Redis, MinIO containers |
| [FFmpeg](https://ffmpeg.org/) | Latest | Video processing |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Latest | Video downloading from URLs |
| Whisper | (see below) | Speech-to-text transcription |

### One-Command Setup

```bash
# Clone the repository
git clone https://github.com/afzalimdad9/yt-player.git
cd yt-player

# Run the dev script (installs deps, starts Docker services, runs migrations, starts dev servers)
./scripts/dev.sh
```

### Manual Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Generate Prisma client
pnpm db:generate

# 3. Start infrastructure services
docker compose -f docker/docker-compose.yml up -d postgres redis minio minio-init

# 4. Push database schema
pnpm db:push

# 5. (Optional) Open Prisma Studio to explore the database
pnpm db:studio

# 6. Start development servers (in separate terminals)
pnpm --filter @yt-player/api dev        # API → http://localhost:4000
pnpm --filter @yt-player/web dev        # Frontend → http://localhost:5173
pnpm --filter @yt-player/api dev:worker # Background worker
```

### Setup Whisper (for Captions)

```bash
# Interactive setup (recommended)
./scripts/setup-whisper.sh --interactive

# Quick setup with base model
./scripts/setup-whisper.sh --model base

# Skip whisper.cpp, use Python openai-whisper instead
./scripts/setup-whisper.sh --python-only

# Full options
./scripts/setup-whisper.sh --help
```

### Verify Everything Works

```bash
# TypeScript type checking
pnpm typecheck

# Build all packages
pnpm build

# Check API health
curl http://localhost:4000/api/health

# Submit a test video
curl -X POST http://localhost:4000/api/videos \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

---

## 🎮 API Reference

### Video Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/videos` | Submit a video URL for processing |
| `POST` | `/api/videos/upload` | Upload a video file directly (multipart) |
| `GET` | `/api/videos` | List all videos (paginated) |
| `GET` | `/api/videos/:id` | Get video details with all relations |
| `GET` | `/api/videos/:id/status` | Get processing status |
| `DELETE` | `/api/videos/:id` | Delete video and all assets |

### Streaming Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/stream/:id` | Get streaming session (HLS + DASH manifests, tracks, thumbnails) |
| `GET` | `/api/stream/:id/manifest/:protocol` | Redirect to HLS/DASH manifest URL |
| `GET` | `/api/stream/:id/tracks` | Get all VTT tracks (captions, subtitles, chapters) |

### Health Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Full health check (database + Redis) |
| `GET` | `/api/health/ready` | Readiness probe (database only) |

### Example: Submit a Video

```bash
curl -X POST http://localhost:4000/api/videos \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://youtube.com/watch?v=VIDEO_ID",
    "title": "My Video",
    "wordTimestamps": true
  }'

# Response
{
  "success": true,
  "videoId": "uuid-here",
  "status": "PENDING",
  "message": "Video submitted for processing"
}
```

### Example: Upload a File

```bash
curl -X POST http://localhost:4000/api/videos/upload \
  -F "file=@/path/to/video.mp4" \
  -F "wordTimestamps=true"
```

---

## 🔄 Pipeline Flow

When a video is submitted, the following pipeline executes:

```
 1. PENDING     ──→ Video record created in database
                       │
 2. DOWNLOADING ──→ Download via yt-dlp (or use uploaded file)
                       │
 3. DOWNLOADED  ──→ Extract audio, probe metadata (ffprobe)
                       │
 4. PROCESSING  ──→ ┌─────────────────────────────────────┐
                    │  Transcode to HLS + DASH             │
                    │  (multiple quality levels via FFmpeg) │
                    │                                      │
                    │  Generate Captions (Whisper)          │
                    │  → Word-level VTT, subtitles VTT     │
                    │                                      │
                    │  Generate Audio Descriptions (AI)    │
                    │  → Frame extraction + VLM (GPT-4o)   │
                    │                                      │
                    │  Detect Chapters (FFmpeg scene)      │
                    │  → Chapter VTT with timestamps       │
                    │                                      │
                    │  Generate Thumbnail Sprites          │
                    │  → Sprite sheet + seek preview VTT   │
                    └─────────────────────────────────────┘
                       │
 5. READY       ──→ Upload all assets to S3/MinIO
                    Update database with metadata
                    Cleanup temp files
                       │
 6. FAILED      ──→ (if any step fails)
                    Error message recorded in database
```

### Quality Levels

| Level | Resolution | Bitrate | Use Case |
|-------|-----------|---------|----------|
| 144p | 256×144 | 100 Kbps | Low bandwidth |
| 240p | 426×240 | 300 Kbps | Mobile 2G/3G |
| 360p | 640×360 | 600 Kbps | Mobile 4G |
| 480p | 854×480 | 1.2 Mbps | SD streaming |
| 720p | 1280×720 | 2.5 Mbps | HD streaming |
| 1080p | 1920×1080 | 5 Mbps | Full HD |
| 1440p | 2560×1440 | 10 Mbps | 2K |
| 2160p | 3840×2160 | 20 Mbps | 4K |

> **Note:** In development mode, only 360p and 720p are generated for faster testing.

---

## 🖥️ Frontend Features

### Video Player
- **HLS.js** integration with adaptive bitrate streaming
- **DASH** fallback for unsupported browsers
- Custom controls: play/pause, seek, volume, fullscreen
- Playback speed: 0.25× – 2×
- Quality selector: Auto / manual level selection
- Chapter navigation with timeline markers
- Captions/subtitles/descriptions via WebVTT tracks
- Thumbnail sprite previews on seek hover
- Keyboard shortcuts, buffering indicator, error recovery

### Upload Page
- **URL submission** — supports YouTube, Twitter/X, TikTok, etc.
- **Drag & drop** — multi-file upload with 5GB limit
- **File queue** — preview thumbnails, progress bars, speed/ETA
- **Word-level captions toggle** — per-video configuration
- **Processing pipeline visualization** — step-by-step status

### Home Page
- Responsive video grid (1–4 columns)
- Thumbnails with duration overlays
- Status badges (READY, PROCESSING, FAILED, etc.)
- Error state with retry button
- Empty state with call-to-action
- Dark/light theme toggle (persisted to localStorage)

---

## 🐳 Docker Environment

### Development

```bash
# Start all services with hot-reload
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up

# Or use the convenience script
./scripts/dev.sh
```

### Production Build

```bash
# Build and run production stack
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up --build
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| **PostgreSQL** | 5432 | Primary database |
| **Redis** | 6379 | Queue backend + caching |
| **MinIO** | 9000 (API) / 9001 (Console) | S3-compatible storage |
| **API** | 4000 | Fastify REST API |
| **Worker** | — | BullMQ background jobs |
| **Web** | 5173 | Vite dev server / Nginx |

### Dockerfiles

Three multi-stage Dockerfiles are provided:

- **`Dockerfile.api`** — Builds whisper.cpp, installs dependencies, compiles TypeScript, produces production image with FFmpeg + Python whisper fallback
- **`Dockerfile.worker`** — Same as API but runs the worker entry point
- **`Dockerfile.web`** — Two-stage build: Vite compilation → Nginx static serving

---

## 🔧 Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | `postgresql://ytplayer:ytplayer@localhost:5432/ytplayer` | ✅ | PostgreSQL connection string |
| `REDIS_HOST` | `localhost` | ✅ | Redis server hostname |
| `REDIS_PORT` | `6379` | | Redis server port |
| `REDIS_PASSWORD` | — | | Redis AUTH password |
| `STORAGE_ENDPOINT` | `http://localhost:9000` | ✅ | S3/MinIO endpoint |
| `STORAGE_ACCESS_KEY` | `minioadmin` | ✅ | S3 access key |
| `STORAGE_SECRET_KEY` | `minioadmin` | ✅ | S3 secret key |
| `STORAGE_BUCKET` | `yt-player` | ✅ | S3 bucket name |
| `STORAGE_REGION` | `us-east-1` | | AWS region |
| `STORAGE_PUBLIC_URL` | `http://localhost:9000/yt-player` | | Public-facing storage URL |
| `API_PORT` | `4000` | | API server port |
| `API_HOST` | `0.0.0.0` | | API server host |
| `API_CORS_ORIGIN` | `http://localhost:5173` | | Allowed CORS origin |
| `NODE_ENV` | `development` | | Environment mode |
| `TEMP_DIR` | `./tmp` | | Temporary processing directory |
| `YT_DLP_PATH` | `yt-dlp` | | Path to yt-dlp binary |
| `WHISPER_MODEL` | `base` | | Whisper model name |
| `WHISPER_MODELS_DIR` | `~/.cache/whisper/models` | | Model storage path |
| `WHISPER_CPP_PATH` | — | | Path to whisper-cli binary |
| `DESCRIPTION_PROVIDER` | `openai` | | VLM provider: openai, anthropic, or ollama |
| `OPENAI_API_KEY` | — | * | OpenAI API key for GPT-4o vision |
| `ANTHROPIC_API_KEY` | — | * | Anthropic API key for Claude vision |
| `VLM_MODEL` | `gpt-4o` / `claude-sonnet-4-20250514` / `llava` | | Model override per provider |
| `VLM_MAX_TOKENS` | `1024` | | Max tokens for VLM responses |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | | Ollama server URL |
| `OLLAMA_MODEL` | `llava` | | Ollama model name |

---

## 🚢 Deployment

### Docker Compose (Self-Hosted)

```bash
# Set environment variables
export S3_BUCKET=my-yt-player
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

# Build and start
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up --build -d
```

### AWS (Full Production)

A comprehensive [AWS deployment guide](./docs/aws-deployment-guide.md) covers:

1. **S3** for video storage (with lifecycle policies, CORS, versioning)
2. **RDS PostgreSQL** (Multi-AZ, encrypted, auto-scaling storage)
3. **ElastiCache Redis** (BullMQ-optimized parameters)
4. **ECR** for container registry (with image scanning)
5. **ECS Fargate** for API + Worker containers (with auto-scaling)
6. **Application Load Balancer** (SSL termination, health checks)
7. **CloudFront CDN** (edge-cached video delivery)
8. **CloudWatch** monitoring and alerting

### Terraform

```bash
cd terraform/environments/production
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

### CI/CD (GitHub Actions)

The `.github/workflows/deploy.yml` pipeline automates:

1. **Test** — TypeScript typecheck + build
2. **Build & Push** — Docker images to ECR
3. **Migrate** — Run Prisma migrations via ECS run-task
4. **Deploy** — Force new ECS deployments + S3 frontend sync
5. **Health Check** — Verify API and frontend responsiveness
6. **Notify** — Slack notification with deployment status

---

## 🧪 Development

### Commands

```bash
pnpm dev              # Start all dev servers in parallel
pnpm build            # Build all packages
pnpm typecheck        # Type-check all packages
pnpm lint             # Run linters
pnpm clean            # Clean all build artifacts

# Database
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema to database
pnpm db:migrate       # Run database migrations
pnpm db:studio        # Open Prisma Studio

# Docker
pnpm docker:dev       # Start development Docker stack
pnpm docker:prod      # Start production Docker stack
pnpm docker:build     # Build all Docker images
```

### Monorepo Architecture

```
packages/
├── shared/        # Types, enums, interfaces (Zod schemas)
├── database/      # Prisma client + connection management
├── storage/       # S3 abstraction layer (AWS SDK)
├── queue/         # BullMQ + Redis connection management
├── pipeline/      # Video processing (FFmpeg, Whisper, VLM)
├── api/           # Fastify server + route handlers
└── web/           # React frontend (Vite + Tailwind)
```

---

## 📊 Database Schema

The PostgreSQL database is managed by Prisma with the following models:

```prisma
model Video {
  id              String          @id @default(uuid())
  title           String
  description     String
  originalUrl     String
  duration        Float
  width           Int
  height          Int
  fps             Float
  status          VideoStatus     @default(PENDING)
  error           String?
  thumbnailUrl    String?
  renditions      Rendition[]
  audioRenditions AudioRendition[]
  tracks          Track[]
  chapters        Chapter[]
  manifests       Manifest[]
  thumbnailSprites ThumbnailSprite[]
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
}
```

**Supporting models:** `Rendition`, `AudioRendition`, `Track`, `Chapter`, `Manifest`, `ThumbnailSprite` — all with cascade delete from their parent `Video`.

**Video statuses:** `PENDING → DOWNLOADING → DOWNLOADED → PROCESSING → READY | FAILED`

---

## 📚 Project Documentation

| Document | Description |
|----------|-------------|
| [`AGENTS.md`](./AGENTS.md) | Developer/agent guidelines for the codebase |
| [`docs/aws-deployment-guide.md`](./docs/aws-deployment-guide.md) | Full AWS production deployment guide (50+ pages) |
| [`steering/deploy.yml`](./steering/deploy.yml) | Environment-specific deployment configuration |
| [`steering/pipeline.yml`](./steering/pipeline.yml) | Video pipeline step definitions with resource requirements |
| [`scripts/setup-whisper.sh`](./scripts/setup-whisper.sh) | Whisper installation script with interactive mode |

---

## 🛠️ Custom Agent Skills

The project includes AI agent skills for development assistance:

| Skill | Description |
|-------|-------------|
| `video-pipeline` | Video processing pipeline operations |
| `docker-setup` | Docker development environment management |
| `stream-debug` | Streaming and player debugging |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Write TypeScript in strict mode
- Add proper types (avoid `any`)
- Use `.js` extensions for ESM imports
- Follow existing patterns and conventions
- Update tests if applicable
- Run `pnpm typecheck` before committing

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](./LICENSE) file for details.

---

## 🙏 Acknowledgments

- **FFmpeg** — The backbone of video processing
- **OpenAI Whisper** — State-of-the-art speech recognition
- **GGML whisper.cpp** — Fast local inference
- **hls.js** — HLS playback in the browser
- **shadcn/ui** — UI component inspiration
- **BullMQ** — Reliable job queues
- **Fastify** — Performant Node.js framework

---

<div align="center">
  <p>
    Built with ❤️ using TypeScript · React · Fastify · FFmpeg · Whisper
  </p>
  <p>
    <a href="https://github.com/afzalimdad9/yt-player/issues">Report Bug</a>
    ·
    <a href="https://github.com/afzalimdad9/yt-player/issues">Request Feature</a>
  </p>
</div>
