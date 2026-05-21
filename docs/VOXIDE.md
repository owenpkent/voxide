# VoxIDE — Voice-Controlled Accessible IDE

**Target Users**: Developers who are blind, have limited mobility, or both — anyone who needs to code using only their voice.

**Core Principle**: Everything is controlled by voice. Everything responds with audio. No keyboard or mouse required.

---

## Overview

VoxIDE is a simplified, voice-first IDE designed from the ground up for accessibility. It uses:

- **Deepgram Nova-3** for continuous speech recognition (always listening)
- **Claude AI** (Haiku) for intelligent voice command classification
- **Windows TTS** (Web Speech API / SAPI) for spoken feedback
- **Monaco Editor** with full screen reader support (ARIA, NVDA/JAWS compatible)
- **High-contrast UI** (yellow on black, WCAG AAA) as the default theme

VoxIDE works as a **full file browser and editor** — navigate your entire computer by voice, open any file, write code or documents. No GitHub account or internet login required beyond API keys.

---

## Setup

### Prerequisites

- Node.js 18+
- ffmpeg in PATH (for microphone capture)
- A Deepgram API key (get one at [deepgram.com](https://deepgram.com))
- A Claude API key (get one at [console.anthropic.com](https://console.anthropic.com))

### Development

```bash
cd windows-desktop
npm install
npm run dev
# In another terminal or via the dev command:
# Navigate to http://localhost:5173/voxide/index.html
```

### Build

```bash
npm run build:voxide           # Build only
npm run package:voxide          # Build + NSIS installer + portable exe
```

### First Launch

1. VoxIDE will speak: "Welcome to VoxIDE. Please enter your Deepgram and Claude API keys."
2. Enter your API keys in the setup dialog (Tab to navigate fields)
3. Keys are stored in localStorage — entered once per machine
4. Say "open project" to select a local directory
5. Say "help" for a full list of voice commands

---

## Voice Commands Reference

### File Browser

| Say | What happens |
|-----|-------------|
| "go to documents" | Navigate to your Documents folder |
| "go to desktop" | Navigate to your Desktop folder |
| "go to downloads" | Navigate to your Downloads folder |
| "go to home" | Navigate to your home directory |
| "go up" / "go back" | Navigate to parent directory |
| "enter folder src" | Enter a subfolder by name (fuzzy matches) |
| "list drives" | Hear all available drives (C:, D:, etc.) |
| "go to C drive" | Navigate to drive C:\ |
| "list files" | TTS reads all files and folders in current directory |
| "where am I" / "what folder" | TTS reads current directory path |

### File Operations

| Say | What happens |
|-----|-------------|
| "open project" | Opens a folder picker dialog |
| "open file App.tsx" | Opens a file (fuzzy matches against current directory) |
| "save" / "save file" | Saves the current file |
| "create file notes.txt" | Creates a new file in the current directory |
| "select all" | Select all text in the editor |

### Mode Switching

| Say | What happens |
|-----|-------------|
| "code mode" | Switch to programming mode — syntax highlighting, line numbers |
| "document mode" | Switch to text writing mode — larger font, no line numbers, auto-capitalize |
| "conversation mode" / "chat mode" | Switch to AI conversation — speak naturally, Claude responds, response is read aloud via TTS |
| "clear conversation" / "reset chat" | Clear the conversation history |

### Navigation

| Say | What happens |
|-----|-------------|
| "go to line 47" | Moves cursor to line 47 |
| "go to the top" | Moves cursor to line 1 |
| "go to the end" | Moves cursor to the last line |
| "where am I" | TTS announces current file and line number |

### Code Reading

| Say | What happens |
|-----|-------------|
| "read this function" | TTS reads an intelligent summary of the current function |
| "read file" | TTS gives a brief overview (line count, imports, functions) |
| "read line 10" | TTS reads line 10 with symbol translation |
| "read line 10 to 20" | TTS reads lines 10-20 in detailed mode |

### Editing

| Say | What happens |
|-----|-------------|
| (any unrecognized speech) | Text inserted at cursor (in document mode: auto-capitalized) |
| "undo" | Undoes the last edit |
| "redo" | Redoes the last undo |
| "new line" / "new paragraph" | Inserts a line break |
| "period" / "comma" / "question mark" | Inserts punctuation |
| "exclamation mark" | Inserts ! |

### Shell Commands

| Say | What happens |
|-----|-------------|
| "run npm test" | Executes `npm test` in the project directory |
| "run the command git status" | Executes `git status` and reads the output |

### TTS Control

| Say | What happens |
|-----|-------------|
| "stop" / "quiet" / "shut up" | Stops all TTS speech immediately |
| "verbosity brief" | Minimal code reading (line count, function names only) |
| "verbosity normal" | Standard code reading (imports, function signatures) |
| "verbosity detailed" | Line-by-line code reading with symbol translation |

### Listening Control

| Say | What happens |
|-----|-------------|
| "pause listening" | Stops Deepgram streaming (saves API usage) |
| "resume listening" | Restarts Deepgram streaming |

### Help

| Say | What happens |
|-----|-------------|
| "help" | TTS reads a summary of all available commands |

---

## Architecture

### Voice Pipeline

```
User speaks
  → FFmpeg captures audio (16kHz, 16-bit PCM)
  → Deepgram Nova-3 streaming transcription
  → Final transcript arrives in renderer via IPC
  → Fast-path regex matching (80% of commands, instant)
  → Claude Haiku fallback (complex commands, ~1-2s)
  → Action executed (file open, navigate, TTS response)
  → TTS speaks confirmation + earcon plays
```

### Command Classification

1. **Regex fast-path**: Common commands like "open file X", "go to line N", "save", "read this function" are matched instantly with no API call.

2. **Claude fallback**: Ambiguous or complex commands are sent to Claude Haiku with the current editor context. Claude returns structured JSON with intent and parameters.

3. **Dictation detection**: If no command keywords match, the transcript is treated as text to insert at the cursor position.

### File System

- All file operations are **sandboxed** to the currently open project directory
- Full filesystem access — the user can navigate and open files anywhere on their computer
- Files are read/written via IPC with absolute path validation

### TTS

- Uses the Web Speech API (`window.speechSynthesis`) which delegates to Windows SAPI
- Queue system prevents overlapping speech
- "interrupt" priority cancels current speech for urgent feedback (errors)
- Earcons (short WAV tones) provide non-verbal audio cues for common actions

### Code Reading Verbosity

- **Brief**: "47 lines. 3 imports. Functions: handleSubmit, validateForm, App."
- **Normal**: "This file has 47 lines. Imports: React from react; useState from react. Function handleSubmit at line 12, takes 1 parameter: event."
- **Detailed**: "Line 1: import React from react. Line 2: import useState from react. Line 4: function handleSubmit takes event parameter arrow..."

---

## Product Details

| Property | Value |
|----------|-------|
| App ID | `com.okstudio.voxide` |
| Product Name | VoxIDE |
| Version | 1.0.0 |
| Main Process | `src/main/main-voxide.ts` |
| Preload | `src/main/preload-voxide.ts` |
| Renderer | `src/renderer/voxide/` |
| Build Config | `build/electron-builder.voxide.json` |
| Installer | `build/installer-voxide.nsh` |
| TypeScript Config | `tsconfig.voxide.json` |
| Installer Output | `release-voxide/` |

### Shared Code (with GitConnect Pro and MacroVox)

| Module | File | What it does |
|--------|------|-------------|
| AudioCapture | `src/main/audio.ts` | FFmpeg-based microphone capture |
| DeepgramStreamer | `src/main/deepgram.ts` | Nova-3 streaming + batch transcription |
| Themes | `src/renderer/themes.ts` | 7 color themes (including High Contrast) |
| ThemeContext | `src/renderer/ThemeContext.tsx` | React theme provider |

### VoxIDE-Specific Code

| Module | File | What it does |
|--------|------|-------------|
| VoxIDEApp | `src/renderer/components/VoxIDEApp.tsx` | Main UI component |
| useTTS | `src/renderer/hooks/useTTS.ts` | Text-to-speech with queue, code reading, earcons |
| useVoiceCommands | `src/renderer/hooks/useVoiceCommands.ts` | Voice command parsing (regex + Claude) |
| useConversation | `src/renderer/hooks/useConversation.ts` | AI conversation mode — chat with Claude, responses read aloud via TTS |

### Related: Linux Desktop App

The `linux-desktop/` directory contains a well-developed Linux version of GitConnect Pro with additional features that informed VoxIDE's design:
- **IntentDetector** (`src/main/intent/detector.ts`) — regex-based voice command classification (pattern VoxIDE's useVoiceCommands builds on)
- **IDE Command definitions** (`src/main/intent/commands.ts`) — structured command catalog with categories, voice triggers, and keybindings
- **MCP Hub integration** — Model Context Protocol client for tool use
- **Integrated terminal** — Full PTY with xterm.js
- **PipeWire/PulseAudio/ALSA audio capture** — Linux-native audio
- See `linux-desktop/LINUX_DESKTOP.md` for full documentation

---

## Accessibility Features

### Screen Reader Support
- Full ARIA labels on all interactive elements
- `aria-live="polite"` regions for voice log and status bar
- `aria-live="assertive"` for error messages
- Compatible with NVDA and JAWS
- Monaco editor configured with `accessibilitySupport: 'on'`

### Visual Accessibility
- High Contrast theme (yellow #FFFF00 on black #000000) as default
- 18px base font size in the editor
- No minimap (useless for screen readers)
- Minimum 48x48px touch/click targets
- Focus indicators on all interactive elements (yellow ring)

### Audio Feedback
- TTS announces every action and its result
- Earcons (short audio tones) for common actions
- Different TTS priorities: queue (normal) vs interrupt (errors/urgent)
- Adjustable speech rate (0.5x to 2.0x)
- Voice selection from available Windows SAPI voices
- Three verbosity levels for code reading

### Voice Control
- Continuous listening mode (always-on Deepgram streaming)
- Natural language commands — speak intent, not syntax
- Fuzzy file matching ("open app" matches "App.tsx")
- Pause/resume listening to save API usage

---

## Known Limitations (v1.0.0)

- **No spatial audio** — code structure is described verbally, not with 3D positioning
- **No Deepgram Voice Agent** — uses one-way streaming, not bi-directional conversation
- **No terminal emulator** — shell commands execute and return output, but no interactive terminal
- **No git operations** beyond basic shell commands
- **No code editing via AI** — complex "refactor this function" commands are recognized but not yet implemented
- **Earcons are simple generated tones** — will be replaced with professionally designed sounds
- **Single file editing** — no multi-tab support yet
- **Delete confirmation** — requires saying the delete command twice (no modal dialog)

---

## Roadmap

### Phase 2: Deepgram Voice Agent
- Bi-directional voice conversation with the IDE
- Real-time turn-taking
- Function calling for IDE actions

### Phase 3: Advanced Features
- Spatial audio for code structure
- AI-powered code editing via voice ("add error handling to this function")
- Multi-file context awareness
- Voice bookmarks

### Phase 4: Ecosystem
- Interactive terminal with voice control
- Full git operations via voice
- Pair programming support
- Custom voice profiles for non-standard speech patterns
