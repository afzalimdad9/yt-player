import { spawn, execSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { ensureModel, findWhisperCppBinary, isPythonWhisperAvailable, resolveModelName, WHISPER_MODELS } from './models.js'
import { convertToWav, isFfmpegAvailable, getAudioDuration } from './audio-converter.js'

const TEMP_DIR = process.env['TEMP_DIR'] || './tmp'

export interface VttTrackResult {
  type: 'captions' | 'subtitles' | 'descriptions' | 'chapters'
  language: string
  filePath: string
  label: string
  default: boolean
}

export interface TranscriptionConfig {
  /** Model name (tiny, base, small, medium, large-v3, etc.) */
  model?: string
  /** Language code (auto-detect if not provided) */
  language?: string
  /** Whether to enable word-level timestamps (better captions but larger VTT) */
  wordTimestamps?: boolean
  /** Number of CPU threads to use */
  threads?: number
  /** Whether to use Python openai-whisper instead of whisper.cpp */
  preferPython?: boolean
  /** Print extra debug logs */
  verbose?: boolean
}

const DEFAULT_CONFIG: TranscriptionConfig = {
  model: 'base',
  language: 'auto',
  wordTimestamps: false,
  threads: 4,
  preferPython: false,
  verbose: false,
}

/**
 * Generate captions from audio using Whisper.
 *
 * Supports two backends:
 * 1. whisper.cpp (GGML) - Preferred, fast local inference
 * 2. Python openai-whisper - Fallback if whisper.cpp not available
 *
 * The pipeline:
 * 1. Extract audio from video → 16kHz mono WAV
 * 2. Run Whisper transcription on the WAV
 * 3. Parse output into VTT format
 * 4. Generate captions, subtitles, and descriptions VTT files
 */
export async function generateCaptions(
  audioPath: string,
  videoId: string,
  language = 'en',
  config?: Partial<TranscriptionConfig>
): Promise<VttTrackResult[]> {
  const cfg: TranscriptionConfig = { ...DEFAULT_CONFIG, ...config, language }
  const outputDir = path.join(TEMP_DIR, videoId, 'tracks')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const result: VttTrackResult[] = []

  // ===== Step 1: Check prerequisites =====
  if (cfg.verbose) console.log('[CaptionGenerator] Step 1: Checking prerequisites')

  const ffmpegOk = await isFfmpegAvailable()
  if (!ffmpegOk) {
    console.warn('[CaptionGenerator] ffmpeg not found! Cannot extract audio for transcription.')
    return await generatePlaceholderTracks(outputDir, language)
  }

  // ===== Step 2: Convert audio to WAV format =====
  if (cfg.verbose) console.log('[CaptionGenerator] Step 2: Converting audio to WAV')

  let wavPath: string
  let audioDuration: number

  try {
    const converted = await convertToWav(audioPath, path.join(TEMP_DIR, videoId))
    wavPath = converted.wavPath
    audioDuration = converted.duration > 0 ? converted.duration : await getAudioDuration(converted.wavPath)
    console.log(`[CaptionGenerator] Audio converted: ${(audioDuration / 60).toFixed(1)}min at ${converted.sampleRate}Hz`)
  } catch (error) {
    console.warn('[CaptionGenerator] Audio conversion failed:', error)
    return await generatePlaceholderTracks(outputDir, language)
  }

  // ===== Step 3: Run transcription =====
  if (cfg.verbose) console.log('[CaptionGenerator] Step 3: Running Whisper transcription')

  const transcriptionResult = await runWhisperTranscription(wavPath, outputDir, cfg)

  if (!transcriptionResult) {
    console.warn('[CaptionGenerator] Transcription failed, generating placeholders')
    return await generatePlaceholderTracks(outputDir, language)
  }

  // ===== Step 4: Generate VTT track files =====
  if (cfg.verbose) console.log('[CaptionGenerator] Step 4: Generating VTT track files')

  // Captions VTT (verbatim, includes sound effects markers, speaker labels)
  const captionsVtt = await generateCaptionsVtt(transcriptionResult, outputDir, cfg)
  result.push({
    type: 'captions',
    language: transcriptionResult.detectedLanguage || 'en',
    filePath: captionsVtt,
    label: `Captions (CC)${transcriptionResult.detectedLanguage !== 'en' ? ` - ${transcriptionResult.detectedLanguage.toUpperCase()}` : ''}`,
    default: true,
  })

  // Subtitles VTT (clean, without sound effect markers, for translation)
  const subtitlesVtt = await generateSubtitlesVtt(transcriptionResult, outputDir, cfg)
  result.push({
    type: 'subtitles',
    language: transcriptionResult.detectedLanguage || 'en',
    filePath: subtitlesVtt,
    label: transcriptionResult.detectedLanguage === 'en' ? 'English' : transcriptionResult.detectedLanguage.toUpperCase(),
    default: false,
  })

  // Descriptions VTT (audio descriptions of visual content)
  try {
    const descriptionsVtt = path.join(outputDir, 'descriptions.vtt')
    await generateDescriptionTrack(videoId, descriptionsVtt, audioDuration)
    if (existsSync(descriptionsVtt)) {
      result.push({
        type: 'descriptions',
        language: 'en',
        filePath: descriptionsVtt,
        label: 'Audio Descriptions',
        default: false,
      })
    }
  } catch (e) {
    console.warn('[CaptionGenerator] Description generation failed:', e)
  }

  // ===== Step 5: Cleanup temporary files =====
  if (cfg.verbose) console.log('[CaptionGenerator] Step 5: Cleanup')

  try {
    await unlink(wavPath).catch(() => {})
  } catch {
    // Temp file cleanup is best-effort
  }

  console.log(`[CaptionGenerator] Generated ${result.length} tracks for video ${videoId}`)
  return result
}

// ================================================================
// Backend Implementations
// ================================================================

export interface TranscriptionSegment {
  start: number
  end: number
  text: string
  words?: { word: string; start: number; end: number; probability: number }[]
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[]
  detectedLanguage: string
  backend: 'whisper.cpp' | 'openai-whisper'
  duration: number
}

export type TranscriptionBackend = 'whisper.cpp' | 'openai-whisper'

/**
 * Run Whisper transcription using the best available backend.
 * Tries whisper.cpp first, falls back to Python openai-whisper.
 */
async function runWhisperTranscription(
  wavPath: string,
  outputDir: string,
  config: TranscriptionConfig
): Promise<TranscriptionResult | null> {
  // Strategy 1: Try whisper.cpp
  if (!config.preferPython) {
    const whisperCppPath = findWhisperCppBinary()
    if (whisperCppPath) {
      try {
        return await runWhisperCpp(wavPath, outputDir, config, whisperCppPath)
      } catch (error) {
        console.warn('[CaptionGenerator] whisper.cpp failed, falling back to Python:', error)
      }
    } else {
      console.log('[CaptionGenerator] whisper.cpp not found, trying Python openai-whisper')
    }
  }

  // Strategy 2: Try Python openai-whisper
  try {
    const pythonAvailable = await isPythonWhisperAvailable()
    if (pythonAvailable) {
      return await runPythonWhisper(wavPath, outputDir, config)
    }
  } catch (error) {
    console.warn('[CaptionGenerator] Python whisper also failed:', error)
  }

  return null
}

/**
 * Run transcription using whisper.cpp CLI.
 */
async function runWhisperCpp(
  wavPath: string,
  outputDir: string,
  config: TranscriptionConfig,
  whisperBinary: string
): Promise<TranscriptionResult> {
  const modelName = resolveModelName(config.model)
  const modelPath = await ensureModel(modelName)
  const baseName = path.basename(wavPath, '.wav')

  console.log(`[WhisperCpp] Using model: ${modelName} (${WHISPER_MODELS[modelName]?.size || 'unknown'})`)

  // Build command arguments
  const args = [
    '-m', modelPath,
    '-f', wavPath,
    '-ovtt',                         // Output VTT format
    '-oj',                           // Output JSON (for parsing)
    '-otxt',                         // Output plain text
    '-t', String(config.threads || 4),
    '--output-dir', outputDir,
  ]

  // Language (auto-detect if not specified)
  if (config.language && config.language !== 'auto') {
    args.push('-l', config.language)
  }

  if (config.verbose) {
    args.push('--print-progress')
  }

  console.log(`[WhisperCpp] Running: ${whisperBinary} -m ${modelName} -f ${path.basename(wavPath)} -ovtt -oj`)

  await new Promise<void>((resolve, reject) => {
    const whisperProcess = spawn(whisperBinary, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''

    whisperProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
      if (config.verbose) {
        process.stdout.write(data)
      }
    })

    whisperProcess.stdout?.on('data', (data: Buffer) => {
      if (config.verbose) {
        process.stdout.write(data)
      }
    })

    whisperProcess.on('close', (code) => {
      clearInterval(progressInterval)
      if (code === 0) resolve()
      else reject(new Error(`whisper.cpp exited with code ${code}: ${stderr.slice(-500)}`))
    })

    whisperProcess.on('error', (err) => {
      clearInterval(progressInterval)
      reject(err)
    })

    // Log progress periodically
    const progressInterval = setInterval(() => {
      const progressMatch = stderr.match(/whisper_model_load\s+.*?\n.*?whisper_print\s+.*?(\d+)%/s)
      if (progressMatch) {
        console.log(`[WhisperCpp] Progress: ${progressMatch[1]}%`)
      }
    }, 5000)
  })

  // Parse the JSON output
  const jsonPath = path.join(outputDir, `${baseName}.json`)
  const vttPath = path.join(outputDir, `${baseName}.vtt`)

  const segments = await parseWhisperCppJson(jsonPath, baseName, outputDir)
  const detectedLanguage = await detectLanguageFromJson(jsonPath) || config.language || 'en'

  // Rename output files to standard names
  try {
    renameSync(vttPath, path.join(outputDir, 'captions.vtt'))
  } catch {}
  try {
    renameSync(jsonPath, path.join(outputDir, 'transcript.json'))
  } catch {}

  const audioDuration = await getAudioDuration(wavPath)

  return {
    segments,
    detectedLanguage,
    backend: 'whisper.cpp',
    duration: audioDuration,
  }
}

