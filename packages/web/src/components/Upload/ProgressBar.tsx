interface ProgressBarProps {
  progress: number
  speed?: number
  eta?: number
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatEta(seconds: number): string {
  if (seconds < 0 || !isFinite(seconds)) return '--'
  if (seconds < 5) return 'a few seconds'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (mins < 60) return `${mins}m ${secs}s`
  const hrs = Math.floor(mins / 60)
  const remainMins = mins % 60
  return `${hrs}h ${remainMins}m`
}

export function ProgressBar({ progress, speed, eta }: ProgressBarProps) {
  return (
    <div className="mt-2">
      <div className="w-full h-1.5 bg-yt-black rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      {(speed !== undefined || eta !== undefined) && (
        <div className="flex items-center justify-between mt-1 text-[10px] text-yt-light/50">
          <span>
            {speed !== undefined && formatSpeed(speed)}
          </span>
          <span>
            {eta !== undefined && eta > 0 && `${formatEta(eta)} remaining`}
          </span>
        </div>
      )}
    </div>
  )
}
