import { useState, useEffect, useCallback, useRef } from 'react'

export type EarconType = 'success' | 'error' | 'navigation' | 'file-open' | 'file-save' | 'recording-start' | 'recording-stop'

type Priority = 'queue' | 'interrupt'

interface SpeakOptions {
  priority?: Priority
  voice?: string
  rate?: number
}

interface UseTTSReturn {
  speak: (text: string, options?: SpeakOptions) => void
  speakCode: (code: string, verbosity: 'brief' | 'normal' | 'detailed') => void
  playEarcon: (type: EarconType) => void
  stop: () => void
  isSpeaking: boolean
  setVoice: (name: string) => void
  setRate: (rate: number) => void
  rate: number
  voiceName: string
  availableVoices: SpeechSynthesisVoice[]
}

// Convert code symbols to spoken words
function symbolsToWords(code: string): string {
  return code
    .replace(/=>/g, ' arrow ')
    .replace(/===/g, ' strict equals ')
    .replace(/!==/g, ' not strict equals ')
    .replace(/==/g, ' equals ')
    .replace(/!=/g, ' not equals ')
    .replace(/&&/g, ' and ')
    .replace(/\|\|/g, ' or ')
    .replace(/<=/g, ' less than or equal ')
    .replace(/>=/g, ' greater than or equal ')
    .replace(/\+\+/g, ' increment ')
    .replace(/--/g, ' decrement ')
    .replace(/\.\.\./g, ' spread ')
}

// Detect function signatures in code
function detectFunctions(code: string): { name: string; params: string; line: number }[] {
  const functions: { name: string; params: string; line: number }[] = []
  const lines = code.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // function declarations
    let match = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/)
    if (match) {
      functions.push({ name: match[1], params: match[2], line: i + 1 })
      continue
    }
    // arrow functions assigned to const/let/var
    match = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/)
    if (match) {
      functions.push({ name: match[1], params: match[2], line: i + 1 })
      continue
    }
    // class methods
    match = line.match(/(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*\w+)?\s*\{/)
    if (match && !['if', 'for', 'while', 'switch', 'catch'].includes(match[1])) {
      functions.push({ name: match[1], params: match[2], line: i + 1 })
    }
  }

  return functions
}

// Detect import statements
function detectImports(code: string): string[] {
  const imports: string[] = []
  const lines = code.split('\n')
  for (const line of lines) {
    const match = line.match(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/)
    if (match) {
      const names = match[1] || match[2]
      const from = match[3]
      imports.push(`${names.trim()} from ${from}`)
    }
  }
  return imports
}

export function useTTS(): UseTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceName, setVoiceName] = useState(() =>
    localStorage.getItem('voxide_tts_voice') || ''
  )
  const [rate, setRateState] = useState(() =>
    parseFloat(localStorage.getItem('voxide_tts_rate') || '1.0')
  )
  const earconCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const utteranceQueueRef = useRef<SpeechSynthesisUtterance[]>([])
  const isProcessingRef = useRef(false)

  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length > 0) {
        setAvailableVoices(voices)
      }
    }
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [])

  // Process utterance queue
  const processQueue = useCallback(() => {
    if (isProcessingRef.current) return
    if (utteranceQueueRef.current.length === 0) {
      setIsSpeaking(false)
      return
    }

    isProcessingRef.current = true
    setIsSpeaking(true)

    const utterance = utteranceQueueRef.current.shift()!
    utterance.onend = () => {
      isProcessingRef.current = false
      processQueue()
    }
    utterance.onerror = () => {
      isProcessingRef.current = false
      processQueue()
    }
    window.speechSynthesis.speak(utterance)
  }, [])

  const speak = useCallback((text: string, options?: SpeakOptions) => {
    if (!text.trim()) return

    if (options?.priority === 'interrupt') {
      window.speechSynthesis.cancel()
      utteranceQueueRef.current = []
      isProcessingRef.current = false
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = options?.rate ?? rate
    utterance.pitch = 1.0

    // Set voice
    const targetVoice = options?.voice ?? voiceName
    if (targetVoice && availableVoices.length > 0) {
      const voice = availableVoices.find(v => v.name === targetVoice)
      if (voice) utterance.voice = voice
    }

    utteranceQueueRef.current.push(utterance)
    processQueue()
  }, [rate, voiceName, availableVoices, processQueue])

  const speakCode = useCallback((code: string, verbosity: 'brief' | 'normal' | 'detailed') => {
    if (!code.trim()) {
      speak('No code to read.')
      return
    }

    const lines = code.split('\n')
    const functions = detectFunctions(code)
    const imports = detectImports(code)

    switch (verbosity) {
      case 'brief': {
        const parts: string[] = []
        parts.push(`${lines.length} lines.`)
        if (imports.length > 0) parts.push(`${imports.length} imports.`)
        if (functions.length > 0) {
          parts.push(`Functions: ${functions.map(f => f.name).join(', ')}.`)
        }
        speak(parts.join(' '))
        break
      }

      case 'normal': {
        const parts: string[] = []
        parts.push(`This file has ${lines.length} lines.`)
        if (imports.length > 0) {
          parts.push(`Imports: ${imports.join('; ')}.`)
        }
        for (const fn of functions) {
          const paramDesc = fn.params.trim()
            ? `takes ${fn.params.split(',').length} parameter${fn.params.split(',').length > 1 ? 's' : ''}: ${fn.params.trim()}`
            : 'takes no parameters'
          parts.push(`Function ${fn.name} at line ${fn.line}, ${paramDesc}.`)
        }
        speak(parts.join(' '))
        break
      }

      case 'detailed': {
        // Read line by line with symbol translation
        const readable = lines
          .map((line, i) => {
            const trimmed = line.trim()
            if (!trimmed) return ''
            return `Line ${i + 1}: ${symbolsToWords(trimmed)}`
          })
          .filter(Boolean)
          .join('. ')
        speak(readable)
        break
      }
    }
  }, [speak])

  const playEarcon = useCallback((type: EarconType) => {
    // Try to load from bundled resources
    const earconPath = `../earcons/${type}.wav`
    let audio = earconCacheRef.current.get(type)
    if (!audio) {
      audio = new Audio(earconPath)
      audio.volume = 0.3
      earconCacheRef.current.set(type, audio)
    }
    audio.currentTime = 0
    audio.play().catch(() => {
      // Earcon files may not exist yet — silently ignore
    })
  }, [])

  const stop = useCallback(() => {
    window.speechSynthesis.cancel()
    utteranceQueueRef.current = []
    isProcessingRef.current = false
    setIsSpeaking(false)
  }, [])

  const setVoice = useCallback((name: string) => {
    setVoiceName(name)
    localStorage.setItem('voxide_tts_voice', name)
  }, [])

  const setRate = useCallback((newRate: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, newRate))
    setRateState(clamped)
    localStorage.setItem('voxide_tts_rate', String(clamped))
  }, [])

  return {
    speak,
    speakCode,
    playEarcon,
    stop,
    isSpeaking,
    setVoice,
    setRate,
    rate,
    voiceName,
    availableVoices,
  }
}
