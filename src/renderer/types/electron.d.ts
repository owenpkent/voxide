export {}

declare global {
  interface Window {
    electronAPI: {
      listAudioDevices: () => Promise<{ success: boolean; devices: string[]; selected: string | null; error?: string }>
      setAudioDevice: (deviceName: string) => Promise<{ success: boolean }>
      startAudio: () => Promise<{ success: boolean; error?: string }>
      stopAudio: () => Promise<{ success: boolean }>
      getAudioLevel: () => Promise<number>
      startDeepgram: (apiKey: string) => Promise<{ success: boolean; error?: string }>
      stopDeepgram: () => Promise<{ success: boolean }>
      onTranscript: (callback: (data: { transcript: string; isFinal: boolean }) => void) => () => void
      startRecording: () => Promise<{ success: boolean; error?: string }>
      stopRecording: (apiKey: string) => Promise<{ 
        success: boolean; 
        error?: string; 
        transcript?: string;
        confidence?: number;
        duration?: number;
      }>
      cancelRecording: () => Promise<{ success: boolean }>
      startDeviceFlow: (clientId: string) => Promise<{
        success: boolean
        error?: string
        user_code?: string
        verification_uri?: string
        device_code?: string
        interval?: number
      }>
      cancelDeviceFlow: () => Promise<{ success: boolean }>
      onAuthSuccess: (callback: (data: { token: string; refresh_token?: string }) => void) => () => void
      onAuthError: (callback: (data: { error: string }) => void) => () => void
      
      // Secure Token Storage (persists across app restarts)
      saveToken: (token: string) => Promise<{ success: boolean; error?: string }>
      getToken: () => Promise<{ success: boolean; token?: string; error?: string }>
      clearToken: () => Promise<{ success: boolean; error?: string }>
      refreshToken: () => Promise<{ success: boolean; token?: string; refresh_token?: string; error?: string }>
      
      openExternal: (url: string) => Promise<{ success: boolean }>
      onNavigateToFile: (callback: (path: string) => void) => () => void
      
      // GitHub User
      fetchGitHubUser: (token: string) => Promise<{ 
        success: boolean
        user?: { id: number; login: string; avatar_url: string; name: string | null; email: string | null }
        error?: string 
      }>
      
      // Subscription
      checkSubscription: (githubId: string) => Promise<{
        success: boolean
        status?: 'free' | 'pro' | 'team'
        expiresAt?: string | null
        features?: { managedApiKeys: boolean; voiceMinutes: number; aiRequests: number }
        error?: string
      }>
      syncUser: (githubUser: { id: number; login: string; email?: string | null }) => Promise<{ success: boolean; profile?: unknown; error?: string }>
      startCheckout: (githubUser: { id: number; login: string; email?: string | null }) => Promise<{ success: boolean; error?: string }>
      openBillingPortal: (githubId: string) => Promise<{ success: boolean; error?: string }>
      getManagedKeys: (githubId: string) => Promise<{
        success: boolean
        deepgramKey?: string | null
        anthropicKey?: string | null
        hasManagedKeys?: boolean
        error?: string
      }>
      
      // File System
      fsReaddir: (dirPath: string) => Promise<{ success: boolean; entries?: { name: string; isDirectory: boolean }[]; error?: string }>
      fsReadFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
      fsWriteFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
      fsBasename: (filePath: string) => Promise<string>
      fsJoin: (...paths: string[]) => Promise<string>
      fsExtname: (filePath: string) => Promise<string>
      
      // Dialogs
      openDirectory: () => Promise<{ success: boolean; path?: string }>
      openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<{ success: boolean; path?: string }>
      
      // Dictation Window
      setDictationAlwaysOnTop: (value: boolean) => Promise<{ success: boolean }>
      openSettingsWindow: () => Promise<{ success: boolean }>
      onQuickDictationStart: (callback: () => void) => () => void
      onQuickDictationToggle: (callback: () => void) => () => void
      
      // Menu events
      onOpenSettings: (callback: () => void) => () => void
      onToggleVoice: (callback: () => void) => () => void
      onPushToTalk: (callback: () => void) => () => void
      
      // Theme sync across windows
      broadcastThemeChange: (themeId: string) => Promise<{ success: boolean }>
      onThemeChange: (callback: (themeId: string) => void) => () => void

      // Settings sync across windows
      broadcastSettings: (settings: Record<string, string>) => Promise<{ success: boolean }>
      onSettingsChanged: (callback: (settings: Record<string, string>) => void) => () => void

      // Clipboard
      copyToClipboard: (text: string) => Promise<{ success: boolean }>

      // Auto-paste: hide dictation window and send Ctrl+V to previously focused app
      autoPaste: () => Promise<{ success: boolean; error?: string }>

      // App window behavior
      setMinimizeToTray: (value: boolean) => Promise<{ success: boolean }>

      // Auth events — fired when a token is saved so pre-warmed windows can reload their API key
      onTokenReady: (callback: () => void) => () => void
    }
  }
}
