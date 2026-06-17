import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { ThumbnailSprite } from '@yt-player/shared'

const TEMP_DIR = process.env['TEMP_DIR'] || './tmp'

export interface SpriteResult {
  sprite: ThumbnailSprite
  spritePath: string
  vttPath: string
}

/**
 * Generate thumbnail sprite sheet and VTT file.
 * Creates a grid of thumbnails at regular intervals.
 */
export async function generateThumbnailSprite(
  videoPath: string,
  videoId: string,
  interval = 10 // seconds between thumbnails
): Promise<SpriteResult> {
  const outputDir = path.join(TEMP_DIR, videoId, 'thumbnails')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const spriteFile = path.join(outputDir, 'sprite.jpg')
  const vttFile = path.join(outputDir, 'sprite.vtt')

  // Calculate number of frames based on video duration and interval
  const duration = await getVideoDuration(videoPath)
  const totalFrames = Math.ceil(duration / interval)

  // Sprite grid layout (adjust based on total frames)
  const columns = Math.min(10, Math.ceil(Math.sqrt(totalFrames)))
  const rows = Math.ceil(totalFrames / columns)
  const tileWidth = 160
  const tileHeight = 90
  const spriteWidth = columns * tileWidth
  const spriteHeight = rows * tileHeight

  console.log(`[ThumbnailSprite] Generating ${totalFrames} thumbnails (${columns}x${rows} grid)`)

  // Generate thumbnail sprite sheet using FFmpeg
  await generateSprite(videoPath, spriteFile, interval, columns, rows, tileWidth, tileHeight)

  // Generate VTT file for the sprite
  await writeSpriteVtt(vttFile, videoId, columns, tileWidth, tileHeight, totalFrames, interval)

  return {
    sprite: {
      src: `thumbnails/sprite.jpg`,
      vttSrc: `thumbnails/sprite.vtt`,
      tileWidth,
      tileHeight,
      columns,
      rows,
      totalFrames,
      interval,
    },
    spritePath: spriteFile,
    vttPath: vttFile,
  }
}

/**
 * Use FFmpeg to generate a sprite sheet from the video
 */
function generateSprite(
  videoPath: string,
  outputPath: string,
  interval: number,
  columns: number,
  rows: number,
  tileWidth: number,
  tileHeight: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fps = 1 / interval

    const args = [
      '-i', videoPath,
      '-vf', `fps=${fps},scale=${tileWidth}:${tileHeight}:force_original_aspect_ratio=decrease,pad=${tileWidth}:${tileHeight}:(ow-iw)/2:(oh-ih)/2,tile=${columns}x${rows}`,
      '-frames:v', '1',
      '-q:v', '5',
      '-y',
      outputPath,
    ]

    const ffmpeg = spawn('ffmpeg', args, { stdio: 'pipe' })
    let stderr = ''

    ffmpeg.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Thumbnail sprite generation failed: ${stderr.slice(-500)}`))
    })
    ffmpeg.on('error', reject)
  })
}

/**
 * Write the VTT file that maps time ranges to sprite coordinates
 */
async function writeSpriteVtt(
  vttPath: string,
  videoId: string,
  columns: number,
  tileWidth: number,
  tileHeight: number,
  totalFrames: number,
  interval: number
): Promise<void> {
  const { writeFile } = await import('node:fs/promises')

  let content = 'WEBVTT\n\n'

  for (let i = 0; i < totalFrames; i++) {
    const startTime = i * interval
    const endTime = (i + 1) * interval
    const col = i % columns
    const row = Math.floor(i / columns)
    const x = col * tileWidth
    const y = row * tileHeight

    const startStr = formatVttTime(startTime)
    const endStr = formatVttTime(endTime)

    content += `${startStr} --> ${endStr}\n`
    content += `sprite.jpg#xywh=${x},${y},${tileWidth},${tileHeight}\n\n`
  }

  await writeFile(vttPath, content, 'utf-8')
}

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
      if (code === 0) resolve(parseFloat(output.trim()))
      else reject(new Error('Failed to get video duration'))
    })

    ffprobe.on('error', reject)
  })
}

function formatVttTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const millis = Math.round((s - Math.floor(s)) * 1000)
  return `${pad(h)}:${pad(m)}:${pad(Math.floor(s))}.${pad(millis, 3)}`
}

function pad(num: number, width = 2): string {
  return String(num).padStart(width, '0')
}
