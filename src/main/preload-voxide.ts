import { contextBridge, ipcRenderer } from 'electron'

// VoxIDE — Preload bridge for the accessible voice-first IDE.
// Exposes audio, Deepgram, filesystem, shell, and settings APIs.
// No GitHub auth — users provide their own API keys.
contextBridge.exposeInMainWorld('electronAPI', {
  // Managed API keys (optional, bundled at build time)
  getManagedKeys: () => ipcRenderer.invoke('keys:getManagedKeys'),

  // Audio devices
  listAudioDevices: () => ipcRenderer.invoke('audio:listDevices'),
  setAudioDevice: (deviceName: string) => ipcRenderer.invoke('audio:setDevice', deviceName),

  // Audio capture
  startAudio: () => ipcRenderer.invoke('audio:start'),
  stopAudio: () => ipcRenderer.invoke('audio:stop'),
  getAudioLevel: () => ipcRenderer.invoke('audio:getLevel'),

  // Deepgram (streaming mode — continuous listening)
  startDeepgram: (apiKey: string) => ipcRenderer.invoke('deepgram:start', apiKey),
  stopDeepgram: () => ipcRenderer.invoke('deepgram:stop'),
  onTranscript: (callback: (data: { transcript: string; isFinal: boolean }) => void) => {
    ipcRenderer.on('deepgram:transcript', (_event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('deepgram:transcript')
  },

  // Buffered recording mode (record first, transcribe after)
  startRecording: () => ipcRenderer.invoke('recording:start'),
  stopRecording: (apiKey: string) => ipcRenderer.invoke('recording:stop', apiKey),
  cancelRecording: () => ipcRenderer.invoke('recording:cancel'),

  // File system (sandboxed to project root)
  fsReaddir: (dirPath: string) => ipcRenderer.invoke('fs:readdir', dirPath),
  fsReadFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  fsWriteFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  fsCreateFile: (filePath: string, content?: string) => ipcRenderer.invoke('fs:createFile', filePath, content || ''),
  fsDeleteFile: (filePath: string) => ipcRenderer.invoke('fs:deleteFile', filePath),
  fsRename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  fsStat: (filePath: string) => ipcRenderer.invoke('fs:stat', filePath),
  fsBasename: (filePath: string) => ipcRenderer.invoke('fs:basename', filePath),
  fsJoin: (...paths: string[]) => ipcRenderer.invoke('fs:join', ...paths),
  fsExtname: (filePath: string) => ipcRenderer.invoke('fs:extname', filePath),
  fsDirname: (filePath: string) => ipcRenderer.invoke('fs:dirname', filePath),

  // Well-known folders and navigation
  getKnownFolder: (name: string) => ipcRenderer.invoke('fs:getKnownFolder', name),
  getDrives: () => ipcRenderer.invoke('fs:getDrives'),
  getCurrentDir: () => ipcRenderer.invoke('fs:getCurrentDir'),
  setCurrentDir: (dirPath: string) => ipcRenderer.invoke('fs:setCurrentDir', dirPath),

  // Dialogs
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),

  // Shell execution (sandboxed to project directory)
  shellExec: (command: string, cwd?: string) => ipcRenderer.invoke('shell:exec', command, cwd),

  // Clipboard
  copyToClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text),

  // Settings
  openSettingsWindow: () => ipcRenderer.invoke('settings:openWindow'),

  // Theme sync across windows
  broadcastThemeChange: (themeId: string) => ipcRenderer.invoke('theme:broadcast', themeId),
  onThemeChange: (callback: (themeId: string) => void) => {
    ipcRenderer.on('theme-changed', (_event, themeId) => callback(themeId))
    return () => ipcRenderer.removeAllListeners('theme-changed')
  },

  // Settings sync across windows
  broadcastSettings: (settings: Record<string, string>) => ipcRenderer.invoke('settings:broadcast', settings),
  onSettingsChanged: (callback: (settings: Record<string, string>) => void) => {
    ipcRenderer.on('settings-changed', (_event, settings) => callback(settings))
    return () => ipcRenderer.removeAllListeners('settings-changed')
  },
})

declare global {
  interface Window {
    electronAPI: {
      // Managed API keys
      getManagedKeys: () => Promise<{ success: boolean; deepgramKey?: string; claudeKey?: string; error?: string }>

      // Audio devices
      listAudioDevices: () => Promise<{ success: boolean; devices: string[]; selected: string | null; error?: string }>
      setAudioDevice: (deviceName: string) => Promise<{ success: boolean }>

      // Audio capture
      startAudio: () => Promise<{ success: boolean; error?: string }>
      stopAudio: () => Promise<{ success: boolean }>
      getAudioLevel: () => Promise<number>

      // Deepgram streaming
      startDeepgram: (apiKey: string) => Promise<{ success: boolean; error?: string }>
      stopDeepgram: () => Promise<{ success: boolean }>
      onTranscript: (callback: (data: { transcript: string; isFinal: boolean }) => void) => () => void

      // Buffered recording
      startRecording: () => Promise<{ success: boolean; error?: string }>
      stopRecording: (apiKey: string) => Promise<{
        success: boolean
        error?: string
        transcript?: string
        confidence?: number
        duration?: number
      }>
      cancelRecording: () => Promise<{ success: boolean }>

      // File system
      fsReaddir: (dirPath: string) => Promise<{ success: boolean; entries?: { name: string; isDirectory: boolean }[]; error?: string }>
      fsReadFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
      fsWriteFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
      fsCreateFile: (filePath: string, content?: string) => Promise<{ success: boolean; error?: string }>
      fsDeleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
      fsRename: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
      fsStat: (filePath: string) => Promise<{ success: boolean; size?: number; isDirectory?: boolean; modified?: string; error?: string }>
      fsBasename: (filePath: string) => Promise<string>
      fsJoin: (...paths: string[]) => Promise<string>
      fsExtname: (filePath: string) => Promise<string>
      fsDirname: (filePath: string) => Promise<string>

      // Well-known folders and navigation
      getKnownFolder: (name: string) => Promise<{ success: boolean; path?: string; error?: string }>
      getDrives: () => Promise<{ success: boolean; drives: string[]; error?: string }>
      getCurrentDir: () => Promise<{ success: boolean; path: string }>
      setCurrentDir: (dirPath: string) => Promise<{ success: boolean; error?: string }>

      // Dialogs
      openDirectory: () => Promise<{ success: boolean; path?: string }>
      openFileDialog: () => Promise<{ success: boolean; path?: string }>

      // Shell execution
      shellExec: (command: string, cwd?: string) => Promise<{
        success: boolean
        stdout?: string
        stderr?: string
        exitCode?: number
        error?: string
      }>

      // Clipboard
      copyToClipboard: (text: string) => Promise<{ success: boolean }>

      // Settings
      openSettingsWindow: () => Promise<{ success: boolean }>

      // Theme sync
      broadcastThemeChange: (themeId: string) => Promise<{ success: boolean }>
      onThemeChange: (callback: (themeId: string) => void) => () => void

      // Settings sync
      broadcastSettings: (settings: Record<string, string>) => Promise<{ success: boolean }>
      onSettingsChanged: (callback: (settings: Record<string, string>) => void) => () => void
    }
  }
}
