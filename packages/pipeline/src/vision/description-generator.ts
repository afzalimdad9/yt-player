import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { extractFrames, loadFramesBase64, type ExtractedFrame, type FrameExtractionConfig } from './frame-extractor.js'
import { vlmChat, resolveVlmConfig, type VlmConfig, type VlmMessage } from './vlm-client.js'
import type { VttTrackResult } from '../whisper/caption-generator.js'

const TEMP_DIR = process.env['TEMP_DIR'] || './tmp'

export interface DescriptionConfig {
  /** Interval between described segments in seconds (default: 30) */
  segmentInterval?: number
  /** Frames per description batch sent to the VLM (default: 5) */
  framesPerBatch?: number
  /** Frame extraction interval in seconds (default: 15) */
  frameInterval?: number
  /** Max total frames to extract (default: 200) */
  maxFrames?: number
  /** Video title for context in the prompt */
  title?: string
  /** Whether descriptions are enabled (default: true) */
  enabled?: boolean
  /** Override VLM provider (openai, anthropic, or ollama for local inference) */
  provider?: 'openai' | 'anthropic' | 'ollama'
}

const DEFAULT_DESC_CONFIG: Required<DescriptionConfig> = {
  segmentInterval: 30,
  framesPerBatch: 4,
  frameInterval: 30,
  maxFrames: 200,
  title: 'Untitled Video',
  enabled: true,
  provider: 'openai',
}

/**
 * System prompt for the VLM to generate audio descriptions.
 * Instructs the model to detect natural scene boundaries and produce
 * vivid, detailed descriptions suitable for video accessibility.
 */
const SYSTEM_PROMPT = `You are an expert audio description narrator for video accessibility (a11y). Your job is to describe visual content vividly and naturally, as if narrating for someone who cannot see the screen.

Output Format:
For each distinct scene you identify, output exactly one block:
[- TIMESTAMP] Scene description text.

Rules:
1. DETECT SCENE BOUNDARIES — group frames into coherent scenes. A new scene starts when the location, characters, or on-screen activity changes significantly. Do not just describe every time slice.
2. Be vivid and specific (2-4 sentences per scene). Include:
   - People: approximate age, gender, clothing colors/styles, facial expressions, body language, positions relative to each other
   - Setting: location type (indoor/outdoor), lighting (dim/bright/natural), time of day, colors, atmosphere
   - Actions: what is happening, object interactions, camera movement (pan, zoom, close-up)
   - On-screen text: titles, captions, signs, phone screens — read verbatim if readable
   - Scene transitions: cuts, fades, dissolves between scenes
3. Use present tense ("A woman walks into a room")
4. Describe only what is VISIBLE on screen
5. Do NOT interpret emotions or read minds — describe visible expressions and body language instead (e.g. "she clenches her fists" not "she is angry")
6. Do NOT describe audio, music, or dialogue — that belongs to separate audio tracks
7. Each scene block covers the full duration of the scene. Use the starting timestamp of the scene as TIMESTAMP.

Example:
[- 12] Medium shot of a modern office lobby with floor-to-ceiling windows letting in bright afternoon sunlight. A woman in her 30s wearing a navy blazer and carrying a leather briefcase walks briskly across the marble floor past a curved reception desk with a green plant on it. The camera pans right to follow her toward the elevator bank.
[- 45] Tight close-up of the woman's hand pressing the elevator call button. Her fingernails are unpainted and she is wearing a simple silver watch. The elevator chime sounds and the doors slide open, revealing a brightly lit empty car. She steps inside and the doors close. Cut to black.`

/**
 * Generate a real audio description track for a video using a vision-language model.
 *
 * Pipeline:
 * 1. Extract frames from video at regular intervals using FFmpeg
 * 2. Send frames in batches to a VLM (GPT-4o or Claude) with context
 * 3. Parse VLM responses into timed descriptions
 * 4. Generate a proper VTT file with description cues
 * 5. Return a VttTrackResult
 *
 * If the VLM is unavailable (no API key), falls back gracefully by logging a warning.
 */
