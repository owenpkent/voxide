import { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { Mic, MicOff, FolderOpen, Save, Settings, Volume2, VolumeX, ChevronRight, ChevronDown, FileText, Folder } from 'lucide-react'
import { useTTS } from '../hooks/useTTS'
import { useVoiceCommands } from '../hooks/useVoiceCommands'
import { useConversation } from '../hooks/useConversation'

// ============================================================================
// Types
// ============================================================================

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
  expanded?: boolean
}

interface VoiceLogEntry {
  type: 'user' | 'system' | 'error'
  text: string
  timestamp: number
}

// ============================================================================
// File Tree Component
// ============================================================================

function FileTreeItem({
  node,
  depth,
  onFileClick,
  onToggle,
}: {
  node: FileNode
  depth: number
  onFileClick: (path: string) => void
  onToggle: (path: string) => void
}) {
  return (
    <div>
      <button
        className="w-full text-left flex items-center gap-1 py-1 px-2 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-yellow-400"
        style={{
          paddingLeft: `${depth * 16 + 8}px`,
          color: 'var(--text-primary)',
          fontSize: '14px',
        }}
        onClick={() => node.isDirectory ? onToggle(node.path) : onFileClick(node.path)}
        aria-label={`${node.isDirectory ? 'Folder' : 'File'}: ${node.name}`}
        role="treeitem"
        aria-expanded={node.isDirectory ? node.expanded : undefined}
      >
        {node.isDirectory ? (
          node.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
        ) : (
          <FileText size={14} style={{ color: 'var(--text-muted)' }} />
        )}
        {node.isDirectory && <Folder size={14} style={{ color: 'var(--accent-primary)' }} />}
        <span className="truncate">{node.name}</span>
      </button>
      {node.isDirectory && node.expanded && node.children?.map(child => (
        <FileTreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          onFileClick={onFileClick}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

// ============================================================================
// Main VoxIDE App
// ============================================================================

export function VoxIDEApp() {
  // File browser state
  const [currentDir, setCurrentDir] = useState<string | null>(null)
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [flatFileList, setFlatFileList] = useState<string[]>([])

  // Editor state
  const [openFilePath, setOpenFilePath] = useState<string | null>(null)
  const [openFileContent, setOpenFileContent] = useState<string>('')
  const [cursorLine, setCursorLine] = useState(1)
  const [isDirty, setIsDirty] = useState(false)
  const editorRef = useRef<any>(null)

  // Mode: 'code' for programming, 'document' for plain text, 'conversation' for AI chat
  const [editorMode, setEditorMode] = useState<'code' | 'document' | 'conversation'>(() =>
    (localStorage.getItem('voxide_editor_mode') as any) || 'code'
  )

  // Voice state
  const [isListening, setIsListening] = useState(false)
  const [deepgramKey, setDeepgramKey] = useState<string | null>(null)
  const [claudeKey, setClaudeKey] = useState<string | null>(null)
  const [keysLoading, setKeysLoading] = useState(true)
  const [verbosity, setVerbosity] = useState<'brief' | 'normal' | 'detailed'>(() =>
    (localStorage.getItem('voxide_verbosity') as any) || 'normal'
  )

  // Voice log
  const [voiceLog, setVoiceLog] = useState<VoiceLogEntry[]>([])
  const voiceLogRef = useRef<HTMLDivElement>(null)

  // Audio level
  const [audioLevel, setAudioLevel] = useState(0)
  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // TTS
  const tts = useTTS()

  // Conversation
  const conversation = useConversation({
    apiKey: claudeKey,
    speak: tts.speak,
    playEarcon: tts.playEarcon,
    editorContext: {
      filePath: openFilePath,
      content: openFileContent,
      cursorLine,
    },
  })

  // Add to voice log
  const addLog = useCallback((type: VoiceLogEntry['type'], text: string) => {
    setVoiceLog(prev => [...prev.slice(-100), { type, text, timestamp: Date.now() }])
  }, [])

  // Auto-scroll voice log
  useEffect(() => {
    if (voiceLogRef.current) {
      voiceLogRef.current.scrollTop = voiceLogRef.current.scrollHeight
    }
  }, [voiceLog])

  // ============================================================================
  // File system operations
  // ============================================================================

  const buildFileTree = useCallback(async (dirPath: string, depth = 0): Promise<FileNode[]> => {
    if (depth > 3 || !window.electronAPI) return [] // Limit depth
    const result = await window.electronAPI.fsReaddir(dirPath)
    if (!result.success || !result.entries) return []

    const nodes: FileNode[] = []
    // Sort: directories first, then alphabetical
    const sorted = result.entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__')
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    for (const entry of sorted) {
      const fullPath = await window.electronAPI.fsJoin(dirPath, entry.name)
      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory,
        expanded: false,
        children: entry.isDirectory ? [] : undefined,
      })
    }
    return nodes
  }, [])

  const flattenTree = useCallback((nodes: FileNode[]): string[] => {
    const flat: string[] = []
    for (const node of nodes) {
      if (!node.isDirectory) {
        flat.push(node.path)
      }
      if (node.children) {
        flat.push(...flattenTree(node.children))
      }
    }
    return flat
  }, [])

  const navigateToDir = useCallback(async (dirPath: string) => {
    if (!window.electronAPI) return
    const tree = await buildFileTree(dirPath)
    setCurrentDir(dirPath)
    setFileTree(tree)
    setFlatFileList(flattenTree(tree))
    await window.electronAPI.setCurrentDir(dirPath)
    localStorage.setItem('voxide_last_dir', dirPath)

    const dirName = dirPath.split(/[/\\]/).pop() || dirPath
    const fileCount = tree.filter(n => !n.isDirectory).length
    const dirCount = tree.filter(n => n.isDirectory).length
    tts.speak(`${dirName}. ${fileCount} files, ${dirCount} folders.`)
    tts.playEarcon('navigation')
    addLog('system', `Navigated to: ${dirPath}`)
  }, [buildFileTree, flattenTree, tts, addLog])

  const openProject = useCallback(async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.openDirectory()
    if (result.success && result.path) {
      await navigateToDir(result.path)
    }
  }, [navigateToDir])

  const goToFolder = useCallback(async (folderName: string) => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.getKnownFolder(folderName)
    if (result.success && result.path) {
      await navigateToDir(result.path)
    } else {
      tts.speak(`Could not find ${folderName} folder.`, { priority: 'interrupt' })
      tts.playEarcon('error')
    }
  }, [navigateToDir, tts])

  const goUp = useCallback(async () => {
    if (!window.electronAPI || !currentDir) return
    const parent = await window.electronAPI.fsDirname(currentDir)
    if (parent && parent !== currentDir) {
      await navigateToDir(parent)
    } else {
      tts.speak('Already at the top level.')
    }
  }, [currentDir, navigateToDir, tts])

  const enterFolder = useCallback(async (name: string) => {
    if (!window.electronAPI || !currentDir) return
    // Fuzzy match folder name in current tree
    const match = fileTree.find(n => n.isDirectory && n.name.toLowerCase() === name.toLowerCase())
      || fileTree.find(n => n.isDirectory && n.name.toLowerCase().includes(name.toLowerCase()))
    if (match) {
      await navigateToDir(match.path)
    } else {
      tts.speak(`No folder named ${name} here.`, { priority: 'interrupt' })
      tts.playEarcon('error')
    }
  }, [currentDir, fileTree, navigateToDir, tts])

  const listDrives = useCallback(async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.getDrives()
    if (result.success && result.drives.length > 0) {
      tts.speak(`Available drives: ${result.drives.join(', ')}.`)
    } else {
      tts.speak('Could not list drives.')
    }
  }, [tts])

  const goToDrive = useCallback(async (letter: string) => {
    await navigateToDir(`${letter}:\\`)
  }, [navigateToDir])

  const getCurrentLocation = useCallback(() => {
    if (currentDir) {
      tts.speak(`You are in ${currentDir}.`, { priority: 'interrupt' })
    } else {
      tts.speak('No directory is open.', { priority: 'interrupt' })
    }
  }, [currentDir, tts])

  const toggleDirectory = useCallback(async (dirPath: string) => {
    const toggle = async (nodes: FileNode[]): Promise<FileNode[]> => {
      const result: FileNode[] = []
      for (const node of nodes) {
        if (node.path === dirPath && node.isDirectory) {
          if (!node.expanded && (!node.children || node.children.length === 0)) {
            // Load children
            const children = await buildFileTree(dirPath, 1)
            result.push({ ...node, expanded: true, children })
          } else {
            result.push({ ...node, expanded: !node.expanded })
          }
        } else if (node.children) {
          result.push({ ...node, children: await toggle(node.children) })
        } else {
          result.push(node)
        }
      }
      return result
    }
    const newTree = await toggle(fileTree)
    setFileTree(newTree)
    setFlatFileList(flattenTree(newTree))
  }, [fileTree, buildFileTree, flattenTree])

  const openFile = useCallback(async (filePath: string) => {
    if (!window.electronAPI) return
    // Save current file if dirty
    if (isDirty && openFilePath) {
      await window.electronAPI.fsWriteFile(openFilePath, openFileContent)
    }

    const result = await window.electronAPI.fsReadFile(filePath)
    if (result.success && result.content !== undefined) {
      setOpenFilePath(filePath)
      setOpenFileContent(result.content)
      setIsDirty(false)
      setCursorLine(1)
      const filename = filePath.split(/[/\\]/).pop()
      const lineCount = result.content.split('\n').length
      tts.speak(`Opened ${filename}. ${lineCount} lines.`)
      tts.playEarcon('file-open')
      addLog('system', `Opened: ${filename}`)
    } else {
      tts.speak(`Failed to open file: ${result.error || 'unknown error'}.`, { priority: 'interrupt' })
      tts.playEarcon('error')
      addLog('error', `Failed to open: ${result.error}`)
    }
  }, [isDirty, openFilePath, openFileContent, tts, addLog])

  const saveFile = useCallback(async () => {
    if (!window.electronAPI || !openFilePath) {
      tts.speak('No file is open to save.', { priority: 'interrupt' })
      return
    }
    const result = await window.electronAPI.fsWriteFile(openFilePath, openFileContent)
    if (result.success) {
      setIsDirty(false)
      tts.speak('File saved.')
      tts.playEarcon('file-save')
      addLog('system', 'File saved.')
    } else {
      tts.speak(`Save failed: ${result.error}.`, { priority: 'interrupt' })
      tts.playEarcon('error')
      addLog('error', `Save failed: ${result.error}`)
    }
  }, [openFilePath, openFileContent, tts, addLog])

  const createFile = useCallback(async (name: string) => {
    if (!window.electronAPI || !currentDir) {
      tts.speak('Navigate to a folder first.', { priority: 'interrupt' })
      return
    }
    const filePath = await window.electronAPI.fsJoin(currentDir, name)
    const result = await window.electronAPI.fsCreateFile(filePath)
    if (result.success) {
      // Refresh file tree
      const tree = await buildFileTree(currentDir)
      setFileTree(tree)
      setFlatFileList(flattenTree(tree))
      await openFile(filePath)
    } else {
      tts.speak(`Failed to create file: ${result.error}.`, { priority: 'interrupt' })
      tts.playEarcon('error')
    }
  }, [currentDir, buildFileTree, flattenTree, openFile, tts])

  // ============================================================================
  // Editor operations
  // ============================================================================

  const goToLine = useCallback((line: number) => {
    if (!editorRef.current) return
    const editor = editorRef.current
    const model = editor.getModel()
    if (!model) return

    const targetLine = line === -1 ? model.getLineCount() : line
    editor.revealLineInCenter(targetLine)
    editor.setPosition({ lineNumber: targetLine, column: 1 })
    editor.focus()
    setCursorLine(targetLine)
  }, [])

  const insertText = useCallback((text: string) => {
    if (!editorRef.current) return
    const editor = editorRef.current
    const position = editor.getPosition()
    if (position) {
      editor.executeEdits('voice-insert', [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
        text: text,
      }])
    }
  }, [])

  const handleUndo = useCallback(() => {
    editorRef.current?.trigger('voice', 'undo', null)
  }, [])

  const handleRedo = useCallback(() => {
    editorRef.current?.trigger('voice', 'redo', null)
  }, [])

  const handleSelectAll = useCallback(() => {
    if (!editorRef.current) return
    const model = editorRef.current.getModel()
    if (model) {
      editorRef.current.setSelection({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: model.getLineCount(),
        endColumn: model.getLineMaxColumn(model.getLineCount()),
      })
    }
  }, [])

  const handleNewLine = useCallback(() => {
    insertText('\n')
  }, [insertText])

  const handleInsertPunctuation = useCallback((char: string) => {
    if (!editorRef.current) return
    const editor = editorRef.current
    const position = editor.getPosition()
    if (position) {
      // Insert punctuation, potentially replacing trailing space
      const model = editor.getModel()
      if (model) {
        const lineContent = model.getLineContent(position.lineNumber)
        const beforeCursor = lineContent.substring(0, position.column - 1)
        // Remove trailing space before punctuation
        const trimCol = beforeCursor.endsWith(' ') ? position.column - 1 : position.column
        editor.executeEdits('voice-punctuation', [{
          range: {
            startLineNumber: position.lineNumber,
            startColumn: trimCol,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: char + ' ',
        }])
      }
    }
  }, [])

  const readCode = useCallback((readVerbosity: 'brief' | 'normal' | 'detailed', range?: { start: number; end: number }) => {
    if (!openFileContent) {
      tts.speak('No file is open.', { priority: 'interrupt' })
      return
    }
    if (range) {
      const lines = openFileContent.split('\n')
      const slice = lines.slice(range.start - 1, range.end).join('\n')
      tts.speakCode(slice, 'detailed')
    } else {
      tts.speakCode(openFileContent, readVerbosity)
    }
  }, [openFileContent, tts])

  const listFiles = useCallback(() => {
    if (fileTree.length === 0) {
      tts.speak('No project is open. Say open project to get started.')
      return
    }
    const names = fileTree.map(n => `${n.isDirectory ? 'folder' : 'file'} ${n.name}`).join(', ')
    tts.speak(`Files in project: ${names}.`)
  }, [fileTree, tts])

  const runCommand = useCallback(async (command: string) => {
    if (!window.electronAPI) return
    addLog('user', `$ ${command}`)
    const result = await window.electronAPI.shellExec(command)
    if (result.success) {
      const output = result.stdout?.trim() || 'Command completed with no output.'
      addLog('system', output)
      // Read first few lines of output
      const lines = output.split('\n')
      if (lines.length <= 5) {
        tts.speak(`Output: ${output}`)
      } else {
        tts.speak(`Output: ${lines.slice(0, 3).join('. ')}. And ${lines.length - 3} more lines.`)
      }
      tts.playEarcon('success')
    } else {
      const errMsg = result.stderr?.trim() || result.error || 'Unknown error'
      addLog('error', errMsg)
      tts.speak(`Command failed: ${errMsg.substring(0, 200)}.`, { priority: 'interrupt' })
      tts.playEarcon('error')
    }
  }, [tts, addLog])

  // ============================================================================
  // Voice Commands
  // ============================================================================

  const { processTranscript, isProcessing: isCommandProcessing, lastCommand } = useVoiceCommands({
    currentDir,
    openFilePath,
    editorContent: openFileContent,
    cursorLine,
    fileTree: flatFileList,
    editorMode,
    onOpenFile: openFile,
    onGoToLine: goToLine,
    onReadCode: readCode,
    onInsertText: insertText,
    onSaveFile: saveFile,
    onCreateFile: createFile,
    onDeleteFile: () => {},
    onOpenProject: openProject,
    onListFiles: listFiles,
    onRunCommand: runCommand,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onSelectAll: handleSelectAll,
    onNewLine: handleNewLine,
    onInsertPunctuation: handleInsertPunctuation,
    onSetVerbosity: (level) => {
      setVerbosity(level)
      localStorage.setItem('voxide_verbosity', level)
    },
    onGoToFolder: goToFolder,
    onGoUp: goUp,
    onEnterFolder: enterFolder,
    onListDrives: listDrives,
    onGoToDrive: goToDrive,
    onGetCurrentLocation: getCurrentLocation,
    onSetMode: (mode) => {
      setEditorMode(mode)
      localStorage.setItem('voxide_editor_mode', mode)
    },
    onSendChat: (text) => {
      conversation.sendMessage(text)
    },
    onClearConversation: () => {
      conversation.clearHistory()
    },
    speak: tts.speak,
    speakCode: tts.speakCode,
    playEarcon: tts.playEarcon,
    stopSpeaking: tts.stop,
    claudeApiKey: claudeKey,
  })

  // ============================================================================
  // Deepgram continuous listening
  // ============================================================================

  const startListening = useCallback(async () => {
    if (!window.electronAPI || !deepgramKey) {
      tts.speak('Voice keys are still loading. Please try again in a moment.', { priority: 'interrupt' })
      return
    }

    const result = await window.electronAPI.startDeepgram(deepgramKey)
    if (result.success) {
      setIsListening(true)
      tts.playEarcon('recording-start')
      addLog('system', 'Listening started.')

      // Poll audio level
      audioLevelIntervalRef.current = setInterval(async () => {
        if (window.electronAPI?.getAudioLevel) {
          const level = await window.electronAPI.getAudioLevel()
          setAudioLevel(level)
        }
      }, 100)
    } else {
      tts.speak(`Failed to start listening: ${result.error}.`, { priority: 'interrupt' })
      addLog('error', `Listen error: ${result.error}`)
    }
  }, [deepgramKey, tts, addLog])

  const stopListening = useCallback(async () => {
    if (!window.electronAPI) return
    await window.electronAPI.stopDeepgram()
    setIsListening(false)
    setAudioLevel(0)
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current)
      audioLevelIntervalRef.current = null
    }
    tts.playEarcon('recording-stop')
    addLog('system', 'Listening stopped.')
  }, [tts, addLog])

  // Listen for Deepgram transcripts
  useEffect(() => {
    if (!window.electronAPI?.onTranscript) return
    const cleanup = window.electronAPI.onTranscript(({ transcript, isFinal }) => {
      if (transcript) {
        if (isFinal) {
          addLog('user', transcript)
          processTranscript(transcript, true)
        }
      }
    })
    return cleanup
  }, [processTranscript, addLog])

  // ============================================================================
  // Startup
  // ============================================================================

  // Load managed API keys on startup (bundled if present), else fall back to BYO keys
  useEffect(() => {
    const fetchKeys = async () => {
      if (!window.electronAPI?.getManagedKeys) {
        setKeysLoading(false)
        return
      }
      try {
        const result = await window.electronAPI.getManagedKeys()
        if (result.success) {
          if (result.deepgramKey) setDeepgramKey(result.deepgramKey)
          if (result.claudeKey) setClaudeKey(result.claudeKey)
        } else {
          console.warn('[VoxIDE] Managed keys unavailable:', result.error)
          // Fall back to any locally stored keys
          const localDg = localStorage.getItem('voxide_deepgram_key')
          const localCl = localStorage.getItem('voxide_claude_key')
          if (localDg) setDeepgramKey(localDg)
          if (localCl) setClaudeKey(localCl)
        }
      } catch (err) {
        console.error('[VoxIDE] Failed to fetch managed keys:', err)
      } finally {
        setKeysLoading(false)
      }
    }
    fetchKeys()
  }, [])

  useEffect(() => {
    if (keysLoading) return // Wait for keys before speaking welcome

    const hasKeys = deepgramKey && claudeKey
    if (hasKeys) {
      tts.speak('Welcome to VoxIDE. Say help for a list of commands, or go to documents to start writing.')
    } else {
      tts.speak('Welcome to VoxIDE. Please enter your API keys to enable voice features. Press Tab to navigate to the key fields.')
    }

    // Restore last directory or start at home
    const init = async () => {
      if (!window.electronAPI) return
      const lastDir = localStorage.getItem('voxide_last_dir')
      if (lastDir) {
        try {
          const tree = await buildFileTree(lastDir)
          setCurrentDir(lastDir)
          setFileTree(tree)
          setFlatFileList(flattenTree(tree))
          await window.electronAPI.setCurrentDir(lastDir)
        } catch {
          // Fallback to home
          const home = await window.electronAPI.getKnownFolder('home')
          if (home.success && home.path) {
            const tree = await buildFileTree(home.path)
            setCurrentDir(home.path)
            setFileTree(tree)
            setFlatFileList(flattenTree(tree))
          }
        }
      } else {
        const home = await window.electronAPI.getKnownFolder('home')
        if (home.success && home.path) {
          const tree = await buildFileTree(home.path)
          setCurrentDir(home.path)
          setFileTree(tree)
          setFlatFileList(flattenTree(tree))
        }
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysLoading])

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current)
      }
    }
  }, [])

  // ============================================================================
  // Tab-to-read: announce focused element via TTS (JAWS-like behavior)
  // ============================================================================

  useEffect(() => {
    const describeFocusedElement = (el: HTMLElement): string => {
      // 1. Use aria-label if available
      const ariaLabel = el.getAttribute('aria-label')
      if (ariaLabel) {
        const expanded = el.getAttribute('aria-expanded')
        if (expanded !== null) {
          return `${ariaLabel}, ${expanded === 'true' ? 'expanded' : 'collapsed'}`
        }
        return ariaLabel
      }

      // 2. Buttons — use text content or title
      if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
        return el.textContent?.trim() || el.getAttribute('title') || 'Button'
      }

      // 3. Inputs
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const label = el.getAttribute('aria-label')
          || document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()
          || el.getAttribute('placeholder')
          || 'Text field'
        const value = (el as HTMLInputElement).value
        return value ? `${label}: ${value}` : label
      }

      // 4. Links
      if (el.tagName === 'A') {
        return `Link: ${el.textContent?.trim() || el.getAttribute('href') || 'unknown'}`
      }

      // 5. Regions
      const role = el.getAttribute('role')
      if (role) {
        return `${el.textContent?.trim().substring(0, 80) || role}`
      }

      return el.textContent?.trim().substring(0, 80) || el.tagName.toLowerCase()
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      // Don't intercept Tab inside Monaco editor (it handles indentation)
      const target = e.target as HTMLElement
      if (target.closest('.monaco-editor')) return

      // Let the browser move focus first, then read the new target
      requestAnimationFrame(() => {
        const focused = document.activeElement as HTMLElement
        if (focused && focused !== document.body) {
          const description = describeFocusedElement(focused)
          tts.speak(description, { priority: 'interrupt' })
        }
      })
    }

    window.addEventListener('keydown', handleTab)
    return () => window.removeEventListener('keydown', handleTab)
  }, [tts])

  // Detect language from file extension
  const getLanguage = (filePath: string | null): string => {
    if (!filePath) return 'plaintext'
    const ext = filePath.split('.').pop()?.toLowerCase()
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
      swift: 'swift', rb: 'ruby', php: 'php', cs: 'csharp', cpp: 'cpp',
      c: 'c', h: 'c', md: 'markdown', json: 'json', yaml: 'yaml',
      yml: 'yaml', html: 'html', css: 'css', scss: 'scss', sql: 'sql',
      sh: 'shell', bash: 'shell', xml: 'xml', toml: 'ini',
    }
    return langMap[ext || ''] || 'plaintext'
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div
      className="h-screen w-screen flex flex-col font-mono select-none"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      role="application"
      aria-label="VoxIDE - Voice Controlled Accessible IDE"
    >
      {/* ===== Header Bar ===== */}
      <header
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
        role="banner"
      >
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold tracking-wider" style={{ color: 'var(--accent-primary)' }}>
            VoxIDE
          </h1>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              backgroundColor: editorMode === 'conversation' ? '#a855f7'
                : editorMode === 'document' ? 'var(--success)'
                : 'var(--accent-primary)',
              color: '#000',
              fontWeight: 'bold',
            }}
            aria-label={`Current mode: ${editorMode}`}
          >
            {editorMode === 'conversation' ? 'CHAT' : editorMode === 'document' ? 'DOC' : 'CODE'}
          </span>
          {currentDir && (
            <span className="text-sm truncate max-w-xs" style={{ color: 'var(--text-secondary)' }} title={currentDir}>
              {currentDir}
            </span>
          )}
          {openFilePath && (
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              / {openFilePath.split(/[/\\]/).pop()}{isDirty ? ' *' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Audio level indicator */}
          {isListening && (
            <div className="flex items-center gap-[2px] h-6" aria-label={`Audio level: ${Math.round(audioLevel * 100)}%`}>
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full transition-all duration-75"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    height: `${4 + Math.min(audioLevel * 4, 1) * 16}px`,
                    opacity: 0.3 + Math.min(audioLevel * 4, 1) * 0.7,
                  }}
                />
              ))}
            </div>
          )}

          {/* Mic toggle */}
          <button
            onClick={() => isListening ? stopListening() : startListening()}
            disabled={!deepgramKey || keysLoading}
            className="p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400"
            style={{
              backgroundColor: isListening ? 'var(--danger)' : 'var(--accent-primary)',
              color: '#ffffff',
              opacity: deepgramKey && !keysLoading ? 1 : 0.4,
            }}
            aria-label={keysLoading ? 'Loading, please wait' : isListening ? 'Stop listening' : 'Start listening'}
            title={keysLoading ? 'Loading API keys...' : isListening ? 'Stop listening' : 'Start listening'}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          {/* TTS toggle */}
          <button
            onClick={() => tts.isSpeaking ? tts.stop() : null}
            className="p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400"
            style={{ color: 'var(--text-muted)' }}
            aria-label={tts.isSpeaking ? 'Stop speaking' : 'Text to speech active'}
            title="Stop TTS"
          >
            {tts.isSpeaking ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Open project */}
          <button
            onClick={openProject}
            className="p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Open project folder"
            title="Open project"
          >
            <FolderOpen size={18} />
          </button>

          {/* Save */}
          <button
            onClick={saveFile}
            disabled={!openFilePath || !isDirty}
            className="p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400"
            style={{ color: 'var(--text-muted)', opacity: openFilePath && isDirty ? 1 : 0.3 }}
            aria-label="Save file"
            title="Save"
          >
            <Save size={18} />
          </button>
        </div>
      </header>

      {/* ===== Main Content ===== */}
      <div className="flex-1 flex min-h-0">
        {/* ===== File Tree Panel ===== */}
        <aside
          className="w-56 border-r overflow-y-auto"
          style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
          role="tree"
          aria-label="File tree"
        >
          {fileTree.length > 0 ? (
            fileTree.map(node => (
              <FileTreeItem
                key={node.path}
                node={node}
                depth={0}
                onFileClick={openFile}
                onToggle={toggleDirectory}
              />
            ))
          ) : (
            <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
              <p className="text-sm">Loading files...</p>
              <p className="text-xs mt-2">Say "go to documents" or "list drives"</p>
            </div>
          )}
        </aside>

        {/* ===== Editor + Transcript ===== */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Editor or Conversation */}
          <div className="flex-1 min-h-0" role="region" aria-label={editorMode === 'conversation' ? 'AI conversation' : 'Code editor'}>
            {editorMode === 'conversation' ? (
              /* ===== Conversation Mode ===== */
              <div
                className="h-full flex flex-col overflow-y-auto p-4 space-y-4"
                style={{ backgroundColor: 'var(--bg-primary)' }}
                role="log"
                aria-label="AI conversation"
                aria-live="polite"
              >
                {conversation.messages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <h2 className="text-xl font-bold" style={{ color: 'var(--accent-primary)' }}>
                        Conversation Mode
                      </h2>
                      <p style={{ color: 'var(--text-secondary)' }}>
                        Speak naturally — your words will be sent to Claude AI and the response will be read aloud.
                      </p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Try: "Explain what a React hook is" or "How do I sort an array in Python?"
                      </p>
                    </div>
                  </div>
                ) : (
                  conversation.messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`max-w-2xl rounded-lg p-3 ${msg.role === 'user' ? 'ml-auto' : 'mr-auto'}`}
                      style={{
                        backgroundColor: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                        color: msg.role === 'user' ? '#000' : 'var(--text-primary)',
                        border: msg.role === 'assistant' ? '1px solid var(--border-primary)' : 'none',
                      }}
                    >
                      <div className="text-xs mb-1 opacity-60">
                        {msg.role === 'user' ? 'You' : 'Claude'}
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ))
                )}
                {conversation.isThinking && (
                  <div
                    className="max-w-2xl rounded-lg p-3 mr-auto"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
                  >
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Thinking...
                    </div>
                  </div>
                )}
              </div>
            ) : openFilePath ? (
              <Editor
                height="100%"
                language={editorMode === 'document' ? 'plaintext' : getLanguage(openFilePath)}
                value={openFileContent}
                onChange={(value) => {
                  setOpenFileContent(value || '')
                  setIsDirty(true)
                }}
                onMount={(editor) => {
                  editorRef.current = editor
                  editor.onDidChangeCursorPosition((e) => {
                    setCursorLine(e.position.lineNumber)
                  })
                }}
                theme="vs-dark"
                options={{
                  accessibilitySupport: 'on',
                  ariaLabel: `${editorMode === 'document' ? 'Text' : 'Code'} editor: ${openFilePath?.split(/[/\\]/).pop() || 'untitled'}`,
                  fontSize: editorMode === 'document' ? 20 : 18,
                  lineNumbers: editorMode === 'document' ? 'off' : 'on',
                  minimap: { enabled: false },
                  wordWrap: 'on',
                  cursorBlinking: 'solid',
                  renderLineHighlight: editorMode === 'document' ? 'none' : 'all',
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                  autoClosingBrackets: editorMode === 'document' ? 'never' : 'always',
                  autoClosingQuotes: editorMode === 'document' ? 'never' : 'always',
                  lineDecorationsWidth: editorMode === 'document' ? 0 : undefined,
                  folding: editorMode !== 'document',
                  glyphMargin: editorMode !== 'document',
                  renderIndentGuides: editorMode !== 'document',
                }}
              />
            ) : (
              <div
                className="h-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--bg-primary)' }}
              >
                <div className="text-center space-y-4" role="status" aria-live="polite">
                  <h2 className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>VoxIDE</h2>
                  <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                    Voice-Controlled Accessible IDE & Text Editor
                  </p>
                  <div className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <p>Say "go to documents" to browse your Documents folder</p>
                    <p>Say "open file" to open a file from the sidebar</p>
                    <p>Say "document mode" to write plain text with your voice</p>
                    <p>Say "conversation mode" to chat with AI</p>
                    <p>Say "help" for a list of voice commands</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ===== Voice Log / Transcript Panel ===== */}
          <div
            className="h-48 border-t overflow-y-auto p-3"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-tertiary)' }}
            ref={voiceLogRef}
            role="log"
            aria-label="Voice activity log"
            aria-live="polite"
          >
            {voiceLog.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {isListening ? 'Listening... speak a command.' : 'Voice log will appear here.'}
              </p>
            ) : (
              voiceLog.map((entry, i) => (
                <div
                  key={i}
                  className="text-sm py-0.5"
                  style={{
                    color: entry.type === 'error' ? 'var(--danger)'
                      : entry.type === 'user' ? 'var(--accent-primary)'
                      : 'var(--text-secondary)',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>{' '}
                  {entry.type === 'user' ? '> ' : '  '}
                  {entry.text}
                </div>
              ))
            )}
          </div>
        </main>
      </div>

      {/* ===== Inline API Key Entry (shown only when keys missing after load) ===== */}
      {!keysLoading && (!deepgramKey || !claudeKey) && (
        <div
          className="flex items-center gap-3 px-4 py-2 border-t"
          style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--bg-secondary)' }}
          role="region"
          aria-label="API key setup"
        >
          <span className="text-xs font-bold whitespace-nowrap" style={{ color: 'var(--danger)' }}>
            API Keys Needed:
          </span>
          {!deepgramKey && (
            <input
              type="password"
              placeholder="Deepgram API key"
              aria-label="Deepgram API key"
              className="flex-1 px-2 py-1 rounded text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', maxWidth: '260px' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim()
                  if (val) {
                    setDeepgramKey(val)
                    localStorage.setItem('voxide_deepgram_key', val)
                    tts.speak('Deepgram key saved.')
                  }
                }
              }}
            />
          )}
          {!claudeKey && (
            <input
              type="password"
              placeholder="Claude API key"
              aria-label="Claude API key"
              className="flex-1 px-2 py-1 rounded text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', maxWidth: '260px' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim()
                  if (val) {
                    setClaudeKey(val)
                    localStorage.setItem('voxide_claude_key', val)
                    tts.speak('Claude key saved.')
                  }
                }
              }}
            />
          )}
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Press Enter to save</span>
        </div>
      )}

      {/* ===== Status Bar ===== */}
      <footer
        className="flex items-center justify-between px-4 py-1 border-t text-xs"
        style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-4">
          <span>{isListening ? '● Listening' : '○ Not listening'}</span>
          {isCommandProcessing && <span style={{ color: 'var(--accent-primary)' }}>Processing command...</span>}
          {lastCommand && <span>Last: {lastCommand.intent} — "{lastCommand.transcript}"</span>}
        </div>
        <div className="flex items-center gap-4">
          {openFilePath && <span>Line {cursorLine}</span>}
          <span>Mode: {editorMode}</span>
          <span>Verbosity: {verbosity}</span>
          {keysLoading && (
            <span style={{ color: 'var(--accent-primary)' }}>Loading API keys...</span>
          )}
        </div>
      </footer>

    </div>
  )
}
