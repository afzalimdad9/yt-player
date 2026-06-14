import { prisma } from '@yt-player/database'
import { StorageClient } from '@yt-player/storage'
import {
  VideoStatus,
  VideoQuality,
  TrackType,
  StreamingProtocol,
} from '@yt-player/shared'
import { downloadVideo } from './downloader.js'
import { transcodeVideo } from './transcoder.js'
import { generateCaptions } from './whisper/index.js'
import { detectChapters } from './chapter-detector.js'
import { generateDescriptions } from './vision/index.js'
import { generateThumbnailSprite } from './thumbnail-sprite.js'
import { uploadStreamingAssets } from './manifest-generator.js'
import { rm } from 'node:fs/promises'
import path from 'node:path'

export interface PipelineConfig {
  storage: StorageClient
  /** Whether to use word-level timestamps in captions (default: true) */
  wordTimestamps?: boolean
}

/**
 * Full pipeline to process a video from URL to streaming-ready assets.
 *
 * Steps:
 * 1.  Download video from URL
 * 2.  Analyze and create database record
 * 3.  Transcode into multiple quality renditions (HLS + DASH)
 * 4.  Generate captions/subtitles via Whisper
 * 5.  Generate audio descriptions via AI vision (GPT-4o/Claude)
 * 6.  Detect chapters/scenes
 * 7.  Generate thumbnail sprite sheet
 * 8.  Upload all assets to S3/MinIO
 * 9.  Update database with final metadata
 * 10. Cleanup temp processing files
 */
