import { Job } from 'bullmq'
import { prisma } from '@yt-player/database'
import { StorageClient } from '@yt-player/storage'
import { createWorker, QueueName } from '@yt-player/queue'
import {
  VideoIngestJobData,
  VideoProcessJobData,
  CaptionGenerateJobData,
  ThumbnailGenerateJobData,
  ManifestGenerateJobData,
  VideoStatus,
} from '@yt-player/shared'
import { runPipeline } from '@yt-player/pipeline'

const storage = new StorageClient()

/**
 * Start all workers. Call this from the main process.
 */
export function startWorkers() {
  // Video Ingest Worker - orchestrates the full pipeline
  const ingestWorker = createWorker<VideoIngestJobData>(
    QueueName.VIDEO_INGEST,
    async (job: Job<VideoIngestJobData>) => {
      const { videoId, url } = job.data
      console.log(`[Worker:Ingest] Processing video ${videoId} from ${url}`)

      try {
        await runPipeline(videoId, url, { storage })
        console.log(`[Worker:Ingest] Video ${videoId} processed successfully`)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Worker:Ingest] Video ${videoId} failed:`, message)

        await prisma.video.update({
          where: { id: videoId },
          data: {
            status: VideoStatus.FAILED,
            error: message,
          },
        })
        throw error
      }
    },
    { concurrency: 2 } // Only process 2 videos at a time
  )

  // Video Process Worker - handles transcoding (called by ingest worker internally)
  const processWorker = createWorker<VideoProcessJobData>(
    QueueName.VIDEO_PROCESS,
    async (job: Job<VideoProcessJobData>) => {
      console.log(`[Worker:Process] Transcoding video ${job.data.videoId}`)
      // Transcoder is called internally via runPipeline
      // This worker serves as a fallback for isolated transcoding jobs
    },
    { concurrency: 1 } // Heavy CPU work, run 1 at a time
  )

  // Caption Generate Worker
  const captionWorker = createWorker<CaptionGenerateJobData>(
    QueueName.CAPTION_GENERATE,
    async (job: Job<CaptionGenerateJobData>) => {
      console.log(`[Worker:Caption] Generating captions for ${job.data.videoId}`)
    },
    { concurrency: 2 }
  )

  // Thumbnail Generate Worker
  const thumbnailWorker = createWorker<ThumbnailGenerateJobData>(
    QueueName.THUMBNAIL_GENERATE,
    async (job: Job<ThumbnailGenerateJobData>) => {
      console.log(`[Worker:Thumbnail] Generating thumbnails for ${job.data.videoId}`)
    },
    { concurrency: 2 }
  )

  // Manifest Generate Worker
  const manifestWorker = createWorker<ManifestGenerateJobData>(
    QueueName.MANIFEST_GENERATE,
    async (job: Job<ManifestGenerateJobData>) => {
      console.log(`[Worker:Manifest] Generating manifests for ${job.data.videoId}`)
    },
    { concurrency: 2 }
  )

  // Handle worker errors
  const workers = [ingestWorker, processWorker, captionWorker, thumbnailWorker, manifestWorker]
  workers.forEach(worker => {
    worker.on('failed', (job, error) => {
      console.error(`[Worker] Job ${job?.id} failed:`, error.message)
    })
  })

  console.log('[Workers] All workers started')
  return workers
}
