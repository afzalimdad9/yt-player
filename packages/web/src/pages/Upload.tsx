import { useState, useRef, useCallback, useEffect, DragEvent } from 'react'
import { api } from '../services/api'
import {
  Upload as UploadIcon,
  Link,
  CirclePlay,
  Trash2,
  Square,
  X,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { DropZone } from '../components/Upload/DropZone'
import { UrlForm } from '../components/Upload/UrlForm'
import { FileCard, type FileCardItem, type QueueItemStatus } from '../components/Upload/FileCard'

interface UploadProps {
  onVideoUploaded: (videoId: string) => void
}

type UploadMethod = 'url' | 'file'
type OverallStatus = 'idle' | 'uploading' | 'done'

const ACCEPTED_TYPES = [
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'video/x-msvideo', 'video/x-matroska',
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
  const [queue, setQueue] = useState<FileCardItem[]>([])
  const [overallStatus, setOverallStatus] = useState<OverallStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [wordTimestamps, setWordTimestamps] = useState(true)
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(true)
  const cancelledRef = useRef(false)
  const uploadStartRef = useRef<Map<string, number>>(new Map())
  const previewUrlsRef = useRef<Set<string>>(new Set())

  useEffect(() => { return () => { mountedRef.current = false } }, [])

  const updateItem = useCallback((id: string, patch: Partial<FileCardItem>) => {
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

    const newItems: FileCardItem[] = Array.from(files)
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
          speed: undefined,
          eta: undefined,
        }
      })

    if (newItems.length === 0 && validErrors.length > 0) {
      setError(validErrors.join('\n'))
    }
    if (newItems.length > 0) {
      setQueue(prev => [...prev, ...newItems])
    }
  }, [queue, validateFile])

  // ===== Object URL lifecycle =====
  const prevQueueRef = useRef<FileCardItem[]>([])
  useEffect(() => {
    const prev = prevQueueRef.current
    const current = queue
    for (const prevItem of prev) {
      if (!current.find(c => c.id === prevItem.id)) {
        URL.revokeObjectURL(prevItem.previewUrl)
      }
    }
    prevQueueRef.current = current
  }, [queue])

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) URL.revokeObjectURL(url)
      previewUrlsRef.current.clear()
    }
  }, [])

  // ===== Drag & Drop =====
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(true)
  }, [])
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
  }, [])
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation()
    setIsDragOver(false); setMethod('file')
    if (e.dataTransfer.files.length > 0) addFilesToQueue(e.dataTransfer.files)
  }, [addFilesToQueue])
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFilesToQueue(e.target.files)
    e.target.value = ''
  }, [addFilesToQueue])

  // ===== Queue actions =====
  const removeItem = useCallback((id: string) => {
    setQueue(prev => {
      const item = prev.find(i => i.id === id)
      if (item) { previewUrlsRef.current.delete(item.previewUrl); URL.revokeObjectURL(item.previewUrl) }
      return prev.filter(i => i.id !== id)
    })
  }, [])

  const clearQueue = useCallback(() => {
    for (const url of previewUrlsRef.current) URL.revokeObjectURL(url)
    previewUrlsRef.current.clear()
    setQueue([]); setError(null); setOverallStatus('idle'); setSuccess(null)
  }, [])

  const retryItem = useCallback((id: string) => {
    updateItem(id, { status: 'pending', progress: 0, error: null, videoId: null, speed: undefined, eta: undefined })
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

      updateItem(item.id, { status: 'uploading', progress: 0, error: null, speed: undefined, eta: undefined })
      uploadStartRef.current.set(item.id, Date.now())

      try {
        const { promise, abort } = api.uploadVideo(item.file, (progress) => {
          if (mountedRef.current) {
            const elapsed = (Date.now() - (uploadStartRef.current.get(item.id) || Date.now())) / 1000
            const speed = elapsed > 0 ? progress.loaded / elapsed : 0
            const eta = speed > 0 ? (progress.total - progress.loaded) / speed : 0
            updateItem(item.id, { progress: progress.percent, speed, eta })
          }
        }, wordTimestamps)
        abortRef.current = abort

        const result = await promise
        abortRef.current = null

        if (!mountedRef.current || cancelledRef.current) break
        updateItem(item.id, { status: 'done', progress: 100, videoId: result.videoId })

        if (i === pending.length - 1) {
          setSuccess(`All ${pending.length} video${pending.length > 1 ? 's' : ''} uploaded!`)
          setOverallStatus('done')
          setTimeout(() => onVideoUploaded(result.videoId), 1500)
        }
      } catch (err) {
        abortRef.current = null
        if (!mountedRef.current || cancelledRef.current) break

        const isAbort = err instanceof DOMException && err.name === 'AbortError'
        updateItem(item.id, {
          status: isAbort ? 'cancelled' : 'failed',
          error: isAbort ? 'Cancelled' : (err instanceof Error ? err.message : 'Upload failed'),
        })
        if (isAbort) { setOverallStatus('idle'); break }

        const anyPending = queue.some(q => q.status === 'pending' && mountedRef.current)
        if (!anyPending) { setOverallStatus('done'); setSuccess('Some uploads failed') }
      }
    }
  }, [queue, updateItem, onVideoUploaded, wordTimestamps])

  const cancelAll = useCallback(() => {
    cancelledRef.current = true
    if (abortRef.current) { abortRef.current(); abortRef.current = null }
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
    if (!url.trim()) { setError('Please enter a video URL'); return }
    try { new URL(url) } catch { setError('Please enter a valid URL'); return }

    try {
      setOverallStatus('uploading'); setError(null)
      const result = await api.submitVideo(url, title || undefined, wordTimestamps)
      setOverallStatus('done')
      setSuccess(`Video submitted! ID: ${result.videoId.slice(0, 8)}...`)
      setTimeout(() => onVideoUploaded(result.videoId), 1500)
    } catch (err) {
      setOverallStatus('idle')
      setError(err instanceof Error ? err.message : 'Failed to submit video')
    }
  }

  // ===== Derived state =====
  const pendingCount = queue.filter(q => q.status === 'pending').length
  const uploadingCount = queue.filter(q => q.status === 'uploading').length
  const doneCount = queue.filter(q => q.status === 'done').length
  const failedCount = queue.filter(q => q.status === 'failed').length
  const cancelledCount = queue.filter(q => q.status === 'cancelled').length

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <CirclePlay className="w-8 h-8 text-yt-red" />
        <div>
          <h1 className="text-2xl font-semibold">Upload Video</h1>
          <p className="text-sm text-yt-light mt-0.5">Submit a URL or drag-and-drop video files</p>
        </div>
      </div>

      {/* Method Tabs */}
      <div className="flex gap-1 mb-6 bg-yt-dark rounded-lg p-1 border border-yt-gray">
        <button
          onClick={() => { setMethod('url'); setError(null) }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
            method === 'url' ? 'bg-yt-gray text-yt-white shadow' : 'text-yt-light hover:text-yt-white hover:bg-yt-dark/50'
          }`}
        >
          <Link className="w-4 h-4" /> URL
        </button>
        <button
          onClick={() => { setMethod('file'); setError(null) }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
            method === 'file' ? 'bg-yt-gray text-yt-white shadow' : 'text-yt-light hover:text-yt-white hover:bg-yt-dark/50'
          }`}
        >
          <UploadIcon className="w-4 h-4" /> File Upload
        </button>
      </div>

      {/* ===== URL Method ===== */}
      {method === 'url' && (
        <UrlForm
          url={url}
          title={title}
          wordTimestamps={wordTimestamps}
          overallStatus={overallStatus}
          error={error}
          success={success}
          onUrlChange={setUrl}
          onTitleChange={setTitle}
          onWordTimestampsChange={setWordTimestamps}
          onSubmit={handleUrlSubmit}
        />
      )}

      {/* ===== File Method ===== */}
      {method === 'file' && (
        <div className="space-y-6">
          <DropZone
            isDragOver={isDragOver}
            queueCount={queue.length}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onFileSelect={handleFileSelect}
          />

          {/* Queue */}
          {queue.length > 0 && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-yt-white">Upload Queue ({queue.length})</h3>
                  <span className="text-[11px] text-yt-light/50">
                    {doneCount > 0 && `${doneCount} done`}
                    {doneCount > 0 && failedCount > 0 && ', '}
                    {failedCount > 0 && `${failedCount} failed`}
                    {uploadingCount > 0 && `, ${uploadingCount} uploading`}
                  </span>
                </div>
                {overallStatus !== 'uploading' && (
                  <button onClick={clearQueue} className="text-xs text-yt-light/50 hover:text-red-400 transition-colors">
                    Clear all
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {queue.map((item, index) => (
                  <FileCard
                    key={item.id}
                    item={item}
                    index={index}
                    overallUploading={overallStatus === 'uploading'}
                    onRemove={removeItem}
                    onRetry={retryItem}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && overallStatus !== 'uploading' && (
            <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-800 rounded-lg animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                {error.includes('\n') ? (
                  error.split('\n').map((line, i) => <p key={i} className="text-sm text-red-300">{line}</p>)
                ) : (
                  <p className="text-sm text-red-300">{error}</p>
                )}
              </div>
            </div>
          )}

          {/* Success banner */}
          {success && overallStatus === 'done' && (
            <div className="flex items-center gap-2 p-3 bg-green-900/30 border border-green-800 rounded-lg animate-fade-in">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              <p className="text-sm text-green-300">{success}</p>
            </div>
          )}

          {/* Caption toggle */}
          <div className="flex items-center justify-between p-3 bg-yt-dark rounded-lg border border-yt-gray">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-yt-light/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-yt-white">Word-Level Captions</p>
                <p className="text-[11px] text-yt-light/50">More precise timing, slightly larger files</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWordTimestamps(!wordTimestamps)}
              disabled={overallStatus === 'uploading'}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 ${
                wordTimestamps ? 'bg-blue-600' : 'bg-yt-gray'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                wordTimestamps ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* Bottom actions */}
          {queue.length > 0 && (
            <div className="flex gap-3">
              {overallStatus !== 'uploading' && pendingCount > 0 && (
                <>
                  <button onClick={clearQueue} className="flex-1 flex items-center justify-center gap-2 border border-yt-gray hover:bg-yt-dark text-yt-white font-medium rounded-lg px-6 py-3 transition-colors text-sm">
                    <Trash2 className="w-4 h-4" /> Clear Queue
                  </button>
                  <button onClick={startUploads} className="flex-[2] flex items-center justify-center gap-2 bg-yt-red hover:bg-red-700 text-yt-white font-medium rounded-lg px-6 py-3 transition-colors text-sm">
                    <UploadIcon className="w-4 h-4" /> Upload {pendingCount > 1 ? `All ${pendingCount}` : ''}
                  </button>
                </>
              )}
              {overallStatus === 'uploading' && (
                <button onClick={cancelAll} className="w-full flex items-center justify-center gap-2 bg-yt-dark hover:bg-red-900/20 text-yt-light hover:text-red-400 font-medium rounded-lg px-6 py-3 text-sm border border-yt-gray hover:border-red-800/50 transition-all group">
                  <Square className="w-4 h-4 group-hover:fill-red-400 transition-colors" /> Cancel All Uploads
                </button>
              )}
              {overallStatus !== 'uploading' && pendingCount === 0 && doneCount > 0 && (
                <button onClick={clearQueue} className="w-full flex items-center justify-center gap-2 border border-yt-gray hover:bg-yt-dark text-yt-light hover:text-yt-white font-medium rounded-lg px-6 py-3 transition-colors text-sm">
                  <X className="w-4 h-4" /> {failedCount > 0 ? 'Dismiss (retry failed items above)' : 'Clear Queue'}
                </button>
              )}
            </div>
          )}

          {/* Summary */}
          {overallStatus === 'done' && queue.length > 0 && pendingCount === 0 && (
            <div className="flex items-center justify-center gap-4 text-xs text-yt-light/50 p-2">
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> {doneCount} done</span>
              {failedCount > 0 && <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-500" /> {failedCount} failed</span>}
              {cancelledCount > 0 && <span className="flex items-center gap-1"><Square className="w-3 h-3 text-yellow-500" /> {cancelledCount} cancelled</span>}
            </div>
          )}
        </div>
      )}

      {/* Pipeline info */}
      <div className="mt-10 p-4 bg-yt-dark rounded-lg border border-yt-gray">
        <h3 className="text-sm font-medium text-yt-light mb-3">Processing Pipeline</h3>
        <div className="space-y-2 text-xs text-yt-light/70">
          {[
            { color: 'bg-blue-500', text: 'Download video from URL (or use uploaded file)' },
            { color: 'bg-green-500', text: 'Transcode to multiple quality levels (HLS + DASH)' },
            { color: 'bg-yellow-500', text: 'Generate captions, subtitles, and descriptions (AI)' },
            { color: 'bg-purple-500', text: 'Detect chapters and scenes' },
            { color: 'bg-pink-500', text: 'Generate thumbnail sprites with VTT' },
            { color: 'bg-teal-500', text: 'Upload to S3/MinIO storage' },
            { color: 'bg-yt-white/50', text: 'Ready for streaming!' },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${step.color}`} />
              <span>{step.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
