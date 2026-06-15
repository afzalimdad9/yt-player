import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, createWriteStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

const TEMP_DIR = process.env['TEMP_DIR'] || './tmp'

export interface DownloadResult {
  videoPath: string
  audioPath: string
  metadata: {
    title: string
    duration: number
    width: number
    height: number
    fps: number
  }
}

/**
 * Download a video from a URL using yt-dlp (YouTube-DLP)
 * If the input is already a local file path, skip the download step.
 */
export async function downloadVideo(url: string, videoId: string): Promise<DownloadResult> {
  const outputDir = path.join(TEMP_DIR, videoId)
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  // ===== Handle local file uploads =====
  // If the "url" is actually a path to an existing local file, skip downloading
  if (existsSync(url)) {
    const videoPath = url
    const audioPath = path.join(outputDir, 'audio.mp3')
    console.log(`[Downloader] Local file detected: ${videoPath}`)

    // Extract audio for speech-to-text processing
    await extractAudio(videoPath, audioPath)

    // Probe metadata with ffprobe
    const metadata = await probeVideo(videoPath)

    return { videoPath, audioPath, metadata }
  }

  // ===== Remote URL download =====
  const videoPath = path.join(outputDir, 'video.mp4')
  const audioPath = path.join(outputDir, 'audio.mp3')

  // Use yt-dlp for downloading (supports YouTube, Twitter, TikTok, etc.)
  const ytDlpPath = process.env['YT_DLP_PATH'] || 'yt-dlp'

  console.log(`[Downloader] Downloading ${url} to ${videoPath}`)

  // Download best video+audio combined, capture JSON metadata
  const ytDlpOutput = execSync(
    `${ytDlpPath} -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" ` +
    `-o "${videoPath}" ` +
    `--merge-output-format mp4 ` +
    `--print-json ` +
    `"${url}"`,
    { stdio: 'pipe', encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  )

  // Parse yt-dlp JSON to get the real title
  let ytDlpTitle = ''
  try {
    const ytDlpData = JSON.parse(ytDlpOutput)
    ytDlpTitle = ytDlpData.title || ytDlpData.fulltitle || ''
  } catch {}

  // Extract audio for speech-to-text processing
  await extractAudio(videoPath, audioPath)

  // Probe metadata with ffprobe
  const metadata = await probeVideo(videoPath)

  // Prefer yt-dlp title over ffprobe filename fallback
  if (ytDlpTitle) {
    metadata.title = ytDlpTitle
  }

  return { videoPath, audioPath, metadata }
}

/**
 * Extract audio track from video using FFmpeg
 */
async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  console.log(`[Downloader] Extracting audio to ${audioPath}`)

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-ab', '128k',
      '-ar', '44100',
      '-y',
      audioPath,
    ], { stdio: 'pipe' })

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg audio extraction exited with code ${code}`))
    })

    ffmpeg.on('error', reject)
  })
}

/**
 * Probe video file metadata using ffprobe
 */
async function probeVideo(videoPath: string): Promise<DownloadResult['metadata']> {
  const output = execSync(
    `ffprobe -v quiet -print_format json -show_streams -show_format "${videoPath}"`,
    { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }
  )

  const data = JSON.parse(output)
  const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video')
  const format = data.format || {}

  return {
    title: format.tags?.title || path.basename(videoPath),
    duration: parseFloat(format.duration || '0'),
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
    fps: evalFps(videoStream?.r_frame_rate || '30/1'),
  }
}

function evalFps(frameRate: string): number {
  const parts = frameRate.split('/')
  if (parts.length === 2) {
    return Math.round(parseInt(parts[0], 10) / parseInt(parts[1], 10) * 100) / 100
  }
  return parseFloat(frameRate) || 30
}
