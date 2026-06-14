import { useEffect, useState } from 'react'
import { api, VideoResponse, StreamingSession, Chapter } from '../services/api'
import { VideoPlayer } from '../components/VideoPlayer/VideoPlayer'
import { ChapterMarkers } from '../components/VideoPlayer/ChapterMarkers'
import { Loader2, ArrowLeft, Clock, AlertCircle } from 'lucide-react'

interface WatchProps {
  videoId: string
  onBack: () => void
}

export function Watch({ videoId, onBack }: WatchProps) {
  const [video, setVideo] = useState<VideoResponse | null>(null)
  const [session, setSession] = useState<StreamingSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    loadVideo()
  }, [videoId])

  async function loadVideo() {
    try {
      setLoading(true)
      setError(null)

      const [videoRes, sessionRes] = await Promise.all([
        api.getVideo(videoId),
        api.getStreamingSession(videoId).catch(() => null),
      ])

      setVideo(videoRes.data)
      if (sessionRes?.data) {
        setSession(sessionRes.data)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load video'
      setError(message)
      console.error('[Watch] Failed to load video:', err)
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
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-yt-red" />
          <p className="text-yt-light text-sm">Loading video...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="w-12 h-12 text-yt-red" />
          <h2 className="text-xl font-semibold">Error Loading Video</h2>
          <p className="text-yt-light max-w-md">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="px-4 py-2 border border-[#3d3d3d] rounded-full text-sm hover:bg-yt-dark transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={loadVideo}
              className="px-4 py-2 bg-yt-red rounded-full text-sm hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!video) return null

  const isReady = video.status === 'READY'
  const chapters = video.chapters as Chapter[] | undefined

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-yt-light hover:text-white mb-3 transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </button>

      <div className="lg:flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Video Player */}
          <div className="video-container rounded-xl overflow-hidden bg-black">
            <VideoPlayer
              session={session}
              videoTitle={video.title}
              onTimeUpdate={setCurrentTime}
            />
          </div>

          {/* Video Info */}
          <div className="mt-4">
            <h1 className="text-xl font-semibold text-white">{video.title}</h1>

            <div className="flex items-center gap-3 mt-2 text-sm text-yt-light">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{formatDuration(video.duration)}</span>
              </div>
              <span>{formatDate(video.createdAt)}</span>
              <span className="capitalize">{video.status.toLowerCase()}</span>
              {video.renditions && video.renditions.length > 0 && (
                <span>
                  {video.renditions.length} quality levels
                </span>
              )}
            </div>

            {/* Description */}
            {video.description && (
              <div className="mt-3 p-3 bg-yt-dark rounded-lg">
                <p className="text-sm text-yt-light">{video.description}</p>
              </div>
            )}
          </div>

          {/* Chapters */}
          {chapters && chapters.length > 0 && (
            <div className="mt-6">
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                Chapters
                <span className="text-xs text-yt-light font-normal">{chapters.length} chapters</span>
              </h2>
              <ChapterMarkers
                chapters={chapters}
                currentTime={currentTime}
                onSeek={(time) => {
                  // The VideoPlayer handles seeking internally via HLS/DASH
                  // This is a hook point for chapter navigation
                  const videoEl = document.querySelector('video')
                  if (videoEl) videoEl.currentTime = time
                }}
              />
            </div>
          )}
        </div>

        {/* Sidebar - Future: Related videos */}
        <div className="hidden lg:block w-[350px] shrink-0">
          <div className="sticky top-20">
            <h3 className="text-sm font-medium text-yt-light mb-3">Processing Details</h3>

            {/* Quality options */}
            {video.renditions && video.renditions.length > 0 && (
              <div className="space-y-2 mb-4">
                <h4 className="text-xs text-yt-light/60 uppercase tracking-wider">Available Qualities</h4>
                {video.renditions.map((r, i) => (
                  <div key={i} className="flex justify-between text-xs text-yt-light bg-yt-dark p-2 rounded">
                    <span>{r.quality}</span>
                    <span>{r.width}x{r.height} • {(r.bitrate / 1000000).toFixed(1)}Mbps</span>
                  </div>
                ))}
              </div>
            )}

            {/* Track info */}
            {video.tracks && video.tracks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs text-yt-light/60 uppercase tracking-wider">Tracks</h4>
                {video.tracks.map((t, i) => (
                  <div key={i} className="flex justify-between text-xs text-yt-light bg-yt-dark p-2 rounded">
                    <span className="capitalize">{t.type}</span>
                    <span>{t.language}{t.default ? ' (default)' : ''}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Status */}
            <div className="mt-4 p-3 bg-yt-dark rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  video.status === 'READY' ? 'bg-green-500' :
                  video.status === 'FAILED' ? 'bg-red-500' :
                  'bg-yellow-500 animate-pulse'
                }`} />
                <span className="text-xs text-yt-light">Status: {video.status}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
