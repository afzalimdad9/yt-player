import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import path from 'node:path'

/**
 * Whisper model management.
 * Handles auto-download of models from HuggingFace and local caching.
 */

// Default models directory (configurable via env var)
const MODELS_DIR = process.env['WHISPER_MODELS_DIR']
  || path.join(process.env['HOME'] || '/tmp', '.cache', 'whisper', 'models')

// Base URL for GGML model downloads
const HF_MODEL_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

export interface WhisperModelInfo {
  name: string
  filename: string
  size: string
  description: string
  isMultilingual: boolean
  sizeBytes: number
  downloadUrl: string
}

/**
 * Available whisper.cpp GGML models with their metadata.
 * Sorted by size - smaller = faster but less accurate.
 */
export const WHISPER_MODELS: Record<string, WhisperModelInfo> = {
  'tiny': {
    name: 'tiny',
    filename: 'ggml-tiny.bin',
    size: '~75 MB',
    description: 'Tiny multilingual model (fastest)',
    isMultilingual: true,
    sizeBytes: 75 * 1024 * 1024,
    downloadUrl: `${HF_MODEL_BASE}/ggml-tiny.bin`,
  },
  'tiny.en': {
    name: 'tiny.en',
    filename: 'ggml-tiny.en.bin',
    size: '~75 MB',
    description: 'Tiny English-only model (fastest English)',
    isMultilingual: false,
    sizeBytes: 75 * 1024 * 1024,
    downloadUrl: `${HF_MODEL_BASE}/ggml-tiny.en.bin`,
  },
  'base': {
    name: 'base',
    filename: 'ggml-base.bin',
    size: '~142 MB',
    description: 'Base multilingual model',
    isMultilingual: true,
    sizeBytes: 142 * 1024 * 1024,
    downloadUrl: `${HF_MODEL_BASE}/ggml-base.bin`,
  },
  'base.en': {
    name: 'base.en',
    filename: 'ggml-base.en.bin',
    size: '~142 MB',
    description: 'Base English-only model',
    isMultilingual: false,
    sizeBytes: 142 * 1024 * 1024,
    downloadUrl: `${HF_MODEL_BASE}/ggml-base.en.bin`,
  },
  'small': {
    name: 'small',
    filename: 'ggml-small.bin',
    size: '~466 MB',
    description: 'Small multilingual model (good accuracy)',
    isMultilingual: true,
    sizeBytes: 466 * 1024 * 1024,
    downloadUrl: `${HF_MODEL_BASE}/ggml-small.bin`,
  },
  'small.en': {
    name: 'small.en',
    filename: 'ggml-small.en.bin',
    size: '~466 MB',
    description: 'Small English-only model (good accuracy)',
    isMultilingual: false,
    sizeBytes: 466 * 1024 * 1024,
    downloadUrl: `${HF_MODEL_BASE}/ggml-small.en.bin`,
  },
  'medium': {
    name: 'medium',
    filename: 'ggml-medium.bin',
    size: '~1.5 GB',
    description: 'Medium multilingual model',
    isMultilingual: true,
    sizeBytes: 1.5 * 1024 * 1024 * 1024,
    downloadUrl: `${HF_MODEL_BASE}/ggml-medium.bin`,
  },
  'large-v3': {
    name: 'large-v3',
    filename: 'ggml-large-v3.bin',
    size: '~3.1 GB',
    description: 'Large v3 multilingual model (most accurate)',
    isMultilingual: true,
    sizeBytes: 3.1 * 1024 * 1024 * 1024,
    downloadUrl: `${HF_MODEL_BASE}/ggml-large-v3.bin`,
  },
  'large-v3-turbo': {
    name: 'large-v3-turbo',
    filename: 'ggml-large-v3-turbo.bin',
    size: '~1.6 GB',
    description: 'Large v3 turbo multilingual (fast + accurate)',
    isMultilingual: true,
    sizeBytes: 1.6 * 1024 * 1024 * 1024,
    downloadUrl: `${HF_MODEL_BASE}/ggml-large-v3-turbo.bin`,
  },
}

/**
 * Resolve the model name to a valid model key.
 * Falls back to 'base' if the requested model is not found.
 */
export function resolveModelName(modelName?: string): string {
  if (!modelName) return 'base'
  if (WHISPER_MODELS[modelName]) return modelName
  console.warn(`[WhisperModels] Unknown model "${modelName}", falling back to "base"`)
  return 'base'
}

/**
 * Get the expected file path for a model.
 */
export function getModelPath(modelName: string): string {
  const info = WHISPER_MODELS[modelName]
  if (!info) throw new Error(`Unknown model: ${modelName}`)
  return path.join(MODELS_DIR, info.filename)
}

/**
 * Check if a model file exists locally.
 */
export function isModelDownloaded(modelName: string): boolean {
  const filePath = getModelPath(resolveModelName(modelName))
  return existsSync(filePath)
}

/**
 * Get sizes of all available models that have been downloaded.
 */
