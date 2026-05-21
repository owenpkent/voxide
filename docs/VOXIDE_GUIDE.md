# VoxIDE: How It Works — A Complete Guide

## What Is VoxIDE?

VoxIDE is a code editor designed for people who cannot use a keyboard or mouse, and who may not be able to see the screen. It is a voice-first IDE — you speak commands and it speaks back to you. Every single action in VoxIDE can be performed with your voice alone.

If you are blind, have a spinal cord injury, have severe RSI, or any other condition that prevents you from using traditional input devices — VoxIDE is built for you.

---

## How It Works (End to End)

Here's what happens when you speak to VoxIDE:

```
1. You speak into your microphone
2. FFmpeg captures the raw audio from your mic (16kHz, 16-bit mono PCM)
3. Audio streams continuously to Deepgram's Nova-3 speech recognition model
4. Deepgram converts your speech to text in real-time
5. The transcript appears in the voice log panel
6. VoxIDE decides: is this a command or dictation?
   a. First, it checks 20+ regex patterns for common commands (instant)
   b. If no match, it sends the transcript to Claude AI for classification (~1-2s)
7. The action executes (file opens, code is read, text is inserted, etc.)
8. VoxIDE speaks the result back to you via Windows text-to-speech
9. A short audio tone (earcon) plays to confirm the action type
```

This entire pipeline runs in under 2 seconds for simple commands and under 4 seconds for complex ones that need Claude.

---

## The Three Layers of Intelligence

### Layer 1: Regex Fast-Path (Instant)

About 80% of commands are handled by simple pattern matching with no internet call needed. These patterns recognize the most common things you'll say:

- **"open file App.tsx"** — The regex sees `open` + `file` + a filename
- **"go to line 47"** — The regex extracts the number 47
- **"save"** — Exact match, no parameters needed
- **"read this function"** — Keyword match for code reading

This layer works offline (after initial Deepgram connection) and responds instantly.

### Layer 2: Claude AI Classification (~1-2 seconds)

When regex matching fails — because you said something more natural or ambiguous — the transcript goes to Claude Haiku (the fastest Claude model). Claude receives:

- Your spoken text
- The file you currently have open
- Your cursor position
- A list of files in your project

Claude returns structured JSON telling VoxIDE what you meant:

```json
{
  "intent": "open_file",
  "params": { "filename": "the auth handler thing" }
}
```

This handles natural language like "show me the auth handler" or "can you open whatever file handles login" — things regex can't match.

### Layer 3: Dictation Fallback

If neither regex nor Claude identifies a command, VoxIDE treats your speech as **text to type**. It inserts the transcript directly at your cursor position. This is how you dictate code or prose.

---

## Capabilities

### 1. Project Management

VoxIDE works with **local directories** on your computer. No GitHub account needed, no internet login.

| What you say | What happens |
|---|---|
| "open project" | A Windows folder picker appears. Select any directory. |
| "list files" | VoxIDE reads all top-level files and folders aloud. |
| "open file App.tsx" | Opens that file in the editor. Fuzzy matches — "open app" works too. |
| "create file utils.ts" | Creates a new empty file in the project root. |
| "delete file old.ts" | VoxIDE asks you to say the command again for safety. |

When you open a project, VoxIDE announces: *"Opened project my-app. 12 files, 3 folders. Say list files to hear them."*

Your last project is remembered — next time you launch, it's ready.

### 2. Code Navigation

| What you say | What happens |
|---|---|
| "go to line 47" | Cursor moves to line 47. |
| "go to the top" | Cursor moves to line 1. |
| "go to the end" | Cursor moves to the last line. |
| "where am I" | VoxIDE says: *"You are in App.tsx, line 47."* |

### 3. Code Reading

This is where VoxIDE shines. It doesn't just read raw code character by character — it understands code structure and describes it intelligently.

| What you say | What happens |
|---|---|
| "read file" | **Brief mode**: *"47 lines. 3 imports. Functions: handleSubmit, validateForm, App."* |
| "read this function" | **Normal mode**: *"Function handleSubmit at line 12, takes 1 parameter: event. Calls preventDefault, then setLoading, then awaits submitForm."* |
| "read line 10" | **Detailed mode**: *"Line 10: const result strict equals await fetchData open paren id close paren"* |
| "read line 5 to 20" | Reads lines 5 through 20 in detailed mode. |

#### Three Verbosity Levels

You control how much detail VoxIDE gives you:

- **Brief** — Just the facts: line count, import count, function names. Say "verbosity brief" to switch.
- **Normal** (default) — Function signatures, parameter names, import sources. Say "verbosity normal".
- **Detailed** — Line-by-line reading with symbols converted to words (`===` becomes "strict equals", `=>` becomes "arrow", `&&` becomes "and"). Say "verbosity detailed".

