import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'

export type QueueItemStatus = 'pending' | 'uploading' | 'done' | 'failed' | 'cancelled'

export function StatusBadge({ status }: { status: QueueItemStatus }) {
  switch (status) {
    case 'pending':
      return <span className="text-[11px] px-2 py-0.5 rounded bg-yt-gray/50 text-yt-light/60 border border-[#3d3d3d]">Pending</span>
    case 'uploading':
      return (
        <span className="text-[11px] px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-800/50 flex items-center gap-1">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />Uploading
        </span>
      )
    case 'done':
      return (
        <span className="text-[11px] px-2 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-800/40 flex items-center gap-1">
          <CheckCircle className="w-2.5 h-2.5" />Done
        </span>
      )
    case 'failed':
      return (
        <span className="text-[11px] px-2 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-800/40 flex items-center gap-1">
          <AlertCircle className="w-2.5 h-2.5" />Failed
        </span>
      )
    case 'cancelled':
      return <span className="text-[11px] px-2 py-0.5 rounded bg-yellow-900/30 text-yellow-400 border border-yellow-800/40">Cancelled</span>
  }
}
