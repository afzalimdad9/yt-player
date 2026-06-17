import { FastifyInstance } from 'fastify'
import { prisma } from '@yt-player/database'
import { getConnection } from '@yt-player/queue'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async (_request, _reply) => {
    const checks: Record<string, string> = {}

    // Check database
    try {
      await prisma.$queryRaw`SELECT 1`
      checks.database = 'ok'
    } catch {
      checks.database = 'error'
    }

    // Check Redis
    try {
      const redis = getConnection()
      await redis.ping()
      checks.redis = 'ok'
    } catch {
      checks.redis = 'error'
    }

    const allOk = Object.values(checks).every(v => v === 'ok')

    return {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    }
  })

  app.get('/ready', async (_request, _reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return { status: 'ready', timestamp: new Date().toISOString() }
    } catch {
      _reply.status(503)
      return { status: 'not ready', timestamp: new Date().toISOString() }
    }
  })
}
