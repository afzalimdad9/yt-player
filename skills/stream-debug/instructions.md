# Stream Debug Skill

This skill helps AI agents debug streaming and player issues.

## Stream Architecture

```
Client (Browser)
  │
  ├── HLS (preferred)
  │   ├── Fetch master.m3u8
  │   ├── Select quality variant
  │   └── Fetch .ts segments
  │
  └── DASH (fallback)
      ├── Fetch master.mpd
      ├── Select representation
      └── Fetch .m4s segments
```

## Debugging Tools

### Check HLS Playlist
```bash
curl -s http://localhost:9000/yt-player/videos/<id>/hls/master.m3u8
```

### Check DASH Manifest
```bash
curl -s http://localhost:9000/yt-player/videos/<id>/dash/master.mpd
```

### Check Segment Availability
```bash
curl -I http://localhost:9000/yt-player/videos/<id>/hls/720p/segment_000.ts
```

### Verify Caption Tracks
```bash
curl -s http://localhost:9000/yt-player/videos/<id>/tracks/captions.vtt
```

### Check Thumbnail Sprite
```bash
curl -I http://localhost:9000/yt-player/videos/<id>/thumbnails/sprite.jpg
```

## Browser HLS Verification

- Open Chrome DevTools → Network tab
- Filter by "m3u8" to see playlist requests
- Filter by ".ts" to see segment requests
- Check the video element in Elements tab for active track elements

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| 404 on manifest | Video not processed | Check status endpoint |
| CORS errors | Missing CORS config | Check `API_CORS_ORIGIN` |
| Captions not showing | Wrong track kind | Use 'captions' for CC, 'subtitles' for translation |
| Chapters not working | Missing chapters VTT | Verify chapter detection ran |
| Thumbnails not showing | Sprite not uploaded | Check MinIO console |
| HLS not playing | Browser doesn't support HLS | Use DASH fallback or hls.js |
