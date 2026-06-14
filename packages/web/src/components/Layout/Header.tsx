import { Search, Menu, Upload as UploadIcon, Bell, User, Youtube } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  onHomeClick: () => void
  onUploadClick: () => void
  darkMode: boolean
  onToggleTheme: () => void
}

export function Header({ onHomeClick, onUploadClick, darkMode, onToggleTheme }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-yt-black flex items-center justify-between px-4 md:px-6 z-50 border-b border-yt-gray transition-colors duration-300">
      {/* Left Section */}
      <div className="flex items-center gap-3">
        <button className="p-2 rounded-full hover:bg-yt-dark transition-colors">
          <Menu className="w-5 h-5 text-yt-white" />
        </button>
        <button onClick={onHomeClick} className="flex items-center gap-1 hover:opacity-80">
          <Youtube className="w-7 h-7 text-yt-red" />
          <span className="text-lg font-semibold text-yt-white tracking-tight hidden sm:block">
            YT Player
          </span>
        </button>
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-[600px] mx-4 hidden md:flex">
        <div className="flex w-full">
          <input
            type="text"
            placeholder="Search"
            className="w-full bg-yt-dark border border-yt-gray rounded-l-full px-4 py-2 text-yt-white text-sm focus:outline-none placeholder:text-yt-light"
          />
          <button className="bg-yt-gray px-5 rounded-r-full border border-l-0 border-yt-gray hover:bg-yt-dark transition-colors">
            <Search className="w-4 h-4 text-yt-white" />
          </button>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        <ThemeToggle darkMode={darkMode} onToggle={onToggleTheme} />
        <button
          onClick={onUploadClick}
          className="p-2 rounded-full hover:bg-yt-dark transition-colors"
          title="Upload Video"
        >
          <UploadIcon className="w-5 h-5 text-yt-white" />
        </button>
        <button className="p-2 rounded-full hover:bg-yt-dark transition-colors hidden sm:block">
          <Bell className="w-5 h-5 text-yt-white" />
        </button>
        <button className="p-1.5 rounded-full bg-yt-gray ml-1 hover:bg-yt-dark transition-colors">
          <User className="w-5 h-5 text-yt-white" />
        </button>
      </div>
    </header>
  )
}
