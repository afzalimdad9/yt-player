import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@yt-player/database'
import { StorageClient } from '@yt-player/storage'
import { StreamingSession } from '@yt-player/shared'

const VideoIdParam = z.object({
  id: z.string().uuid('Invalid video ID'),
})

/**
 * Build a streaming session response for the frontend player
 */
async function buildStreamingSession(videoId: string): Promise<StreamingSession | null> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      tracks: true,
      manifests: true,
      thumbnailSprites: true,
      renditions: true,
    },
  })

  if (!video || video.status !== 'READY') return null

  const storage = new StorageClient()

  return {
    videoId: video.id,
    hlsManifest: video.manifests.find(m => m.protocol === 'hls')?.url,
    dashManifest: video.manifests.find(m => m.protocol === 'dash')?.url,
    tracks: video.tracks.map(t => ({
      type: t.type as 'captions' | 'subtitles' | 'descriptions' | 'chapters',
      language: t.language,
      label: t.label,
      src: storage.getPublicUrl(t.src),
      default: t.default,
    })),
    thumbnails: video.thumbnailSprites[0]
      ? storage.getPublicUrl(video.thumbnailSprites[0].vttSrc)
      : undefined,
  }
}

export async function streamRoutes(app: FastifyInstance) {
  /**
   * GET /api/stream/:id
   * Get streaming session info for a video
   */
  app.get('/:id', async (request, reply) => {
    const { id } = VideoIdParam.parse(request.params)
    const session = await buildStreamingSession(id)

    if (!session) {
      reply.status(404)
      return {
        error: 'Not Found',
        message: 'Video not found or not ready for streaming',
      }
    }

    return { data: session }
  })

  /**
   * GET /api/stream/:id/manifest/:protocol
   * Get streaming manifest URL (redirects to storage)
   */
  app.get('/:id/manifest/:protocol', async (request, reply) => {
    const { id } = VideoIdParam.parse(request.params)
    const { protocol } = request.params as { protocol: string }

    const manifest = await prisma.manifest.findFirst({
      where: { videoId: id, protocol: protocol.toLowerCase() },
    })

    if (!manifest) {
      reply.status(404)
      return { error: 'Not Found', message: `No ${protocol} manifest found` }
    }

    return reply.code(301).redirect(manifest.url)
  })

  /**
   * GET /api/stream/:id/tracks
   * Get all VTT tracks for a video
   */
  app.get('/:id/tracks', async (request, reply) => {
    const { id } = VideoIdParam.parse(request.params)
    const tracks = await prisma.track.findMany({ where: { videoId: id } })

    return { data: tracks }
  })
}
