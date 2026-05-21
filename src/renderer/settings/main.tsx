import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { SettingsPanel } from '../components/SettingsPanel'
import { ThemeProvider } from '../ThemeContext'
import '../index.css'
import '../types/electron.d.ts'

interface GitHubUser {
  id: number
  login: string
  avatar_url: string
  name: string | null
  email: string | null
}

function SettingsApp() {
  const [user, setUser] = useState<GitHubUser | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      let token: string | null = null
      if (window.electronAPI?.getToken) {
        const result = await window.electronAPI.getToken()
        if (result.success && result.token) {
          token = result.token
        }
      }
      if (!token) {
        token = localStorage.getItem('github_token')
      }
      if (token && window.electronAPI) {
        try {
          const result = await window.electronAPI.fetchGitHubUser(token)
          if (result.success && result.user) {
            setUser(result.user)
          }
        } catch {}
      }
    }
    loadUser()
  }, [])

  return (
    <SettingsPanel
      isOpen={true}
      onClose={() => window.close()}
      user={user}
      isPopup={true}
    />
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <SettingsApp />
    </ThemeProvider>
  </React.StrictMode>
)
