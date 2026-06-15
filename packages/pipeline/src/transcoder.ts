import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { VideoQuality } from '@yt-player/shared'

const TEMP_DIR = process.env['TEMP_DIR'] || './tmp'

export interface TranscodeResult {
  hlsDir: string
  dashDir: string
  qualities: {
    quality: VideoQuality
    playlist: string
    bandwidth: number
    resolution: string
  }[]
}

interface QualityConfig {
  quality: VideoQuality
  width: number
  height: number
  bitrate: number
  maxrate: number
  bufsize: number
}

const QUALITY_CONFIGS: QualityConfig[] = [
  { quality: VideoQuality.QUALITY_144P, width: 256, height: 144, bitrate: 100_000, maxrate: 150_000, bufsize: 200_000 },
  { quality: VideoQuality.QUALITY_240P, width: 426, height: 240, bitrate: 300_000, maxrate: 400_000, bufsize: 500_000 },
  { quality: VideoQuality.QUALITY_360P, width: 640, height: 360, bitrate: 600_000, maxrate: 800_000, bufsize: 1_000_000 },
  { quality: VideoQuality.QUALITY_480P, width: 854, height: 480, bitrate: 1_200_000, maxrate: 1_500_000, bufsize: 2_000_000 },
  { quality: VideoQuality.QUALITY_720P, width: 1280, height: 720, bitrate: 2_500_000, maxrate: 3_500_000, bufsize: 5_000_000 },
  { quality: VideoQuality.QUALITY_1080P, width: 1920, height: 1080, bitrate: 5_000_000, maxrate: 7_000_000, bufsize: 10_000_000 },
  { quality: VideoQuality.QUALITY_1440P, width: 2560, height: 1440, bitrate: 10_000_000, maxrate: 14_000_000, bufsize: 20_000_000 },
  { quality: VideoQuality.QUALITY_2160P, width: 3840, height: 2160, bitrate: 20_000_000, maxrate: 28_000_000, bufsize: 40_000_000 },
]

/**
 * Transcode a video into multiple quality renditions.
 * Outputs both HLS (m3u8 segments) and DASH (mpd segments).
 */
export async function transcodeVideo(
  inputPath: string,
  videoId: string,
  maxHeight: number
): Promise<TranscodeResult> {
  const outputDir = path.join(TEMP_DIR, videoId, 'stream')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const hlsDir = path.join(outputDir, 'hls')
  const dashDir = path.join(outputDir, 'dash')

  if (!existsSync(hlsDir)) mkdirSync(hlsDir, { recursive: true })
  if (!existsSync(dashDir)) mkdirSync(dashDir, { recursive: true })

  // Filter qualities based on source max height
  let applicableQualities = QUALITY_CONFIGS.filter(q => q.height <= maxHeight)

  // In development, limit to fewer renditions for faster processing
  if (process.env['NODE_ENV'] === 'development' || !process.env['NODE_ENV']) {
    const devQualities = [VideoQuality.QUALITY_360P, VideoQuality.QUALITY_720P]
    const devFiltered = applicableQualities.filter(q => devQualities.includes(q.quality))
    if (devFiltered.length > 0) applicableQualities = devFiltered
  }

  console.log(`[Transcoder] Encoding ${applicableQualities.length} quality levels sequentially...`)

  // Generate HLS renditions sequentially to avoid CPU saturation
  const hlsResults: RenditionResult[] = []
  for (const q of applicableQualities) {
    console.log(`[Transcoder] HLS ${q.quality} (${q.width}x${q.height})...`)
    hlsResults.push(await generateHlsRendition(inputPath, hlsDir, q))
  }

  // Generate DASH renditions sequentially
  const dashResults: RenditionResult[] = []
  for (const q of applicableQualities) {
    console.log(`[Transcoder] DASH ${q.quality} (${q.width}x${q.height})...`)
    dashResults.push(await generateDashRendition(inputPath, dashDir, q))
  }

  // Generate HLS master playlist
  await generateHlsMasterPlaylist(hlsDir, hlsResults)

  // Generate DASH MPD
  await generateDashMpd(dashDir, dashResults)

  return {
    hlsDir,
    dashDir,
    qualities: hlsResults.map(r => ({
      quality: r.quality,
      playlist: path.relative(hlsDir, r.playlist),
      bandwidth: r.bitrate,
      resolution: `${r.width}x${r.height}`,
    })),
  }
}

interface RenditionResult {
  quality: VideoQuality
  width: number
  height: number
  bitrate: number
  playlist: string
}

/**
 * Generate HLS segments for a single quality level
 */
