import { PrismaClient } from '@prisma/client'

/**
 * Singleton Prisma client with proper connection lifecycle.
 * In development, we store on globalThis to survive hot-reloads.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

/** Graceful shutdown helper */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect()
}

export * from '@prisma/client'
