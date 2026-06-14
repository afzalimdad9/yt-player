import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@yt-player/database'
import { VideoStatus, QueueName, VideoIngestJobData } from '@yt-player/shared'
import { createQueues } from '@yt-player/queue'

const SubmitVideoSchema = z.object({
  url: z.string().url('Must be a valid URL').min(1, 'URL is required'),
  title: z.string().optional(),
  wordTimestamps: z.boolean().optional(),
})

const VideoIdParam = z.object({
  id: z.string().uuid('Invalid video ID'),
})

const UPLOAD_DIR = process.env['TEMP_DIR'] || './tmp'

export async function videoRoutes(app: FastifyInstance) {
  const queues = createQueues()
  const videoIngestQueue = queues[QueueName.VIDEO_INGEST]

  /**
   * POST /api/videos
   * Submit a video URL for processing
   */
  app.post('/', async (request, reply) => {
    const body = SubmitVideoSchema.parse(request.body)
    const videoId = uuid()

    // Create database record
    await prisma.video.create({
      data: {
        id: videoId,
        title: body.title || 'Untitled Video',
        originalUrl: body.url,
        status: VideoStatus.PENDING,
      },
    })

    // Enqueue processing job
    await videoIngestQueue.add(
      'ingest',
      {
        videoId,
        url: body.url,
        wordTimestamps: body.wordTimestamps,
      } satisfies VideoIngestJobData,
      {
        jobId: videoId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    )

    reply.status(201)
    return {
      success: true,
      videoId,
      status: VideoStatus.PENDING,
      message: 'Video submitted for processing',
    }
  })

  /**
   * POST /api/videos/upload
   * Upload a video file directly (drag-and-drop / file picker)
   */
  app.post('/upload', async (request, reply) => {
    const data = await request.file()

    if (!data) {
      reply.status(400)
      return { error: 'Bad Request', message: 'No file uploaded' }
    }

    const filename = data.filename || 'uploaded_video'
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')

    // Server-side file type validation
    const allowedMimes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    const allowedExts = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv']
    const ext = safeName.substring(safeName.lastIndexOf('.')).toLowerCase()

    if (!allowedExts.includes(ext) && data.mimetype && !allowedMimes.includes(data.mimetype)) {
      reply.status(400)
      return { error: 'Invalid file type', message: `Only video files are accepted. Got: ${data.mimetype || ext}` }
    }

    const videoId = uuid()
    const videoDir = path.join(UPLOAD_DIR, videoId)
    const filePath = path.join(videoDir, safeName)

    if (!existsSync(videoDir)) {
      mkdirSync(videoDir, { recursive: true })
    }

    // Stream the file to disk
    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)
    await writeFile(filePath, buffer)

    const fileSizeMb = (buffer.length / (1024 * 1024)).toFixed(1)
    console.log(`[Upload] Received file: ${filename} (${fileSizeMb}MB, ${data.mimetype || 'unknown'}), saved to ${filePath}`)

    // Create database record
    await prisma.video.create({
      data: {
        id: videoId,
        title: filename.replace(/\.[^/.]+$/, ''),
        originalUrl: filePath,
        status: VideoStatus.PENDING,
      },
    })

    // Read wordTimestamps from the upload fields (Fastify stores non-file fields)
    const wordTimestampsField = data.fields?.wordTimestamps
    const wt = typeof wordTimestampsField === 'string' ? wordTimestampsField : undefined
    const wordTimestamps = wt === 'true' ? true : wt === 'false' ? false : undefined

    // Enqueue processing job with local file path
    await videoIngestQueue.add(
      'ingest',
      {
        videoId,
        url: filePath,
        wordTimestamps,
      } satisfies VideoIngestJobData,
      {
        jobId: videoId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    )

    reply.status(201)
    return {
      success: true,
      videoId,
      filename,
      size: buffer.length,
      mimetype: data.mimetype,
      status: VideoStatus.PENDING,
      message: 'Video uploaded and queued for processing',
    }
  })

  /**
   * GET /api/videos
   * List all videos with pagination
   */
  app.get('/', async (request) => {
    const query = request.query as { page?: string; limit?: string }
    const page = parseInt(query.page || '1', 10)
    const limit = Math.min(parseInt(query.limit || '20', 10), 100)
    const skip = (page - 1) * limit

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          renditions: true,
          tracks: true,
          thumbnailSprites: true,
          manifests: true,
          chapters: { orderBy: { startTime: 'asc' } },
          _count: true,
        },
      }),
      prisma.video.count(),
    ])

    return {
      data: videos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  })

  /**
   * GET /api/videos/:id
   * Get video details by ID
   */
  app.get('/:id', async (request, reply) => {
    const { id } = VideoIdParam.parse(request.params)
    const video = await prisma.video.findUnique({
      where: { id },
      include: {
        renditions: true,
        audioRenditions: true,
        tracks: true,
        chapters: { orderBy: { startTime: 'asc' } },
        thumbnailSprites: true,
        manifests: true,
      },
    })

    if (!video) {
      reply.status(404)
      return { error: 'Not Found', message: 'Video not found' }
    }

    return { data: video }
  })

  /**
   * DELETE /api/videos/:id
   * Delete a video and all its assets
   */
  app.delete('/:id', async (request, reply) => {
    const { id } = VideoIdParam.parse(request.params)
    const video = await prisma.video.findUnique({ where: { id } })

    if (!video) {
      reply.status(404)
      return { error: 'Not Found', message: 'Video not found' }
    }

    await prisma.video.delete({ where: { id } })
    return { success: true, message: 'Video deleted' }
  })

  /**
   * GET /api/videos/:id/status
   * Get processing status of a video
   */
  app.get('/:id/status', async (request, reply) => {
    const { id } = VideoIdParam.parse(request.params)
    const video = await prisma.video.findUnique({
      where: { id },
      select: { id: true, status: true, error: true, createdAt: true, updatedAt: true },
    })

    if (!video) {
      reply.status(404)
      return { error: 'Not Found', message: 'Video not found' }
    }

    return { data: video }
  })
}
