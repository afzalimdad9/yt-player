import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import { StreamingSession } from '../../services/api'
import { Controls } from './Controls'
import { ProgressBar } from './ProgressBar'

interface VideoPlayerProps {
  session: StreamingSession | null
  videoTitle: string
  onTimeUpdate?: (time: number) => void
}

type PlayerState = 'loading' | 'ready' | 'playing' | 'paused' | 'error'

export function VideoPlayer({ session, videoTitle, onTimeUpdate }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [playerState, setPlayerState] = useState<PlayerState>('loading')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [buffered, setBuffered] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [activeTrack, setActiveTrack] = useState<string>()
  const [qualities, setQualities] = useState<{ height: number; level: number }[]>([])
  const [currentQuality, setCurrentQuality] = useState(-1) // -1 = auto

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Initialize HLS or DASH streaming
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Cleanup previous
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (!session) {
      // No session yet - video still processing
      setPlayerState('loading')
      return
    }

    // Prefer HLS over DASH for broader browser support
    const manifestUrl = session.hlsManifest || session.dashManifest
    if (!manifestUrl) {
      setPlayerState('error')
      return
    }

    setPlayerState('loading')

    // Handle HLS
    if (session.hlsManifest) {
      if (Hls.isSupported()) {
        // Use hls.js for browsers that don't support HLS natively
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 30,
        })

        hlsRef.current = hls
        hls.loadSource(session.hlsManifest)
        hls.attachMedia(video)

        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          setPlayerState('ready')
          hls.currentLevel = -1 // auto
          // Extract available quality levels
          const levels = data.levels.map((level, index) => ({
            height: level.height,
            level: index,
          }))
          setQualities(levels)
        })

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.error('[HLS] Fatal error:', data.type, data.details)
            setPlayerState('error')
          }
        })

        hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
          console.log(`[HLS] Switched to quality level ${data.level}`)
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari/iOS)
        video.src = session.hlsManifest
      } else {
        // HLS not supported - fall back to DASH
        if (session.dashManifest) {
          video.src = session.dashManifest
        } else {
          setPlayerState('error')
        }
      }
    } else if (session.dashManifest) {
      video.src = session.dashManifest
    } else {
      setPlayerState('error')
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [session])

  // Track VTT for captions/subtitles
  useEffect(() => {
    const video = videoRef.current
    if (!video || !session) return

    // Clear existing tracks
    const existingTracks = video.querySelectorAll('track')
    existingTracks.forEach(t => t.remove())

    // Add tracks from session
    session.tracks.forEach(track => {
      const trackEl = document.createElement('track')
      trackEl.kind = track.type === 'chapters' ? 'chapters' :
                     track.type === 'descriptions' ? 'descriptions' :
                     track.type === 'captions' ? 'captions' : 'subtitles'
      trackEl.src = track.src
      trackEl.srclang = track.language
      trackEl.label = track.label
      trackEl.default = track.default || false
      video.appendChild(trackEl)
    })

    // If thumbnails VTT exists, we can use it for preview on hover
    if (session.thumbnails) {
      const thumbTrack = document.createElement('track')
      thumbTrack.kind = 'metadata'
      thumbTrack.src = session.thumbnails
      thumbTrack.label = 'thumbnails'
      video.appendChild(thumbTrack)
    }
  }, [session])

  // Time update
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      onTimeUpdate?.(video.currentTime)
    }

    const handleDurationChange = () => {
      setDuration(video.duration)
    }

    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const end = video.buffered.end(video.buffered.length - 1)
        setBuffered((end / video.duration) * 100)
      }
    }

    const handlePlay = () => setPlayerState('playing')
    const handlePause = () => setPlayerState('paused')
    const handleWaiting = () => setPlayerState('loading')
    const handleCanPlay = () => setPlayerState(playerState === 'loading' ? 'ready' : playerState)

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('durationchange', handleDurationChange)
    video.addEventListener('progress', handleProgress)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('canplay', handleCanPlay)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('durationchange', handleDurationChange)
      video.removeEventListener('progress', handleProgress)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('canplay', handleCanPlay)
    }
  }, [onTimeUpdate, playerState])

  // Controls visibility
  const handleMouseMove = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (playerState === 'playing') {
        setShowControls(false)
      }
    }, 3000)
  }, [playerState])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
    } else {
      video.pause()
    }
  }, [])

  const handleSeek = useCallback((time: number) => {
    const video = videoRef.current
    if (video) {
      video.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  const handleVolumeChange = useCallback((value: number) => {
    const video = videoRef.current
    if (video) {
      video.volume = value
      video.muted = value === 0
      setVolume(value)
      setIsMuted(value === 0)
    }
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    if (document.fullscreenElement) {
      await document.exitFullscreen()
      setIsFullscreen(false)
    } else {
      await container.requestFullscreen()
      setIsFullscreen(true)
    }
  }, [])

  const handlePlaybackRateChange = useCallback((rate: number) => {
    const video = videoRef.current
    if (video) {
      video.playbackRate = rate
      setPlaybackRate(rate)
    }
  }, [])

  const handleQualityChange = useCallback((level: number) => {
    const hls = hlsRef.current
    if (hls) {
      hls.currentLevel = level // -1 for auto
      setCurrentQuality(level)
    }
  }, [])

  // Loading indicator
  const isBuffering = playerState === 'loading'

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black group cursor-pointer"
      onMouseMove={handleMouseMove}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        preload="metadata"
        playsInline
        crossOrigin="anonymous"
      />

      {/* Buffering indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 border-4 border-yt-red border-t-transparent rounded-full animate-spin" />
            <span className="text-yt-white text-xs">Loading</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {playerState === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <p className="text-yt-white text-sm mb-2">Unable to play this video</p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                window.location.reload()
              }}
              className="px-3 py-1 bg-yt-red rounded text-xs hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Top gradient + title */}
      <div className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-yt-white text-sm font-medium truncate">{videoTitle}</h2>
      </div>

      {/* Controls */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Center play button */}
        {playerState === 'paused' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 bg-yt-red/90 rounded-full flex items-center justify-center hover:bg-yt-red transition-colors">
              <svg className="w-6 h-6 text-yt-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-12">
          {/* Progress Bar */}
          <ProgressBar
            currentTime={currentTime}
            duration={duration}
            buffered={buffered}
            onSeek={handleSeek}
          />

          {/* Controls Row */}
          <Controls
            playerState={playerState}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            isMuted={isMuted}
            isFullscreen={isFullscreen}
            playbackRate={playbackRate}
            qualities={qualities}
            currentQuality={currentQuality}
            onPlayPause={togglePlay}
            onVolumeChange={handleVolumeChange}
            onMuteToggle={toggleMute}
            onFullscreenToggle={toggleFullscreen}
            onPlaybackRateChange={handlePlaybackRateChange}
            onQualityChange={handleQualityChange}
          />
        </div>
      </div>
    </div>
  )
}