#### Symbol Translation

In detailed mode, VoxIDE converts code symbols into spoken words:

| Symbol | Spoken as |
|---|---|
| `=>` | "arrow" |
| `===` | "strict equals" |
| `!==` | "not strict equals" |
| `==` | "equals" |
| `!=` | "not equals" |
| `&&` | "and" |
| `\|\|` | "or" |
| `<=` | "less than or equal" |
| `>=` | "greater than or equal" |
| `++` | "increment" |
| `--` | "decrement" |
| `...` | "spread" |

### 4. Three Modes

VoxIDE has three modes you can switch between:

**Code Mode** (default): For programming. Syntax highlighting, line numbers, Claude classifies ambiguous commands.
- Say "code mode" to enter

**Document Mode**: For writing text. Larger font (20px), no line numbers, no bracket auto-close. Auto-capitalizes dictation. Has punctuation commands ("period", "comma", "question mark", "new line").
- Say "document mode" to enter
- All unrecognized speech is typed instantly (no Claude round-trip = faster)

**Conversation Mode**: For talking with AI. Like the Claude app's voice feature. Speak naturally, get responses read aloud.
- Say "conversation mode" or "chat mode" to enter
- Everything you say is sent to Claude as a chat message
- Responses are read back via TTS
- Context-aware: Claude knows what file you have open

| What you say | What happens |
|---|---|
| (any unrecognized speech — code mode) | Sent to Claude for classification, then acted on |
| (any unrecognized speech — document mode) | Typed at cursor (auto-capitalized) |
| (any unrecognized speech — conversation mode) | Sent to Claude as a chat message, response read aloud |
| "undo" | Undoes the last edit |
| "redo" | Redoes the last undo |
| "save" or "save file" | Saves the current file to disk |
| "new line" | Inserts a line break |
| "period" / "comma" / "question mark" | Inserts punctuation |
| "select all" | Selects all text |

When you dictate in code or document mode, VoxIDE inserts at the cursor and announces what was inserted.

### 5. AI Conversation Mode

This is like the voice mode in the Claude app — you speak naturally and the AI responds, reading its answer aloud.

**How to enter**: Say "conversation mode" or "chat mode"

