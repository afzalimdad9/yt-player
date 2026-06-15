import { Queue, QueueOptions, Worker, WorkerOptions, Job } from 'bullmq'
import type { RedisOptions } from 'ioredis'
import { QueueName } from '@yt-player/shared'
import { getConnectionOptions } from './connection.js'

function defaultQueueOptions(): QueueOptions {
  return {
    connection: getConnectionOptions() as unknown as RedisOptions,
    defaultJobOptions: {
      attempts: 1,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 3600 * 24,
        count: 100,
      },
      removeOnFail: {
        age: 3600 * 24 * 7,
        count: 500,
      },
    },
  }
}

function defaultWorkerOptions(): WorkerOptions {
  return {
    connection: getConnectionOptions() as unknown as RedisOptions,
    concurrency: 3,
    lockDuration: 600_000, // 10 minutes - video processing is long-running
    stalledInterval: 300_000, // 5 minutes - check for stalled jobs less frequently
    lockRenewTime: 150_000, // renew lock every 2.5 minutes
    limiter: {
      max: 5,
      duration: 1000,
    },
  }
}

/** Create all queues used in the system */
export function createQueues(): Record<QueueName, Queue> {
  return {
    [QueueName.VIDEO_INGEST]: new Queue(QueueName.VIDEO_INGEST, defaultQueueOptions()),
    [QueueName.VIDEO_PROCESS]: new Queue(QueueName.VIDEO_PROCESS, defaultQueueOptions()),
    [QueueName.CAPTION_GENERATE]: new Queue(QueueName.CAPTION_GENERATE, defaultQueueOptions()),
    [QueueName.THUMBNAIL_GENERATE]: new Queue(QueueName.THUMBNAIL_GENERATE, defaultQueueOptions()),
    [QueueName.MANIFEST_GENERATE]: new Queue(QueueName.MANIFEST_GENERATE, defaultQueueOptions()),
    [QueueName.CLEANUP]: new Queue(QueueName.CLEANUP, defaultQueueOptions()),
  }
}

/**
 * Create a typed worker for a queue.
 * Caller provides the processor function.
 */
export function createWorker<T = unknown, R = unknown>(
  queueName: QueueName,
  processor: (job: Job<T, R>) => Promise<R>,
  opts?: Partial<WorkerOptions>
): Worker<T, R> {
  return new Worker<T, R>(queueName, processor, {
    ...defaultWorkerOptions(),
    ...opts,
  })
}

export { QueueName }