/**
 * Run transcription using Python openai-whisper as fallback.
 */
async function runPythonWhisper(
  wavPath: string,
  outputDir: string,
  config: TranscriptionConfig
): Promise<TranscriptionResult> {
  const modelName = resolveModelName(config.model)

  console.log(`[PythonWhisper] Using model: ${modelName}`)

  // Build command
  const script = `import whisper; model = whisper.load_model("${modelName}"); ` +
    `result = model.transcribe("${wavPath}", language=${config.language === 'auto' ? 'None' : `"${config.language}"`}, verbose=${config.verbose ? 'True' : 'False'}); ` +
    `import json; print(json.dumps(result, ensure_ascii=False))`

  const stdout = execSync(`python3 -c "${script}"`, {
    timeout: 600_000, // 10 minute timeout
    maxBuffer: 50 * 1024 * 1024,
    encoding: 'utf-8',
  })

  // Parse JSON result
  const data = JSON.parse(stdout.trim())
  const segments: TranscriptionSegment[] = data.segments.map((seg: any) => ({
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
    words: seg.words?.map((w: any) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      probability: w.probability || 0,
    })),
  }))

  // Generate VTT from parsed segments
  const vttPath = path.join(outputDir, 'captions.vtt')
  await writeVttFromSegments(segments, vttPath, 'captions')

  return {
    segments,
    detectedLanguage: data.language || config.language || 'en',
    backend: 'openai-whisper',
    duration: segments.length > 0 ? segments[segments.length - 1]!.end : 0,
  }
}

