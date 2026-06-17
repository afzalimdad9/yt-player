import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const TEMP_DIR = process.env['TEMP_DIR'] || './tmp'

export interface ExtractedFrame {
  /** Timestamp in seconds */
  timestamp: number
  /** Path to the JPEG file on disk */
  filePath: string
  /** Base64-encoded JPEG data (populated on demand) */
  base64?: string
}

export interface FrameExtractionConfig {
  /** Interval between frames in seconds (default: 15) */
  interval?: number
  /** Max total frames to extract (default: 200, to avoid excessive API costs) */
  maxFrames?: number
  /** JPEG quality 1-31 (lower = better, default: 5) */
  quality?: number
  /** Optional start time in seconds */
  startTime?: number
  /** Optional end time in seconds */
  endTime?: number
}

const DEFAULT_CONFIG: Required<FrameExtractionConfig> = {
  interval: 15,
  maxFrames: 200,
  quality: 5,
  startTime: 0,
  endTime: Infinity,
}

/**
 * Extract frames from a video at regular intervals using FFmpeg.
 * Returns an array of frame metadata with file paths.
 *
 * @param videoPath Path to the video file
 * @param videoId Video ID for temp directory resolution
 * @param config Extraction configuration
 * @returns Array of extracted frame metadata
 */
export async function extractFrames(
  videoPath: string,
  videoId: string,
  config?: FrameExtractionConfig
): Promise<ExtractedFrame[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const outputDir = path.join(TEMP_DIR, videoId, 'frames')

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  // Get video duration
  const duration = await getVideoDuration(videoPath)
  const endTime = Math.min(cfg.endTime, duration)

  // Calculate frame timestamps
  const timestamps: number[] = []
  for (
    let t = cfg.startTime;
    t < endTime && timestamps.length < cfg.maxFrames;
    t += cfg.interval
  ) {
    timestamps.push(t)
  }

  if (timestamps.length === 0) {
    console.log('[FrameExtractor] No frames to extract')
    return []
  }

  console.log(
    `[FrameExtractor] Extracting ${timestamps.length} frames (every ${cfg.interval}s) from ${duration.toFixed(0)}s video`
  )

  // Extract frames using ffmpeg thumbnail filter for best frame selection
  const framePaths: string[] = []
  let lastProgress = 0

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i]!
    const outputPath = path.join(outputDir, `frame_${String(i).padStart(4, '0')}.jpg`)

    await extractSingleFrame(videoPath, ts, outputPath, cfg.quality)
    framePaths.push(outputPath)

    const progress = Math.round(((i + 1) / timestamps.length) * 100)
    if (progress - lastProgress >= 10) {
      console.log(`[FrameExtractor] Progress: ${progress}% (${i + 1}/${timestamps.length})`)
      lastProgress = progress
    }
  }

  console.log(`[FrameExtractor] Extracted ${framePaths.length} frames to ${outputDir}`)

  return framePaths.map((filePath, i) => ({
    timestamp: timestamps[i]!,
    filePath,
  }))
}

/**
 * Load base64 data for frames. This is done lazily to avoid loading
 * all frames into memory at once.
 */
export async function loadFrameBase64(frame: ExtractedFrame): Promise<string> {
  if (frame.base64) return frame.base64
  const buffer = await readFile(frame.filePath)
  frame.base64 = buffer.toString('base64')
  return frame.base64
}

/**
 * Load base64 data for multiple frames in parallel.
 */
export async function loadFramesBase64(frames: ExtractedFrame[]): Promise<ExtractedFrame[]> {
  await Promise.all(frames.map(loadFrameBase64))
  return frames
}

/**
 * Extract a single frame from a video at a given timestamp using FFmpeg.
 * Uses the `thumbnail` filter to pick the best frame near the target time.
 */
function extractSingleFrame(
  videoPath: string,
  timestamp: number,
  outputPath: string,
  quality: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-ss', String(timestamp),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', String(quality),
      '-y',
      outputPath,
    ]

    const ffmpeg = spawn('ffmpeg', args, { stdio: 'pipe' })
    let stderr = ''

    ffmpeg.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg frame extraction failed at ${timestamp}s: ${stderr.slice(-200)}`))
    })
    ffmpeg.on('error', reject)
  })
}

/**
 * Get video duration using ffprobe.
 */
function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ])

    let output = ''
    ffprobe.stdout?.on('data', (data: Buffer) => { output += data.toString() })
    ffprobe.on('close', (code) => {
      if (code === 0) resolve(parseFloat(output.trim()) || 0)
      else reject(new Error('Failed to get video duration'))
    })
    ffprobe.on('error', reject)
  })
}
