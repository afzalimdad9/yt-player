# Video Pipeline Skill

This skill enables AI agents to operate the video processing pipeline of YT Player.

## Capabilities

1. **Submit Video** - Submit a URL for processing via the API
2. **Check Status** - Poll for video processing status
3. **Debug Transcoding** - Inspect FFmpeg output and logs
4. **Generate Reports** - Summarize pipeline metrics

## Pipeline Operations

```typescript
// Submit a video for processing
POST /api/videos
Body: { url: string, title?: string }

// Check processing status
GET /api/videos/:id/status

// Get streaming session
GET /api/stream/:id
```

## Quality Levels

Available qualities: 144p, 240p, 360p, 480p, 720p, 1080p, 1440p, 2160p

The pipeline automatically selects qualities up to the source resolution.

## Streaming Protocols

- **HLS**: Apple HTTP Live Streaming (`.m3u8` + `.ts` segments)
- **DASH**: MPEG-DASH (`.mpd` + `.m4s` segments)

## Common Commands

```bash
# Check FFmpeg version
ffmpeg -version

# Probe video file
ffprobe -v quiet -print_format json -show_streams <file>

# Generate chapter VTT manually
ffmpeg -i <video> -vf "select='gt(scene,0.4)',showinfo" -f null -
```

## Debugging

- Check worker logs: `docker compose logs worker`
- Check API logs: `docker compose logs api`
- Check MinIO console: http://localhost:9001
- Check Redis: `redis-cli -h localhost -p 6379`

## Migration Commands

```bash
# Generate Prisma migration
pnpm db:migrate --name <migration_name>

# Push schema (dev only)
pnpm db:push

# View database in Prisma Studio
pnpm db:studio
```