// ================================================================
// VTT Generation
// ================================================================

/**
 * Generate the captions VTT file (verbatim, with sound effects markers cleaned).
 */
async function generateCaptionsVtt(
  transcription: TranscriptionResult,
  outputDir: string,
  config: TranscriptionConfig
): Promise<string> {
  const outputPath = path.join(outputDir, 'captions.vtt')

  // If whisper.cpp already generated a VTT, it's already at captions.vtt
  if (transcription.backend === 'whisper.cpp') {
    const captionsPath = path.join(outputDir, 'captions.vtt')
    if (existsSync(captionsPath)) {
      return captionsPath
    }
  }

  // Otherwise, generate from segments
  await writeVttFromSegments(transcription.segments, outputPath, 'captions')
  return outputPath
}

/**
 * Generate the subtitles VTT file (clean text, properly formatted).
 */
async function generateSubtitlesVtt(
  transcription: TranscriptionResult,
  outputDir: string,
  config: TranscriptionConfig
): Promise<string> {
  const outputPath = path.join(outputDir, 'subtitles.vtt')

  // For subtitles, we clean up the transcription:
  // - Remove sound effect markers if any
  // - Fix capitalization
  // - Merge very short segments
  const cleanedSegments = transcription.segments.map(seg => ({
    ...seg,
    text: seg.text
      .replace(/\[.*?\]/g, '')       // Remove [Music], [Applause], etc.
      .replace(/♪.*?♪/g, '')         // Remove ♪ song lyrics markers ♪
      .replace(/\s+/g, ' ')          // Normalize whitespace
      .trim(),
  })).filter(seg => seg.text.length > 0)  // Remove empty segments

  if (cleanedSegments.length === 0) {
    // Fall back to original if all were filtered
    await writeVttFromSegments(transcription.segments, outputPath, 'subtitles')
  } else {
    await writeVttFromSegments(cleanedSegments, outputPath, 'subtitles')
  }

  return outputPath
}

/**
 * Generate a description track VTT (placeholder content about visual elements).
 */
