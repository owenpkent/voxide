import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// chunkForTTS — mirrors the function in useConversation.ts
// Splits AI responses into TTS-friendly segments and strips markdown.
// ---------------------------------------------------------------------------

function chunkForTTS(text: string): string[] {
  let cleaned = text
    .replace(/```[\s\S]*?```/g, (match) => {
      const lines = match.split('\n').filter(l => !l.startsWith('```'))
      return `Code: ${lines.slice(0, 3).join('. ')}${lines.length > 3 ? `. And ${lines.length - 3} more lines.` : ''}`
    })
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  const sentences = cleaned.split(/(?<=[.!?])\s+/)

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
// Markdown stripping
// ============================================================================

describe('chunkForTTS — markdown stripping', () => {
  it('removes inline code backticks', () => {
    const chunks = chunkForTTS('Use the `useState` hook.')
    expect(chunks.join(' ')).toContain('useState')
    expect(chunks.join(' ')).not.toContain('`')
  })

  it('removes bold markers', () => {
    const chunks = chunkForTTS('This is **important** text.')
    expect(chunks.join(' ')).toContain('important')
    expect(chunks.join(' ')).not.toContain('**')
  })

  it('removes italic markers', () => {
    const chunks = chunkForTTS('This is *emphasized* text.')
    expect(chunks.join(' ')).toContain('emphasized')
    expect(chunks.join(' ')).not.toContain('*')
  })

  it('removes heading markers', () => {
    const chunks = chunkForTTS('## Section Title\nSome content.')
    expect(chunks.join(' ')).toContain('Section Title')
    expect(chunks.join(' ')).not.toContain('##')
  })

  it('removes bullet points', () => {
    const chunks = chunkForTTS('- First item\n- Second item')
    expect(chunks.join(' ')).toContain('First item')
    expect(chunks.join(' ')).not.toContain('- ')
  })

  it('removes numbered lists', () => {
    const chunks = chunkForTTS('1. First\n2. Second')
    expect(chunks.join(' ')).toContain('First')
    expect(chunks.join(' ')).not.toMatch(/^\d+\./)
  })

  it('extracts link text and drops URLs', () => {
    const chunks = chunkForTTS('Visit [Anthropic](https://anthropic.com) for more.')
    expect(chunks.join(' ')).toContain('Anthropic')
    expect(chunks.join(' ')).not.toContain('https://')
    expect(chunks.join(' ')).not.toContain('[')
  })

  it('replaces code blocks with spoken summary', () => {
    const code = '```typescript\nconst x = 1\nconst y = 2\nconst z = 3\n```'
    const chunks = chunkForTTS(code)
    const text = chunks.join(' ')
    expect(text).toContain('Code:')
    expect(text).not.toContain('```')
  })

  it('summarizes long code blocks', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
    const code = '```\n' + lines.join('\n') + '\n```'
    const chunks = chunkForTTS(code)
    const text = chunks.join(' ')
    expect(text).toContain('And')
    expect(text).toContain('more lines')
  })
})

// ============================================================================
// Sentence chunking
// ============================================================================

describe('chunkForTTS — sentence chunking', () => {
  it('returns a single chunk for short text', () => {
    const chunks = chunkForTTS('Hello, how are you?')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe('Hello, how are you?')
  })

  it('splits long text into multiple chunks', () => {
    const long = Array.from({ length: 10 }, (_, i) =>
      `This is sentence number ${i + 1} and it contains some words.`
    ).join(' ')
    const chunks = chunkForTTS(long)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('each chunk is under ~250 characters', () => {
    const long = Array.from({ length: 20 }, (_, i) =>
      `Sentence ${i + 1} has a moderate amount of content in it.`
    ).join(' ')
    const chunks = chunkForTTS(long)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThan(300)
    }
  })

  it('preserves all content across chunks', () => {
    const original = 'First sentence. Second sentence. Third sentence.'
    const chunks = chunkForTTS(original)
    const reassembled = chunks.join(' ')
    expect(reassembled).toContain('First sentence')
    expect(reassembled).toContain('Second sentence')
    expect(reassembled).toContain('Third sentence')
  })

  it('handles text with no sentence boundaries', () => {
    const text = 'just a long string of words without any periods or other sentence ending punctuation that goes on and on'
    const chunks = chunkForTTS(text)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks.join(' ')).toContain('just a long string')
  })

  it('handles empty string', () => {
    const chunks = chunkForTTS('')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe('')
  })
})

