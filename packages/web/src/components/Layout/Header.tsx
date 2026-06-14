import { Search, Menu, Upload as UploadIcon, Bell, User, Youtube } from 'lucide-react'

interface HeaderProps {
  onHomeClick: () => void
  onUploadClick: () => void
}

export function Header({ onHomeClick, onUploadClick }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-yt-black flex items-center justify-between px-4 md:px-6 z-50 border-b border-[#3d3d3d]">
      {/* Left Section */}
      <div className="flex items-center gap-3">
        <button className="p-2 rounded-full hover:bg-yt-dark transition-colors">
          <Menu className="w-5 h-5 text-white" />
        </button>
        <button onClick={onHomeClick} className="flex items-center gap-1 hover:opacity-80">
          <Youtube className="w-7 h-7 text-yt-red" />
          <span className="text-lg font-semibold text-white tracking-tight hidden sm:block">
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
            className="w-full bg-yt-dark border border-[#3d3d3d] rounded-l-full px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-yt-light"
          />
          <button className="bg-[#3d3d3d] px-5 rounded-r-full border border-l-0 border-[#3d3d3d] hover:bg-[#4d4d4d] transition-colors">
            <Search className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        <button
          onClick={onUploadClick}
          className="p-2 rounded-full hover:bg-yt-dark transition-colors"
          title="Upload Video"
        >
          <UploadIcon className="w-5 h-5 text-white" />
        </button>
        <button className="p-2 rounded-full hover:bg-yt-dark transition-colors hidden sm:block">
          <Bell className="w-5 h-5 text-white" />
        </button>
        <button className="p-1.5 rounded-full bg-yt-gray ml-1 hover:bg-[#555] transition-colors">
          <User className="w-5 h-5 text-white" />
        </button>
      </div>
    </header>
  )
}
