import { useCallback, useRef, useState } from 'react'

export interface VoiceCommandResult {
  intent: string
  params: Record<string, unknown>
  transcript: string
  handled: boolean
}

interface UseVoiceCommandsOptions {
  currentDir: string | null
  openFilePath: string | null
  editorContent: string | null
  cursorLine: number
  fileTree: string[]
  editorMode: 'code' | 'document' | 'conversation'
  onOpenFile: (path: string) => void
  onGoToLine: (line: number) => void
  onReadCode: (verbosity: 'brief' | 'normal' | 'detailed', range?: { start: number; end: number }) => void
  onInsertText: (text: string) => void
  onSaveFile: () => void
  onCreateFile: (name: string) => void
  onDeleteFile: (path: string) => void
  onOpenProject: () => void
  onListFiles: () => void
  onRunCommand: (command: string) => void
  onUndo: () => void
  onRedo: () => void
  onSelectAll: () => void
  onNewLine: () => void
  onInsertPunctuation: (char: string) => void
  onSetVerbosity: (level: 'brief' | 'normal' | 'detailed') => void
  onGoToFolder: (folder: string) => void
  onGoUp: () => void
  onEnterFolder: (name: string) => void
  onListDrives: () => void
  onGoToDrive: (letter: string) => void
  onGetCurrentLocation: () => void
  onSetMode: (mode: 'code' | 'document' | 'conversation') => void
  onSendChat: (text: string) => void
  onClearConversation: () => void
  speak: (text: string, options?: { priority?: 'queue' | 'interrupt' }) => void
  speakCode: (code: string, verbosity: 'brief' | 'normal' | 'detailed') => void
  playEarcon: (type: string) => void
  stopSpeaking: () => void
  claudeApiKey: string | null
}

