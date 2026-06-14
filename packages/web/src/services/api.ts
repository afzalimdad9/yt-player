const API_BASE = import.meta.env.VITE_API_URL || ''

export interface VideoResponse {
  id: string
  title: string
  originalUrl: string
  description: string
  duration: number
  width: number
  height: number
  status: string
  thumbnailUrl: string | null
  thumbnailSprites: ThumbnailSprite[]
  renditions: Rendition[]
  tracks: Track[]
  chapters: Chapter[]
  manifests: Manifest[]
  createdAt: string
  updatedAt: string
}

export interface ThumbnailSprite {
  id: string
  src: string
  vttSrc: string
  tileWidth: number
  tileHeight: number
  columns: number
  rows: number
  totalFrames: number
  interval: number
}

export interface Rendition {
  quality: string
  width: number
  height: number
  bitrate: number
  codec: string
}

export interface Track {
  type: 'captions' | 'subtitles' | 'descriptions' | 'chapters'
  language: string
  label: string
  src: string
  default: boolean
}

export interface Chapter {
  title: string
  startTime: number
  endTime: number
}

export interface Manifest {
  protocol: 'hls' | 'dash'
  url: string
  bandwidth: number
  resolution: string | null
}

export interface StreamingSession {
  videoId: string
  hlsManifest?: string
  dashManifest?: string
  tracks: Track[]
  thumbnails?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

class ApiService {
  private baseUrl: string

  constructor() {
    this.baseUrl = `${API_BASE}/api`
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }))
      throw new Error(error.message || `HTTP ${response.status}`)
    }

    return response.json()
  }

  /** Submit a video URL for processing */
  async submitVideo(url: string, title?: string) {
    return this.request<{ success: boolean; videoId: string; status: string }>(
      '/videos',
      {
        method: 'POST',
        body: JSON.stringify({ url, title }),
      }
    )
  }

  /** Get list of all videos */
  async getVideos(page = 1, limit = 20) {
    return this.request<PaginatedResponse<VideoResponse>>(
      `/videos?page=${page}&limit=${limit}`
    )
  }

  /** Get a single video by ID */
  async getVideo(id: string) {
    return this.request<{ data: VideoResponse }>(`/videos/${id}`)
  }

  /** Get video processing status */
  async getVideoStatus(id: string) {
    return this.request<{ data: { id: string; status: string; error?: string } }>(
      `/videos/${id}/status`
    )
  }

  /** Get streaming session for a video */
  async getStreamingSession(id: string) {
    return this.request<{ data: StreamingSession }>(`/stream/${id}`)
  }

  /** Upload a video file directly */
  async uploadVideo(file: File, onProgress?: (percent: number) => void) {
    return new Promise<{ success: boolean; videoId: string; status: string }>((resolve, reject) => {
      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${this.baseUrl}/videos/upload`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            reject(new Error(error.message || `Upload failed (HTTP ${xhr.status})`))
          } catch {
            reject(new Error(`Upload failed (HTTP ${xhr.status})`))
          }
        }
      }

      xhr.onerror = () => reject(new Error('Network error during upload'))
      xhr.send(formData)
    })
  }

  /** Delete a video */
  async deleteVideo(id: string) {
    return this.request<{ success: boolean }>(`/videos/${id}`, { method: 'DELETE' })
  }

  /** Get API health */
  async getHealth() {
    return this.request<{ status: string; checks: Record<string, string> }>('/health')
  }
}

export const api = new ApiService()
