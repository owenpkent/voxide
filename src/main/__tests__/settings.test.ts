import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Settings merge — mirrors the pattern used in main.ts when loading settings
// from disk and merging with defaults. Pure logic, no I/O.
// ---------------------------------------------------------------------------

interface AppSettings {
  selectedMicDevice: string | null
  voiceMode: 'streaming' | 'batch'
  autoStop: boolean
  autoStopDuration: number
  dictationAlwaysOnTop: boolean
  selectedTheme: string
  accessibilityContext: string
  postProcessEnabled: boolean
  quickDictationEnabled: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  selectedMicDevice: null,
  voiceMode: 'batch',
  autoStop: false,
  autoStopDuration: 30,
  dictationAlwaysOnTop: true,
  selectedTheme: 'mcrn',
  accessibilityContext: '',
  postProcessEnabled: false,
  quickDictationEnabled: true,
}

function mergeSettings(saved: Partial<AppSettings>): AppSettings {
  return { ...DEFAULT_SETTINGS, ...saved }
}

describe('mergeSettings', () => {
  it('returns all defaults when given an empty object', () => {
    const result = mergeSettings({})
    expect(result).toEqual(DEFAULT_SETTINGS)
  })

  it('overrides a single field while keeping defaults for others', () => {
    const result = mergeSettings({ selectedMicDevice: 'USB Mic' })
    expect(result.selectedMicDevice).toBe('USB Mic')
    expect(result.voiceMode).toBe('batch')
    expect(result.selectedTheme).toBe('mcrn')
  })

  it('overrides multiple fields', () => {
    const result = mergeSettings({ voiceMode: 'streaming', autoStop: true, autoStopDuration: 15 })
    expect(result.voiceMode).toBe('streaming')
    expect(result.autoStop).toBe(true)
    expect(result.autoStopDuration).toBe(15)
    expect(result.selectedMicDevice).toBeNull()
  })

  it('a saved false value is not overridden by default true', () => {
    const result = mergeSettings({ dictationAlwaysOnTop: false })
    expect(result.dictationAlwaysOnTop).toBe(false)
  })

  it('does not mutate DEFAULT_SETTINGS', () => {
    mergeSettings({ selectedTheme: 'mars', postProcessEnabled: true })
    expect(DEFAULT_SETTINGS.selectedTheme).toBe('mcrn')
    expect(DEFAULT_SETTINGS.postProcessEnabled).toBe(false)
  })

  it('unknown keys in saved data do not cause errors', () => {
    const result = mergeSettings({ selectedMicDevice: 'Mic X', ...(({ extraKey: 'ignore' }) as any) })
    expect(result.selectedMicDevice).toBe('Mic X')
  })
})
