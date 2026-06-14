import { Sun, Moon } from 'lucide-react'

interface ThemeToggleProps {
  darkMode: boolean
  onToggle: () => void
}

export function ThemeToggle({ darkMode, onToggle }: ThemeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-full hover:bg-yt-dark transition-colors"
      title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {darkMode ? (
        <Sun className="w-5 h-5 text-yt-white" />
      ) : (
        <Moon className="w-5 h-5 text-yt-white" />
      )}
    </button>
  )
}
