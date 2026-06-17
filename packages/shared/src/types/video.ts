/** Represents the overall processing state of a video */
export enum VideoStatus {
  PENDING = 'PENDING',
  DOWNLOADING = 'DOWNLOADING',
  DOWNLOADED = 'DOWNLOADED',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}

/** Available streaming qualities */
export enum VideoQuality {
  QUALITY_144P = '144p',
  QUALITY_240P = '240p',
  QUALITY_360P = '360p',
  QUALITY_480P = '480p',
  QUALITY_720P = '720p',
  QUALITY_1080P = '1080p',
  QUALITY_1440P = '1440p',
  QUALITY_2160P = '2160p',
}

/** Audio quality levels */
export enum AudioQuality {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/** Codec support */
export enum VideoCodec {
  H264 = 'h264',
  H265 = 'h265',
  VP9 = 'vp9',
  AV1 = 'av1',
}

/** Audio codec */
export enum AudioCodec {
  AAC = 'aac',
  OPUS = 'opus',
  MP3 = 'mp3',
}

/** Container format */
export enum ContainerFormat {
  MP4 = 'mp4',
  WEBM = 'webm',
}

/** Streaming protocol */
export enum StreamingProtocol {
  HLS = 'hls',
  DASH = 'dash',
}

/** Track types for VTT */
export enum TrackType {
  CAPTIONS = 'captions',
  SUBTITLES = 'subtitles',
  DESCRIPTIONS = 'descriptions',
  CHAPTERS = 'chapters',
  THUMBNAILS = 'thumbnails',
}

/** A single video quality rendition */
export interface VideoRendition {
  quality: VideoQuality
  width: number
  height: number
  bitrate: number
  codec: VideoCodec
  container: ContainerFormat
}

/** Audio rendition */
export interface AudioRendition {
  quality: AudioQuality
  bitrate: number
  codec: AudioCodec
}

/** VTT track metadata */
export interface VttTrack {
  type: TrackType
  language: string
  label: string
  src: string
  default?: boolean
}

/** Thumbnail sprite metadata */
export interface ThumbnailSprite {
  src: string
  vttSrc: string
  tileWidth: number
  tileHeight: number
  columns: number
  rows: number
  totalFrames: number
  interval: number // seconds between each thumbnail frame
}

/** Stream manifest info */
export interface StreamManifest {
  protocol: StreamingProtocol
  url: string
  bandwidth: number
  resolution?: string
  codecs?: string
}

/** Chapter information */
export interface Chapter {
  title: string
  startTime: number
  endTime: number
}

/** Complete video metadata stored in DB */
export interface VideoMetadata {
  id: string
  title: string
  originalUrl: string
  description: string
  duration: number
  width: number
  height: number
  fps: number
  status: VideoStatus
  error?: string
  thumbnailUrl?: string
  thumbnailSprites?: ThumbnailSprite
  renditions: VideoRendition[]
  audioRenditions: AudioRendition[]
  tracks: VttTrack[]
  chapters: Chapter[]
  manifests: StreamManifest[]
  createdAt: string
  updatedAt: string
}
