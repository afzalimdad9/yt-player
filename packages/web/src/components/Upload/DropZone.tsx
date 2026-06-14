import { useRef, DragEvent } from 'react'
import { Upload as UploadIcon, FileVideo } from 'lucide-react'

interface DropZoneProps {
  isDragOver: boolean
  queueCount: number
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function DropZone({ isDragOver, queueCount, onDragOver, onDragLeave, onDrop, onFileSelect }: DropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`
        relative border-2 border-dashed rounded-xl text-center cursor-pointer
        transition-all duration-200 group
        ${isDragOver
          ? 'border-yt-red bg-yt-red/5 scale-[1.02]'
          : queueCount > 0
            ? 'border-yt-gray hover:border-yt-red/50 hover:bg-yt-dark/50 p-6'
            : 'border-yt-gray hover:border-yt-red/50 hover:bg-yt-dark/50 p-12'
        }
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.webm,.ogg,.mov,.avi,.mkv"
        onChange={onFileSelect}
        className="hidden"
      />

      <div className={`flex flex-col items-center gap-3 transition-transform duration-200 ${isDragOver ? 'scale-110' : ''}`}>
        <div className={`p-4 rounded-full transition-colors ${
          isDragOver
            ? 'bg-yt-red/20 text-yt-red'
            : 'bg-yt-dark text-yt-light group-hover:text-yt-red'
        }`}>
          {isDragOver
            ? <UploadIcon className="w-10 h-10" />
            : queueCount > 0
              ? <UploadIcon className="w-6 h-6" />
              : <FileVideo className="w-10 h-10" />
          }
        </div>
        <div>
          <p className={`font-medium text-yt-white ${queueCount > 0 ? 'text-xs' : 'text-sm'}`}>
            {isDragOver
              ? 'Drop videos here'
              : queueCount > 0
                ? 'Drop more videos or click to add'
                : 'Drag & drop your videos here'}
          </p>
          <p className={`text-xs text-yt-light/60 mt-1 ${queueCount > 0 ? 'hidden' : ''}`}>
            or click to browse files (multi-select supported)
          </p>
        </div>
        {queueCount === 0 && (
          <>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {['MP4', 'WebM', 'MOV', 'AVI', 'MKV'].map(fmt => (
                <span key={fmt} className="text-[10px] px-2 py-0.5 rounded bg-yt-dark border border-yt-gray text-yt-light/60">
                  {fmt}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-yt-light/40 mt-1">Max 5GB per file</p>
          </>
        )}
      </div>

      {/* Ripple effect on drag over */}
      {isDragOver && (
        <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 border-2 border-yt-red/30 rounded-xl animate-pulse-slow" />
          <div className="absolute inset-4 border border-yt-red/20 rounded-lg" />
        </div>
      )}
    </div>
  )
}