async function generateDescriptionTrack(
  videoId: string,
  outputPath: string,
  duration: number
): Promise<void> {
  const content = `WEBVTT
Kind: descriptions
Language: en

00:00:00.000 --> 00:00:10.000
This video has no audio description track available.

00:00:10.000 --> 00:00:20.000
Audio descriptions provide a narration of key visual elements.

00:00:20.000 --> 00:00:30.000
To generate descriptions, integrate with a vision-language model (e.g., GPT-4o, Claude 3.5).

00:00:30.000 --> ${formatVttTime(Math.min(duration, 60))}
Video ID: ${videoId}
`
  await writeFile(outputPath, content, 'utf-8')
}

/**
 * Generate placeholder VTT files when transcription fails.
 */
async function generatePlaceholderTracks(
  outputDir: string,
  language: string
): Promise<VttTrackResult[]> {
  const result: VttTrackResult[] = []

  // Captions placeholder
  const captionsPath = path.join(outputDir, 'captions.vtt')
  await writeFile(captionsPath, createPlaceholderVttContent('Captions not available'), 'utf-8')
  result.push({ type: 'captions', language, filePath: captionsPath, label: 'Captions (CC)', default: true })

  // Subtitles placeholder
  const subtitlesPath = path.join(outputDir, 'subtitles.vtt')
  await writeFile(subtitlesPath, createPlaceholderVttContent('Subtitles not available'), 'utf-8')
  result.push({ type: 'subtitles', language, filePath: subtitlesPath, label: 'English', default: false })

  // Descriptions placeholder
  const descriptionsPath = path.join(outputDir, 'descriptions.vtt')
  await writeFile(descriptionsPath, createPlaceholderVttContent('Descriptions not available'), 'utf-8')
  result.push({ type: 'descriptions', language: 'en', filePath: descriptionsPath, label: 'Descriptions', default: false })

  return result
}

// ================================================================
// Parsing Utilities
// ================================================================

/**
 * Parse whisper.cpp JSON output into segments.
 */
async function parseWhisperCppJson(
  jsonPath: string,
  baseName: string,
  outputDir: string
): Promise<TranscriptionSegment[]> {
  try {
    if (!existsSync(jsonPath)) {
      console.warn('[WhisperCpp] JSON output not found, trying alternative paths')
      // whisper.cpp might use different naming conventions
      const altPath = path.join(outputDir, `${baseName}.wav.json`)
      if (existsSync(altPath)) {
        return parseJsonFile(altPath)
      }
      console.warn('[WhisperCpp] No JSON output found, returning empty segments')
      return []
    }
    return parseJsonFile(jsonPath)
  } catch (error) {
    console.warn('[WhisperCpp] Failed to parse JSON output:', error)
    return []
  }
}

async function parseJsonFile(filePath: string): Promise<TranscriptionSegment[]> {
  const content = await readFile(filePath, 'utf-8')
  const data = JSON.parse(content)

  // whisper.cpp JSON format varies by version
  // Try different possible structures
  const rawSegments = data.transcription || data.segments || data || []

  if (!Array.isArray(rawSegments)) {
    console.warn('[WhisperCpp] Unexpected JSON format, keys:', Object.keys(data))
    return []
  }

  return rawSegments.map((seg: any): TranscriptionSegment => ({
    start: seg.start || seg.t0 || 0,
    end: seg.end || seg.t1 || 0,
    text: seg.text || '',
    words: seg.words?.map((w: any) => ({
      word: w.word || w.text || '',
      start: w.start || w.t0 || 0,
      end: w.end || w.t1 || 0,
      probability: w.probability || w.p || 0,
    })),
  }))
}

/**
 * Detect language from whisper.cpp JSON output.
 */
async function detectLanguageFromJson(jsonPath: string): Promise<string | null> {
  try {
    if (!existsSync(jsonPath)) return null
    const content = await readFile(jsonPath, 'utf-8')
    const data = JSON.parse(content)
    return data.language || null
  } catch {
    return null
  }
}

/**
 * Write a VTT file from transcription segments.
 */
async function writeVttFromSegments(
  segments: TranscriptionSegment[],
  outputPath: string,
  kind: 'captions' | 'subtitles' | 'chapters'
): Promise<void> {
  let content = 'WEBVTT\n'

  if (kind === 'captions') {
    content += 'Kind: captions\n'
  }

  content += '\n'

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    if (!seg.text.trim()) continue

    const startStr = formatVttTime(seg.start)
    const endStr = formatVttTime(seg.end)

    content += `${startStr} --> ${endStr}\n`
    content += `${seg.text.trim()}\n\n`
  }

  await writeFile(outputPath, content, 'utf-8')
}

// ================================================================
// Formatting Helpers
// ================================================================

function createPlaceholderVttContent(message: string): string {
  return `WEBVTT\n\n00:00:00.000 --> 00:00:05.000\n${message}\n`
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
