import Fastify, { FastifyServerOptions } from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { videoRoutes } from './routes/videos.js'
import { streamRoutes } from './routes/stream.js'
import { healthRoutes } from './routes/health.js'
import { errorHandler } from './middleware/error.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function buildApp(opts?: FastifyServerOptions) {
  const app = Fastify({
    logger: {
      level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
    ...opts,
  })

  // Plugins
  await app.register(cors, {
    origin: process.env['API_CORS_ORIGIN'] || 'http://localhost:5173',
    credentials: true,
  })

  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024 * 1024, // 5GB
    },
  })

  // Health check (no auth)
  await app.register(healthRoutes, { prefix: '/api/health' })

  // Video routes
  await app.register(videoRoutes, { prefix: '/api/videos' })

  // Streaming routes
  await app.register(streamRoutes, { prefix: '/api/stream' })

  // Error handler
  app.setErrorHandler(errorHandler)

  // 404 handler
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: 'Not Found', message: 'Route not found' })
  })

  return app
}
