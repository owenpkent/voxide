import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Voice command regex matching — mirrors the fast-path patterns in
// useVoiceCommands.ts. These are pure regex tests with no React dependency.
// ---------------------------------------------------------------------------

interface CommandPattern {
  pattern: RegExp
  intent: string
  extract: (match: RegExpMatchArray) => Record<string, unknown>
}

// Duplicated from useVoiceCommands.ts (module-private, pure logic)
const COMMAND_PATTERNS: CommandPattern[] = [
  // File operations — open_project MUST come before open_file (both start with "open")
  {
    pattern: /^(?:open|select|choose|pick)\s+(?:a\s+)?project(?:\s+(?:directory|folder))?$/i,
    intent: 'open_project',
    extract: () => ({}),
  },
  {
    pattern: /^(?:open|load)\s+(?:file\s+)?(.+)$/i,
    intent: 'open_file',
    extract: (m) => ({ filename: m[1].trim() }),
  },
  {
    pattern: /^(?:save|write)(?:\s+(?:file|this))?$/i,
    intent: 'save',
    extract: () => ({}),
  },
  {
    pattern: /^(?:create|new)\s+(?:file\s+)?(.+)$/i,
    intent: 'create_file',
    extract: (m) => ({ filename: m[1].trim() }),
  },
  {
    pattern: /^delete\s+(?:file\s+)?(.+)$/i,
    intent: 'delete_file',
    extract: (m) => ({ filename: m[1].trim() }),
  },
  {
    pattern: /^(?:list|show)\s+(?:all\s+)?files$/i,
    intent: 'list_files',
    extract: () => ({}),
  },
  // Navigation
  {
    pattern: /^(?:go\s+to|jump\s+to|move\s+to)\s+line\s+(\d+)$/i,
    intent: 'go_to_line',
    extract: (m) => ({ line: parseInt(m[1], 10) }),
  },
  {
    pattern: /^(?:go\s+to|jump\s+to)\s+(?:the\s+)?(?:top|beginning|start)$/i,
    intent: 'go_to_line',
    extract: () => ({ line: 1 }),
  },
  {
    pattern: /^(?:go\s+to|jump\s+to)\s+(?:the\s+)?(?:bottom|end)$/i,
    intent: 'go_to_line',
    extract: () => ({ line: -1 }),
  },
  // Code reading
  {
    pattern: /^read\s+(?:this\s+)?(?:function|method)$/i,
    intent: 'read_function',
    extract: () => ({}),
  },
  {
    pattern: /^read\s+(?:this\s+)?file$/i,
    intent: 'read_file',
    extract: () => ({}),
  },
  {
    pattern: /^read\s+line\s+(\d+)(?:\s+(?:to|through)\s+(\d+))?$/i,
    intent: 'read_lines',
    extract: (m) => ({ start: parseInt(m[1], 10), end: m[2] ? parseInt(m[2], 10) : parseInt(m[1], 10) }),
  },
  {
    pattern: /^(?:what(?:'s|\s+is)\s+(?:on\s+)?)?line\s+(\d+)$/i,
    intent: 'read_lines',
    extract: (m) => ({ start: parseInt(m[1], 10), end: parseInt(m[1], 10) }),
  },
  {
    pattern: /^(?:where\s+am\s+I|what\s+file|current\s+file)(?:\?)?$/i,
    intent: 'where_am_i',
    extract: () => ({}),
  },
  // Editing
  { pattern: /^undo$/i, intent: 'undo', extract: () => ({}) },
  { pattern: /^redo$/i, intent: 'redo', extract: () => ({}) },
  // Shell
  {
    pattern: /^(?:run|execute)\s+(?:the\s+)?(?:command\s+)?(.+)$/i,
    intent: 'run_command',
    extract: (m) => ({ command: m[1].trim() }),
  },
  // TTS control
  {
    pattern: /^(?:stop|quiet|shut\s+up|silence|hush|be\s+quiet)$/i,
    intent: 'stop_speaking',
    extract: () => ({}),
  },
  {
    pattern: /^(?:verbosity|set\s+verbosity(?:\s+to)?)\s+(brief|normal|detailed)$/i,
    intent: 'set_verbosity',
    extract: (m) => ({ level: m[1].toLowerCase() }),
  },
  // Listening control
  {
    pattern: /^(?:pause|stop)\s+listening$/i,
    intent: 'pause_listening',
    extract: () => ({}),
  },
  {
    pattern: /^(?:resume|start)\s+listening$/i,
    intent: 'resume_listening',
    extract: () => ({}),
  },
  // Help
  {
    pattern: /^(?:help|what\s+can\s+(?:I|you)\s+(?:say|do))(?:\?)?$/i,
    intent: 'help',
    extract: () => ({}),
  },
]

function matchCommand(text: string): { intent: string; params: Record<string, unknown> } | null {
  const cleaned = text.trim()
  for (const cmd of COMMAND_PATTERNS) {
    const match = cleaned.match(cmd.pattern)
    if (match) {
      return { intent: cmd.intent, params: cmd.extract(match) }
    }
  }
  return null
}

// ============================================================================
// File operation commands
// ============================================================================

describe('voice commands — file operations', () => {
  it('"open file App.tsx" → open_file with filename App.tsx', () => {
    const result = matchCommand('open file App.tsx')
    expect(result).toEqual({ intent: 'open_file', params: { filename: 'App.tsx' } })
  })

  it('"open App.tsx" → open_file (without "file" keyword)', () => {
    const result = matchCommand('open App.tsx')
    expect(result).toEqual({ intent: 'open_file', params: { filename: 'App.tsx' } })
  })

  it('"load file main.ts" → open_file', () => {
    const result = matchCommand('load file main.ts')
    expect(result).toEqual({ intent: 'open_file', params: { filename: 'main.ts' } })
  })

  it('"Open File README.md" → case insensitive', () => {
    const result = matchCommand('Open File README.md')
    expect(result).toEqual({ intent: 'open_file', params: { filename: 'README.md' } })
  })

  it('"open project" → open_project', () => {
    const result = matchCommand('open project')
    expect(result).toEqual({ intent: 'open_project', params: {} })
  })

  it('"open a project directory" → open_project', () => {
    const result = matchCommand('open a project directory')
    expect(result).toEqual({ intent: 'open_project', params: {} })
  })

  it('"select project folder" → open_project', () => {
    const result = matchCommand('select project folder')
    expect(result).toEqual({ intent: 'open_project', params: {} })
  })

  it('"save" → save', () => {
    const result = matchCommand('save')
    expect(result).toEqual({ intent: 'save', params: {} })
  })

  it('"save file" → save', () => {
    const result = matchCommand('save file')
    expect(result).toEqual({ intent: 'save', params: {} })
  })

  it('"write" → save', () => {
    const result = matchCommand('write')
    expect(result).toEqual({ intent: 'save', params: {} })
  })

  it('"create file utils.ts" → create_file', () => {
    const result = matchCommand('create file utils.ts')
    expect(result).toEqual({ intent: 'create_file', params: { filename: 'utils.ts' } })
  })

  it('"new helpers.js" → create_file', () => {
    const result = matchCommand('new helpers.js')
    expect(result).toEqual({ intent: 'create_file', params: { filename: 'helpers.js' } })
  })

  it('"delete file old.ts" → delete_file', () => {
    const result = matchCommand('delete file old.ts')
    expect(result).toEqual({ intent: 'delete_file', params: { filename: 'old.ts' } })
  })

  it('"delete temp.log" → delete_file (without "file" keyword)', () => {
    const result = matchCommand('delete temp.log')
    expect(result).toEqual({ intent: 'delete_file', params: { filename: 'temp.log' } })
  })

  it('"list files" → list_files', () => {
    const result = matchCommand('list files')
    expect(result).toEqual({ intent: 'list_files', params: {} })
  })

  it('"show all files" → list_files', () => {
    const result = matchCommand('show all files')
    expect(result).toEqual({ intent: 'list_files', params: {} })
  })
})

// ============================================================================
// Navigation commands
// ============================================================================

describe('voice commands — navigation', () => {
  it('"go to line 47" → go_to_line with line 47', () => {
    const result = matchCommand('go to line 47')
    expect(result).toEqual({ intent: 'go_to_line', params: { line: 47 } })
  })

  it('"jump to line 1" → go_to_line with line 1', () => {
    const result = matchCommand('jump to line 1')
    expect(result).toEqual({ intent: 'go_to_line', params: { line: 1 } })
  })

  it('"move to line 999" → go_to_line with line 999', () => {
    const result = matchCommand('move to line 999')
    expect(result).toEqual({ intent: 'go_to_line', params: { line: 999 } })
  })

  it('"go to the top" → go_to_line with line 1', () => {
    const result = matchCommand('go to the top')
    expect(result).toEqual({ intent: 'go_to_line', params: { line: 1 } })
  })

  it('"jump to beginning" → go_to_line with line 1', () => {
    const result = matchCommand('jump to beginning')
    expect(result).toEqual({ intent: 'go_to_line', params: { line: 1 } })
  })

  it('"go to the end" → go_to_line with line -1', () => {
    const result = matchCommand('go to the end')
    expect(result).toEqual({ intent: 'go_to_line', params: { line: -1 } })
  })

  it('"jump to bottom" → go_to_line with line -1', () => {
    const result = matchCommand('jump to bottom')
    expect(result).toEqual({ intent: 'go_to_line', params: { line: -1 } })
  })

  it('"where am I" → where_am_i', () => {
    const result = matchCommand('where am I')
    expect(result).toEqual({ intent: 'where_am_i', params: {} })
  })

  it('"where am I?" → where_am_i (with question mark)', () => {
    const result = matchCommand('where am I?')
    expect(result).toEqual({ intent: 'where_am_i', params: {} })
  })

  it('"what file" → where_am_i', () => {
    const result = matchCommand('what file')
    expect(result).toEqual({ intent: 'where_am_i', params: {} })
  })

  it('"current file" → where_am_i', () => {
    const result = matchCommand('current file')
    expect(result).toEqual({ intent: 'where_am_i', params: {} })
  })
})

// ============================================================================
// Code reading commands
// ============================================================================

describe('voice commands — code reading', () => {
  it('"read this function" → read_function', () => {
    const result = matchCommand('read this function')
    expect(result).toEqual({ intent: 'read_function', params: {} })
  })

  it('"read function" → read_function', () => {
    const result = matchCommand('read function')
    expect(result).toEqual({ intent: 'read_function', params: {} })
  })

  it('"read this method" → read_function', () => {
    const result = matchCommand('read this method')
    expect(result).toEqual({ intent: 'read_function', params: {} })
  })

  it('"read file" → read_file', () => {
    const result = matchCommand('read file')
    expect(result).toEqual({ intent: 'read_file', params: {} })
  })

  it('"read this file" → read_file', () => {
    const result = matchCommand('read this file')
    expect(result).toEqual({ intent: 'read_file', params: {} })
  })

  it('"read line 10" → read_lines start=10, end=10', () => {
    const result = matchCommand('read line 10')
    expect(result).toEqual({ intent: 'read_lines', params: { start: 10, end: 10 } })
  })

  it('"read line 5 to 20" → read_lines start=5, end=20', () => {
    const result = matchCommand('read line 5 to 20')
    expect(result).toEqual({ intent: 'read_lines', params: { start: 5, end: 20 } })
  })

  it('"read line 1 through 100" → read_lines start=1, end=100', () => {
    const result = matchCommand('read line 1 through 100')
    expect(result).toEqual({ intent: 'read_lines', params: { start: 1, end: 100 } })
  })

  it('"line 42" → read_lines (shorthand)', () => {
    const result = matchCommand('line 42')
    expect(result).toEqual({ intent: 'read_lines', params: { start: 42, end: 42 } })
  })

  it('"what\'s on line 7" → read_lines', () => {
    const result = matchCommand("what's on line 7")
    expect(result).toEqual({ intent: 'read_lines', params: { start: 7, end: 7 } })
  })

  it('"what is line 15" → read_lines', () => {
    const result = matchCommand('what is line 15')
    expect(result).toEqual({ intent: 'read_lines', params: { start: 15, end: 15 } })
  })
})

// ============================================================================
// Editing commands
// ============================================================================

describe('voice commands — editing', () => {
  it('"undo" → undo', () => {
    expect(matchCommand('undo')).toEqual({ intent: 'undo', params: {} })
  })

  it('"Undo" → case insensitive', () => {
    expect(matchCommand('Undo')).toEqual({ intent: 'undo', params: {} })
  })

  it('"redo" → redo', () => {
    expect(matchCommand('redo')).toEqual({ intent: 'redo', params: {} })
  })
})

// ============================================================================
// Shell commands
// ============================================================================

describe('voice commands — shell execution', () => {
  it('"run npm test" → run_command with command "npm test"', () => {
    const result = matchCommand('run npm test')
    expect(result).toEqual({ intent: 'run_command', params: { command: 'npm test' } })
  })

  it('"execute git status" → run_command', () => {
    const result = matchCommand('execute git status')
    expect(result).toEqual({ intent: 'run_command', params: { command: 'git status' } })
  })

  it('"run the command npm install lodash" → run_command', () => {
    const result = matchCommand('run the command npm install lodash')
    expect(result).toEqual({ intent: 'run_command', params: { command: 'npm install lodash' } })
  })

  it('"run command ls -la" → run_command', () => {
    const result = matchCommand('run command ls -la')
    expect(result).toEqual({ intent: 'run_command', params: { command: 'ls -la' } })
  })
})

// ============================================================================
// TTS and listening control
// ============================================================================

describe('voice commands — TTS control', () => {
  it('"stop" → stop_speaking', () => {
    expect(matchCommand('stop')).toEqual({ intent: 'stop_speaking', params: {} })
  })

  it('"quiet" → stop_speaking', () => {
    expect(matchCommand('quiet')).toEqual({ intent: 'stop_speaking', params: {} })
  })

  it('"shut up" → stop_speaking', () => {
    expect(matchCommand('shut up')).toEqual({ intent: 'stop_speaking', params: {} })
  })

  it('"silence" → stop_speaking', () => {
    expect(matchCommand('silence')).toEqual({ intent: 'stop_speaking', params: {} })
  })

  it('"be quiet" → stop_speaking', () => {
    expect(matchCommand('be quiet')).toEqual({ intent: 'stop_speaking', params: {} })
  })

  it('"verbosity brief" → set_verbosity', () => {
    expect(matchCommand('verbosity brief')).toEqual({ intent: 'set_verbosity', params: { level: 'brief' } })
  })

  it('"set verbosity to detailed" → set_verbosity', () => {
    expect(matchCommand('set verbosity to detailed')).toEqual({ intent: 'set_verbosity', params: { level: 'detailed' } })
  })

  it('"set verbosity normal" → set_verbosity', () => {
    expect(matchCommand('set verbosity normal')).toEqual({ intent: 'set_verbosity', params: { level: 'normal' } })
  })

  it('"pause listening" → pause_listening', () => {
    expect(matchCommand('pause listening')).toEqual({ intent: 'pause_listening', params: {} })
  })

  it('"stop listening" → pause_listening', () => {
    expect(matchCommand('stop listening')).toEqual({ intent: 'pause_listening', params: {} })
  })

  it('"resume listening" → resume_listening', () => {
    expect(matchCommand('resume listening')).toEqual({ intent: 'resume_listening', params: {} })
  })

  it('"start listening" → resume_listening', () => {
    expect(matchCommand('start listening')).toEqual({ intent: 'resume_listening', params: {} })
  })
})

// ============================================================================
// Help
// ============================================================================

describe('voice commands — help', () => {
  it('"help" → help', () => {
    expect(matchCommand('help')).toEqual({ intent: 'help', params: {} })
  })

  it('"what can I say" → help', () => {
    expect(matchCommand('what can I say')).toEqual({ intent: 'help', params: {} })
  })

  it('"what can you do?" → help', () => {
    expect(matchCommand('what can you do?')).toEqual({ intent: 'help', params: {} })
  })
})

// ============================================================================
// Non-matching (should fall through to Claude/dictation)
// ============================================================================

describe('voice commands — unmatched transcripts', () => {
  it('prose text does not match any command', () => {
    expect(matchCommand('the quick brown fox jumps over the lazy dog')).toBeNull()
  })

  it('code-like text does not match any command', () => {
    expect(matchCommand('const x equals 5')).toBeNull()
  })

  it('ambiguous text does not match', () => {
    expect(matchCommand('can you add a function called handleSubmit')).toBeNull()
  })

  it('empty string does not match', () => {
    expect(matchCommand('')).toBeNull()
  })

  it('whitespace only does not match', () => {
    expect(matchCommand('   ')).toBeNull()
  })
})