export function listDownloadedModels(): { name: string; info: WhisperModelInfo }[] {
  if (!existsSync(MODELS_DIR)) return []

  return Object.values(WHISPER_MODELS)
    .filter(info => existsSync(path.join(MODELS_DIR, info.filename)))
    .map(info => ({ name: info.name, info }))
}

/**
 * Download a whisper.cpp model file from HuggingFace.
 * Shows download progress via console.log.
 * Returns the path to the downloaded model.
 */
export async function downloadModel(modelName: string): Promise<string> {
  const resolved = resolveModelName(modelName)
  const info = WHISPER_MODELS[resolved]!

  // Ensure model directory exists
  if (!existsSync(MODELS_DIR)) {
    mkdirSync(MODELS_DIR, { recursive: true })
  }

  const outputPath = path.join(MODELS_DIR, info.filename)

  // Skip if already downloaded
  if (existsSync(outputPath)) {
    console.log(`[WhisperModels] Model already cached: ${info.filename}`)
    return outputPath
  }

  console.log(`[WhisperModels] Downloading model: ${info.name} (${info.size})`)
  console.log(`[WhisperModels] From: ${info.downloadUrl}`)
  console.log(`[WhisperModels] To: ${outputPath}`)

  try {
    // Use fetch + streams to download with progress
    const response = await fetch(info.downloadUrl)
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`)
    }

    const contentLength = response.headers.get('content-length')
    const totalBytes = contentLength ? parseInt(contentLength, 10) : info.sizeBytes
    const reader = response.body!.getReader()

    // Write to a temp file first
    const tmpPath = `${outputPath}.download`
    const chunks: Uint8Array[] = []
    let downloadedBytes = 0
    let lastLogTime = Date.now()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      chunks.push(value)
      downloadedBytes += value.length

      // Log progress every 2 seconds
      const now = Date.now()
      if (now - lastLogTime > 2000) {
        const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1)
        const downloadedMb = (downloadedBytes / (1024 * 1024)).toFixed(1)
        const totalMb = (totalBytes / (1024 * 1024)).toFixed(1)
        console.log(`[WhisperModels] Downloading: ${percent}% (${downloadedMb}MB / ${totalMb}MB)`)
        lastLogTime = now
      }
    }

    // Concatenate all chunks and write to temp file
    const fullBuffer = new Uint8Array(downloadedBytes)
    let offset = 0
    for (const chunk of chunks) {
      fullBuffer.set(chunk, offset)
      offset += chunk.length
    }

    await writeFile(tmpPath, fullBuffer)

    // Rename temp file to actual model file (atomic)
    renameSync(tmpPath, outputPath)

    console.log(`[WhisperModels] Download complete: ${info.filename}`)
    return outputPath
  } catch (error) {
    console.error(`[WhisperModels] Download failed for ${info.name}:`, error)
    throw error
  }
}

/**
 * Ensure a model is available, downloading if necessary.
 * Returns the path to the model file.
 */
export async function ensureModel(modelName?: string): Promise<string> {
  const resolved = resolveModelName(modelName)
  const modelPath = getModelPath(resolved)

  if (!existsSync(modelPath)) {
    console.log(`[WhisperModels] Model not found locally, downloading: ${resolved}`)
    return downloadModel(resolved)
  }

  return modelPath
}

/**
 * Get the path to the whisper.cpp executable.
 * Checks multiple possible locations.
 */
export function findWhisperCppBinary(): string | null {
  const envPath = process.env['WHISPER_CPP_PATH']
  if (envPath && existsSync(envPath)) return envPath

  const candidates = [
    'whisper-cli',                           // in PATH
    'whisper',                               // in PATH (some package managers)
    '/usr/local/bin/whisper-cli',
    '/usr/bin/whisper-cli',
    '/opt/whisper.cpp/build/bin/whisper-cli',
    './whisper.cpp/build/bin/whisper-cli',
    './whisper.cpp/build/bin/whisper',
    path.join(MODELS_DIR, '..', 'whisper-cli'),
  ]

  for (const candidate of candidates) {
    // For relative paths, check from process.cwd()
    const fullPath = candidate.startsWith('/') || candidate.startsWith('.')
      ? path.resolve(candidate)
      : candidate

    if (fullPath === candidate && !fullPath.includes('/')) {
      // It's just a command name - check if it's in PATH
      try {
        execSync(`which ${candidate}`, { stdio: 'pipe' })
        return candidate
      } catch {
        continue
      }
    }

    if (existsSync(fullPath)) {
      return fullPath
    }
  }

  return null
}

/**
 * Check if Python openai-whisper is available as a fallback.
 */
export async function isPythonWhisperAvailable(): Promise<boolean> {
  try {
    execSync('python3 -c "import whisper; print(whisper.__version__)"', {
      stdio: 'pipe',
      timeout: 5000,
    })
    return true
  } catch {
    return false
  }
}

export { MODELS_DIR }
