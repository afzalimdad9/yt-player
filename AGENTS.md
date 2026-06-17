# YT Player - Agent Guidelines

## Project Overview

YT Player is a monorepo video processing and streaming platform. It ingests video URLs, transcodes them into multiple quality levels (HLS + DASH), generates captions/subtitles/descriptions, detects chapters, creates thumbnail sprites, and serves everything through a YouTube-like player.

## Architecture

```
yt-player/
├── packages/
│   ├── shared/       # Shared TypeScript types, enums, Zod schemas
│   ├── database/     # Prisma ORM + PostgreSQL schema
│   ├── storage/      # S3/MinIO storage abstraction (AWS SDK)
│   ├── queue/        # BullMQ + Redis queue infrastructure
│   ├── pipeline/     # Video processing pipeline (FFmpeg, Whisper)
│   ├── api/          # Fastify REST API server
│   └── web/          # React frontend (Vite + shadcn/ui)
├── docker/           # Docker Compose, Dockerfiles, Nginx configs
├── skills/           # Custom AI agent skills
└── steering/         # Build/deploy automation configs
```

## Tech Stack

| Component   | Technology            |
|-------------|-----------------------|
| Language    | TypeScript (strict)   |
| Monorepo    | pnpm workspaces       |
| Build       | Turborepo             |
| API         | Fastify v5            |
| Database    | PostgreSQL + Prisma   |
| Queue       | BullMQ + Redis        |
| Storage     | MinIO (dev) / AWS S3 (prod) |
| Video Proc  | FFmpeg (fluent-ffmpeg)|
| Captions    | OpenAI Whisper        |
| Frontend    | React 19 + Vite + shadcn/ui |
| Streaming   | HLS + DASH            |
| Container   | Docker + Docker Compose |

## Development Setup

```bash
# Prerequisites: Node.js 22+, pnpm 9+, Docker, FFmpeg, yt-dlp, whisper

# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Push schema to database (requires PostgreSQL running)
pnpm db:push

# Start all services (Docker)
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up

# Or run locally (separate terminals):
pnpm --filter @yt-player/api dev        # API on :4000
pnpm --filter @yt-player/web dev        # Frontend on :5173
pnpm --filter @yt-player/api dev:worker # Background worker

# Build all packages
pnpm build
```

## Pipeline Flow

1. **User submits URL** → POST `/api/videos` creates DB record + enqueues BullMQ job
2. **Ingest Worker** picks up job → runs `runPipeline()`:
   - Download video (yt-dlp) + extract audio
   - Transcode to multiple qualities (FFmpeg → HLS + DASH)
   - Generate captions (Whisper → VTT)
   - Detect chapters (FFmpeg scene detection → VTT)
   - Generate thumbnail sprites (FFmpeg → sprite + VTT)
   - Upload all assets to S3/MinIO
   - Update database with final metadata
3. **Frontend** polls API, loads HLS/DASH manifests, renders YouTube-like player

## Environment Variables

See `.env.example` for all required env vars.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://ytplayer:ytplayer@localhost:5432/ytplayer` | PostgreSQL connection |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `STORAGE_ENDPOINT` | `http://localhost:9000` | S3/MinIO endpoint |
| `STORAGE_ACCESS_KEY` | `minioadmin` | S3/MinIO access key |
| `STORAGE_SECRET_KEY` | `minioadmin` | S3/MinIO secret key |
| `STORAGE_BUCKET` | `yt-player` | S3/MinIO bucket |
| `API_PORT` | `4000` | API server port |
| `NODE_ENV` | `development` | Environment |

## Package Dependencies

```
shared (no deps)
  ↑
database ──┐
storage ───┤
queue ─────┼──→ pipeline ──→ api ──→ web
           │
           └─────────────────┘
```

## Code Conventions

- **Imports**: Use `.js` extensions for ESM imports within packages
- **Types**: Define all shared types in `@yt-player/shared`
- **Database**: All queries go through Prisma; no raw SQL
- **Error handling**: Use Zod validation on API inputs; Fastify error middleware
- **Streaming**: HLS preferred (wider support); DASH fallback
- **State management**: React useState/useEffect; no Redux needed at this scale
- **CSS**: Tailwind CSS + CSS modules where complex styling needed

## Key API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/videos` | Submit video URL for processing |
| GET | `/api/videos` | List all videos (paginated) |
| GET | `/api/videos/:id` | Get video details |
| GET | `/api/videos/:id/status` | Get processing status |
| DELETE | `/api/videos/:id` | Delete video |
| GET | `/api/stream/:id` | Get streaming session |
| GET | `/api/stream/:id/tracks` | Get VTT tracks |

## Agent Skills

Custom agent skills are in `skills/`. Available skills:

- `video-pipeline` - Video processing pipeline operations
- `docker-setup` - Docker development environment management
- `stream-debug` - Streaming and player debugging

## Testing

```bash
# Type check all packages
pnpm typecheck

# Build all packages
pnpm build

# Run linting
pnpm lint
```

## Production Deployment

```bash
# Build and start production stack
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up --build

# For AWS S3, set env vars:
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export S3_BUCKET=yt-player-prod
export AWS_REGION=us-east-1
```
