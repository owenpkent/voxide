import { useState, useCallback, useRef } from 'react'

// ============================================================================
// Types
// ============================================================================

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface UseConversationOptions {
  apiKey: string | null
  speak: (text: string, options?: { priority?: 'queue' | 'interrupt' }) => void
  playEarcon: (type: string) => void
  /** Optional editor context to give the AI awareness of what's open */
  editorContext?: {
    filePath: string | null
    content: string | null
    cursorLine: number
  }
}

interface UseConversationReturn {
  messages: ConversationMessage[]
  isThinking: boolean
  sendMessage: (text: string) => Promise<void>
  clearHistory: () => void
}

// ============================================================================
// Constants
// ============================================================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const SYSTEM_PROMPT = `You are VoxIDE Assistant, a helpful AI built into an accessible voice-controlled IDE designed for blind and mobility-impaired developers.

Key behaviors:
- Keep responses concise and conversational — they will be read aloud via text-to-speech
- Avoid long code blocks in conversation mode — summarize what the code does instead
- When the user asks about code, refer to their currently open file if context is provided
- Use plain language, not markdown formatting (no asterisks, backticks, or headers — TTS reads those literally)
- If the user asks you to write code, provide it clearly but briefly, and explain what it does
- You can help with: explaining code, answering programming questions, debugging, writing snippets, general knowledge
- Be warm but efficient — respect that every word is being spoken aloud

If the user provides editor context (current file, cursor position), use it to give contextual answers.`

// ============================================================================
// Chunk response into TTS-friendly segments
// ============================================================================

/** Split a response into sentence-ish chunks for progressive TTS reading */
export function chunkForTTS(text: string): string[] {
  // Clean markdown artifacts that TTS would read literally
  let cleaned = text
    .replace(/```[\s\S]*?```/g, (match) => {
      // Replace code blocks with a spoken description
      const lines = match.split('\n').filter(l => !l.startsWith('```'))
      return `Code: ${lines.slice(0, 3).join('. ')}${lines.length > 3 ? `. And ${lines.length - 3} more lines.` : ''}`
    })
    .replace(/`([^`]+)`/g, '$1')     // inline code: remove backticks
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1')     // italic
    .replace(/#{1,6}\s+/g, '')         // headers
    .replace(/^[-*]\s+/gm, '')         // bullet points
    .replace(/^\d+\.\s+/gm, '')        // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links: keep text, drop URL

  // Split on sentence boundaries
  const sentences = cleaned.split(/(?<=[.!?])\s+/)

  // Group into chunks of ~1-2 sentences (so TTS doesn't have to wait for entire response)
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current.length + sentence.length > 200 && current.length > 0) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current = current ? current + ' ' + sentence : sentence
    }
  }
  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks.length > 0 ? chunks : [cleaned]
}

// ============================================================================
// Hook
// ============================================================================

export function useConversation(options: UseConversationOptions): UseConversationReturn {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const sendMessage = useCallback(async (text: string) => {
    const opts = optionsRef.current
    if (!opts.apiKey) {
      opts.speak('Please set your Claude API key first.', { priority: 'interrupt' })
      return
    }

    if (!text.trim()) return

    // Add user message
    const userMsg: ConversationMessage = { role: 'user', content: text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setIsThinking(true)

    try {
      // Build message history (last 20 messages for context window management)
      const history = [...messages.slice(-20), userMsg].map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      // Build system prompt with optional editor context
      let system = SYSTEM_PROMPT
      if (opts.editorContext?.filePath) {
        system += `\n\nCurrently open file: ${opts.editorContext.filePath}`
        system += `\nCursor at line: ${opts.editorContext.cursorLine}`
        if (opts.editorContext.content) {
          // Include nearby code (20 lines around cursor)
          const lines = opts.editorContext.content.split('\n')
          const start = Math.max(0, opts.editorContext.cursorLine - 10)
          const end = Math.min(lines.length, opts.editorContext.cursorLine + 10)
          system += `\nNearby code (lines ${start + 1}-${end}):\n${lines.slice(start, end).join('\n')}`
        }
      }

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system,
          messages: history,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error?.message || `API error: ${response.status}`)
      }

      const data = await response.json()
      const assistantText = data.content?.[0]?.text || 'Sorry, I could not generate a response.'

      // Add assistant message
      const assistantMsg: ConversationMessage = {
        role: 'assistant',
        content: assistantText,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, assistantMsg])

      // Read response aloud, chunked for progressive TTS
      const chunks = chunkForTTS(assistantText)
      for (const chunk of chunks) {
        opts.speak(chunk)
      }
      opts.playEarcon('success')

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error'
      opts.speak(`Sorry, there was an error: ${errMsg}`, { priority: 'interrupt' })
      opts.playEarcon('error')

      // Add error as assistant message so user sees it in the log
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${errMsg}`,
        timestamp: Date.now(),
      }])
    } finally {
      setIsThinking(false)
    }
  }, [messages])

  const clearHistory = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isThinking,
    sendMessage,
    clearHistory,
  }
}