// Regex patterns for fast-path command matching
const COMMAND_PATTERNS: Array<{
  pattern: RegExp
  intent: string
  extract: (match: RegExpMatchArray) => Record<string, unknown>
}> = [
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

  // File browser navigation
  {
    pattern: /^(?:go\s+to|open|browse)\s+(?:my\s+)?(?:the\s+)?(desktop|documents|downloads|home|music|pictures|videos)$/i,
    intent: 'go_to_folder',
    extract: (m) => ({ folder: m[1].toLowerCase() }),
  },
  {
    pattern: /^go\s+(?:up|back)(?:\s+(?:a|one)\s+(?:level|folder|directory))?$/i,
    intent: 'go_up',
    extract: () => ({}),
  },
  {
    pattern: /^(?:enter|open)\s+(?:folder|directory)\s+(.+)$/i,
    intent: 'enter_folder',
    extract: (m) => ({ folder: m[1].trim() }),
  },
  {
    pattern: /^(?:where\s+am\s+I|current\s+(?:folder|directory|location)|what\s+folder)(?:\?)?$/i,
    intent: 'current_location',
    extract: () => ({}),
  },
  {
    pattern: /^(?:show|list)\s+(?:all\s+)?drives$/i,
    intent: 'list_drives',
    extract: () => ({}),
  },
  {
    pattern: /^(?:go\s+to|open|switch\s+to)\s+(?:drive\s+)?([a-zA-Z])(?:\s+drive)?$/i,
    intent: 'go_to_drive',
    extract: (m) => ({ drive: m[1].toUpperCase() }),
  },

  // Mode switching
  {
    pattern: /^(?:switch\s+to\s+|enter\s+)?(?:document|writing|text)\s+mode$/i,
    intent: 'document_mode',
    extract: () => ({}),
  },
  {
    pattern: /^(?:switch\s+to\s+|enter\s+)?code\s+mode$/i,
    intent: 'code_mode',
    extract: () => ({}),
  },

  // Dictation formatting commands (document mode)
  {
    pattern: /^new\s+(?:line|paragraph)$/i,
    intent: 'new_line',
    extract: () => ({}),
  },
  {
    pattern: /^(?:add\s+)?(?:a\s+)?period$/i,
    intent: 'insert_punctuation',
    extract: () => ({ char: '.' }),
  },
  {
    pattern: /^(?:add\s+)?(?:a\s+)?comma$/i,
    intent: 'insert_punctuation',
    extract: () => ({ char: ',' }),
  },
  {
    pattern: /^(?:add\s+)?(?:a\s+)?question\s+mark$/i,
    intent: 'insert_punctuation',
    extract: () => ({ char: '?' }),
  },
  {
    pattern: /^(?:add\s+)?(?:a\s+)?exclamation\s+(?:mark|point)$/i,
    intent: 'insert_punctuation',
    extract: () => ({ char: '!' }),
  },
  {
    pattern: /^(?:select|highlight)\s+all$/i,
    intent: 'select_all',
    extract: () => ({}),
  },

  // Editor navigation
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
    extract: () => ({ line: -1 }), // -1 = last line
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
  {
    pattern: /^undo$/i,
    intent: 'undo',
    extract: () => ({}),
  },
  {
    pattern: /^redo$/i,
    intent: 'redo',
    extract: () => ({}),
  },

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

  // Conversation mode
  {
    pattern: /^(?:switch\s+to\s+|enter\s+)?(?:conversation|chat|talk)\s+mode$/i,
    intent: 'conversation_mode',
    extract: () => ({}),
  },
  {
    pattern: /^(?:clear|reset)\s+(?:conversation|chat|history)$/i,
    intent: 'clear_conversation',
    extract: () => ({}),
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

// Send transcript to Claude for intent classification
async function classifyWithClaude(
  transcript: string,
  context: {
    openFilePath: string | null
    cursorLine: number
    nearbyCode: string | null
    fileList: string[]
    currentDir: string | null
  },
  apiKey: string
): Promise<VoiceCommandResult> {
  const systemPrompt = `You are a voice command classifier for VoxIDE, an accessible IDE controlled entirely by voice.

Given a user's spoken transcript and the current IDE context, classify the intent and extract parameters.

Return ONLY valid JSON with this structure:
{
  "intent": "open_file" | "go_to_line" | "read_code" | "edit_code" | "create_file" | "delete_file" | "save" | "run_command" | "dictation" | "help" | "unknown",
  "params": { ... },
  "dictation_text": "text to insert if intent is dictation"
}

Intent descriptions:
- open_file: User wants to open a file. params: { filename: string }
- go_to_line: Navigate to a line. params: { line: number }
- read_code: Read code aloud. params: { verbosity?: "brief"|"normal"|"detailed", start?: number, end?: number }
- edit_code: Modify code. params: { instruction: string }
- create_file: Create a new file. params: { filename: string, content?: string }
- delete_file: Delete a file. params: { filename: string }
- save: Save current file. params: {}
- run_command: Execute shell command. params: { command: string }
- dictation: User is dictating text/code to insert at cursor. Extract clean text in dictation_text.
- help: User wants help. params: {}
- unknown: Cannot classify. params: {}

If the transcript sounds like prose or code to be typed (no command keywords), classify as "dictation".

Available files in current directory: ${context.fileList.slice(0, 50).join(', ')}
Current file: ${context.openFilePath || 'none'}
Cursor at line: ${context.cursorLine}
Current directory: ${context.currentDir || 'none'}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: 'user', content: transcript }],
      }),
    })

    if (!response.ok) {
      console.error('[VoiceCommands] Claude API error:', response.status)
      return { intent: 'dictation', params: {}, transcript, handled: false }
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'
    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        intent: parsed.intent || 'unknown',
        params: { ...parsed.params, dictation_text: parsed.dictation_text },
        transcript,
        handled: true,
      }
    }
  } catch (err) {
    console.error('[VoiceCommands] Claude classification failed:', err)
  }

  // Fallback: treat as dictation
  return { intent: 'dictation', params: { dictation_text: transcript }, transcript, handled: false }
}

export function useVoiceCommands(options: UseVoiceCommandsOptions) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastCommand, setLastCommand] = useState<VoiceCommandResult | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const processTranscript = useCallback(async (text: string, isFinal: boolean) => {
    if (!isFinal || !text.trim()) return

    const opts = optionsRef.current
    const cleaned = text.trim()

    // Fast-path: try regex matching first
    for (const cmd of COMMAND_PATTERNS) {
      const match = cleaned.match(cmd.pattern)
      if (match) {
        const result: VoiceCommandResult = {
          intent: cmd.intent,
          params: cmd.extract(match),
          transcript: cleaned,
          handled: true,
        }
        setLastCommand(result)
        executeCommand(result, opts)
        return
      }
    }

    // In conversation mode, unmatched speech goes to AI chat
    if (opts.editorMode === 'conversation') {
      opts.onSendChat(cleaned)
      setLastCommand({ intent: 'chat', params: {}, transcript: cleaned, handled: true })
      return
    }

    // In document mode, unmatched speech is always dictation (skip Claude for speed)
    if (opts.editorMode === 'document') {
      // Auto-capitalize first letter of sentences
      let text = cleaned
      if (text.length > 0) {
        text = text.charAt(0).toUpperCase() + text.slice(1)
      }
      const result: VoiceCommandResult = {
        intent: 'dictation',
        params: { dictation_text: text },
        transcript: cleaned,
        handled: true,
      }
      setLastCommand(result)
      executeCommand(result, opts)
      return
    }

    // Claude fallback for complex/ambiguous commands (code mode)
    if (opts.claudeApiKey) {
      setIsProcessing(true)
      const nearbyCode = opts.editorContent
        ? opts.editorContent.split('\n').slice(Math.max(0, opts.cursorLine - 5), opts.cursorLine + 5).join('\n')
        : null

      const result = await classifyWithClaude(
        cleaned,
        {
          openFilePath: opts.openFilePath,
          cursorLine: opts.cursorLine,
          nearbyCode,
          fileList: opts.fileTree,
          currentDir: opts.currentDir,
        },
        opts.claudeApiKey
      )
      setIsProcessing(false)
      setLastCommand(result)
      executeCommand(result, opts)
    } else {
      // No Claude key — treat as dictation
      const result: VoiceCommandResult = {
        intent: 'dictation',
        params: { dictation_text: cleaned },
        transcript: cleaned,
        handled: false,
      }
      setLastCommand(result)
      executeCommand(result, opts)
    }
  }, [])

  return {
    processTranscript,
    isProcessing,
    lastCommand,
  }
}

function executeCommand(result: VoiceCommandResult, opts: UseVoiceCommandsOptions) {
  const { intent, params } = result

  switch (intent) {
    case 'open_file': {
      const filename = params.filename as string
      // Fuzzy match against file tree
      const match = opts.fileTree.find(f => {
        const base = f.split(/[/\\]/).pop() || ''
        return base.toLowerCase() === filename.toLowerCase()
      }) || opts.fileTree.find(f => {
        const base = f.split(/[/\\]/).pop() || ''
        return base.toLowerCase().includes(filename.toLowerCase())
      })
      if (match) {
        opts.onOpenFile(match)
        opts.speak(`Opening ${match.split(/[/\\]/).pop()}.`)
        opts.playEarcon('file-open')
      } else {
        opts.speak(`Could not find file ${filename}.`, { priority: 'interrupt' })
        opts.playEarcon('error')
      }
      break
    }

    case 'open_project':
      opts.onOpenProject()
      break

    case 'save':
      opts.onSaveFile()
      opts.speak('File saved.')
      opts.playEarcon('file-save')
      break

    case 'create_file': {
      const name = params.filename as string
      opts.onCreateFile(name)
      opts.speak(`Created file ${name}.`)
      opts.playEarcon('success')
      break
    }

    case 'delete_file': {
      const name = params.filename as string
      opts.speak(`Are you sure you want to delete ${name}? Say delete ${name} again to confirm.`)
      // For now, don't auto-delete — require confirmation by repeating
      break
    }

    case 'list_files':
      opts.onListFiles()
      break

    case 'go_to_line': {
      const line = params.line as number
      opts.onGoToLine(line)
      opts.speak(`Line ${line === -1 ? 'end of file' : line}.`)
      opts.playEarcon('navigation')
      break
    }

    case 'read_function':
      opts.onReadCode('normal')
      break

    case 'read_file':
      opts.onReadCode('brief')
      break

    case 'read_lines': {
      const start = params.start as number
      const end = params.end as number
      opts.onReadCode('detailed', { start, end })
      break
    }

    case 'where_am_i': {
      if (opts.openFilePath) {
        const filename = opts.openFilePath.split(/[/\\]/).pop()
        opts.speak(`You are in ${filename}, line ${opts.cursorLine}.`, { priority: 'interrupt' })
      } else {
        opts.speak('No file is open.', { priority: 'interrupt' })
      }
      break
    }

    case 'undo':
      opts.onUndo()
      opts.speak('Undo.')
      break

    case 'redo':
      opts.onRedo()
      opts.speak('Redo.')
      break

    case 'run_command': {
      const command = params.command as string
      opts.speak(`Running ${command}.`)
      opts.onRunCommand(command)
      break
    }

    case 'stop_speaking':
      opts.stopSpeaking()
      break

    case 'set_verbosity': {
      const level = params.level as 'brief' | 'normal' | 'detailed'
      opts.onSetVerbosity(level)
      opts.speak(`Verbosity set to ${level}.`)
      break
    }

    case 'pause_listening':
      opts.speak('Pausing voice input.')
      // The VoxIDEApp will handle this by stopping Deepgram
      break

    case 'resume_listening':
      opts.speak('Resuming voice input.')
      break

    case 'help':
      opts.speak(
        'File commands: open file, save, create file, delete file, list files. ' +
        'Browser commands: go to desktop, go to documents, go to downloads, go up, enter folder, list drives, go to C drive. ' +
        'Navigation: go to line number, where am I. ' +
        'Reading: read this function, read file, read line number. ' +
        'Editing: undo, redo, select all, new line, period, comma, question mark. ' +
        'Modes: document mode, code mode, conversation mode, clear conversation. ' +
        'Other: run command, verbosity brief normal or detailed, stop, pause listening, help.',
      )
      break

    case 'dictation': {
      const text = (params.dictation_text as string) || result.transcript
      opts.onInsertText(text)
      opts.speak(`Inserted: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`)
      break
    }

    case 'edit_code': {
      opts.speak('Code editing via voice is coming soon. You can dictate text directly for now.')
      break
    }

    // File browser navigation
    case 'go_to_folder': {
      const folder = params.folder as string
      opts.onGoToFolder(folder)
      break
    }

    case 'go_up':
      opts.onGoUp()
      break

    case 'enter_folder': {
      const folderName = params.folder as string
      opts.onEnterFolder(folderName)
      break
    }

    case 'current_location':
      opts.onGetCurrentLocation()
      break

    case 'list_drives':
      opts.onListDrives()
      break

    case 'go_to_drive': {
      const drive = params.drive as string
      opts.onGoToDrive(drive)
      break
    }

    // Mode switching
    case 'document_mode':
      opts.onSetMode('document')
      opts.speak('Switched to document mode. Your voice will be typed as text. Say code mode to switch back.')
      opts.playEarcon('success')
      break

    case 'code_mode':
      opts.onSetMode('code')
      opts.speak('Switched to code mode.')
      opts.playEarcon('success')
      break

    case 'conversation_mode':
      opts.onSetMode('conversation')
      opts.speak('Switched to conversation mode. Everything you say will be sent to Claude AI, and I will read the response back to you. Say code mode or document mode to switch back.')
      opts.playEarcon('success')
      break

    case 'clear_conversation':
      opts.onClearConversation()
      opts.speak('Conversation cleared.')
      opts.playEarcon('success')
      break

    // Document mode formatting
    case 'new_line':
      opts.onNewLine()
      break

    case 'insert_punctuation': {
      const char = params.char as string
      opts.onInsertPunctuation(char)
      break
    }

    case 'select_all':
      opts.onSelectAll()
      opts.speak('Selected all.')
      break

    default:
      opts.speak(`I didn't understand that command. Say help for a list of commands.`)
      opts.playEarcon('error')
  }
}
