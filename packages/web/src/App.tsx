import { useState, useEffect, useCallback } from 'react'
import { Header } from './components/Layout/Header'
import { Home } from './pages/Home'
import { Watch } from './pages/Watch'
import { Upload } from './pages/Upload'

type Page = 'home' | 'watch' | 'upload'

function getInitialTheme(): boolean {
  if (typeof window === 'undefined') return true
  const stored = localStorage.getItem('theme')
  if (stored === 'dark') return true
  if (stored === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null)
  const [darkMode, setDarkMode] = useState(getInitialTheme)

  const toggleTheme = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev
      localStorage.setItem('theme', next ? 'dark' : 'light')
      return next
    })
  }, [])

  // Sync dark class to <html> and apply transition class
  useEffect(() => {
    const root = document.documentElement
    if (darkMode) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [darkMode])

  const navigateToWatch = (videoId: string) => {
    setCurrentVideoId(videoId)
    setCurrentPage('watch')
  }

  const navigateToUpload = () => {
    setCurrentPage('upload')
  }

  const navigateToHome = () => {
    setCurrentPage('home')
    setCurrentVideoId(null)
  }

  return (
    <div className="min-h-screen bg-yt-black transition-colors duration-300">
      {/* Skip-to-content link for keyboard users */}
      <a
        href="#main-content"
        className="absolute -top-full left-3 z-[60] px-4 py-2 bg-yt-red text-white rounded-lg text-sm font-medium shadow-lg focus-visible:top-3 focus-visible:outline-none transition-all duration-200"
      >
        Skip to content
      </a>

      <Header
        onHomeClick={navigateToHome}
        onUploadClick={navigateToUpload}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
      />

      <main id="main-content" className="pt-14">
        {currentPage === 'home' && <Home onVideoClick={navigateToWatch} />}
        {currentPage === 'watch' && currentVideoId && (
          <Watch videoId={currentVideoId} onBack={navigateToHome} />
        )}
        {currentPage === 'upload' && (
          <Upload onVideoUploaded={navigateToWatch} />
        )}
      </main>
    </div>
  )
}
