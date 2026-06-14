import { Chapter } from '../../services/api'

interface ChapterMarkersProps {
  chapters: Chapter[]
  currentTime: number
  onSeek: (time: number) => void
}

export function ChapterMarkers({ chapters, currentTime, onSeek }: ChapterMarkersProps) {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const getActiveChapter = () => {
    return chapters.findIndex(
      (ch) => currentTime >= ch.startTime && currentTime < ch.endTime
    )
  }

  const activeIndex = getActiveChapter()

  return (
    <div className="space-y-1">
      {chapters.map((chapter, i) => {
        const isActive = i === activeIndex
        return (
          <button
            key={i}
            onClick={() => onSeek(chapter.startTime)}
            className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
              isActive
                ? 'bg-yt-red/10 text-yt-red'
                : 'hover:bg-yt-dark text-yt-light hover:text-white'
            }`}
          >
            {/* Timeline indicator */}
            <div className="relative flex items-center">
              <div className={`w-2 h-2 rounded-full ${
                isActive ? 'bg-yt-red' : 'bg-[#3d3d3d]'
              }`} />
              {/* Connector line */}
              {i < chapters.length - 1 && (
                <div className={`absolute top-3 left-1 w-0.5 h-6 -translate-x-1/2 ${
                  i < activeIndex ? 'bg-yt-red/50' : 'bg-[#3d3d3d]'
                }`} />
              )}
            </div>

            {/* Chapter info */}
            <div className="flex-1 min-w-0">
              <span className={`text-sm truncate block ${isActive ? 'font-medium' : ''}`}>
                {chapter.title}
              </span>
            </div>

            {/* Timestamp */}
            <span className={`text-xs shrink-0 ${isActive ? 'text-yt-red' : 'text-yt-light/60'}`}>
              {formatTime(chapter.startTime)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
