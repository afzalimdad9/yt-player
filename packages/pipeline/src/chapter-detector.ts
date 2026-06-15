import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { Chapter } from '@yt-player/shared'

const TEMP_DIR = process.env['TEMP_DIR'] || './tmp'

export interface ChapterDetectionResult {
  chapters: Chapter[]
  chaptersVtt: string
}

/**
 * Detect scene changes in a video using FFmpeg's scene detection filter.
 * Generates a chapters.vtt file with detected scene changes.
 */
export async function detectChapters(
  videoPath: string,
  videoId: string,
  sensitivity = 0.3
): Promise<ChapterDetectionResult> {
  const outputDir = path.join(TEMP_DIR, videoId, 'tracks')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const chaptersVtt = path.join(outputDir, 'chapters.vtt')

  console.log(`[ChapterDetector] Detecting chapters with sensitivity ${sensitivity}`)

  const scenes = await detectScenes(videoPath, sensitivity)
  const totalDuration = await getVideoDuration(videoPath)

  // Compute chapter boundaries from scene transitions
  // If no scenes detected, skip chapter creation (don't create a meaningless "Chapter 1")
  const chapters = scenes.length > 0 ? buildChapters(scenes, totalDuration) : []
  await writeChaptersVtt(chapters, chaptersVtt)

  return { chapters, chaptersVtt }
}

/**
 * Use FFmpeg scene detection to find scene change timestamps
 */
function detectScenes(videoPath: string, sensitivity: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const timestamps: number[] = []

    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-vf', `select='gt(scene,${sensitivity})',showinfo`,
      '-vsync', 'vfr',
      '-f', 'null',
      '-',
    ], { stdio: ['pipe', 'pipe', 'pipe'] })

    let stderr = ''

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
      // Parse showinfo output for pts_time
      const timeRegex = /pts_time:([\d.]+)/g
      let match
      while ((match = timeRegex.exec(stderr)) !== null) {
        timestamps.push(parseFloat(match[1]!))
      }
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(timestamps)
      } else {
        // If scene detection fails, return empty (single chapter)
        console.warn('[ChapterDetector] Scene detection failed:', stderr.slice(-500))
        resolve([])
      }
    })

    ffmpeg.on('error', reject)
  })
}

/**
 * Get total video duration using ffprobe
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
      if (code === 0) resolve(parseFloat(output.trim()))
      else reject(new Error('Failed to get video duration'))
    })

    ffprobe.on('error', reject)
  })
}

/**
 * Build chapter objects from scene timestamps
 * Filters out very short segments and assigns titles
 */
function buildChapters(sceneTimestamps: number[], totalDuration: number): Chapter[] {
  const chapters: Chapter[] = []
  const MIN_CHAPTER_DURATION = 10 // seconds

  // Add start timestamp
  const allTimes = [0, ...sceneTimestamps, totalDuration]

  for (let i = 0; i < allTimes.length - 1; i++) {
    const startTime = allTimes[i]!
    const endTime = allTimes[i + 1]!
    const duration = endTime - startTime

    if (duration < MIN_CHAPTER_DURATION && i > 0) {
      // Merge with previous chapter
      const prev = chapters[chapters.length - 1]
      if (prev) {
        prev.endTime = endTime
      }
      continue
    }

    chapters.push({
      title: `Chapter ${chapters.length + 1}`,
      startTime,
      endTime,
    })
  }

  return chapters
}

/**
 * Write chapters as a VTT file
 */
async function writeChaptersVtt(chapters: Chapter[], outputPath: string): Promise<void> {
  const { writeFile } = await import('node:fs/promises')

  let content = 'WEBVTT\n\n'

  for (const chapter of chapters) {
    const startStr = formatVttTime(chapter.startTime)
    const endStr = formatVttTime(chapter.endTime)
    content += `${startStr} --> ${endStr}\n${chapter.title}\n\n`
  }

  await writeFile(outputPath, content, 'utf-8')
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