function generateHlsRendition(
  inputPath: string,
  hlsDir: string,
  config: QualityConfig
): Promise<RenditionResult> {
  const segDir = path.resolve(path.join(hlsDir, config.quality))
  if (!existsSync(segDir)) mkdirSync(segDir, { recursive: true })

  const playlist = path.resolve(path.join(segDir, 'index.m3u8'))

  return new Promise((resolve, reject) => {
    const absInput = path.resolve(inputPath)

    const args = [
      '-i', absInput,
      '-vf', `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-profile:v', 'main',
      '-b:v', String(config.bitrate),
      '-maxrate', String(config.maxrate),
      '-bufsize', String(config.bufsize),
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', 'hls',
      '-hls_time', '6',
      '-hls_list_size', '0',
      '-hls_segment_filename', path.join(segDir, 'segment_%03d.ts'),
      '-hls_playlist_type', 'vod',
      '-y',
      playlist,
    ]

    const ffmpeg = spawn('ffmpeg', args, { stdio: 'pipe' })
    let stderr = ''

    ffmpeg.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve({
          quality: config.quality,
          width: config.width,
          height: config.height,
          bitrate: config.bitrate,
          playlist,
        })
      } else {
        reject(new Error(`HLS transcode failed (${config.quality}): ${stderr}`))
      }
    })
    ffmpeg.on('error', reject)
  })
}

/**
 * Generate DASH segments for a single quality level
 */
function generateDashRendition(
  inputPath: string,
  dashDir: string,
  config: QualityConfig
): Promise<RenditionResult> {
  const segDir = path.resolve(path.join(dashDir, config.quality))
  if (!existsSync(segDir)) mkdirSync(segDir, { recursive: true })

  const manifest = path.join(segDir, 'init.mp4')

  return new Promise((resolve, reject) => {
    const absInput = path.resolve(inputPath)
    const absManifest = path.resolve(path.join(segDir, 'manifest.mpd'))

    const args = [
      '-i', absInput,
      '-vf', `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease,pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-profile:v', 'main',
      '-b:v', String(config.bitrate),
      '-maxrate', String(config.maxrate),
      '-bufsize', String(config.bufsize),
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', 'dash',
      '-seg_duration', '6',
      '-single_file', '1',
      '-init_seg_name', 'init.m4s',
      '-media_seg_name', 'stream.m4s',
      '-adaptation_sets', 'id=0,streams=v id=1,streams=a',
      '-y',
      absManifest,
    ]

    const ffmpeg = spawn('ffmpeg', args, { stdio: 'pipe' })
    let stderr = ''

    ffmpeg.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve({
          quality: config.quality,
          width: config.width,
          height: config.height,
          bitrate: config.bitrate,
          playlist: path.join(config.quality, 'manifest.mpd'),
        })
      } else {
        reject(new Error(`DASH transcode failed (${config.quality}): ${stderr}`))
      }
    })
    ffmpeg.on('error', reject)
  })
}

/**
 * Generate HLS master playlist
 */
async function generateHlsMasterPlaylist(
  hlsDir: string,
  results: RenditionResult[]
): Promise<void> {
  const { writeFile } = await import('node:fs/promises')

  let master = `#EXTM3U\n#EXT-X-VERSION:3\n`

  for (const r of results) {
    master += `#EXT-X-STREAM-INF:BANDWIDTH=${r.bitrate},RESOLUTION=${r.width}x${r.height},CODECS="avc1.64001e,mp4a.40.2"\n`
    master += `${r.quality}/index.m3u8\n`
  }

  await writeFile(path.join(hlsDir, 'master.m3u8'), master, 'utf-8')
}

/**
 * Generate DASH MPD manifest
 */
async function generateDashMpd(
  dashDir: string,
  results: RenditionResult[]
): Promise<void> {
  const { writeFile } = await import('node:fs/promises')

  let mpd = `<?xml version="1.0" encoding="utf-8"?>\n`
  mpd += `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="static">\n`
  mpd += `<Period id="1">\n`
  mpd += `<AdaptationSet mimeType="video/mp4" contentType="video">\n`

  for (const r of results) {
    mpd += `  <Representation id="${r.quality}" bandwidth="${r.bitrate}" width="${r.width}" height="${r.height}" codecs="avc1.64001e">\n`
    mpd += `    <BaseURL>${r.quality}/manifest.mpd</BaseURL>\n`
    mpd += `  </Representation>\n`
  }

  mpd += `</AdaptationSet>\n</Period>\n</MPD>\n`

  await writeFile(path.join(dashDir, 'master.mpd'), mpd, 'utf-8')
}
