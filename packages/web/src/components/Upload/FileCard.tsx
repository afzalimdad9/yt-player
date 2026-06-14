import { useRef, useState, useCallback } from 'react'
import { Play, Pause, X, Loader2, CheckCircle } from 'lucide-react'
import { StatusBadge, type QueueItemStatus } from './StatusBadge'
import { ProgressBar } from './ProgressBar'

export type { QueueItemStatus }

export interface FileCardItem {
  id: string
  file: File
  title: string
  status: QueueItemStatus
  progress: number
  videoId: string | null
  error: string | null
  previewUrl: string
  /** Upload speed in bytes per second (computed on-the-fly) */
  speed?: number
  /** Estimated time remaining in seconds */
  eta?: number
}

interface FileCardProps {
  item: FileCardItem
  index: number
  overallUploading: boolean
  onRemove: (id: string) => void
  onRetry: (id: string) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function FileCard({ item, index, overallUploading, onRemove, onRetry }: FileCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState<number | null>(null)

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      video.play().catch(() => {})
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }, [])

  const handleMetadataLoaded = useCallback(() => {
    const video = videoRef.current
    if (video && video.duration && isFinite(video.duration)) {
      setDuration(video.duration)
    }
  }, [])

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false)
  }, [])

  return (
    <div
      className={`
        bg-yt-dark rounded-lg border overflow-hidden transition-all duration-300
        ${item.status === 'uploading' ? 'border-blue-800/50 ring-1 ring-blue-800/20' : ''}
        ${item.status === 'failed' ? 'border-red-800/40' : ''}
        ${item.status === 'done' ? 'border-green-800/30' : ''}
        ${item.status === 'cancelled' ? 'border-yellow-800/30 opacity-60' : ''}
        ${item.status === 'pending' ? 'border-yt-gray hover:border-yt-light' : 'border-yt-gray'}
      `}
    >
      <div className="flex gap-3 p-3 items-center">
        {/* Mini video preview with play/pause overlay */}
        <div className="relative w-24 h-14 shrink-0 rounded overflow-hidden bg-yt-black group">
          <video
            ref={videoRef}
            src={item.previewUrl}
            className="w-full h-full object-cover"
            preload="metadata"
            muted
            playsInline
            onLoadedMetadata={handleMetadataLoaded}
            onEnded={handleVideoEnded}
          />

          {/* Play/Pause toggle overlay */}
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white drop-shadow-lg" />
            ) : (
              <Play className="w-5 h-5 text-white drop-shadow-lg" />
            )}
          </button>

          {/* Index badge (top-left) */}
          <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white/70 font-mono">
            {index + 1}
          </div>

          {/* Duration badge (bottom-right) */}
          {duration !== null && (
            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-white/80 font-mono">
              {formatDuration(duration)}
            </div>
          )}
        </div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="text-sm font-medium text-yt-white truncate">
              {item.title}
            </p>
            <StatusBadge status={item.status} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-yt-light/50">
            <span>{formatFileSize(item.file.size)}</span>
            {item.error && (
              <>
                <span className="w-1 h-1 rounded-full bg-red-500/50" />
                <span className="text-red-400/70 truncate">{item.error}</span>
              </>
            )}
            {item.videoId && (
              <>
                <span className="w-1 h-1 rounded-full bg-green-500/50" />
                <span className="text-green-400/60">{item.videoId.slice(0, 8)}</span>
              </>
            )}
          </div>

          {/* Per-item progress bar with speed/ETA (uploading only) */}
          {item.status === 'uploading' && (
            <ProgressBar progress={item.progress} speed={item.speed} eta={item.eta} />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {item.status === 'pending' && !overallUploading && (
            <button
              onClick={() => onRemove(item.id)}
              className="p-1.5 rounded hover:bg-yt-dark text-yt-light hover:text-red-400 transition-colors"
              title="Remove from queue"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {(item.status === 'failed' || item.status === 'cancelled') && !overallUploading && (
            <button
              onClick={() => onRetry(item.id)}
              className="p-1.5 rounded hover:bg-yt-dark text-yt-light hover:text-blue-400 transition-colors"
              title="Retry upload"
            >
              <Loader2 className="w-3.5 h-3.5" />
            </button>
          )}
          {item.status === 'done' && (
            <CheckCircle className="w-4 h-4 text-green-500" />
          )}
        </div>
      </div>
    </div>
  )
}
