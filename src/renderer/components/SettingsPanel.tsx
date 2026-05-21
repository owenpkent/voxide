import { useState, useEffect } from 'react'
import { Settings, Mic, X, RefreshCw, Palette, Key } from 'lucide-react'
import { THEMES, getStoredTheme, setStoredTheme } from '../themes'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  isPopup?: boolean
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [devices, setDevices] = useState<string[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)

  const [keywordBoosts, setKeywordBoosts] = useState(() =>
    localStorage.getItem('deepgram_keywords') || ''
  )

  const [deepgramKey, setDeepgramKey] = useState(() =>
    localStorage.getItem('voxide_deepgram_key') || ''
  )
  const [claudeKey, setClaudeKey] = useState(() =>
    localStorage.getItem('voxide_claude_key') || ''
  )

  const [selectedTheme, setSelectedTheme] = useState(() => getStoredTheme())

  const loadDevices = async () => {
    setIsLoadingDevices(true)
    try {
      const result = await window.electronAPI.listAudioDevices()
      if (result.success) {
        setDevices(result.devices)
        setSelectedDevice(result.selected)
      }
    } finally {
      setIsLoadingDevices(false)
    }
  }

  useEffect(() => {
    if (isOpen) loadDevices()
  }, [isOpen])

  const saveSetting = (key: string, value: string) => {
    localStorage.setItem(key, value)
    const allSettings: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) allSettings[k] = localStorage.getItem(k) || ''
    }
    window.electronAPI.broadcastSettings(allSettings)
  }

  const handleDeviceChange = async (device: string) => {
    setSelectedDevice(device)
    await window.electronAPI.setAudioDevice(device)
  }

  const handleKeywordBoostsChange = (value: string) => {
    setKeywordBoosts(value)
    saveSetting('deepgram_keywords', value)
  }

  const handleDeepgramKeyChange = (value: string) => {
    setDeepgramKey(value)
    saveSetting('voxide_deepgram_key', value)
  }

  const handleClaudeKeyChange = (value: string) => {
    setClaudeKey(value)
    saveSetting('voxide_claude_key', value)
  }

  const handleThemeChange = (themeId: string) => {
    setSelectedTheme(themeId)
    setStoredTheme(themeId)
    window.dispatchEvent(new CustomEvent('theme-change', { detail: themeId }))
    window.electronAPI.broadcastThemeChange(themeId)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div
        className="rounded-lg w-full max-w-md mx-4 shadow-xl max-h-[90vh] flex flex-col font-mono"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <div className="flex items-center gap-2">
            <Settings size={18} style={{ color: 'var(--accent-primary)' }} />
            <h2
              className="text-lg font-semibold uppercase tracking-wider"
              style={{ color: 'var(--accent-primary)' }}
            >
              Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-red-900/30 rounded text-slate-500 hover:text-red-400"
            aria-label="Close settings"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto flex-1">
          <section>
            <h3
              className="text-sm font-semibold flex items-center gap-2 mb-3 uppercase tracking-wider"
              style={{ color: 'var(--accent-primary)' }}
            >
              <Palette size={16} style={{ color: 'var(--accent-secondary)' }} />
              Theme
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map(theme => (
                <button
                  key={theme.id}
                  onClick={() => handleThemeChange(theme.id)}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    selectedTheme === theme.id
                      ? 'border-cyan-500 bg-cyan-900/20'
                      : 'border-slate-700 hover:border-slate-600 bg-[#0a0f14]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-4 h-4 rounded-full border border-slate-600"
                      style={{ backgroundColor: theme.colors.accentPrimary }}
                    />
                    <span className="text-sm font-medium text-slate-200">{theme.name}</span>
                  </div>
                  <p className="text-xs text-slate-500">{theme.description}</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3
              className="text-sm font-semibold flex items-center gap-2 mb-3 uppercase tracking-wider"
              style={{ color: 'var(--accent-primary)' }}
            >
              <Mic size={16} style={{ color: 'var(--accent-secondary)' }} />
              Microphone
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-200">Input device</span>
                <button
                  onClick={loadDevices}
                  className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                  aria-label="Refresh device list"
                >
                  <RefreshCw size={12} className={isLoadingDevices ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>
              <select
                value={selectedDevice || ''}
                onChange={e => handleDeviceChange(e.target.value)}
                className="w-full px-2 py-1 rounded text-sm focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">System default</option>
                {devices.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section>
            <h3
              className="text-sm font-semibold flex items-center gap-2 mb-3 uppercase tracking-wider"
              style={{ color: 'var(--accent-primary)' }}
            >
              <Mic size={16} style={{ color: 'var(--accent-secondary)' }} />
              Speech recognition vocabulary
            </h3>
            <p className="text-xs text-slate-500 mb-2">
              One term per line. Useful for code identifiers and jargon Deepgram often mishears
              (e.g. variable names, library names, your own naming conventions).
            </p>
            <textarea
              value={keywordBoosts}
              onChange={e => handleKeywordBoostsChange(e.target.value)}
              placeholder={'VoxIDE\nuseConversation\nDeepgram\nmonorepo'}
              rows={4}
              className="w-full px-3 py-2 rounded text-sm focus:outline-none resize-none font-mono"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              aria-label="Speech recognition vocabulary"
            />
          </section>

          <section>
            <h3
              className="text-sm font-semibold flex items-center gap-2 mb-3 uppercase tracking-wider"
              style={{ color: 'var(--accent-primary)' }}
            >
              <Key size={16} style={{ color: 'var(--accent-secondary)' }} />
              API keys
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              VoxIDE is bring-your-own-key. Keys are stored in localStorage on this machine and
              sent only to the respective providers. For more secure storage, set
              VOXIDE_DEEPGRAM_KEY and VOXIDE_CLAUDE_KEY as environment variables when launching
              VoxIDE; bundled env vars take precedence over keys entered here.
            </p>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="deepgram-key"
                  className="text-sm text-slate-200 block mb-1"
                >
                  Deepgram API key
                </label>
                <input
                  id="deepgram-key"
                  type="password"
                  value={deepgramKey}
                  onChange={e => handleDeepgramKeyChange(e.target.value)}
                  placeholder="dg_..."
                  className="w-full px-3 py-2 rounded text-sm focus:outline-none font-mono"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="claude-key"
                  className="text-sm text-slate-200 block mb-1"
                >
                  Anthropic (Claude) API key
                </label>
                <input
                  id="claude-key"
                  type="password"
                  value={claudeKey}
                  onChange={e => handleClaudeKeyChange(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2 rounded text-sm focus:outline-none font-mono"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
