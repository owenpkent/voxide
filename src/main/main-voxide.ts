// VoxIDE — Voice-Controlled Accessible IDE (main process)
// A simplified, voice-first coding environment for blind and mobility-impaired users.
// Uses Deepgram Nova-3 for continuous speech recognition + Claude for intent classification.
// No GitHub auth required — users provide their own API keys.

import { app, BrowserWindow, ipcMain, Menu, globalShortcut, nativeImage, clipboard, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import { AudioCapture } from './audio'
import { DeepgramStreamer } from './deepgram'

// Disable GPU cache to prevent "Unable to move cache" errors on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-gpu-program-cache')

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let audioCapture: AudioCapture | null = null
let deepgramStreamer: DeepgramStreamer | null = null

// Settings
let audioPreWarmed = false
let deepgramKeywords: string[] = []
let selectedMicDevice: string | null = null

// Current browsing directory — user can navigate anywhere on the filesystem
let currentDirectory: string = app.getPath('home')

const isDev = process.env.ELECTRON_DEV === 'true'

// ============================================================================
// Window creation
// ============================================================================

function createMainWindow() {
  if (mainWindow) {
    mainWindow.focus()
    return
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload-voxide.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#000000',
    title: 'VoxIDE',
    show: true,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/voxide/index.html')
  } else {
    const htmlPath = path.join(__dirname, '../renderer/voxide/index.html')
    mainWindow.loadFile(htmlPath)
  }

  // Pre-warm ffmpeg for audio capture
  mainWindow.webContents.once('did-finish-load', () => {
    if (!audioCapture) {
      audioCapture = new AudioCapture(selectedMicDevice || undefined)
      audioCapture.startPersistent().then(() => {
        audioPreWarmed = true
      }).catch((err) => {
        console.error('[Audio] Pre-warm failed:', err.message)
        audioCapture = null
        audioPreWarmed = false
      })
    } else {
      audioPreWarmed = true
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Focus existing window when second instance launched
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 700,
    minWidth: 400,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload-voxide.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#000000',
    title: 'VoxIDE Settings',
    modal: false,
    alwaysOnTop: true,
  })

  if (isDev) {
    settingsWindow.loadURL('http://localhost:5173/settings/index.html')
  } else {
    const settingsPath = path.join(__dirname, '../renderer/settings/index.html')
    settingsWindow.loadFile(settingsPath)
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

// ============================================================================
// App lifecycle
// ============================================================================

app.whenReady().then(() => {
  createMainWindow()
  Menu.setApplicationMenu(null)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  audioPreWarmed = false
  if (audioCapture) {
    audioCapture.stop()
    audioCapture = null
  }
  if (deepgramStreamer) {
    deepgramStreamer.stop()
    deepgramStreamer = null
  }
})

// ============================================================================
// IPC Handlers - API Keys (BYO)
// ============================================================================

// VoxIDE is bring-your-own-key. Build-time env vars are honored as a
// convenience for personal/dev builds; otherwise the renderer should prompt
// the user for their Deepgram and Claude API keys and persist them locally.
const BUNDLED_KEYS = {
  deepgramKey: process.env.VOXIDE_DEEPGRAM_KEY || '',
  claudeKey: process.env.VOXIDE_CLAUDE_KEY || '',
}

ipcMain.handle('keys:getManagedKeys', async () => {
  if (BUNDLED_KEYS.deepgramKey && BUNDLED_KEYS.claudeKey) {
    return { success: true, ...BUNDLED_KEYS }
  }
  return {
    success: false,
    error: 'No bundled API keys. Enter your Deepgram and Claude API keys in Settings, or set VOXIDE_DEEPGRAM_KEY and VOXIDE_CLAUDE_KEY env vars at build time.',
  }
})

// ============================================================================
// IPC Handlers — Audio
// ============================================================================

ipcMain.handle('audio:listDevices', async () => {
  try {
    const devices = AudioCapture.getAvailableDevices()
    return { success: true, devices, selected: selectedMicDevice }
  } catch (error) {
    return { success: false, error: (error as Error).message, devices: [] }
  }
})

ipcMain.handle('audio:setDevice', async (_event, deviceName: string) => {
  selectedMicDevice = deviceName
  if (audioPreWarmed && audioCapture) {
    audioCapture.stop()
    audioCapture = null
    audioPreWarmed = false
    audioCapture = new AudioCapture(deviceName)
    audioCapture.startPersistent().then(() => {
      audioPreWarmed = true
    }).catch((err) => {
      console.error('[Audio] Re-warm failed:', err.message)
      audioCapture = null
    })
  }
  return { success: true }
})

ipcMain.handle('audio:start', async () => {
  try {
    audioCapture = new AudioCapture(selectedMicDevice || undefined)
    await audioCapture.start()
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('audio:stop', async () => {
  if (audioCapture) {
    audioCapture.stop()
    audioCapture = null
  }
  return { success: true }
})

ipcMain.handle('audio:getLevel', () => {
  return audioCapture?.getAudioLevel() ?? 0
})

// ============================================================================
// IPC Handlers — Deepgram streaming
// ============================================================================

ipcMain.handle('deepgram:start', async (_event, apiKey: string) => {
  try {
    if (!apiKey) return { success: false, error: 'No API key provided' }

    if (!audioCapture) {
      audioCapture = new AudioCapture(selectedMicDevice || undefined)
      await audioCapture.start()
    }

    const stream = audioCapture.enableStreaming()

    deepgramStreamer = new DeepgramStreamer(apiKey)
    await deepgramStreamer.start(
      stream,
      (transcript, isFinal) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('deepgram:transcript', { transcript, isFinal })
        }
      }
    )

    return { success: true }
  } catch (error) {
    if (audioCapture) {
      audioCapture.stop()
      audioCapture = null
    }
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('deepgram:stop', async () => {
  if (deepgramStreamer) {
    deepgramStreamer.stop()
    deepgramStreamer = null
  }
  if (audioCapture) {
    audioCapture.disableStreaming()
  }
  if (audioCapture && !audioPreWarmed) {
    audioCapture.stop()
    audioCapture = null
  }
  return { success: true }
})

// ============================================================================
// IPC Handlers — Buffered recording
// ============================================================================

ipcMain.handle('recording:start', async () => {
  try {
    if (audioCapture?.isRunning()) {
      audioCapture.startBuffering()
    } else {
      if (audioCapture) {
        audioCapture.stop()
        audioCapture = null
        audioPreWarmed = false
      }
      audioCapture = new AudioCapture(selectedMicDevice || undefined)
      audioCapture.startBuffering()
      await audioCapture.start()
    }
    return { success: true }
  } catch (error) {
    if (audioCapture) {
      audioCapture.stop()
      audioCapture = null
      audioPreWarmed = false
    }
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('recording:stop', async (_event, apiKey: string) => {
  try {
    if (!audioCapture) return { success: false, error: 'No recording in progress' }

    const audioBuffer = audioCapture.stopBuffering()
    if (!audioPreWarmed) {
      audioCapture.stop()
      audioCapture = null
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return { success: true, transcript: '' }
    }

    const streamer = new DeepgramStreamer(apiKey)
    const result = await streamer.transcribeBatch(audioBuffer, deepgramKeywords.length ? deepgramKeywords : undefined)
    return { success: true, ...result }
  } catch (error) {
    if (audioCapture && !audioPreWarmed) {
      audioCapture.stop()
      audioCapture = null
    }
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('recording:cancel', async () => {
  if (audioCapture) {
    audioCapture.stopBuffering()
    if (!audioPreWarmed) {
      audioCapture.stop()
      audioCapture = null
    }
  }
  return { success: true }
})

// ============================================================================
// IPC Handlers — File System (full access — user can browse entire computer)
// ============================================================================

// Security: validate and normalize filesystem paths
function validatePath(inputPath: string): { valid: boolean; resolved: string; error?: string } {
  // Reject null bytes (can truncate paths in C-level fs calls)
  if (inputPath.includes('\0')) {
    return { valid: false, resolved: '', error: 'Path contains null bytes' }
  }
  if (!path.isAbsolute(inputPath)) {
    return { valid: false, resolved: '', error: 'Path must be absolute' }
  }
  // Normalize to resolve .. and . segments
  const resolved = path.resolve(inputPath)
  return { valid: true, resolved }
}

ipcMain.handle('fs:readdir', async (_event, dirPath: string) => {
  try {
    const check = validatePath(dirPath)
    if (!check.valid) return { success: false, error: check.error }
    const entries = await fs.promises.readdir(check.resolved, { withFileTypes: true })
    return {
      success: true,
      entries: entries.map(e => ({
        name: e.name,
        isDirectory: e.isDirectory()
      }))
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  try {
    const check = validatePath(filePath)
    if (!check.valid) return { success: false, error: check.error }
    const content = await fs.promises.readFile(check.resolved, 'utf-8')
    return { success: true, content }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  try {
    const check = validatePath(filePath)
    if (!check.valid) return { success: false, error: check.error }
    if (typeof content !== 'string') return { success: false, error: 'Content must be a string' }
    await fs.promises.writeFile(check.resolved, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('fs:createFile', async (_event, filePath: string, content: string = '') => {
  try {
    const check = validatePath(filePath)
    if (!check.valid) return { success: false, error: check.error }
    await fs.promises.mkdir(path.dirname(check.resolved), { recursive: true })
    await fs.promises.writeFile(check.resolved, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('fs:deleteFile', async (_event, filePath: string) => {
  try {
    const check = validatePath(filePath)
    if (!check.valid) return { success: false, error: check.error }
    await fs.promises.unlink(check.resolved)
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
  try {
    const checkOld = validatePath(oldPath)
    const checkNew = validatePath(newPath)
    if (!checkOld.valid) return { success: false, error: checkOld.error }
    if (!checkNew.valid) return { success: false, error: checkNew.error }
    await fs.promises.rename(checkOld.resolved, checkNew.resolved)
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('fs:stat', async (_event, filePath: string) => {
  try {
    const check = validatePath(filePath)
    if (!check.valid) return { success: false, error: check.error }
    const stat = await fs.promises.stat(check.resolved)
    return {
      success: true,
      size: stat.size,
      isDirectory: stat.isDirectory(),
      modified: stat.mtime.toISOString(),
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('fs:basename', (_event, filePath: string) => {
  return path.basename(filePath)
})

ipcMain.handle('fs:join', (_event, ...paths: string[]) => {
  return path.join(...paths)
})

ipcMain.handle('fs:extname', (_event, filePath: string) => {
  return path.extname(filePath)
})

ipcMain.handle('fs:dirname', (_event, filePath: string) => {
  return path.dirname(filePath)
})

// ============================================================================
// IPC Handlers — Well-known folders and navigation
// ============================================================================

ipcMain.handle('fs:getKnownFolder', (_event, folderName: string) => {
  try {
    switch (folderName.toLowerCase()) {
      case 'home':       return { success: true, path: app.getPath('home') }
      case 'desktop':    return { success: true, path: app.getPath('desktop') }
      case 'documents':  return { success: true, path: app.getPath('documents') }
      case 'downloads':  return { success: true, path: app.getPath('downloads') }
      case 'music':      return { success: true, path: app.getPath('music') }
      case 'pictures':   return { success: true, path: app.getPath('pictures') }
      case 'videos':     return { success: true, path: app.getPath('videos') }
      default:           return { success: false, error: `Unknown folder: ${folderName}` }
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('fs:getDrives', async () => {
  // Windows: list available drive letters
  try {
    const drives: string[] = []
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const drivePath = `${letter}:\\`
      try {
        await fs.promises.access(drivePath)
        drives.push(drivePath)
      } catch {
        // Drive doesn't exist
      }
    }
    return { success: true, drives }
  } catch (error) {
    return { success: false, error: (error as Error).message, drives: [] }
  }
})

ipcMain.handle('fs:getCurrentDir', () => {
  return { success: true, path: currentDirectory }
})

ipcMain.handle('fs:setCurrentDir', (_event, dirPath: string) => {
  const check = validatePath(dirPath)
  if (!check.valid) return { success: false, error: check.error }
  currentDirectory = check.resolved
  return { success: true }
})

// ============================================================================
// IPC Handlers — Dialogs
// ============================================================================

ipcMain.handle('dialog:openDirectory', async () => {
  if (!mainWindow) return { success: false, error: 'No window' }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: currentDirectory,
  })
  if (!result.canceled && result.filePaths[0]) {
    currentDirectory = result.filePaths[0]
    return { success: true, path: currentDirectory }
  }
  return { success: false }
})

ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return { success: false, error: 'No window' }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    defaultPath: currentDirectory,
  })
  if (!result.canceled && result.filePaths[0]) {
    return { success: true, path: result.filePaths[0] }
  }
  return { success: false }
})

// ============================================================================
// IPC Handlers — Shell execution
// ============================================================================

ipcMain.handle('shell:exec', async (_event, command: string, cwd?: string) => {
  try {
    const workDir = cwd || currentDirectory

    // Security: reject commands with shell chaining operators
    // This prevents injection like "npm test && del /s /q C:"
    const dangerousPatterns = /[&|;`$]|>\s*>/
    if (dangerousPatterns.test(command)) {
      return { success: false, error: 'Command contains disallowed shell operators (& | ; ` $ >>). Run one command at a time.' }
    }

    // Security: reject null bytes
    if (command.includes('\0')) {
      return { success: false, error: 'Command contains invalid characters' }
    }

    return new Promise<{ success: boolean; stdout?: string; stderr?: string; exitCode?: number; error?: string }>((resolve) => {
      const child = spawn('cmd', ['/c', command], {
        cwd: workDir,
        windowsHide: true,
        timeout: 30000,
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
      child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

      child.on('close', (exitCode) => {
        resolve({ success: exitCode === 0, stdout, stderr, exitCode: exitCode ?? 1 })
      })

      child.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// ============================================================================
// IPC Handlers — Clipboard
// ============================================================================

ipcMain.handle('clipboard:write', (_event, text: string) => {
  clipboard.writeText(text)
  return { success: true }
})

// ============================================================================
// IPC Handlers — Settings
// ============================================================================

ipcMain.handle('settings:openWindow', () => {
  createSettingsWindow()
  return { success: true }
})

// Theme sync
ipcMain.handle('theme:broadcast', (_event, themeId: string) => {
  const windows = [mainWindow, settingsWindow]
  windows.forEach(win => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('theme-changed', themeId)
    }
  })
  return { success: true }
})

// Settings sync
ipcMain.handle('settings:broadcast', (_event, settings: Record<string, string>) => {
  if ('deepgram_keywords' in settings) {
    const raw = settings['deepgram_keywords'] || ''
    deepgramKeywords = raw.split('\n').map((s: string) => s.trim()).filter(Boolean)
  }
  const windows = [mainWindow, settingsWindow]
  windows.forEach(win => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('settings-changed', settings)
    }
  })
  return { success: true }
})
