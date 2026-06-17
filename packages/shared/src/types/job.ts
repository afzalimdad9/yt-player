import { VideoQuality, VideoCodec, AudioCodec, AudioQuality } from './video.js'

/** Names for the queues used in the system */
export enum QueueName {
  VIDEO_INGEST = 'video-ingest',
  VIDEO_PROCESS = 'video-process',
  CAPTION_GENERATE = 'caption-generate',
  THUMBNAIL_GENERATE = 'thumbnail-generate',
  MANIFEST_GENERATE = 'manifest-generate',
  CLEANUP = 'cleanup',
}

/** Events emitted during pipeline processing */
export enum PipelineEvent {
  DOWNLOAD_STARTED = 'download:started',
  DOWNLOAD_COMPLETE = 'download:complete',
  DOWNLOAD_FAILED = 'download:failed',
  TRANSCODE_STARTED = 'transcode:started',
  TRANSCODE_PROGRESS = 'transcode:progress',
  TRANSCODE_COMPLETE = 'transcode:complete',
  TRANSCODE_FAILED = 'transcode:failed',
  CAPTION_STARTED = 'caption:started',
  CAPTION_COMPLETE = 'caption:complete',
  CAPTION_FAILED = 'caption:failed',
  CHAPTER_DETECTED = 'chapter:detected',
  THUMBNAIL_STARTED = 'thumbnail:started',
  THUMBNAIL_COMPLETE = 'thumbnail:complete',
  MANIFEST_GENERATED = 'manifest:generated',
  PIPELINE_COMPLETE = 'pipeline:complete',
  PIPELINE_FAILED = 'pipeline:failed',
}

/** Data for the video ingest job */
export interface VideoIngestJobData {
  videoId: string
  url: string
  userId?: string
  /** Whether to use word-level timestamps in captions (default: true) */
  wordTimestamps?: boolean
}

/** Data for the video processing (transcoding) job */
export interface VideoProcessJobData {
  videoId: string
  inputPath: string
  qualities: VideoQuality[]
  codecs: VideoCodec[]
}

/** Data for caption generation job */
export interface CaptionGenerateJobData {
  videoId: string
  audioPath: string
  language: string
  /** Whether to use word-level timestamps in captions (default: true) */
  wordTimestamps?: boolean
}

/** Data for thumbnail generation job */
export interface ThumbnailGenerateJobData {
  videoId: string
  inputPath: string
  interval?: number
}

/** Data for manifest generation job */
export interface ManifestGenerateJobData {
  videoId: string
  hlsOutputDir: string
  dashOutputDir: string
}

/** Generic job result */
export interface JobResult {
  videoId: string
  success: boolean
  error?: string
  data?: Record<string, unknown>
}

/** Progress info for a pipeline step */
export interface PipelineProgress {
  videoId: string
  event: PipelineEvent
  progress: number // 0-100
  message?: string
  data?: Record<string, unknown>
}