// ============================================================================
// Voice command patterns — conversation mode
// ============================================================================

// Duplicated regex patterns for conversation mode commands
const CONVERSATION_PATTERNS = [
  {
    pattern: /^(?:switch\s+to\s+|enter\s+)?(?:conversation|chat|talk)\s+mode$/i,
    intent: 'conversation_mode',
  },
  {
    pattern: /^(?:clear|reset)\s+(?:conversation|chat|history)$/i,
    intent: 'clear_conversation',
  },
]

function matchConversationCommand(text: string): string | null {
  for (const cmd of CONVERSATION_PATTERNS) {
    if (cmd.pattern.test(text.trim())) {
      return cmd.intent
    }
  }
  return null
}

describe('voice commands — conversation mode', () => {
  it('"conversation mode" → conversation_mode', () => {
    expect(matchConversationCommand('conversation mode')).toBe('conversation_mode')
  })

  it('"chat mode" → conversation_mode', () => {
    expect(matchConversationCommand('chat mode')).toBe('conversation_mode')
  })

  it('"talk mode" → conversation_mode', () => {
    expect(matchConversationCommand('talk mode')).toBe('conversation_mode')
  })

  it('"switch to conversation mode" → conversation_mode', () => {
    expect(matchConversationCommand('switch to conversation mode')).toBe('conversation_mode')
  })

  it('"enter chat mode" → conversation_mode', () => {
    expect(matchConversationCommand('enter chat mode')).toBe('conversation_mode')
  })

  it('"clear conversation" → clear_conversation', () => {
    expect(matchConversationCommand('clear conversation')).toBe('clear_conversation')
  })

  it('"reset chat" → clear_conversation', () => {
    expect(matchConversationCommand('reset chat')).toBe('clear_conversation')
  })

  it('"clear history" → clear_conversation', () => {
    expect(matchConversationCommand('clear history')).toBe('clear_conversation')
  })

  it('"reset conversation" → clear_conversation', () => {
    expect(matchConversationCommand('reset conversation')).toBe('clear_conversation')
  })

  it('random text does not match', () => {
    expect(matchConversationCommand('tell me about JavaScript')).toBeNull()
  })
})

// ============================================================================
// Voice command patterns — file browser navigation
// ============================================================================

const BROWSER_PATTERNS = [
  {
    pattern: /^(?:go\s+to|open|browse)\s+(?:my\s+)?(?:the\s+)?(desktop|documents|downloads|home|music|pictures|videos)$/i,
    intent: 'go_to_folder',
    extract: (m: RegExpMatchArray) => m[1].toLowerCase(),
  },
  {
    pattern: /^go\s+(?:up|back)(?:\s+(?:a|one)\s+(?:level|folder|directory))?$/i,
    intent: 'go_up',
  },
  {
    pattern: /^(?:enter|open)\s+(?:folder|directory)\s+(.+)$/i,
    intent: 'enter_folder',
    extract: (m: RegExpMatchArray) => m[1].trim(),
  },
  {
    pattern: /^(?:show|list)\s+(?:all\s+)?drives$/i,
    intent: 'list_drives',
  },
  {
    pattern: /^(?:go\s+to|open|switch\s+to)\s+(?:drive\s+)?([a-zA-Z])(?:\s+drive)?$/i,
    intent: 'go_to_drive',
    extract: (m: RegExpMatchArray) => m[1].toUpperCase(),
  },
]

function matchBrowserCommand(text: string): { intent: string; param?: string } | null {
  for (const cmd of BROWSER_PATTERNS) {
    const match = text.trim().match(cmd.pattern)
    if (match) {
      return {
        intent: cmd.intent,
        param: cmd.extract ? cmd.extract(match) : undefined,
      }
    }
  }
  return null
}