In conversation mode, everything you say (that isn't a system command like "stop" or "help") is sent directly to Claude Sonnet as a chat message. Claude's response is:

1. Cleaned of markdown formatting (backticks, bold, headers, bullet points removed — TTS reads those literally)
2. Split into sentence-sized chunks for progressive reading (you hear the first sentence immediately, not after the full response)
3. Read aloud via Windows TTS

**Example conversation**:

- You say: *"What's a React hook?"*
- VoxIDE says: *"A React hook is a function that lets you use state and other React features in functional components. The most common hooks are useState for managing state, useEffect for side effects, and useContext for accessing context values."*

- You say: *"Give me an example of useState"*
- VoxIDE says: *"You can use useState like this: const count, setCount equals useState zero. Then call setCount with a new value to update it. The component re-renders whenever the state changes."*

**Context-aware**: Claude knows what file you have open and where your cursor is. So you can say *"What does this function do?"* and it will look at the code near your cursor.

**Commands in conversation mode**:

| What you say | What happens |
|---|---|
| (any speech) | Sent to Claude as a chat message, response read aloud |
| "clear conversation" | Clears chat history |
| "code mode" | Switch back to code editing |
| "document mode" | Switch to text writing |
| "stop" / "quiet" | Stop TTS mid-sentence |

Conversation history is maintained during the session (last 20 messages for context window management).

### 6. File Browser

You can navigate your entire computer by voice — not limited to a single project.

| What you say | What happens |
|---|---|
| "go to documents" | Navigate to your Documents folder |
| "go to desktop" | Navigate to your Desktop |
| "go to downloads" | Navigate to your Downloads |
| "go to home" | Navigate to your home directory |
| "go up" / "go back" | Go to the parent directory |
| "enter folder src" | Enter a subfolder (fuzzy matches by name) |
| "list drives" | Hear all available drives (C:, D:, etc.) |
| "go to C drive" | Navigate to C:\ |
| "where am I" / "what folder" | Hear your current directory path |
| "list files" | Hear all files and folders in the current directory |

VoxIDE starts at your home directory and remembers where you were last time.

### 7. Running Commands

You can execute shell commands without leaving the editor:

| What you say | What happens |
|---|---|
| "run npm test" | Executes `npm test` in the project directory. |
| "run git status" | Runs `git status` and reads the output. |
| "run the command npm install lodash" | Installs lodash. |

VoxIDE reads the first few lines of output aloud. If there are many lines, it says: *"Output: [first 3 lines]. And 47 more lines."*

Commands are sandboxed to your project directory and have a 30-second timeout.

### 6. Speech Control

| What you say | What happens |
|---|---|
| "stop" / "quiet" / "shut up" | Immediately stops all speech output. |
| "pause listening" | Stops voice recognition (saves API usage). |
| "resume listening" | Restarts voice recognition. |
| "help" | Reads a summary of all available commands. |

---

## Audio Feedback System

VoxIDE uses two types of audio feedback:

### Text-to-Speech (TTS)

Every action produces a spoken response:
- File operations: *"Opened App.tsx. 47 lines."* / *"File saved."*
- Navigation: *"Line 47."* / *"You are in App.tsx, line 12."*
- Errors: *"Could not find file config.yaml."* (spoken with interrupt priority — cuts through anything currently being said)
- Help: *"You can say: open file, save, go to line number, read this function..."*

TTS settings are stored per-machine:
- **Voice**: Choose from any installed Windows SAPI voice
- **Rate**: 0.5x (very slow) to 2.0x (double speed)
- These are configured in your browser's localStorage

### Earcons (Audio Tones)

Short, distinctive tones play alongside TTS for instant feedback:

| Earcon | When it plays |
|---|---|
| Ascending chime | Success (file saved, command completed) |
| Descending tone | Error (file not found, command failed) |
| Soft click | Navigation (go to line, move cursor) |
| Page turn | File opened |
| Confirmation beep | File saved |
| Rising beep | Recording/listening started |
| Falling beep | Recording/listening stopped |

Earcons are very short (80-300ms) so they never conflict with TTS speech.

---

## The User Interface

While VoxIDE is designed for voice-only use, it does have a visual interface — useful for sighted helpers, debugging, or users who have some vision.

```
+------------------------------------------------------------------+
|  VoxIDE   my-app / App.tsx *    [||||] [Mic] [Vol] [Folder] [Save] |
+----------+-------------------------------------------------------+
|          |                                                        |
| File     |   Code Editor (Monaco)                                 |
| Tree     |   Large font (18px), high contrast                     |
| Panel    |   Screen reader support enabled                        |
|          |                                                        |
|          +-------------------------------------------------------+
|          |  Voice Log                                              |
|          |  19:30:01 > open file App.tsx                           |
|          |  19:30:01   Opened: App.tsx                             |
|          |  19:30:05 > read this function                          |
|          |  19:30:05   Function handleSubmit at line 12...          |
+----------+-------------------------------------------------------+
|  ● Listening | Last: read_function — "read this function" | L:12  |
+------------------------------------------------------------------+
```

### High Contrast Theme (Default)

VoxIDE defaults to the High Contrast theme:
- **Background**: Pure black (#000000)
- **Text**: Pure white (#FFFFFF)
- **Accents**: Bright yellow (#FFFF00)
- **Errors**: Bright red (#FF4444)
- **Success**: Bright green (#00FF00)

This exceeds WCAG AAA contrast requirements (21:1 ratio).

### Screen Reader Compatibility

Every UI element has proper ARIA attributes:
- The voice log is an `aria-live="polite"` region — NVDA/JAWS announces new entries
- The status bar is `aria-live="polite"` — announces state changes
- Error messages use `aria-live="assertive"` — announced immediately
- All buttons have `aria-label` descriptions
- The file tree uses `role="tree"` and `role="treeitem"` semantics
- Focus indicators are bright yellow rings, visible on the dark background

---

## Getting Started — Step by Step

### Step 1: Get API Keys

You need two API keys:

1. **Deepgram** (for voice recognition): Go to [deepgram.com](https://deepgram.com), create a free account, generate an API key. Free tier gives you plenty of usage.

2. **Claude** (for understanding complex commands): Go to [console.anthropic.com](https://console.anthropic.com), create an account, add credit, generate an API key. VoxIDE uses Claude Haiku — the cheapest model at ~$0.25/million tokens. Most commands are handled by regex without using Claude at all.

### Step 2: Launch VoxIDE

```bash
cd windows-desktop
npm install
npm run dev
```

VoxIDE will say: *"Welcome to VoxIDE. Please enter your Deepgram and Claude API keys to get started."*

### Step 3: Enter API Keys

Tab to the input fields and paste your keys. They're saved in localStorage — you only do this once.

### Step 4: Start Coding

Click the microphone button (or have a sighted helper click it once). Then say:

1. **"open project"** — Select a folder
2. **"list files"** — Hear what's in it
3. **"open file index.ts"** — Open a file
4. **"read file"** — Get an overview
5. **"read this function"** — Hear the current function explained
6. **"go to line 10"** — Navigate
7. **"save"** — Save changes
8. **"help"** — Hear all commands

---

## Architecture for Developers

### File Structure

```
windows-desktop/
├── src/main/
│   ├── main-voxide.ts          # Electron main process
│   ├── preload-voxide.ts       # IPC bridge to renderer
│   ├── audio.ts                # Shared: FFmpeg mic capture
│   └── deepgram.ts             # Shared: Nova-3 STT
├── src/renderer/
│   ├── voxide/
│   │   ├── index.html          # Entry HTML
│   │   └── main.tsx            # React entry
│   ├── components/
│   │   └── VoxIDEApp.tsx       # Main UI (file tree, editor, voice log)
│   └── hooks/
│       ├── useTTS.ts           # Text-to-speech engine
│       └── useVoiceCommands.ts # Command classification
├── build/
│   ├── electron-builder.voxide.json
│   └── installer-voxide.nsh
├── resources/
│   └── earcons/*.wav           # Audio cue files
└── tsconfig.voxide.json
```

### Key Design Decisions

**Why Deepgram Nova-3?** — Best real-time streaming speech recognition. Low latency, high accuracy, built-in VAD (voice activity detection), keyword boosting for technical terms.

**Why Claude Haiku for classification?** — Fastest Claude model, cheapest per-token, good enough for intent classification. Most commands don't need it anyway (regex handles 80%).

**Why Web Speech API for TTS?** — Zero dependencies. Uses Windows' built-in SAPI voices. No extra download. Works offline once voices are installed.

**Why Monaco Editor?** — Already in the project, has native `accessibilitySupport: 'on'` mode, ARIA attributes, screen reader cursor tracking.

**Why local filesystem instead of GitHub?** — Blind/mobility-impaired users shouldn't need to set up GitHub OAuth to start coding. Open a folder, start working.

### Security

- File system access is unrestricted (full computer browser) — the user is in control
- Shell commands run in the current directory with a 30-second timeout
- API keys are stored in localStorage (client-side only, never transmitted anywhere except to their respective APIs)
- Conversation history stays in-memory (not persisted to disk)

### Testing

237 unit tests across 4 test files:

- **Voice command matching** (65 tests): Every command pattern, file operations, navigation, code reading, editing, shell, TTS control, listening, help, unmatched transcripts
- **TTS code reading** (34 tests): Symbol-to-words translation (12 operators), function detection (standard, async, arrow, class methods), import detection
- **File system** (32 tests): Path validation, fuzzy file matching, language detection from extensions
- **Conversation + browser + doc mode** (47 tests): TTS markdown stripping (backticks, bold, headers, bullets, code blocks, links), sentence chunking, conversation mode commands, file browser navigation commands (folders, drives, go up), document mode auto-capitalization
- **Plus** 59 existing tests from GitConnect Pro/MacroVox (deepgram, auth, settings, audio, post-processing) that verify no regressions

Run tests:
```bash
npm test
```

---

## Troubleshooting

### "No speech recognized"
- Check that ffmpeg is in your PATH: `ffmpeg -version`
- Verify your microphone is working in Windows Settings > Sound
- Check that the correct mic is selected (say a few words and watch the audio level bars in the header)

### "Failed to start listening"
- Verify your Deepgram API key is correct
- Check your internet connection (Deepgram requires internet for streaming)
- Check the Deepgram console for usage limits

### "Command not recognized"
- Try simpler phrasing: "open app" instead of "could you please open the app component"
- Check the voice log to see what Deepgram heard — speech recognition may have transcribed incorrectly
- Make sure your Claude API key is set (complex commands need Claude)

### TTS not speaking
- Check Windows Sound settings — make sure output device is correct
- Try a different SAPI voice (some may not be installed)
- Check that speech synthesis is not disabled in your browser/Electron settings

### Microphone issues
- VoxIDE uses ffmpeg's DirectShow capture on Windows
- If you have multiple mics, the first one with "Microphone" in its name is selected by default
- You can change the mic device in settings

---

## What's Coming Next

- **Deepgram Voice Agent** — True bi-directional voice streaming (talk while the IDE talks back, no turn-taking delay)
- **AI Code Editing** — Say "add error handling to this function" and watch it happen
- **Spatial Audio** — Use 3D sound to represent code structure (nested code sounds deeper, imports sound to the left)
- **Voice Profiles** — Adapt to your specific speech patterns for higher accuracy
- **Custom Vocabulary** — Teach VoxIDE your project's technical terms
- **Terminal Integration** — Interactive terminal controlled by voice
- **Multi-file Editing** — Tabs and split views
