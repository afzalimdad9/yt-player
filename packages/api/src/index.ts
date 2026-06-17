import { buildApp } from './app.js'
import { prisma, disconnectPrisma } from '@yt-player/database'
import { closeConnection } from '@yt-player/queue'

const PORT = parseInt(process.env['API_PORT'] || '4000', 10)
const HOST = process.env['API_HOST'] || '0.0.0.0'

async function main() {
  const app = await buildApp()

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[API] Received ${signal}, shutting down...`)
    await app.close()
    await disconnectPrisma()
    await closeConnection()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  try {
    await app.listen({ port: PORT, host: HOST })
    console.log(`[API] Server running at http://${HOST}:${PORT}`)
  } catch (err) {
    console.error('[API] Failed to start:', err)
    await disconnectPrisma()
    await closeConnection()
    process.exit(1)
  }
}

main()
