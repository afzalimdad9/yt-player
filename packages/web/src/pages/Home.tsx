import { useEffect, useState } from 'react'
import { api, VideoResponse } from '../services/api'
import { Clock, AlertCircle, Loader2 } from 'lucide-react'

interface HomeProps {
  onVideoClick: (videoId: string) => void
}

export function Home({ onVideoClick }: HomeProps) {
  const [videos, setVideos] = useState<VideoResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadVideos()
  }, [])

  async function loadVideos() {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getVideos()
      setVideos(response.data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load videos'
      setError(message)
      console.error('[Home] Failed to load videos:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      READY: 'bg-green-600',
      PROCESSING: 'bg-yellow-600',
      DOWNLOADING: 'bg-blue-600',
      FAILED: 'bg-red-600',
      PENDING: 'bg-gray-600',
    }
    return (
      <span className={`text-xs px-2 py-0.5 rounded ${colors[status] || 'bg-gray-600'} text-white`}>
        {status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-yt-red" />
          <p className="text-yt-light text-sm">Loading videos...</p>
        </div>
      </div>
    )
  }

  if (error && videos.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="w-12 h-12 text-yt-red" />
          <h2 className="text-xl font-semibold">Connection Error</h2>
          <p className="text-yt-light max-w-md">
            Could not connect to the backend. Make sure the API server is running with Docker Compose.
          </p>
          <button
            onClick={loadVideos}
            className="mt-2 px-4 py-2 bg-yt-red rounded-full text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-center">
          <Clock className="w-12 h-12 text-yt-light" />
          <h2 className="text-xl font-semibold">No Videos Yet</h2>
          <p className="text-yt-light max-w-md">
            Submit a video URL to get started. Your processed videos will appear here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {videos.map((video) => (
          <div
            key={video.id}
            onClick={() => onVideoClick(video.id)}
            className="yt-card group cursor-pointer"
          >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-yt-dark overflow-hidden">
              {video.thumbnailUrl ? (
                <img
                  src={video.thumbnailUrl}
                  alt={video.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Clock className="w-12 h-12 text-yt-light" />
                </div>
              )}
              {/* Duration overlay */}
              {video.duration > 0 && (
                <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 rounded">
                  {formatDuration(video.duration)}
                </span>
              )}
              {/* Status overlay */}
              {video.status !== 'READY' && video.status !== 'FAILED' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-1">
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                    <span className="text-white text-xs">{video.status}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-3">
              <h3 className="text-sm font-medium text-white line-clamp-2 mb-1">
                {video.title}
              </h3>
              <div className="flex items-center gap-2 text-xs text-yt-light">
                <span>{formatDate(video.createdAt)}</span>
                {statusBadge(video.status)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
