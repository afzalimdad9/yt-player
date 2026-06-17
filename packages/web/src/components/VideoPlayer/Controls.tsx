import { useState, useRef, useEffect } from 'react'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Subtitles,
} from 'lucide-react'

type PlayerState = 'loading' | 'ready' | 'playing' | 'paused' | 'error'

interface ControlsProps {
  playerState: PlayerState
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  isFullscreen: boolean
  playbackRate: number
  qualities: { height: number; level: number }[]
  currentQuality: number
  onPlayPause: () => void
  onVolumeChange: (volume: number) => void
  onMuteToggle: () => void
  onFullscreenToggle: () => void
  onPlaybackRateChange: (rate: number) => void
  onQualityChange: (level: number) => void
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

export function Controls({
  playerState,
  currentTime,
  duration,
  volume,
  isMuted,
  isFullscreen,
  playbackRate,
  qualities,
  currentQuality,
  onPlayPause,
  onVolumeChange,
  onMuteToggle,
  onFullscreenToggle,
  onPlaybackRateChange,
  onQualityChange,
}: ControlsProps) {
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'main' | 'speed' | 'quality'>('main')
  const settingsRef = useRef<HTMLDivElement>(null)

  // Close settings on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '0:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      {/* Play/Pause */}
      <button onClick={onPlayPause} className="control-btn" title={playerState === 'playing' ? 'Pause' : 'Play'}>
        {playerState === 'playing' ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
      </button>

      {/* Volume */}
      <div
        className="relative flex items-center"
        onMouseEnter={() => setShowVolumeSlider(true)}
        onMouseLeave={() => setShowVolumeSlider(false)}
      >
        <button onClick={onMuteToggle} className="control-btn" title={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
        {showVolumeSlider && (
          <div className="flex items-center gap-1 animate-fade-in">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-20 h-1 accent-yt-red cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Time display */}
      <span className="text-xs text-yt-white/80 whitespace-nowrap select-none">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings */}
      <div className="relative" ref={settingsRef}>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="control-btn"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        {showSettings && (
          <div className="absolute bottom-full right-0 mb-2 bg-yt-dark border border-yt-gray rounded-lg p-2 min-w-[200px] animate-slide-up shadow-xl">
            {settingsTab === 'main' && (
              <>
                <button
                  onClick={() => setSettingsTab('speed')}
                  className="w-full flex items-center justify-between text-xs px-2 py-2 rounded hover:bg-yt-gray/50 text-yt-white"
                >
                  <span>Playback Speed</span>
                  <span className="text-yt-light">{playbackRate}x</span>
                </button>
                {qualities.length > 0 && (
                  <button
                    onClick={() => setSettingsTab('quality')}
                    className="w-full flex items-center justify-between text-xs px-2 py-2 rounded hover:bg-yt-gray/50 text-yt-white"
                  >
                    <span>Quality</span>
                    <span className="text-yt-light">
                      {currentQuality === -1 ? 'Auto' : `${qualities.find(q => q.level === currentQuality)?.height || '?'}p`}
                    </span>
                  </button>
                )}
              </>
            )}

            {settingsTab === 'speed' && (
              <>
                <button
                  onClick={() => setSettingsTab('main')}
                  className="w-full text-left text-xs px-2 py-1.5 text-yt-light hover:text-yt-white"
                >
                  ← Playback Speed
                </button>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {PLAYBACK_RATES.map((rate) => (
                    <button
                      key={rate}
                      onClick={() => {
                        onPlaybackRateChange(rate)
                        setShowSettings(false)
                        setSettingsTab('main')
                      }}
                      className={`text-xs px-2 py-1.5 rounded transition-colors ${
                        playbackRate === rate
                          ? 'bg-yt-red text-white'
                          : 'text-yt-light hover:bg-yt-gray/50'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </>
            )}

            {settingsTab === 'quality' && (
              <>
                <button
                  onClick={() => setSettingsTab('main')}
                  className="w-full text-left text-xs px-2 py-1.5 text-yt-light hover:text-yt-white"
                >
                  ← Quality
                </button>
                <div className="flex flex-col gap-0.5 mt-1">
                  <button
                    onClick={() => {
                      onQualityChange(-1)
                      setShowSettings(false)
                      setSettingsTab('main')
                    }}
                    className={`text-xs px-2 py-1.5 rounded text-left transition-colors ${
                      currentQuality === -1 ? 'bg-yt-red text-white' : 'text-yt-light hover:bg-yt-gray/50'
                    }`}
                  >
                    Auto
                  </button>
                  {qualities.map((q) => (
                    <button
                      key={q.level}
                      onClick={() => {
                        onQualityChange(q.level)
                        setShowSettings(false)
                        setSettingsTab('main')
                      }}
                      className={`text-xs px-2 py-1.5 rounded text-left transition-colors ${
                        currentQuality === q.level ? 'bg-yt-red text-white' : 'text-yt-light hover:bg-yt-gray/50'
                      }`}
                    >
                      {q.height}p
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Fullscreen */}
      <button onClick={onFullscreenToggle} className="control-btn" title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
      </button>
    </div>
  )
}
