/** HLS master playlist info */
export interface HlsMasterPlaylist {
  version: number
  independentSegments: boolean
  variants: HlsVariant[]
  audioGroups: HlsAudioGroup[]
  subtitlesGroups: HlsSubtitleGroup[]
}

export interface HlsVariant {
  bandwidth: number
  resolution?: string
  codecs?: string
  audio?: string
  subtitles?: string
  uri: string
  frameRate?: number
}

export interface HlsAudioGroup {
  groupId: string
  name: string
  default: boolean
  autoselect: boolean
  language: string
  uri: string
}

export interface HlsSubtitleGroup {
  groupId: string
  name: string
  default: boolean
  autoselect: boolean
  forced: boolean
  language: string
  uri: string
}

/** DASH MPD manifest info */
export interface DashManifest {
  profiles: string
  minBufferTime: string
  mediaPresentationDuration: string
  periods: DashPeriod[]
}

export interface DashPeriod {
  id: string
  duration: string
  adaptationSets: DashAdaptationSet[]
}

export interface DashAdaptationSet {
  mimeType: string
  codecs: string
  contentType: 'video' | 'audio' | 'text'
  representations: DashRepresentation[]
  /** For subtitles */
  lang?: string
}

export interface DashRepresentation {
  id: string
  bandwidth: number
  width?: number
  height?: number
  frameRate?: string
  segmentTemplate: string
  initSegment: string
  mediaSegments: string
  codecs?: string
}

/** URL to a stream segment */
export interface StreamSegment {
  url: string
  duration: number
  sequence: number
}

/** Streaming session info returned to the client */
export interface StreamingSession {
  videoId: string
  hlsManifest?: string
  dashManifest?: string
  tracks: StreamTrack[]
  thumbnails?: string
}

export interface StreamTrack {
  type: 'captions' | 'subtitles' | 'descriptions' | 'chapters'
  language: string
  label: string
  src: string
  default?: boolean
}
