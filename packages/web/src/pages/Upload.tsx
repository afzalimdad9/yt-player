import { useState, useRef, useCallback, DragEvent } from 'react'
import { api } from '../services/api'
import {
  Upload as UploadIcon,
  Link,
  Loader2,
  CheckCircle,
  AlertCircle,
  Youtube,
  FileVideo,
  X,
  Trash2,
} from 'lucide-react'

interface UploadProps {
  onVideoUploaded: (videoId: string) => void
}

type UploadMethod = 'url' | 'file'
type UploadState = 'idle' | 'uploading' | 'success' | 'error'

const ACCEPTED_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
]

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB

export function Upload({ onVideoUploaded }: UploadProps) {
  const [method, setMethod] = useState<UploadMethod>('url')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ===== Drag & Drop handlers =====
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    setMethod('file')

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      validateAndSetFile(droppedFile)
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      validateAndSetFile(selectedFile)
    }
  }, [])

  const validateAndSetFile = (file: File) => {
    setError(null)
    setState('idle')

    // Check file type
    const isVideo = ACCEPTED_TYPES.includes(file.type) || file.name.match(/\.(mp4|webm|ogg|mov|avi|mkv)$/i)
    if (!isVideo) {
      setError(`Unsupported file type: ${file.type || 'unknown'}. Accepted: MP4, WebM, OGG, MOV, AVI, MKV`)
      return
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      setError(`File is too large (${(file.size / (1024 * 1024 * 1024)).toFixed(1)}GB). Maximum is 5GB.`)
      return
    }

    setFile(file)
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''))
    }
  }

  const clearFile = useCallback(() => {
    setFile(null)
    setError(null)
    setState('idle')
    setProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // ===== Format file size =====
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  // ===== Submit handlers =====
  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) {
      setError('Please enter a video URL')
      return
    }

    try {
      new URL(url)
    } catch {
      setError('Please enter a valid URL')
      return
    }

    try {
      setState('uploading')
      setProgress(50)
      setError(null)
      const result = await api.submitVideo(url, title || undefined)
      setProgress(100)
      setVideoId(result.videoId)
      setState('success')
      setSuccess(`Video submitted! ID: ${result.videoId.slice(0, 8)}...`)

      setTimeout(() => onVideoUploaded(result.videoId), 1500)
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Failed to submit video')
    }
  }

  const handleFileSubmit = async () => {
    if (!file) return

    try {
      setState('uploading')
      setProgress(0)
      setError(null)

      const result = await api.uploadVideo(file, (percent) => {
        setProgress(percent)
      })

      setProgress(100)
      setVideoId(result.videoId)
      setState('success')
      setSuccess(`Upload complete! ${file.name}`)

      setTimeout(() => onVideoUploaded(result.videoId), 1500)
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  // ===== Render =====
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Youtube className="w-8 h-8 text-yt-red" />
        <div>
          <h1 className="text-2xl font-semibold">Upload Video</h1>
          <p className="text-sm text-yt-light mt-0.5">Submit a URL or drag-and-drop a video file</p>
        </div>
      </div>

      {/* Method Tabs */}
      <div className="flex gap-1 mb-6 bg-yt-dark rounded-lg p-1 border border-[#3d3d3d]">
        <button
          onClick={() => { setMethod('url'); setError(null); setState('idle') }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
            method === 'url'
              ? 'bg-yt-gray text-white shadow'
              : 'text-yt-light hover:text-white hover:bg-white/5'
          }`}
        >
          <Link className="w-4 h-4" />
          URL
        </button>
        <button
          onClick={() => { setMethod('file'); setError(null); setState('idle') }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
            method === 'file'
              ? 'bg-yt-gray text-white shadow'
              : 'text-yt-light hover:text-white hover:bg-white/5'
          }`}
        >
          <UploadIcon className="w-4 h-4" />
          File Upload
        </button>
      </div>

      {/* ===== URL Input Method ===== */}
      {method === 'url' && (
        <form onSubmit={handleUrlSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-yt-light flex items-center gap-2">
              <Link className="w-4 h-4" />
              Video URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-yt-dark border border-[#3d3d3d] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-yt-light/50 transition-colors"
              disabled={state === 'uploading'}
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
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Awesome Video"
              className="w-full bg-yt-dark border border-[#3d3d3d] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-yt-light/50 transition-colors"
              disabled={state === 'uploading'}
            />
          </div>

          {error && state === 'error' && (
            <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-800 rounded-lg animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {state === 'uploading' && (
            <div className="flex items-center gap-2 p-3 bg-blue-900/30 border border-blue-800 rounded-lg animate-fade-in">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400 shrink-0" />
              <p className="text-sm text-blue-300">Queuing video for processing...</p>
            </div>
          )}

          {state === 'success' && success && (
            <div className="flex items-center gap-2 p-3 bg-green-900/30 border border-green-800 rounded-lg animate-fade-in">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              <p className="text-sm text-green-300">{success}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={state === 'uploading'}
            className="w-full flex items-center justify-center gap-2 bg-yt-red hover:bg-red-700 disabled:bg-red-900 disabled:cursor-not-allowed text-white font-medium rounded-lg px-6 py-3 transition-colors"
          >
            {state === 'uploading' ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Queuing...</>
            ) : (
              <><Youtube className="w-5 h-5" /> Process Video URL</>
            )}
          </button>
        </form>
      )}

      {/* ===== File Upload Method ===== */}
      {method === 'file' && (
        <div className="space-y-6">
          {/* Drop Zone */}
          {!file ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
                transition-all duration-200 group
                ${isDragOver
                  ? 'border-yt-red bg-yt-red/5 scale-[1.02]'
                  : 'border-[#3d3d3d] hover:border-yt-red/50 hover:bg-yt-dark/50'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.webm,.ogg,.mov,.avi,.mkv"
                onChange={handleFileSelect}
                className="hidden"
              />

              <div className={`flex flex-col items-center gap-3 transition-transform duration-200 ${isDragOver ? 'scale-110' : ''}`}>
                <div className={`p-4 rounded-full transition-colors ${
                  isDragOver ? 'bg-yt-red/20 text-yt-red' : 'bg-yt-dark text-yt-light group-hover:text-yt-red'
                }`}>
                  {isDragOver ? (
                    <UploadIcon className="w-10 h-10" />
                  ) : (
                    <FileVideo className="w-10 h-10" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">
                    {isDragOver ? 'Drop your video here' : 'Drag & drop your video here'}
                  </p>
                  <p className="text-xs text-yt-light/60 mt-1">
                    or click to browse files
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-1">
                  {['MP4', 'WebM', 'MOV', 'AVI', 'MKV'].map(fmt => (
                    <span key={fmt} className="text-[10px] px-2 py-0.5 rounded bg-yt-dark border border-[#3d3d3d] text-yt-light/60">
                      {fmt}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-yt-light/40 mt-1">Maximum file size: 5GB</p>
              </div>

              {/* Ripple effect on drag */}
              {isDragOver && (
                <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 border-2 border-yt-red/30 rounded-xl animate-pulse-slow" />
                  <div className="absolute inset-4 border border-yt-red/20 rounded-lg" />
                </div>
              )}
            </div>
          ) : (
            /* File Selected Card */
            <div className="bg-yt-dark rounded-xl border border-[#3d3d3d] p-5 animate-fade-in">
              <div className="flex items-start gap-4">
                {/* File icon */}
                <div className="p-3 bg-yt-gray rounded-lg shrink-0">
                  <FileVideo className="w-8 h-8 text-yt-red" />
                </div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{file.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-yt-light">
                    <span>{formatFileSize(file.size)}</span>
                    <span className="w-1 h-1 rounded-full bg-yt-light/30" />
                    <span>{file.type || 'unknown format'}</span>
                  </div>
                </div>

                {/* Remove button */}
                <button
                  onClick={clearFile}
                  disabled={state === 'uploading'}
                  className="p-2 rounded-full hover:bg-white/10 text-yt-light hover:text-white transition-colors disabled:opacity-50"
                  title="Remove file"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Title input */}
              <div className="mt-4">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Video title"
                  className="w-full bg-yt-black border border-[#3d3d3d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-yt-light/50 transition-colors"
                  disabled={state === 'uploading'}
                />
              </div>
            </div>
          )}

          {/* Progress bar */}
          {state === 'uploading' && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="text-yt-light flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-yt-red" />
                  Uploading...
                </span>
                <span className="text-yt-light">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-yt-dark rounded-full overflow-hidden">
                <div
                  className="h-full bg-yt-red rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && state === 'error' && (
            <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-800 rounded-lg animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-300">{error}</p>
                <button
                  onClick={clearFile}
                  className="text-xs text-red-400 hover:text-red-300 mt-1 underline"
                >
                  Try a different file
                </button>
              </div>
            </div>
          )}

          {/* Success message */}
          {state === 'success' && success && (
            <div className="flex items-center gap-2 p-3 bg-green-900/30 border border-green-800 rounded-lg animate-fade-in">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              <div>
                <p className="text-sm text-green-300">{success}</p>
                <p className="text-xs text-green-400/70 mt-0.5">Redirecting to player...</p>
              </div>
            </div>
          )}

          {/* Submit / Change file buttons */}
          {file && (
            <div className="flex gap-3">
              {state !== 'uploading' && state !== 'success' && (
                <>
                  <button
                    onClick={clearFile}
                    className="flex-1 flex items-center justify-center gap-2 border border-[#3d3d3d] hover:bg-yt-dark text-white font-medium rounded-lg px-6 py-3 transition-colors text-sm"
                  >
                    <X className="w-4 h-4" />
                    Change File
                  </button>
                  <button
                    onClick={handleFileSubmit}
                    className="flex-[2] flex items-center justify-center gap-2 bg-yt-red hover:bg-red-700 text-white font-medium rounded-lg px-6 py-3 transition-colors text-sm"
                  >
                    <UploadIcon className="w-4 h-4" />
                    Upload & Process
                  </button>
                </>
              )}
              {state === 'uploading' && (
                <div className="w-full flex items-center justify-center gap-2 bg-yt-dark text-yt-light font-medium rounded-lg px-6 py-3 text-sm border border-[#3d3d3d]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading to server...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pipeline info (shared) */}
      <div className="mt-10 p-4 bg-yt-dark rounded-lg border border-[#3d3d3d]">
        <h3 className="text-sm font-medium text-yt-light mb-3">Processing Pipeline</h3>
        <div className="space-y-2 text-xs text-yt-light/70">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>Download video from URL (or use uploaded file)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Transcode to multiple quality levels (HLS + DASH)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
            <span>Generate captions, subtitles, and descriptions (AI)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span>Detect chapters and scenes</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-pink-500" />
            <span>Generate thumbnail sprites with VTT</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            <span>Upload to S3/MinIO storage</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
            <span>Ready for streaming!</span>
          </div>
        </div>
      </div>
    </div>
  )
}
