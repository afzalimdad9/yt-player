import { useRef, useState, useCallback } from 'react'

interface ProgressBarProps {
  currentTime: number
  duration: number
  buffered: number
  onSeek: (time: number) => void
}

export function ProgressBar({ currentTime, duration, buffered, onSeek }: ProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  const [previewX, setPreviewX] = useState(0)

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const getTimeFromPosition = useCallback((clientX: number) => {
    const bar = barRef.current
    if (!bar || duration <= 0) return 0
    const rect = bar.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    return (x / rect.width) * duration
  }, [duration])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const time = getTimeFromPosition(e.clientX)
    onSeek(time)

    const handleMouseMove = (e: MouseEvent) => {
      const time = getTimeFromPosition(e.clientX)
      onSeek(time)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [getTimeFromPosition, onSeek])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const bar = barRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const time = (x / rect.width) * duration
    setPreviewTime(time || 0)
    setPreviewX(x)
  }, [duration])

  const handleMouseLeave = useCallback(() => {
    setPreviewTime(null)
  }, [])

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '0:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="relative h-5 flex items-center group cursor-pointer -mx-0.5">
      {/* Preview tooltip */}
      {previewTime !== null && duration > 0 && (
        <div
          className="absolute -top-8 transform -translate-x-1/2 bg-black/90 text-yt-white text-xs px-2 py-0.5 rounded pointer-events-none"
          style={{ left: `${previewX}px` }}
        >
          {formatTime(previewTime)}
        </div>
      )}

      {/* Slider bar */}
      <div
        ref={barRef}
        className="relative w-full h-1.5 bg-white/20 rounded-full group-hover:h-2 transition-all duration-150"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Buffered */}
        <div
          className="absolute top-0 left-0 h-full bg-white/30 rounded-full pointer-events-none"
          style={{ width: `${Math.min(buffered, 100)}%` }}
        />

        {/* Progress */}
        <div
          className="absolute top-0 left-0 h-full bg-yt-red rounded-full pointer-events-none transition-all duration-100"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />

        {/* Thumb */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-yt-red rounded-full shadow-md pointer-events-none transition-opacity duration-150 ${
            isDragging ? 'opacity-100 scale-125' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ left: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </div>
  )
}