export async function generateDescriptions(
  videoPath: string,
  videoId: string,
  config?: Partial<DescriptionConfig>
): Promise<VttTrackResult | null> {
  const cfg = { ...DEFAULT_DESC_CONFIG, ...config }

  if (!cfg.enabled) {
    console.log('[DescriptionGenerator] Disabled by config')
    return null
  }

  // Attempt to resolve VLM config
  let vlmConfig: VlmConfig
  try {
    const resolved = resolveVlmConfig()
    if (config?.provider) {
      resolved.provider = config.provider
    }
    vlmConfig = resolved
  } catch {
    console.warn('[DescriptionGenerator] VLM not configured, skipping descriptions')
    return null
  }

  // Cloud providers require an API key; Ollama runs locally without one
  if (vlmConfig.provider !== 'ollama' && !vlmConfig.apiKey) {
    console.warn(
      `[DescriptionGenerator] No API key for provider "${vlmConfig.provider}". ` +
      `Set ${vlmConfig.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} env var, or switch to ollama.`
    )
    return null
  }

  const outputDir = path.join(TEMP_DIR, videoId, 'tracks')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  console.log(`[DescriptionGenerator] Generating descriptions using ${vlmConfig.provider}/${vlmConfig.model}`)

  // ===== Step 1: Extract frames =====
  console.log('[DescriptionGenerator] Step 1: Extracting frames')
  const frameConfig: FrameExtractionConfig = {
    interval: cfg.frameInterval,
    maxFrames: cfg.maxFrames,
  }
  const frames = await extractFrames(videoPath, videoId, frameConfig)

  if (frames.length === 0) {
    console.warn('[DescriptionGenerator] No frames extracted, skipping')
    return null
  }

  console.log(`[DescriptionGenerator] Extracted ${frames.length} frames`)

  // ===== Step 2: Send frames to VLM in batches =====
  console.log('[DescriptionGenerator] Step 2: Sending frames to VLM')

  // Group frames into batches
  const batches = chunkArray(frames, cfg.framesPerBatch)
  const descriptionLines: { timestamp: number; text: string }[] = []

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!
    const firstTs = batch[0]!.timestamp
    const lastTs = batch[batch.length - 1]!.timestamp
    const batchNum = i + 1
    const totalBatches = batches.length

    console.log(
      `[DescriptionGenerator] Batch ${batchNum}/${totalBatches} (${firstTs.toFixed(0)}s - ${lastTs.toFixed(0)}s, ${batch.length} frames)`
    )

    // Load base64 data for this batch
    await loadFramesBase64(batch)

    // Build the user message with frames
    const content: VlmMessage['content'] = [
      {
        type: 'text' as const,
        text: `Here are frames ${batchNum} of ${totalBatches} from the video "${cfg.title}". ` +
          `These cover approximately ${formatTime(firstTs)} to ${formatTime(lastTs)}. ` +
          `Describe what is happening visually in this segment.`,
      },
      ...batch.map(frame => ({
        type: 'image_base64' as const,
        base64: frame.base64!,
        mediaType: 'image/jpeg',
      })),
    ]

    try {
      const response = await vlmChat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        {
          provider: cfg.provider,
          model: undefined, // Use default from env
          apiKey: vlmConfig.apiKey,
          maxTokens: vlmConfig.maxTokens,
        }
      )

      console.log(
        `[DescriptionGenerator] VLM response: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out tokens`
      )

      // Parse description lines from the response
      const parsed = parseDescriptionResponse(response.content, firstTs, lastTs)
      descriptionLines.push(...parsed)

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[DescriptionGenerator] Batch ${batchNum} failed: ${message}`)
      // Generate a fallback description for this batch
      descriptionLines.push({
        timestamp: firstTs,
        text: `[Scene at ${formatTime(firstTs)}]`,
      })
    }

    // Small delay between batches to avoid rate limits
    if (i < batches.length - 1) {
      await sleep(500)
    }
  }

  if (descriptionLines.length === 0) {
    console.warn('[DescriptionGenerator] No descriptions generated')
    return null
  }

  console.log(`[DescriptionGenerator] Generated ${descriptionLines.length} description segments`)

  // ===== Step 3: Generate VTT =====
  console.log('[DescriptionGenerator] Step 3: Generating VTT')

  // Each VLM batch produces one description for the full batch span
  // Use the actual batch duration (framesPerBatch × frameInterval) as the VTT cue duration
  const segmentDuration = cfg.framesPerBatch * cfg.frameInterval

  const outputPath = path.join(outputDir, 'descriptions.vtt')
  await writeDescriptionsVtt(descriptionLines, segmentDuration, outputPath)

  console.log(`[DescriptionGenerator] VTT written to ${outputPath} (${segmentDuration}s per cue)`)

  // ===== Step 4: Log cost estimate =====
  const totalFrames = frames.length
  const estimatedCost = estimateCost(totalFrames, descriptionLines.length)
  console.log(
    `[DescriptionGenerator] Complete: ${descriptionLines.length} segments from ${totalFrames} frames` +
    (estimatedCost ? ` (~$${estimatedCost.toFixed(2)} in API costs)` : '')
  )

  return {
    type: 'descriptions',
    language: 'en',
    filePath: outputPath,
    label: 'Audio Descriptions (AI)',
    default: false,
  }
}

// =========================================================================
// VTT Generation
// =========================================================================

/**
 * Write the descriptions VTT file from parsed description lines.
 * Each description is assigned a time segment of `segmentInterval` seconds.
 */
async function writeDescriptionsVtt(
  lines: { timestamp: number; text: string }[],
  segmentInterval: number,
  outputPath: string
): Promise<void> {
  let content = 'WEBVTT\nKind: descriptions\nLanguage: en\n\n'

  for (const line of lines) {
    const start = line.timestamp
    const end = start + segmentInterval
    const startStr = formatVttTime(start)
    const endStr = formatVttTime(end)
    content += `${startStr} --> ${endStr}\n${line.text}\n\n`
  }

  await writeFile(outputPath, content, 'utf-8')
}

// =========================================================================
// Response Parsing
// =========================================================================

/**
 * Parse the VLM response text into structured description lines.
 * Expected format: "- 15] A woman walks into a room"
 * The timestamp is in seconds.
 */
function parseDescriptionResponse(
  response: string,
  batchStartTime: number,
  _batchEndTime: number
): { timestamp: number; text: string }[] {
  const lines: { timestamp: number; text: string }[] = []
  const lines_array = response.split('\n')

  for (const rawLine of lines_array) {
    const line = rawLine.trim()
    if (!line) continue

    // Match pattern: "- TIMESTAMP] Description text" or "- TIMESTAMP - Description text"
    const match = line.match(/^-\s*([\d.]+)\s*[\]\-–]\s*(.+)/)
    if (match) {
      const timestamp = parseFloat(match[1]!)
      const text = match[2]!.trim()
      if (!isNaN(timestamp) && text) {
        lines.push({ timestamp, text })
      }
    }
  }

  // If parsing failed, create a single description from the batch
  if (lines.length === 0 && response.trim()) {
    lines.push({
      timestamp: batchStartTime,
      text: response.trim().slice(0, 200),
    })
  }

  return lines
}

// =========================================================================
// Utilities
// =========================================================================

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Estimate the API cost based on frame count and description segments.
 * Rough estimates — actual costs vary by model and content.
 */
function estimateCost(frameCount: number, segmentCount: number): number | null {
  const provider = process.env['DESCRIPTION_PROVIDER'] || 'openai'

  if (provider === 'ollama') {
    return null  // Local inference is free
  }

  // Rough per-image token estimates (optimized defaults: 30s intervals, 4 frames/batch)
  // A 10-min video with optimizations: ~20 frames → ~$0.005 with GPT-4o low-detail
  // GPT-4o: ~258 tokens per 512x512 image (low detail mode uses ~85 tokens)
  // Claude Sonnet: ~1600 tokens per image
  if (provider === 'openai') {
    const imageTokens = frameCount * 85  // low detail mode
    const outputTokens = segmentCount * 100
    const totalTokens = imageTokens + outputTokens
    // GPT-4o: $2.50 per 1M input, $10 per 1M output
    const cost = (totalTokens / 1_000_000) * 2.5 + (outputTokens / 1_000_000) * 10
    return cost
  } else if (provider === 'anthropic') {
    const imageTokens = frameCount * 1600  // Claude image tokens (~131K tokens/image with high detail)
    const outputTokens = segmentCount * 100
    const totalTokens = imageTokens + outputTokens
    // Claude Sonnet 4: $3 per 1M input, $15 per 1M output
    const cost = (totalTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15
    return cost
  }

  return null
}