describe('voice commands — file browser', () => {
  it('"go to documents" → go_to_folder: documents', () => {
    const r = matchBrowserCommand('go to documents')
    expect(r).toEqual({ intent: 'go_to_folder', param: 'documents' })
  })

  it('"go to my desktop" → go_to_folder: desktop', () => {
    const r = matchBrowserCommand('go to my desktop')
    expect(r).toEqual({ intent: 'go_to_folder', param: 'desktop' })
  })

  it('"open the downloads" → go_to_folder: downloads', () => {
    const r = matchBrowserCommand('open the downloads')
    expect(r).toEqual({ intent: 'go_to_folder', param: 'downloads' })
  })

  it('"browse pictures" → go_to_folder: pictures', () => {
    const r = matchBrowserCommand('browse pictures')
    expect(r).toEqual({ intent: 'go_to_folder', param: 'pictures' })
  })

  it('"go to home" → go_to_folder: home', () => {
    const r = matchBrowserCommand('go to home')
    expect(r).toEqual({ intent: 'go_to_folder', param: 'home' })
  })

  it('"go up" → go_up', () => {
    expect(matchBrowserCommand('go up')).toEqual({ intent: 'go_up', param: undefined })
  })

  it('"go back" → go_up', () => {
    expect(matchBrowserCommand('go back')).toEqual({ intent: 'go_up', param: undefined })
  })

  it('"go up a level" → go_up', () => {
    expect(matchBrowserCommand('go up a level')).toEqual({ intent: 'go_up', param: undefined })
  })

  it('"go back one folder" → go_up', () => {
    expect(matchBrowserCommand('go back one folder')).toEqual({ intent: 'go_up', param: undefined })
  })

  it('"enter folder src" → enter_folder: src', () => {
    const r = matchBrowserCommand('enter folder src')
    expect(r).toEqual({ intent: 'enter_folder', param: 'src' })
  })

  it('"open directory components" → enter_folder: components', () => {
    const r = matchBrowserCommand('open directory components')
    expect(r).toEqual({ intent: 'enter_folder', param: 'components' })
  })

  it('"list drives" → list_drives', () => {
    expect(matchBrowserCommand('list drives')).toEqual({ intent: 'list_drives', param: undefined })
  })

  it('"show all drives" → list_drives', () => {
    expect(matchBrowserCommand('show all drives')).toEqual({ intent: 'list_drives', param: undefined })
  })

  it('"go to C drive" → go_to_drive: C', () => {
    const r = matchBrowserCommand('go to C drive')
    expect(r).toEqual({ intent: 'go_to_drive', param: 'C' })
  })

  it('"go to drive D" → go_to_drive: D', () => {
    const r = matchBrowserCommand('go to drive D')
    expect(r).toEqual({ intent: 'go_to_drive', param: 'D' })
  })

  it('"switch to D drive" → go_to_drive: D', () => {
    const r = matchBrowserCommand('switch to D drive')
    expect(r).toEqual({ intent: 'go_to_drive', param: 'D' })
  })

  it('unrelated text does not match', () => {
    expect(matchBrowserCommand('open file main.ts')).toBeNull()
  })
})

// ============================================================================
// Document mode — auto-capitalization
// ============================================================================

describe('document mode — auto-capitalization', () => {
  function autoCapitalize(text: string): string {
    if (text.length === 0) return text
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  it('capitalizes first letter of transcript', () => {
    expect(autoCapitalize('hello world')).toBe('Hello world')
  })

  it('leaves already capitalized text unchanged', () => {
    expect(autoCapitalize('Hello world')).toBe('Hello world')
  })

  it('handles single character', () => {
    expect(autoCapitalize('a')).toBe('A')
  })

  it('handles empty string', () => {
    expect(autoCapitalize('')).toBe('')
  })

  it('capitalizes after a number', () => {
    expect(autoCapitalize('3 things to do')).toBe('3 things to do')
  })
})
