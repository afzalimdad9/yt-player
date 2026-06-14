import { useState, useRef, useCallback, useEffect, DragEvent } from 'react'
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
  Square,
  Play,
} from 'lucide-react'

interface UploadProps {
  onVideoUploaded: (videoId: string) => void
}

type UploadMethod = 'url' | 'file'
type QueueItemStatus = 'pending' | 'uploading' | 'done' | 'failed' | 'cancelled'

interface QueueItem {
  id: string
  file: File
  title: string
  status: QueueItemStatus
  progress: number
  videoId: string | null
  error: string | null
  previewUrl: string
}

type OverallStatus = 'idle' | 'uploading' | 'done'

const ACCEPTED_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
]

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB

let itemIdCounter = 0
function nextId(): string {
  return `upload-${++itemIdCounter}`
}

export function Upload({ onVideoUploaded }: UploadProps) {
  const [method, setMethod] = useState<UploadMethod>('url')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [overallStatus, setOverallStatus] = useState<OverallStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [wordTimestamps, setWordTimestamps] = useState(true)
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const currentItemRef = useRef<string | null>(null)

  // Track whether component is mounted for safe async updates
  const mountedRef = useRef(true)
  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  // Ref to track cancel state across stale closures
  const cancelledRef = useRef(false)

  // Ref to accumulate all preview URLs for cleanup on unmount
  const previewUrlsRef = useRef<Set<string>>(new Set())

  // ===== Helpers =====
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item))
  }, [])

  // ===== File validation =====
  const validateFile = useCallback((file: File): string | null => {
    const isVideo = ACCEPTED_TYPES.includes(file.type) || !!file.name.match(/\.(mp4|webm|ogg|mov|avi|mkv)$/i)
    if (!isVideo) {
      return `Unsupported file type: ${file.type || 'unknown'}. Accepted: MP4, WebM, OGG, MOV, AVI, MKV`
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File is too large (${(file.size / (1024 * 1024 * 1024)).toFixed(1)}GB). Maximum is 5GB.`
    }
    return null
  }, [])

  // ===== Add files to queue =====
  const addFilesToQueue = useCallback((files: FileList | File[]) => {
    setError(null)
    setOverallStatus('idle')
    const validErrors: string[] = []
    const preExistingTitles = new Set(queue.map(q => q.title))

    const newItems: QueueItem[] = Array.from(files)
      .filter(f => {
        const err = validateFile(f)
        if (err) {
          validErrors.push(`${f.name}: ${err}`)
          return false
        }
        return true
      })
      .map(f => {
        let autoTitle = f.name.replace(/\.[^/.]+$/, '')
        if (preExistingTitles.has(autoTitle)) {
          let counter = 2
          while (preExistingTitles.has(`${autoTitle} (${counter})`)) counter++
          autoTitle = `${autoTitle} (${counter})`
        }
        preExistingTitles.add(autoTitle)

        const previewUrl = URL.createObjectURL(f)
        previewUrlsRef.current.add(previewUrl)

        return {
          id: nextId(),
          file: f,
          title: autoTitle,
          status: 'pending' as QueueItemStatus,
          progress: 0,
          videoId: null,
          error: null,
          previewUrl,
        }
      })

    if (newItems.length === 0 && validErrors.length > 0) {
      setError(validErrors.join('\n'))
    }

    if (newItems.length > 0) {
      setQueue(prev => [...prev, ...newItems])
    }
  }, [queue, validateFile])

  // ===== Clean up object URLs when queue changes =====
  const prevQueueRef = useRef<QueueItem[]>([])
  useEffect(() => {
    const prev = prevQueueRef.current
    const current = queue
    // Revoke URLs for items that were removed
    for (const prevItem of prev) {
      if (!current.find(c => c.id === prevItem.id)) {
        URL.revokeObjectURL(prevItem.previewUrl)
      }
    }
    prevQueueRef.current = current
  }, [queue])

  // Clean up all remaining object URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) {
        URL.revokeObjectURL(url)
      }
      previewUrlsRef.current.clear()
    }
  }, [])

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
    if (e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files)
    }
  }, [addFilesToQueue])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(e.target.files)
    }
    // Reset so the same file can be re-selected
    e.target.value = ''
  }, [addFilesToQueue])

  // ===== Remove a single item =====
  const removeItem = useCallback((id: string) => {
    setQueue(prev => {
      const item = prev.find(i => i.id === id)
      if (item) {
        previewUrlsRef.current.delete(item.previewUrl)
        URL.revokeObjectURL(item.previewUrl)
      }
      return prev.filter(i => i.id !== id)
    })
  }, [])

  // ===== Remove all items =====
  const clearQueue = useCallback(() => {
    for (const url of previewUrlsRef.current) {
      URL.revokeObjectURL(url)
    }
    previewUrlsRef.current.clear()
    setQueue([])
    setError(null)
    setOverallStatus('idle')
    setSuccess(null)
  }, [])

  // ===== Retry a single failed/cancelled item =====
  const retryItem = useCallback((id: string) => {
    updateItem(id, { status: 'pending', progress: 0, error: null, videoId: null })
  }, [updateItem])

  // ===== Sequential upload =====
  const startUploads = useCallback(async () => {
    const pending = queue.filter(q => q.status === 'pending')
    if (pending.length === 0) return

    cancelledRef.current = false
    setOverallStatus('uploading')
    setError(null)

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i]!
      if (!mountedRef.current || cancelledRef.current) break

      updateItem(item.id, { status: 'uploading', progress: 0, error: null })
      currentItemRef.current = item.id

      try {
        const { promise, abort } = api.uploadVideo(item.file, (percent) => {
          if (mountedRef.current) {
            updateItem(item.id, { progress: percent })
          }
        }, wordTimestamps)
        abortRef.current = abort

        const result = await promise
        abortRef.current = null
        currentItemRef.current = null

        if (!mountedRef.current || cancelledRef.current) break

        updateItem(item.id, { status: 'done', progress: 100, videoId: result.videoId })

        // Navigate to the last successfully uploaded video
        if (i === pending.length - 1) {
          setSuccess(`All ${pending.length} video${pending.length > 1 ? 's' : ''} uploaded!`)
          setOverallStatus('done')
          setTimeout(() => onVideoUploaded(result.videoId), 1500)
        }
      } catch (err) {
        abortRef.current = null
        currentItemRef.current = null

        if (!mountedRef.current || cancelledRef.current) break

        const isAbort = err instanceof DOMException && err.name === 'AbortError'
        updateItem(item.id, {
          status: isAbort ? 'cancelled' : 'failed',
          error: isAbort ? 'Cancelled' : (err instanceof Error ? err.message : 'Upload failed'),
        })

        if (isAbort) {
          // cancelledRef.current is true — the abort was intentional
          setOverallStatus('idle')
          break
        }

        // Failed but not cancelled — continue to next item
        const anyPending = queue.some(
          q => q.status === 'pending' && mountedRef.current
        )
        if (!anyPending) {
          setOverallStatus('done')
          setSuccess('Some uploads failed')
        }
      }
    }
  }, [queue, updateItem, onVideoUploaded])

  // ===== Cancel all / abort current =====
  const cancelAll = useCallback(() => {
    cancelledRef.current = true
    if (abortRef.current) {
      abortRef.current()
      abortRef.current = null
    }
    // Mark remaining pending/uploading as cancelled
    setQueue(prev => prev.map(q =>
      q.status === 'pending' || q.status === 'uploading'
        ? { ...q, status: 'cancelled' as QueueItemStatus, error: 'Cancelled' }
        : q
    ))
    setOverallStatus('idle')
  }, [])

  // ===== URL submit =====
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
      setOverallStatus('uploading')
      setError(null)
      const result = await api.submitVideo(url, title || undefined, wordTimestamps)
      setOverallStatus('done')
      setSuccess(`Video submitted! ID: ${result.videoId.slice(0, 8)}...`)
      setTimeout(() => onVideoUploaded(result.videoId), 1500)
    } catch (err) {
      setOverallStatus('idle')
      setError(err instanceof Error ? err.message : 'Failed to submit video')
    }
  }

  // ===== Status badge helper =====
  const StatusBadge = ({ status }: { status: QueueItemStatus }) => {
    switch (status) {
      case 'pending':
        return <span className="text-[11px] px-2 py-0.5 rounded bg-yt-gray/50 text-yt-light/60 border border-[#3d3d3d]">Pending</span>
      case 'uploading':
        return <span className="text-[11px] px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-800/50 flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" />Uploading</span>
      case 'done':
        return <span className="text-[11px] px-2 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-800/40 flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" />Done</span>
      case 'failed':
        return <span className="text-[11px] px-2 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-800/40 flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" />Failed</span>
      case 'cancelled':
        return <span className="text-[11px] px-2 py-0.5 rounded bg-yellow-900/30 text-yellow-400 border border-yellow-800/40">Cancelled</span>
    }
  }

  // ===== Render =====
  const pendingCount = queue.filter(q => q.status === 'pending').length
  const uploadingCount = queue.filter(q => q.status === 'uploading').length
  const doneCount = queue.filter(q => q.status === 'done').length
  const failedCount = queue.filter(q => q.status === 'failed').length

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Youtube className="w-8 h-8 text-yt-red" />
        <div>
          <h1 className="text-2xl font-semibold">Upload Video</h1>
          <p className="text-sm text-yt-light mt-0.5">Submit a URL or drag-and-drop video files</p>
        </div>
      </div>

      {/* Method Tabs */}
      <div className="flex gap-1 mb-6 bg-yt-dark rounded-lg p-1 border border-[#3d3d3d]">
        <button
          onClick={() => { setMethod('url'); setError(null) }}
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
          onClick={() => { setMethod('file'); setError(null) }}
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
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Awesome Video"
              className="w-full bg-yt-dark border border-[#3d3d3d] rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-yt-light/50 transition-colors"
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
          <div className="flex items-center justify-between p-3 bg-yt-dark rounded-lg border border-[#3d3d3d]">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-yt-light/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-white">Word-Level Captions</p>
                <p className="text-[11px] text-yt-light/50">More precise timing, slightly larger subtitle files</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWordTimestamps(!wordTimestamps)}
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
              <><Youtube className="w-5 h-5" /> Process Video URL</>
            )}
          </button>
        </form>
      )}

      {/* ===== File Upload Method ===== */}
      {method === 'file' && (
        <div className="space-y-6">
          {/* Drop Zone — visible when queue is empty or always as "add more" */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl text-center cursor-pointer
              transition-all duration-200 group
              ${isDragOver
                ? 'border-yt-red bg-yt-red/5 scale-[1.02]'
                : queue.length > 0
                  ? 'border-[#3d3d3d] hover:border-yt-red/50 hover:bg-yt-dark/50 p-6'
                  : 'border-[#3d3d3d] hover:border-yt-red/50 hover:bg-yt-dark/50 p-12'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.webm,.ogg,.mov,.avi,.mkv"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className={`flex flex-col items-center gap-3 transition-transform duration-200 ${isDragOver ? 'scale-110' : ''}`}>
              <div className={`p-4 rounded-full transition-colors ${
                isDragOver
                  ? 'bg-yt-red/20 text-yt-red'
                  : queue.length > 0
                    ? 'bg-yt-dark text-yt-light group-hover:text-yt-red'
                    : 'bg-yt-dark text-yt-light group-hover:text-yt-red'
              }`}>
                {isDragOver
                  ? <UploadIcon className="w-10 h-10" />
                  : queue.length > 0
                    ? <UploadIcon className="w-6 h-6" />
                    : <FileVideo className="w-10 h-10" />
                }
              </div>
              <div>
                <p className={`font-medium text-white ${queue.length > 0 ? 'text-xs' : 'text-sm'}`}>
                  {isDragOver
                    ? 'Drop videos here'
                    : queue.length > 0
                      ? 'Drop more videos or click to add'
                      : 'Drag & drop your videos here'}
                </p>
                <p className={`text-xs text-yt-light/60 mt-1 ${queue.length > 0 ? 'hidden' : ''}`}>
                  or click to browse files (multi-select supported)
                </p>
              </div>
              {queue.length === 0 && (
                <>
                  <div className="flex flex-wrap gap-2 justify-center mt-1">
                    {['MP4', 'WebM', 'MOV', 'AVI', 'MKV'].map(fmt => (
                      <span key={fmt} className="text-[10px] px-2 py-0.5 rounded bg-yt-dark border border-[#3d3d3d] text-yt-light/60">
                        {fmt}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-yt-light/40 mt-1">Max 5GB per file</p>
                </>
              )}
            </div>

            {/* Ripple effect */}
            {isDragOver && (
              <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                <div className="absolute inset-0 border-2 border-yt-red/30 rounded-xl animate-pulse-slow" />
                <div className="absolute inset-4 border border-yt-red/20 rounded-lg" />
              </div>
            )}
          </div>

          {/* ===== Queue List ===== */}
          {queue.length > 0 && (
            <div className="space-y-3 animate-fade-in">
              {/* Queue header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-white">
                    Upload Queue ({queue.length})
                  </h3>
                  <span className="text-[11px] text-yt-light/50">
                    {doneCount > 0 && `${doneCount} done`}
                    {doneCount > 0 && failedCount > 0 && ', '}
                    {failedCount > 0 && `${failedCount} failed`}
                    {uploadingCount > 0 && `, ${uploadingCount} uploading`}
                  </span>
                </div>
                {overallStatus !== 'uploading' && (
                  <button
                    onClick={clearQueue}
                    className="text-xs text-yt-light/50 hover:text-red-400 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Queue items */}
              <div className="space-y-2">
                {queue.map((item, index) => (
                  <div
                    key={item.id}
                    className={`
                      bg-yt-dark rounded-lg border overflow-hidden transition-all duration-300
                      ${item.status === 'uploading' ? 'border-blue-800/50 ring-1 ring-blue-800/20' : ''}
                      ${item.status === 'failed' ? 'border-red-800/40' : ''}
                      ${item.status === 'done' ? 'border-green-800/30' : ''}
                      ${item.status === 'cancelled' ? 'border-yellow-800/30 opacity-60' : ''}
                      ${item.status === 'pending' ? 'border-[#3d3d3d] hover:border-[#4d4d4d]' : 'border-[#3d3d3d]'}
                    `}
                  >
                    {/* Video preview thumbnail row */}
                    <div className="flex gap-3 p-3 items-center">
                      {/* Mini preview */}
                      <div className="relative w-24 h-14 shrink-0 rounded overflow-hidden bg-yt-black">
                        <video
                          src={item.previewUrl}
                          className="w-full h-full object-cover"
                          preload="metadata"
                          muted
                          playsInline
                        />
                        {/* Play icon overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
                          <Play className="w-5 h-5 text-white drop-shadow" />
                        </div>
                        {/* Index badge */}
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white/70 font-mono">
                          {index + 1}
                        </div>
                      </div>

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <p className="text-sm font-medium text-white truncate">
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

                        {/* Per-item progress bar (uploading only) */}
                        {item.status === 'uploading' && (
                          <div className="mt-2 w-full h-1.5 bg-yt-black rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {item.status === 'pending' && overallStatus !== 'uploading' && (
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 rounded hover:bg-white/10 text-yt-light hover:text-red-400 transition-colors"
                            title="Remove from queue"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.status === 'failed' && overallStatus !== 'uploading' && (
                          <button
                            onClick={() => retryItem(item.id)}
                            className="p-1.5 rounded hover:bg-white/10 text-yt-light hover:text-blue-400 transition-colors"
                            title="Retry upload"
                          >
                            <Loader2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.status === 'cancelled' && overallStatus !== 'uploading' && (
                          <button
                            onClick={() => retryItem(item.id)}
                            className="p-1.5 rounded hover:bg-white/10 text-yt-light hover:text-blue-400 transition-colors"
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
                ))}
              </div>
            </div>
          )}

          {/* ===== Error banner ===== */}
          {error && overallStatus !== 'uploading' && (
            <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-800 rounded-lg animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                {error.includes('\n') ? (
                  error.split('\n').map((line, i) => (
                    <p key={i} className="text-sm text-red-300">{line}</p>
                  ))
                ) : (
                  <p className="text-sm text-red-300">{error}</p>
                )}
              </div>
            </div>
          )}

          {/* ===== Success banner ===== */}
          {success && overallStatus === 'done' && (
            <div className="flex items-center gap-2 p-3 bg-green-900/30 border border-green-800 rounded-lg animate-fade-in">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              <p className="text-sm text-green-300">{success}</p>
            </div>
          )}

          {/* Caption options */}
          <div className="flex items-center justify-between p-3 bg-yt-dark rounded-lg border border-[#3d3d3d]">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-yt-light/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-white">Word-Level Captions</p>
                <p className="text-[11px] text-yt-light/50">More precise timing, slightly larger files</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWordTimestamps(!wordTimestamps)}
              disabled={overallStatus === 'uploading'}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 ${
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

          {/* ===== Bottom actions ===== */}
          {queue.length > 0 && (
            <div className="flex gap-3">
              {overallStatus !== 'uploading' && pendingCount > 0 && (
                <>
                  <button
                    onClick={clearQueue}
                    className="flex-1 flex items-center justify-center gap-2 border border-[#3d3d3d] hover:bg-yt-dark text-white font-medium rounded-lg px-6 py-3 transition-colors text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear Queue
                  </button>
                  <button
                    onClick={startUploads}
                    className="flex-[2] flex items-center justify-center gap-2 bg-yt-red hover:bg-red-700 text-white font-medium rounded-lg px-6 py-3 transition-colors text-sm"
                  >
                    <UploadIcon className="w-4 h-4" />
                    Upload {pendingCount > 1 ? `All ${pendingCount}` : ''}
                  </button>
                </>
              )}
              {overallStatus === 'uploading' && (
                <button
                  onClick={cancelAll}
                  className="w-full flex items-center justify-center gap-2 bg-yt-dark hover:bg-red-900/20 text-yt-light hover:text-red-400 font-medium rounded-lg px-6 py-3 text-sm border border-[#3d3d3d] hover:border-red-800/50 transition-all group"
                >
                  <Square className="w-4 h-4 group-hover:fill-red-400 transition-colors" />
                  Cancel All Uploads
                </button>
              )}
              {overallStatus !== 'uploading' && pendingCount === 0 && doneCount > 0 && (
                <button
                  onClick={clearQueue}
                  className="w-full flex items-center justify-center gap-2 border border-[#3d3d3d] hover:bg-yt-dark text-yt-light hover:text-white font-medium rounded-lg px-6 py-3 transition-colors text-sm"
                >
                  <X className="w-4 h-4" />
                  {failedCount > 0 ? 'Dismiss (retry failed items above)' : 'Clear Queue'}
                </button>
              )}
            </div>
          )}

          {/* Summary row after completion */}
          {overallStatus === 'done' && queue.length > 0 && pendingCount === 0 && (
            <div className="flex items-center justify-center gap-4 text-xs text-yt-light/50 p-2">
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> {doneCount} done</span>
              {failedCount > 0 && <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-500" /> {failedCount} failed</span>}
              {queue.filter(q => q.status === 'cancelled').length > 0 && (
                <span className="flex items-center gap-1"><Square className="w-3 h-3 text-yellow-500" /> {queue.filter(q => q.status === 'cancelled').length} cancelled</span>
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
