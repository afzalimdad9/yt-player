import { spawn, execSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Audio conversion utilities for Whisper transcription.
 * Converts various audio/video formats to the 16kHz 16-bit mono WAV
 * format required by whisper.cpp.
 */

interface ConvertedAudio {
  /** Path to the converted WAV file */
  wavPath: string
  /** Duration in seconds */
  duration: number
  /** Sample rate (should be 16000) */
  sampleRate: number
}

/**
 * Check if ffmpeg is available on the system.
 */
export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

/**
 * Extract audio from a video file and convert to the format
 * required by whisper.cpp: 16kHz, 16-bit PCM, mono WAV.
 *
 * @param inputPath - Path to the input video or audio file
 * @param outputDir - Directory to write the output WAV file
 * @returns Path to the converted WAV file and its metadata
 */
export function convertToWav(
  inputPath: string,
  outputDir: string
): Promise<ConvertedAudio> {
  return new Promise((resolve, reject) => {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }

    const inputName = path.basename(inputPath, path.extname(inputPath))
    const outputPath = path.join(outputDir, `${inputName}_whisper.wav`)

    console.log(`[AudioConverter] Converting ${inputPath} to WAV format (16kHz, mono)`)

    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ar', '16000',           // Resample to 16kHz
      '-ac', '1',               // Convert to mono
      '-c:a', 'pcm_s16le',      // 16-bit PCM encoding
      '-vn',                    // No video
      '-y',                     // Overwrite output
      '-f', 'wav',              // Force WAV format
      '-progress', 'pipe:1',    // Progress to stdout
      outputPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    ffmpeg.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
    ffmpeg.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg audio conversion failed (exit ${code}): ${stderr.slice(-300)}`))
        return
      }

      // Parse duration from ffmpeg output
      const durationMatch = stderr.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/)
      let duration = 0
      if (durationMatch) {
        const [, h, m, s, ms] = durationMatch
        duration = parseInt(h!, 10) * 3600
          + parseInt(m!, 10) * 60
          + parseInt(s!, 10)
          + parseInt(ms!, 10) / 100
      }

      // Get actual file size for verification
      try {
        const stats = statSync(outputPath)
        console.log(`[AudioConverter] Converted: ${(stats.size / (1024 * 1024)).toFixed(2)}MB, ${duration.toFixed(1)}s`)
      } catch {}

      resolve({
        wavPath: outputPath,
        duration,
        sampleRate: 16000,
      })
    })

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg process error: ${err.message}`))
    })
  })
}

/**
 * Split a long audio file into chunks for processing.
 * Whisper.cpp can handle long files, but splitting can speed up processing
 * and allow parallelization.
 *
 * @param wavPath - Path to the WAV file
 * @param outputDir - Directory for chunks
 * @param chunkDuration - Duration of each chunk in seconds (default: 600 = 10 min)
 * @returns Array of chunk file paths
 */
export function splitAudio(
  wavPath: string,
  outputDir: string,
  chunkDuration = 600
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }

    const baseName = path.basename(wavPath, '.wav')
    const segmentTemplate = path.join(outputDir, `${baseName}_chunk_%03d.wav`)

    console.log(`[AudioConverter] Splitting audio into ${chunkDuration}s chunks`)

    const ffmpeg = spawn('ffmpeg', [
      '-i', wavPath,
      '-f', 'segment',
      '-segment_time', String(chunkDuration),
      '-c', 'copy',
      '-y',
      segmentTemplate,
    ], { stdio: ['pipe', 'pipe', 'pipe'] })

    let stderr = ''
    ffmpeg.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Audio splitting failed (exit ${code}): ${stderr.slice(-300)}`))
        return
      }

      // Collect generated chunks
      const chunks = readdirSync(outputDir)
        .filter(f => f.startsWith(baseName) && f.endsWith('.wav'))
        .sort()
        .map(f => path.join(outputDir, f))

      console.log(`[AudioConverter] Split into ${chunks.length} chunks`)
      resolve(chunks)
    })

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg split error: ${err.message}`))
    })
  })
}

/**
 * Get audio duration using ffprobe.
 */
export function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ])

    let output = ''
    ffprobe.stdout?.on('data', (data: Buffer) => { output += data.toString() })

    ffprobe.on('close', (code) => {
      if (code === 0) {
        resolve(parseFloat(output.trim()) || 0)
      } else {
        reject(new Error('ffprobe failed to get audio duration'))
      }
    })

    ffprobe.on('error', reject)
  })
}
