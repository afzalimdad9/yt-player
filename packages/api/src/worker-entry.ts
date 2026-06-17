/**
 * Standalone worker process entry point.
 * Run separately from the API server for production deployments.
 * Usage: npx tsx src/worker-entry.ts
 */
import { disconnectPrisma } from '@yt-player/database'
import { closeConnection } from '@yt-player/queue'
import { startWorkers } from './workers.js'

console.log('[Worker] Starting worker process...')

const workers = startWorkers()

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`[Worker] Received ${signal}, shutting down...`)

  await Promise.all(workers.map(w => w.close()))

  await disconnectPrisma()
  await closeConnection()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
  console.error('[Worker] Unhandled rejection:', error)
})