export async function runPipeline(
  videoId: string,
  url: string,
  config: PipelineConfig
): Promise<void> {
  const { storage } = config

  try {
    // ===== Step 1: Download =====
    console.log(`[Pipeline] Starting download for ${videoId}`)
    await updateStatus(videoId, VideoStatus.DOWNLOADING)
    const { videoPath, audioPath, metadata } = await downloadVideo(url, videoId)
    console.log(`[Pipeline] Downloaded: ${metadata.title} (${metadata.duration}s)`)

    // Update database with initial metadata
    await updateVideoMetadata(videoId, {
      title: metadata.title,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
    })

    // ===== Step 2: Transcode =====
    console.log(`[Pipeline] Starting transcode for ${videoId}`)
    await updateStatus(videoId, VideoStatus.PROCESSING)

    const transcodeResult = await transcodeVideo(videoPath, videoId, metadata.height)

    // ===== Step 3: Captions =====
    const useWordTimestamps = config.wordTimestamps
    console.log(`[Pipeline] Generating captions for ${videoId} (wordTimestamps: ${useWordTimestamps ?? true})`)
    const captionResults = useWordTimestamps !== undefined
      ? await generateCaptions(audioPath, videoId, 'en', { wordTimestamps: useWordTimestamps })
      : await generateCaptions(audioPath, videoId)

    // ===== Step 4: Audio Descriptions (AI vision) =====
    console.log(`[Pipeline] Generating audio descriptions for ${videoId}`)
    const descriptionResult = await generateDescriptions(videoPath, videoId, {
      title: metadata.title,
    })

    // ===== Step 5: Chapters =====
    console.log(`[Pipeline] Detecting chapters for ${videoId}`)
    const chapterResult = await detectChapters(videoPath, videoId)

    // ===== Step 6: Thumbnail sprites =====
    console.log(`[Pipeline] Generating thumbnail sprites for ${videoId}`)
    const spriteResult = await generateThumbnailSprite(videoPath, videoId)

    // ===== Step 7: Upload to storage =====
    console.log(`[Pipeline] Uploading assets for ${videoId}`)
    const manifests = await uploadStreamingAssets(storage, videoId, transcodeResult)

    // Upload thumbnail sprite and VTT tracks
    await uploadVttTracks(storage, videoId, captionResults, descriptionResult, chapterResult, spriteResult)

    // Upload main thumbnail (first frame)
    await uploadMainThumbnail(storage, videoId, videoPath)

    // ===== Step 8: Update database with all results =====
    console.log(`[Pipeline] Updating database for ${videoId}`)
    await saveResultsToDatabase(storage, videoId, transcodeResult, captionResults, descriptionResult, chapterResult, spriteResult, manifests)

    // ===== Step 9: Mark complete =====
    await updateStatus(videoId, VideoStatus.READY)
    console.log(`[Pipeline] Complete for ${videoId}`)

    // ===== Step 10: Cleanup temp processing files =====
    try {
      const tempDir = path.join(process.env['TEMP_DIR'] || './tmp', videoId)
      await rm(tempDir, { recursive: true, force: true })
      console.log(`[Pipeline] Cleaned up temp files for ${videoId}`)
    } catch {
      // Best-effort cleanup
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[Pipeline] Failed for ${videoId}:`, message)
    await updateStatus(videoId, VideoStatus.FAILED, message)

    // Cleanup even on failure
    try {
      const tempDir = path.join(process.env['TEMP_DIR'] || './tmp', videoId)
      await rm(tempDir, { recursive: true, force: true })
    } catch {}

    throw error
  }
}

async function updateStatus(videoId: string, status: VideoStatus, error?: string): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: { status, error },
  })
}

async function updateVideoMetadata(
  videoId: string,
  data: {
    title: string
    duration: number
    width: number
    height: number
    fps: number
  }
): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: {
      title: data.title,
      duration: data.duration,
      width: data.width,
      height: data.height,
      fps: data.fps,
      status: VideoStatus.DOWNLOADED,
    },
  })
}

async function uploadVttTracks(
  storage: StorageClient,
  videoId: string,
  captions: Awaited<ReturnType<typeof generateCaptions>>,
  description: Awaited<ReturnType<typeof generateDescriptions>>,
  chapters: Awaited<ReturnType<typeof detectChapters>>,
  sprites: Awaited<ReturnType<typeof generateThumbnailSprite>>
): Promise<void> {
  const { readFile } = await import('node:fs/promises')

  // Upload caption/subtitle VTTs
  for (const track of captions) {
    const content = await readFile(track.filePath, 'utf-8')
    const key = `videos/${videoId}/tracks/${track.type}.vtt`
    await storage.upload(key, content, 'text/vtt')
  }

  // Upload description VTT (if generated)
  if (description) {
    const content = await readFile(description.filePath, 'utf-8')
    await storage.upload(`videos/${videoId}/tracks/descriptions.vtt`, content, 'text/vtt')
  }

  // Upload chapters VTT
  const chaptersContent = await readFile(chapters.chaptersVtt, 'utf-8')
  await storage.upload(`videos/${videoId}/tracks/chapters.vtt`, chaptersContent, 'text/vtt')

  // Upload thumbnail sprite
  const spriteContent = await readFile(sprites.spritePath)
  await storage.upload(sprites.sprite.src, spriteContent, 'image/jpeg')

  const vttContent = await readFile(sprites.vttPath, 'utf-8')
  await storage.upload(sprites.sprite.vttSrc, vttContent, 'text/vtt')
}

async function uploadMainThumbnail(
  storage: StorageClient,
  videoId: string,
  videoPath: string
): Promise<void> {
  const { execSync } = await import('node:child_process')
  const { readFileSync, mkdtempSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')

  const tmpDir = mkdtempSync(join(tmpdir(), 'thumb-'))
  const thumbPath = join(tmpDir, 'thumbnail.jpg')

  execSync(
    `ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 -q:v 2 -y "${thumbPath}"`,
    { stdio: 'pipe' }
  )

  const content = readFileSync(thumbPath)
  await storage.upload(`videos/${videoId}/thumbnail.jpg`, content, 'image/jpeg')
}

async function saveResultsToDatabase(
  storage: StorageClient,
  videoId: string,
  transcodeResult: Awaited<ReturnType<typeof transcodeVideo>>,
  captionResults: Awaited<ReturnType<typeof generateCaptions>>,
  descriptionResult: Awaited<ReturnType<typeof generateDescriptions>>,
  chapterResult: Awaited<ReturnType<typeof detectChapters>>,
  spriteResult: Awaited<ReturnType<typeof generateThumbnailSprite>>,
  manifests: Awaited<ReturnType<typeof uploadStreamingAssets>>
): Promise<void> {
  // Create renditions
  for (const q of transcodeResult.qualities) {
    const [width, height] = q.resolution.split('x').map(Number)
    await prisma.rendition.create({
      data: {
        videoId,
        quality: q.quality,
        width: width || 0,
        height: height || 0,
        bitrate: q.bandwidth,
        codec: 'h264',
        container: 'mp4',
        path: `videos/${videoId}/hls/${q.quality}/index.m3u8`,
      },
    })
  }

  // Create tracks
  for (const track of captionResults) {
    await prisma.track.create({
      data: {
        videoId,
        type: track.type,
        language: track.language,
        label: track.label,
        src: `videos/${videoId}/tracks/${track.type}.vtt`,
        default: track.default,
      },
    })
  }

  // Create description track (if generated)
  if (descriptionResult) {
    await prisma.track.create({
      data: {
        videoId,
        type: 'descriptions',
        language: 'en',
        label: 'Audio Descriptions (AI)',
        src: `videos/${videoId}/tracks/descriptions.vtt`,
        default: false,
      },
    })
  }

  // Add chapters track
  await prisma.track.create({
    data: {
      videoId,
      type: 'chapters' as TrackType,
      language: 'en',
      label: 'Chapters',
      src: `videos/${videoId}/tracks/chapters.vtt`,
      default: false,
    },
  })

  // Create chapters
  for (const chapter of chapterResult.chapters) {
    await prisma.chapter.create({
      data: {
        videoId,
        title: chapter.title,
        startTime: chapter.startTime,
        endTime: chapter.endTime,
      },
    })
  }

  // Create thumbnail sprite
  await prisma.thumbnailSprite.create({
    data: {
      videoId,
      src: spriteResult.sprite.src,
      vttSrc: spriteResult.sprite.vttSrc,
      tileWidth: spriteResult.sprite.tileWidth,
      tileHeight: spriteResult.sprite.tileHeight,
      columns: spriteResult.sprite.columns,
      rows: spriteResult.sprite.rows,
      totalFrames: spriteResult.sprite.totalFrames,
      interval: spriteResult.sprite.interval,
    },
  })

  // Create manifests
  for (const manifest of manifests) {
    await prisma.manifest.create({
      data: {
        videoId,
        protocol: manifest.protocol,
        url: manifest.url,
        bandwidth: manifest.bandwidth,
        resolution: manifest.resolution,
        codecs: manifest.codecs,
      },
    })
  }

  // Update thumbnail URL
  await prisma.video.update({
    where: { id: videoId },
    data: {
      thumbnailUrl: storage.getPublicUrl(`videos/${videoId}/thumbnail.jpg`),
    },
  })
}
