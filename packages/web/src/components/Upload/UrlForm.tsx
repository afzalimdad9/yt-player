import { Link, CirclePlay, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface UrlFormProps {
  url: string
  title: string
  wordTimestamps: boolean
  overallStatus: 'idle' | 'uploading' | 'done'
  error: string | null
  success: string | null
  onUrlChange: (url: string) => void
  onTitleChange: (title: string) => void
  onWordTimestampsChange: (value: boolean) => void
  onSubmit: (e: React.FormEvent) => void
}

export function UrlForm({
  url,
  title,
  wordTimestamps,
  overallStatus,
  error,
  success,
  onUrlChange,
  onTitleChange,
  onWordTimestampsChange,
  onSubmit,
}: UrlFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium text-yt-light flex items-center gap-2">
          <Link className="w-4 h-4" />
          Video URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full bg-yt-dark border border-yt-gray rounded-lg px-4 py-3 text-yt-white text-sm focus:outline-none placeholder:text-yt-light/50 transition-colors"
          disabled={overallStatus === 'uploading'}
        />
        <p className="text-xs text-yt-light/60">
          Supports YouTube, Twitter/X, TikTok, and other video platforms
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-yt-light">
          Title <span className="text-yt-light/50">(optional)</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="My Awesome Video"
          className="w-full bg-yt-dark border border-yt-gray rounded-lg px-4 py-3 text-yt-white text-sm focus:outline-none placeholder:text-yt-light/50 transition-colors"
          disabled={overallStatus === 'uploading'}
        />
      </div>

      {error && overallStatus !== 'uploading' && (
        <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-800 rounded-lg animate-fade-in">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {overallStatus === 'uploading' && (
        <div className="flex items-center gap-2 p-3 bg-blue-900/30 border border-blue-800 rounded-lg animate-fade-in">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400 shrink-0" />
          <p className="text-sm text-blue-300">Queuing video for processing...</p>
        </div>
      )}

      {success && overallStatus === 'done' && (
        <div className="flex items-center gap-2 p-3 bg-green-900/30 border border-green-800 rounded-lg animate-fade-in">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
          <p className="text-sm text-green-300">{success}</p>
        </div>
      )}

      {/* Caption options */}
      <div className="flex items-center justify-between p-3 bg-yt-dark rounded-lg border border-yt-gray">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-yt-light/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-yt-white">Word-Level Captions</p>
            <p className="text-[11px] text-yt-light/50">More precise timing, slightly larger subtitle files</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onWordTimestampsChange(!wordTimestamps)}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
            wordTimestamps ? 'bg-blue-600' : 'bg-[#3d3d3d]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
              wordTimestamps ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <button
        type="submit"
        disabled={overallStatus === 'uploading'}
        className="w-full flex items-center justify-center gap-2 bg-yt-red hover:bg-red-700 disabled:bg-red-900 disabled:cursor-not-allowed text-white font-medium rounded-lg px-6 py-3 transition-colors"
      >
        {overallStatus === 'uploading' ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Queuing...</>
        ) : (
          <><CirclePlay className="w-5 h-5" /> Process Video URL</>
        )}
      </button>
    </form>
  )
}
