import { PrismaClient } from './generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Singleton Prisma client with proper connection lifecycle.
 * In development, we store on globalThis to survive hot-reloads.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env['DATABASE_URL'] || 'postgresql://ytplayer:ytplayer@localhost:5432/ytplayer',
  })

  return new PrismaClient({
    adapter,
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  })
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient()

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
}

/** Graceful shutdown helper */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect()
}

export * from './generated/prisma/client.js'
