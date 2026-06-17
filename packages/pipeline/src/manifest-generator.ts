import path from 'node:path'
import { StorageClient } from '@yt-player/storage'
import { StreamManifest, StreamingProtocol } from '@yt-player/shared'
import { TranscodeResult } from './transcoder.js'

/**
 * Upload all transcoded streaming files to storage and return manifest URLs
 */
export async function uploadStreamingAssets(
  storage: StorageClient,
  videoId: string,
  result: TranscodeResult
): Promise<StreamManifest[]> {
  const manifests: StreamManifest[] = []

  // Upload HLS assets
  if (result.qualities.length > 0) {
    const hlsKey = `videos/${videoId}/hls/master.m3u8`
    const { readFile, readdir } = await import('node:fs/promises')
    const { join, relative } = await import('node:path')

    // Upload master playlist
    const masterContent = await readFile(join(result.hlsDir, 'master.m3u8'), 'utf-8')
    await storage.upload(hlsKey, masterContent, 'application/vnd.apple.mpegurl')

    // Upload each quality rendition
    for (const q of result.qualities) {
      const qualityDir = join(result.hlsDir, q.quality)
      await uploadDirectory(storage, qualityDir, `videos/${videoId}/hls/${q.quality}`)
    }

    manifests.push({
      protocol: StreamingProtocol.HLS,
      url: storage.getPublicUrl(hlsKey),
      bandwidth: Math.max(...result.qualities.map(q => q.bandwidth)),
      resolution: result.qualities[result.qualities.length - 1]?.resolution,
    })
  }

  // Upload DASH assets
  if (result.dashDir) {
    const dashKey = `videos/${videoId}/dash/master.mpd`

    const dashFiles = await import('node:fs/promises')
    const masterContent = await dashFiles.readFile(path.join(result.dashDir, 'master.mpd'), 'utf-8')
    await storage.upload(dashKey, masterContent, 'application/dash+xml')

    for (const q of result.qualities) {
      const qualityDir = path.join(result.dashDir, q.quality)
      await uploadDirectory(storage, qualityDir, `videos/${videoId}/dash/${q.quality}`)
    }

    manifests.push({
      protocol: StreamingProtocol.DASH,
      url: storage.getPublicUrl(dashKey),
      bandwidth: Math.max(...result.qualities.map(q => q.bandwidth)),
      resolution: result.qualities[result.qualities.length - 1]?.resolution,
    })
  }

  return manifests
}

/**
 * Upload a directory of files to storage
 */
async function uploadDirectory(
  storage: StorageClient,
  localDir: string,
  remotePrefix: string
): Promise<void> {
  const { readdir, readFile, stat } = await import('node:fs/promises')
  const path = await import('node:path')

  const entries = await readdir(localDir)

  for (const entry of entries) {
    const fullPath = path.join(localDir, entry)
    const stats = await stat(fullPath)

    if (stats.isDirectory()) {
      await uploadDirectory(storage, fullPath, `${remotePrefix}/${entry}`)
    } else if (stats.isFile()) {
      const content = await readFile(fullPath)
      const contentType = getContentType(entry)
      await storage.upload(`${remotePrefix}/${entry}`, content, contentType)
    }
  }
}

function getContentType(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    m3u8: 'application/vnd.apple.mpegurl',
    ts: 'video/mp2t',
    mp4: 'video/mp4',
    m4s: 'application/octet-stream',
    mpd: 'application/dash+xml',
    vtt: 'text/vtt',
    jpg: 'image/jpeg',
    png: 'image/png',
    json: 'application/json',
  }
  return ext ? types[ext] : undefined
}
