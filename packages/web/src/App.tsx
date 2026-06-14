import { useState } from 'react'
import { Header } from './components/Layout/Header'
import { Home } from './pages/Home'
import { Watch } from './pages/Watch'
import { Upload } from './pages/Upload'

type Page = 'home' | 'watch' | 'upload'

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null)

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
    <div className="min-h-screen bg-yt-black">
      <Header
        onHomeClick={navigateToHome}
        onUploadClick={navigateToUpload}
      />

      <main className="pt-14">
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
