// TODO(voxide-extraction): this panel was carried over from GitConnect Pro
// and still contains UI/handlers for Stripe billing, GitHub-tied subscriptions,
// MacroVox quick-dictation toggles, and tray behavior. Calls into electronAPI
// methods that don't exist in preload-voxide.ts are cast through `as any` so
// the file compiles; at runtime they no-op silently. Rewrite this panel for
// VoxIDE-only settings (audio device, theme, Deepgram keywords, BYO API keys).

import { useState, useEffect } from 'react'
import { Settings, Mic, X, RefreshCw, Sparkles, Loader2, CreditCard, MessageSquare, Pin, Palette } from 'lucide-react'
import { THEMES, getStoredTheme, setStoredTheme } from '../themes'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  user?: { id: number; login: string; email?: string | null } | null
  isPopup?: boolean
}

type SubscriptionStatus = 'free' | 'pro' | 'team' | 'loading'

export function SettingsPanel({ isOpen, onClose, user }: SettingsPanelProps) {
  const [devices, setDevices] = useState<string[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  // Subscription state
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>('loading')
  
  // Quick Dictation settings
  const [autoCopyOnStop, setAutoCopyOnStop] = useState(() => 
    localStorage.getItem('dictation_auto_copy') === 'true'
  )
  const [clearOnNewRecording, setClearOnNewRecording] = useState(() => 
    localStorage.getItem('dictation_clear_on_new') === 'true'
  )
  const [autoCutoffSeconds, setAutoCutoffSeconds] = useState(() => 
    localStorage.getItem('dictation_auto_cutoff') || '30'
  )
  const [alwaysOnTop, setAlwaysOnTop] = useState(() => 
    localStorage.getItem('dictation_always_on_top') !== 'false'
  )
  const [dictationEnabled, setDictationEnabled] = useState(() => 
    localStorage.getItem('deepgram_dictation') !== 'false'
  )
  const [transcriptionMode, setTranscriptionMode] = useState(() => 
    localStorage.getItem('transcription_mode') || 'batch'
  )
  const [postProcessingEnabled, setPostProcessingEnabled] = useState(() => 
    localStorage.getItem('post_processing_enabled') === 'true'
  )
  const [postProcessingContext, setPostProcessingContext] = useState(() => 
    localStorage.getItem('post_processing_context') || ''
  )
  const [autoPasteEnabled, setAutoPasteEnabled] = useState(() =>
    localStorage.getItem('dictation_auto_paste') === 'true'
  )
  const [minimizeToTray, setMinimizeToTray] = useState(() =>
    localStorage.getItem('minimize_to_tray') === 'true'
  )
  const [keywordBoosts, setKeywordBoosts] = useState(() =>
    localStorage.getItem('deepgram_keywords') || ''
  )
  
  // Theme
  const [selectedTheme, setSelectedTheme] = useState(() => getStoredTheme())

  // Check subscription status on mount
  useEffect(() => {
    const checkSub = async () => {
      console.log('[SettingsPanel] Checking subscription, user:', user)
      if (!window.electronAPI || !user) {
        console.log('[SettingsPanel] No electronAPI or user, defaulting to free')
        setSubscriptionStatus('free')
        return
      }

      try {
        console.log('[SettingsPanel] Calling checkSubscription for user id:', user.id)
        const subResult = await (window.electronAPI as any).checkSubscription?.(user.id.toString()) ?? { success: false }
        console.log('[SettingsPanel] checkSubscription result:', subResult)
        if (subResult.success && subResult.status) {
          console.log('[SettingsPanel] Setting status to:', subResult.status)
          setSubscriptionStatus(subResult.status)
        } else {
          console.log('[SettingsPanel] No status in result, defaulting to free')
          setSubscriptionStatus('free')
        }
      } catch (err) {
        console.error('[SettingsPanel] Error checking subscription:', err)
        setSubscriptionStatus('free')
      }
    }

    if (isOpen) {
      checkSub()
    }
  }, [user, isOpen])

  const loadDevices = async () => {
    setIsLoading(true)
    try {
      const result = await window.electronAPI.listAudioDevices()
      if (result.success) {
        setDevices(result.devices)
        setSelectedDevice(result.selected)
      }
    } catch (error) {
      console.error('Failed to load devices:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadDevices()
      // Sync all current settings to main process so it has the correct state after a restart
      if (window.electronAPI?.broadcastSettings) {
        const allSettings: Record<string, string> = {}
        const keys = [
          'dictation_auto_copy', 'dictation_clear_on_new', 'dictation_auto_cutoff',
          'dictation_always_on_top', 'deepgram_dictation', 'transcription_mode',
          'post_processing_enabled', 'post_processing_context', 'dictation_auto_paste',
          'deepgram_keywords', 'minimize_to_tray',
        ]
        keys.forEach(k => {
          const v = localStorage.getItem(k)
          if (v !== null) allSettings[k] = v
        })
        window.electronAPI.broadcastSettings(allSettings)
      }
    }
  }, [isOpen])

  const handleDeviceSelect = async (device: string) => {
    try {
      await window.electronAPI.setAudioDevice(device)
      setSelectedDevice(device)
    } catch (error) {
      console.error('Failed to set device:', error)
    }
  }

  // Helper to save a setting and broadcast to all windows
  const saveSetting = (key: string, value: string) => {
    localStorage.setItem(key, value)
    if (window.electronAPI?.broadcastSettings) {
      window.electronAPI.broadcastSettings({ [key]: value })
    }
  }

  const handleAutoCopyToggle = (value: boolean) => {
    setAutoCopyOnStop(value)
    saveSetting('dictation_auto_copy', String(value))
  }

  const handleClearOnNewToggle = (value: boolean) => {
    setClearOnNewRecording(value)
    saveSetting('dictation_clear_on_new', String(value))
  }

  const handleAutoCutoffChange = (value: string) => {
    setAutoCutoffSeconds(value)
    saveSetting('dictation_auto_cutoff', value)
  }

  const handleAlwaysOnTopToggle = async (value: boolean) => {
    setAlwaysOnTop(value)
    saveSetting('dictation_always_on_top', String(value))
    await (window.electronAPI as any)?.setDictationAlwaysOnTop?.(value)
  }

  const handleMinimizeToTrayToggle = async (value: boolean) => {
    setMinimizeToTray(value)
    saveSetting('minimize_to_tray', String(value))
    await (window.electronAPI as any)?.setMinimizeToTray?.(value)
  }

  const isPro = subscriptionStatus === 'pro' || subscriptionStatus === 'team'

  const handleUpgrade = async () => {
    if (!window.electronAPI || !user) return
    await (window.electronAPI as any).startCheckout?.(user)
  }

  const handleManageSubscription = async () => {
    if (!window.electronAPI || !user) return
    await (window.electronAPI as any).openBillingPortal?.(user.id.toString())
  }

  const handleAutoPasteToggle = (value: boolean) => {
    setAutoPasteEnabled(value)
    saveSetting('dictation_auto_paste', String(value))
  }

  const handleKeywordBoostsChange = (value: string) => {
    setKeywordBoosts(value)
    saveSetting('deepgram_keywords', value)
  }

  const handleThemeChange = (themeId: string) => {
    setSelectedTheme(themeId)
    setStoredTheme(themeId)
    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent('theme-change', { detail: themeId }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="rounded-lg w-full max-w-md mx-4 shadow-xl max-h-[90vh] flex flex-col font-mono" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <div className="flex items-center gap-2">
            <Settings size={18} style={{ color: 'var(--accent-primary)' }} />
            <h2 className="text-lg font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-red-900/30 rounded text-slate-500 hover:text-red-400"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="p-4 space-y-6 overflow-y-auto flex-1">
          
          {/* Theme Selector */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
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

          {/* Quick Dictation Section - Always visible, doesn't require Pro */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
              <MessageSquare size={16} style={{ color: 'var(--accent-secondary)' }} />
              Quick Dictation
            </h3>

            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-slate-200">Auto-copy on stop</span>
                  <p className="text-xs text-slate-500">Copy transcript to clipboard when recording stops</p>
                </div>
                <div 
                  onClick={() => handleAutoCopyToggle(!autoCopyOnStop)}
                  className="w-10 h-5 rounded-full transition-colors cursor-pointer"
                  style={{ backgroundColor: autoCopyOnStop ? 'var(--accent-primary)' : 'var(--bg-tertiary)' }}
                >
                  <div className={`w-4 h-4 rounded-full bg-white mt-0.5 transition-transform ${autoCopyOnStop ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-slate-200">Clear on new recording</span>
                  <p className="text-xs text-slate-500">Delete previous transcript when starting new</p>
                </div>
                <div 
                  onClick={() => handleClearOnNewToggle(!clearOnNewRecording)}
                  className="w-10 h-5 rounded-full transition-colors cursor-pointer"
                  style={{ backgroundColor: clearOnNewRecording ? 'var(--accent-primary)' : 'var(--bg-tertiary)' }}
                >
                  <div className={`w-4 h-4 rounded-full bg-white mt-0.5 transition-transform ${clearOnNewRecording ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-slate-200">Auto-paste on stop</span>
                  <p className="text-xs text-slate-500">After copying, paste into previously focused app (Windows)</p>
                </div>
                <div 
                  onClick={() => handleAutoPasteToggle(!autoPasteEnabled)}
                  className="w-10 h-5 rounded-full transition-colors cursor-pointer"
                  style={{ backgroundColor: autoPasteEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)' }}
                >
                  <div className={`w-4 h-4 rounded-full bg-white mt-0.5 transition-transform ${autoPasteEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </label>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-slate-200">Auto-cutoff</span>
                  <p className="text-xs text-slate-500">Automatically stop recording after duration</p>
                </div>
                <select
                  value={autoCutoffSeconds}
                  onChange={(e) => handleAutoCutoffChange(e.target.value)}
                  className="px-2 py-1 rounded text-sm focus:outline-none"
                  style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="15">15 sec</option>
                  <option value="30">30 sec</option>
                  <option value="45">45 sec</option>
                  <option value="60">60 sec</option>
                </select>
              </div>
            </div>
          </section>

          {/* Voice Recognition Section */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
              <Mic size={16} style={{ color: 'var(--accent-secondary)' }} />
              Voice Recognition
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-slate-200">Transcription mode</span>
                  <p className="text-xs text-slate-500">
                    {transcriptionMode === 'streaming' 
                      ? 'Words appear as you speak (real-time)' 
                      : 'Full transcript after you stop (higher accuracy)'}
                  </p>
                </div>
                <select
                  value={transcriptionMode}
                  onChange={(e) => {
                    setTranscriptionMode(e.target.value)
                    saveSetting('transcription_mode', e.target.value)
                  }}
                  className="px-2 py-1 rounded text-sm focus:outline-none"
                  style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="batch">Batch</option>
                  <option value="streaming">Streaming</option>
                </select>
              </div>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-slate-200">Dictation commands</span>
                  <p className="text-xs text-slate-500">Say "period", "comma", "new line" to insert punctuation</p>
                </div>
                <div 
                  onClick={() => {
                    const next = !dictationEnabled
                    setDictationEnabled(next)
                    saveSetting('deepgram_dictation', String(next))
                  }}
                  className="w-10 h-5 rounded-full transition-colors cursor-pointer"
                  style={{ backgroundColor: dictationEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)' }}
                >
                  <div className={`w-4 h-4 rounded-full bg-white mt-0.5 transition-transform ${dictationEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </label>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-200">Keyword boosting</span>
                </div>
                <p className="text-xs text-slate-500 mb-2">Words or phrases to boost recognition accuracy — one per line (e.g. GitConnect, OAuth, refactor)</p>
                <textarea
                  value={keywordBoosts}
                  onChange={(e) => handleKeywordBoostsChange(e.target.value)}
                  placeholder={'GitConnect\nOAuth\nrefactor\nyour-custom-term'}
                  rows={3}
                  className="w-full px-3 py-2 rounded text-sm focus:outline-none resize-none font-mono"
                  style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
                />
                <p className="text-xs text-slate-600 mt-1">Boosted terms are sent to Deepgram with each transcription request</p>
              </div>
            </div>
          </section>

          {/* AI Post-Processing Section */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
              <Sparkles size={16} style={{ color: 'var(--accent-secondary)' }} />
              AI Post-Processing
            </h3>

            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-slate-200">Clean up transcripts with AI</span>
                  <p className="text-xs text-slate-500">Uses Claude to fix speech-to-text errors after transcription</p>
                </div>
                <div 
                  onClick={() => {
                    const next = !postProcessingEnabled
                    setPostProcessingEnabled(next)
                    saveSetting('post_processing_enabled', String(next))
                  }}
                  className="w-10 h-5 rounded-full transition-colors cursor-pointer"
                  style={{ backgroundColor: postProcessingEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)' }}
                >
                  <div className={`w-4 h-4 rounded-full bg-white mt-0.5 transition-transform ${postProcessingEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </label>

              {postProcessingEnabled && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-200">Accessibility context</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">Describe your speech patterns so the AI can better correct errors (optional)</p>
                  <textarea
                    value={postProcessingContext}
                    onChange={(e) => {
                      setPostProcessingContext(e.target.value)
                      saveSetting('post_processing_context', e.target.value)
                    }}
                    placeholder={'e.g. I have a speech impediment that affects \'r\' and \'l\' sounds. Common words I use: GitConnect, OAuth, refactor.'}
                    rows={3}
                    className="w-full px-3 py-2 rounded text-sm focus:outline-none resize-none"
                    style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
                  />
                  <p className="text-xs text-slate-600 mt-1">This context is sent with each transcript to help the AI understand your speech patterns</p>
                </div>
              )}
            </div>
          </section>

          {/* Dictation Window Section - Always visible */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
              <Pin size={16} style={{ color: 'var(--accent-secondary)' }} />
              Dictation Window
            </h3>

            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-slate-200">Always on top</span>
                  <p className="text-xs text-slate-500">Keep dictation window above other windows</p>
                </div>
                <div 
                  onClick={() => handleAlwaysOnTopToggle(!alwaysOnTop)}
                  className="w-10 h-5 rounded-full transition-colors cursor-pointer"
                  style={{ backgroundColor: alwaysOnTop ? 'var(--accent-primary)' : 'var(--bg-tertiary)' }}
                >
                  <div className={`w-4 h-4 rounded-full bg-white mt-0.5 transition-transform ${alwaysOnTop ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-slate-200">Minimize to tray on close</span>
                  <p className="text-xs text-slate-500">Clicking X hides the main window instead of quitting</p>
                </div>
                <div 
                  onClick={() => handleMinimizeToTrayToggle(!minimizeToTray)}
                  className="w-10 h-5 rounded-full transition-colors cursor-pointer"
                  style={{ backgroundColor: minimizeToTray ? 'var(--accent-primary)' : 'var(--bg-tertiary)' }}
                >
                  <div className={`w-4 h-4 rounded-full bg-white mt-0.5 transition-transform ${minimizeToTray ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </label>
            </div>
          </section>

          {/* Subscription Section */}
          {user && (
            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
                <Sparkles size={16} style={{ color: 'var(--accent-secondary)' }} />
                Subscription
              </h3>
              
              {subscriptionStatus === 'loading' ? (
                <div className="flex items-center gap-2 text-slate-400">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-sm">Checking subscription...</span>
                </div>
              ) : isPro ? (
                <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-accent)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={16} style={{ color: 'var(--accent-primary)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--accent-hover)' }}>
                      {subscriptionStatus === 'team' ? 'Team' : 'Pro'} Plan
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    You have access to managed API keys for Deepgram and Claude.
                  </p>
                  <button
                    onClick={handleManageSubscription}
                    className="text-xs hover:underline flex items-center gap-1" style={{ color: 'var(--accent-primary)' }}
                  >
                    <CreditCard size={12} />
                    Manage subscription
                  </button>
                </div>
              ) : (
                <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}>
                  <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>Free Plan</p>
                  <p className="text-xs text-slate-400 mb-3">
                    Upgrade to Pro for managed API keys — no need to bring your own.
                  </p>
                  <button
                    onClick={handleUpgrade}
                    className="w-full py-2 text-white text-sm rounded flex items-center justify-center gap-2 font-medium tracking-wide" style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    <Sparkles size={14} />
                    Upgrade to Pro
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Audio Section */}
          <section>
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
              <Mic size={16} style={{ color: 'var(--accent-secondary)' }} />
              Audio Input
            </h3>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-400">Microphone</label>
                  <button
                    onClick={loadDevices}
                    disabled={isLoading}
                    className="p-1 rounded" style={{ color: 'var(--text-muted)' }}
                    title="Refresh devices"
                  >
                    <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
                
                <select
                  value={selectedDevice || ''}
                  onChange={(e) => handleDeviceSelect(e.target.value)}
                  className="w-full px-3 py-2 rounded text-sm focus:outline-none"
                  style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="">Auto-detect</option>
                  {devices.map((device) => (
                    <option key={device} value={device}>
                      {device}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* About Section */}
          <section>
            <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>About</h3>
            <div className="rounded p-3" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--accent-primary)' }}>⬡ MACROVOX</p>
              <p className="text-xs text-slate-400 mt-1">Voice Dictation for Windows</p>
              <p className="text-xs text-slate-500 mt-2">Version 1.0.0</p>
              <p className="text-xs text-slate-500 mt-1">
                © 2026 OK Studio
              </p>
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>Keyboard Shortcuts</h3>
            <div className="space-y-2 text-xs">
              {[
                { keys: 'Ctrl+Space', desc: 'Toggle Dictation' },
              ].map(({ keys, desc }) => (
                <div key={keys} className="flex items-center justify-between">
                  <span className="text-slate-400">{desc}</span>
                  <kbd className="px-2 py-0.5 rounded font-mono" style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--accent-hover)' }}>{keys}</kbd>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 flex justify-end shrink-0" style={{ borderTop: '1px solid var(--border-primary)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-white transition-colors font-medium tracking-wide"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
