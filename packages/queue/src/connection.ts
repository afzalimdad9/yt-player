import Redis, { RedisOptions } from 'ioredis'

export interface RedisConfig {
  host: string
  port: number
  password?: string
  db?: number
}

export function getDefaultRedisConfig(): RedisConfig {
  return {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
    password: process.env['REDIS_PASSWORD'],
    db: 0,
  }
}

/**
 * Get connection options object suitable for BullMQ's ConnectionOptions.
 * This avoids direct Redis instance type conflicts between BullMQ and ioredis versions.
 */
export function getConnectionOptions(config?: Partial<RedisConfig>): RedisOptions {
  const resolved: RedisConfig = { ...getDefaultRedisConfig(), ...config }
  return {
    host: resolved.host,
    port: resolved.port,
    password: resolved.password || undefined,
    db: resolved.db,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      if (times > 10) return null
      return Math.min(times * 100, 3000)
    },
  }
}

let connection: Redis | null = null

/**
 * Get or create the shared Redis instance for standalone operations (not BullMQ).
 * For BullMQ, use getConnectionOptions() instead.
 */
export function getConnection(config?: Partial<RedisConfig>): Redis {
  if (connection) return connection
  connection = new Redis(getConnectionOptions(config))
  return connection
}

export async function closeConnection(): Promise<void> {
  if (connection) {
    await connection.quit()
    connection = null
  }
}
