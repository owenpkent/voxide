import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Theme, THEMES, getStoredTheme, setStoredTheme } from './themes'

interface ThemeContextType {
  theme: Theme
  themeId: string
  setTheme: (themeId: string) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState(() => getStoredTheme())
  const [theme, setThemeState] = useState(() => THEMES.find(t => t.id === themeId) || THEMES[0])

  const setTheme = (newThemeId: string, broadcast = true) => {
    const newTheme = THEMES.find(t => t.id === newThemeId) || THEMES[0]
    setThemeId(newThemeId)
    setThemeState(newTheme)
    setStoredTheme(newThemeId)
    
    // Apply CSS variables to document
    applyThemeToDocument(newTheme)
    
    // Broadcast to other windows via IPC
    if (broadcast && window.electronAPI?.broadcastThemeChange) {
      window.electronAPI.broadcastThemeChange(newThemeId)
    }
  }

  // Apply theme on mount - get from localStorage directly to ensure correct theme
  useEffect(() => {
    const storedThemeId = getStoredTheme()
    const storedTheme = THEMES.find(t => t.id === storedThemeId) || THEMES[0]
    applyThemeToDocument(storedTheme)
    setThemeId(storedThemeId)
    setThemeState(storedTheme)
  }, [])

  // Listen for theme changes from other windows via IPC
  useEffect(() => {
    if (!window.electronAPI?.onThemeChange) return
    const cleanup = window.electronAPI.onThemeChange((newThemeId: string) => {
      // Don't broadcast again - this came from another window
      const newTheme = THEMES.find(t => t.id === newThemeId) || THEMES[0]
      setThemeId(newThemeId)
      setThemeState(newTheme)
      setStoredTheme(newThemeId)
      applyThemeToDocument(newTheme)
    })
    return cleanup
  }, [])

  // Listen for theme changes from settings panel (same window)
  useEffect(() => {
    const handleThemeChange = (e: CustomEvent) => {
      setTheme(e.detail, true)
    }
    window.addEventListener('theme-change', handleThemeChange as EventListener)
    return () => window.removeEventListener('theme-change', handleThemeChange as EventListener)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, themeId, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

function applyThemeToDocument(theme: Theme) {
  const root = document.documentElement
  const { colors } = theme
  
  root.style.setProperty('--bg-primary', colors.bgPrimary)
  root.style.setProperty('--bg-secondary', colors.bgSecondary)
  root.style.setProperty('--bg-tertiary', colors.bgTertiary)
  root.style.setProperty('--accent-primary', colors.accentPrimary)
  root.style.setProperty('--accent-secondary', colors.accentSecondary)
  root.style.setProperty('--accent-hover', colors.accentHover)
  root.style.setProperty('--text-primary', colors.textPrimary)
  root.style.setProperty('--text-secondary', colors.textSecondary)
  root.style.setProperty('--text-muted', colors.textMuted)
  root.style.setProperty('--border-primary', colors.borderPrimary)
  root.style.setProperty('--border-accent', colors.borderAccent)
  root.style.setProperty('--danger', colors.danger)
  root.style.setProperty('--danger-bg', colors.dangerBg)
  root.style.setProperty('--success', colors.success)
}
