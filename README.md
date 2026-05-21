# VoxIDE

Voice-controlled accessible IDE for blind and mobility-impaired developers. Every action is voice-driven; every response is spoken back via TTS.

**Platform:** Windows (Electron)
**Status:** In development (v1.0.0)
**License:** MIT

## What it does

VoxIDE is a coding environment where you never need to touch a keyboard. It uses Deepgram Nova-3 for continuous speech recognition and Claude for intent classification. You speak, VoxIDE writes code, navigates files, runs shell commands, and reads results back.

No GitHub login, no cloud accounts, no subscription. Bring your own Deepgram and Claude API keys, work with files anywhere on your local filesystem.

## Tech stack

- Electron + React + TypeScript + Vite + Tailwind CSS
- Monaco editor for code display
- Deepgram SDK (streaming + batch) via a native Rust audio capture module
- Claude API for intent classification and code generation
- Web Speech API for TTS output

## Getting started

### Prerequisites

- Windows 10/11
- Node.js 20+
- A Deepgram API key (https://console.deepgram.com)
- An Anthropic API key (https://console.anthropic.com)

### Build and run from source

```bash
npm install
npm run build:native    # builds the Rust audio capture module
npm run dev             # starts the dev server + main process watcher
```

Or package an installer:

```bash
npm run package         # builds + signs (requires EV cert if you want the signing step)
```

The signed installer ends up in `release-voxide/`.

### First-run setup

On first launch, VoxIDE asks for your Deepgram and Claude API keys. Keys are stored locally via Electron `safeStorage` (DPAPI on Windows). No keys leave your machine except to the respective providers.

You can also set the keys via environment variables before launching:

```
VOXIDE_DEEPGRAM_KEY=...
VOXIDE_CLAUDE_KEY=...
```

## Project structure

```
voxide/
├── src/
│   ├── main/                       # Electron main process (Node.js)
│   │   ├── main-voxide.ts          # Entry point
│   │   ├── preload-voxide.ts       # IPC bridge to the renderer
│   │   ├── audio.ts                # ffmpeg + native audio capture
│   │   ├── audio-native.ts         # Bindings for the Rust module
│   │   └── deepgram.ts             # Deepgram streaming + batch client
│   └── renderer/                   # React UI (Vite)
│       ├── voxide/                 # Main window entry
│       ├── settings/               # Settings window entry
│       ├── components/             # VoxIDEApp, SettingsPanel
│       ├── hooks/                  # useTTS, useVoiceCommands, useConversation
│       └── ThemeContext.tsx
├── native/voxide-audio/            # Rust audio capture (napi-rs)
├── build/                          # electron-builder configs + NSIS installer
├── resources/                      # Icons, earcons
└── docs/                           # VOXIDE.md, accessibility docs
```

## Documentation

- [docs/VOXIDE.md](docs/VOXIDE.md): architecture and design notes
- [docs/ACCESSIBILITY_VOICE_FIRST_IDE.md](docs/ACCESSIBILITY_VOICE_FIRST_IDE.md): accessibility vision and design principles
- [docs/VOXIDE_ALEXA_INTEGRATION.md](docs/VOXIDE_ALEXA_INTEGRATION.md): exploratory notes on Alexa integration

## Origin

VoxIDE was extracted from the multi-product gitconnect monorepo (which housed GitConnect Pro and MacroVox alongside VoxIDE) when the other products were sunset. The original monorepo is archived at https://github.com/okstudio1/gitconnect.

## License

MIT (c) OK Studio
