# VoxIDE Latency Refactor Plan

## Executive Summary

This document identifies every latency source in VoxIDE's voice-to-action pipeline and
proposes fixes ordered by impact. The critical path is:

```
Microphone → ffmpeg → Node PassThrough → Deepgram WebSocket → IPC → Command Parse → Action → TTS Feedback
```

Total measured end-to-end latency (voice → editor action): **~800ms–2500ms** depending on path.
Target: **< 400ms** for built-in commands, **< 800ms** for AI-classified commands.

---

## Latency Source Inventory

### 1. Audio Capture — ffmpeg Subprocess (~80–150ms)

**Where:** `src/main/audio.ts`

**Current implementation:**
- Spawns ffmpeg as a child process via dshow (Windows)
- Configured with `-audio_buffer_size 20` (20ms buffer)
- Outputs PCM s16le @ 16kHz mono, piped to Node stdout
- Pre-warmed on app startup (`startPersistent()`) to avoid cold-start

**Latency breakdown:**
| Component | Latency | Notes |
|-----------|---------|-------|
| ffmpeg process startup (cold) | ~300–800ms | Mitigated by pre-warming |
| ffmpeg dshow buffer | ~20ms | Configured minimum |
| ffmpeg internal pipeline | ~30–50ms | Encode + pipe overhead |
| Node.js stream buffering | ~10–30ms | PassThrough stream backpressure |
| Stereo-to-mono mixdown | ~5ms | `-af "pan=mono..."` filter |

**Problems:**
- ffmpeg is a general-purpose transcoding tool, not optimized for low-latency capture
- dshow has inherent buffering that ffmpeg can't fully eliminate
- Piping through stdout adds a process boundary + serialization layer
- Audio level calculation happens on every chunk in the main process, blocking the event loop momentarily

**Fix — Option A: Native WASAPI via Rust/NAPI (recommended):**

Replace ffmpeg with a Rust native module using WASAPI (Windows Audio Session API) directly:

```
[Microphone] → [WASAPI shared mode] → [Rust ring buffer] → [NAPI callback to Node]
```

Benefits:
- WASAPI shared mode latency: **~3–10ms** (vs ffmpeg's ~50–80ms)
- No subprocess spawning, no pipe serialization
- Audio level calculation in Rust (SIMD-optimized RMS)
- Device enumeration via native Windows API (no ffmpeg device listing hack)
- Ring buffer prevents backpressure stalls

Estimated gain: **60–120ms** off the audio capture path.

**Fix — Option B: Reduce ffmpeg overhead (no Rust):**

If staying with ffmpeg:
- Use `-fflags nobuffer -flags low_delay` to minimize internal buffering
- Set `-probesize 32 -analyzeduration 0` to skip stream analysis
- Remove the stereo-to-mono filter (request mono directly from dshow if device supports it)
- Use `-thread_queue_size 512` to prevent queue stalls
- Move audio level calculation to a worker thread

Estimated gain: **20–40ms**.

---

### 2. Deepgram WebSocket — Connection & Streaming (~200–600ms)

**Where:** `src/main/deepgram.ts`

**Current implementation:**
- Opens a new WebSocket to Deepgram on each `startDeepgram()` call
- Model: `nova-3`, encoding: `linear16`, 16kHz
- `utterance_end_ms: 500` — waits 500ms of silence to finalize
- `endpointing: 200` — 200ms pause triggers sentence boundary
- `interim_results: true` — sends partial transcripts

**Latency breakdown:**
| Component | Latency | Notes |
|-----------|---------|-------|
| WebSocket connect + TLS handshake | ~100–300ms | Per session, not per utterance |
| Network round-trip to Deepgram | ~30–80ms | Depends on region |
| Model processing (interim) | ~100–200ms | First partial result |
| Endpointing wait | ~200ms | Before sentence boundary fires |
| Utterance finalization | ~500ms | Silence threshold |
| Batch mode (stop → transcribe) | ~800–2000ms | Full buffer upload + processing |

**Problems:**
- WebSocket is torn down and re-established each listen session
- 500ms utterance_end_ms is conservative — adds half a second after every pause
- Batch mode sends the entire WAV after recording stops (double latency)
- No connection pre-warming or keep-alive

**Fix — Keep WebSocket alive:**

Don't close the Deepgram connection between listen sessions. Instead:
- Open the connection on app startup (or first use) and keep it alive
- Use Deepgram's `KeepAlive` message to maintain the connection without sending audio
- When user starts listening, immediately begin streaming (no handshake delay)
- Only reconnect on error or after extended idle (>5 min)

```typescript
// Instead of creating new connection each time:
async startListening() {
  if (this.connection?.isOpen()) {
    // Already connected — just start streaming audio
    this.audioCapture.enableStreaming();
    return;
  }
  // Only connect if not already connected
  await this.connect();
}
```

Estimated gain: **100–300ms** on every listen start after the first.

**Fix — Reduce endpointing thresholds:**

For built-in command recognition (short utterances):
- `utterance_end_ms: 300` (from 500)
- `endpointing: 150` (from 200)

These are safe for command-style speech. For dictation mode, keep higher values.

Estimated gain: **150–250ms** per utterance.

**Fix — Act on interim results for commands:**

Don't wait for `isFinal` for known commands. Run regex matching on interim transcripts:

```typescript
onTranscript(transcript, isFinal) {
  // Try matching immediately on interim
  const match = matchCommand(transcript);
  if (match && match.confidence === 'exact') {
    executeCommand(match);
    return; // Don't wait for final
  }
  // Only wait for final for ambiguous/AI-classified input
  if (isFinal) {
    processFullTranscript(transcript);
  }
}
```

Estimated gain: **200–500ms** for recognized commands (skips finalization wait).

**Fix — Eliminate batch mode for commands:**

Batch mode (record → stop → send buffer) adds ~1–2 seconds. For the IDE's command
pipeline, always use streaming mode. Reserve batch for explicit "record a memo" use cases.

---

### 3. Command Processing — Regex + Claude Fallback (~1–50ms / ~500–2000ms)

**Where:** `src/renderer/hooks/useVoiceCommands.ts`

**Current implementation:**
- 45+ regex patterns tested sequentially
- If no match + code_mode → Claude API call for intent classification
- Claude receives: transcript + file content + cursor position + nearby code + file list

**Latency breakdown:**
| Component | Latency | Notes |
|-----------|---------|-------|
| Regex matching (45 patterns) | ~1–5ms | Fast, negligible |
| Claude API call (Haiku) | ~500–2000ms | Network + inference |
| Context assembly | ~5–10ms | String building |

**Problems:**
- Claude fallback is the single largest latency spike in the system
- Context payload can be large (full file content)
- No caching of recent classifications
- Some common commands may not match regex due to speech variations

**Fix — Fuzzy matching before Claude:**

Add a lightweight fuzzy matcher between regex and Claude:

```typescript
// Levenshtein distance or token overlap scoring
const COMMAND_VOCABULARY = [
  { tokens: ['open', 'file'], handler: 'open_file' },
  { tokens: ['go', 'to', 'line'], handler: 'go_to_line' },
  { tokens: ['save'], handler: 'save' },
  // ...
];

function fuzzyMatch(transcript: string): Match | null {
  const words = transcript.toLowerCase().split(/\s+/);
  let bestScore = 0, bestMatch = null;
  for (const cmd of COMMAND_VOCABULARY) {
    const score = tokenOverlap(words, cmd.tokens);
    if (score > bestScore && score > 0.7) {
      bestScore = score;
      bestMatch = cmd;
    }
  }
  return bestMatch;
}
```

This catches speech variations ("open up the file" → "open file") without an API call.

Estimated gain: **500–2000ms** for commands that would have fallen through to Claude.

**Fix — Trim Claude context:**

When Claude fallback is needed, send less context:
- Only +-20 lines around cursor, not the full file
- Don't send the full file list, just the current directory
- Cache the last classification for 5 seconds (repeated commands)

Estimated gain: **100–300ms** on Claude response time.

**Fix — Speculative execution:**

For high-confidence interim matches, pre-load the action:
- If interim transcript matches "open file X", start resolving the file path immediately
- If the final transcript confirms, execute instantly
- If it changes, discard the pre-loaded result

---

### 4. IPC Round-trips — Audio Level Polling (~5–15ms per call, cumulative)

**Where:** `src/renderer/components/VoiceControlPanel.tsx` (50ms polling interval)

**Current implementation:**
- Renderer calls `getAudioLevel()` via IPC every 50ms
- Each call: renderer → main process → read audioLevel → return
- Used purely for waveform visualization

**Problems:**
- 20 IPC round-trips per second just for visualization
- Each IPC call has ~5–15ms overhead (serialization + context switch)
- Blocks the IPC channel, potentially delaying transcript events

**Fix — Push audio levels from main process:**

Replace polling with event-driven push:

```typescript
// Main process: push levels at 50ms interval
setInterval(() => {
  if (this.mainWindow && this.audioCapture?.isActive) {
    this.mainWindow.webContents.send('audio:level', this.audioCapture.audioLevel);
  }
}, 50);

// Renderer: listen for events (no IPC request needed)
useEffect(() => {
  const unsub = window.electronAPI.onAudioLevel((level) => {
    audioLevelRef.current = level;
    // Update waveform via ref, no re-render
  });
  return unsub;
}, []);
```

Estimated gain: Eliminates **20 IPC round-trips/sec**, frees IPC channel for transcripts.

**Fix — Batch IPC calls:**

For operations that trigger multiple IPC calls (e.g., "open file" = readdir + readFile + stat),
batch them into a single IPC handler:

```typescript
// Instead of 3 IPC calls:
ipcMain.handle('fs:openFileContext', async (_, filePath) => {
  const [content, stat, dir] = await Promise.all([
    fs.readFile(filePath, 'utf-8'),
    fs.stat(filePath),
    fs.readdir(path.dirname(filePath)),
  ]);
  return { content, stat, dir };
});
```

---

### 5. Text-to-Speech Feedback (~100–500ms)

**Where:** `src/renderer/hooks/useTTS.ts`

**Current implementation:**
- Web Speech API (SpeechSynthesis)
- Queue-based utterance processing
- Long text split into ~200-char chunks
- Earcons via `new Audio()` with file load

**Latency breakdown:**
| Component | Latency | Notes |
|-----------|---------|-------|
| SpeechSynthesis startup | ~50–200ms | First utterance slower |
| Inter-utterance gap | ~50–150ms | Between queued chunks |
| Earcon file load | ~10–50ms | First play, cached after |
| Voice selection | ~0ms | Cached at init |

**Problems:**
- Web Speech API has unpredictable startup latency on Windows
- Queued utterances have gaps between them
- No pre-warming of the speech engine
- Earcon audio files loaded on demand

**Fix — Pre-warm SpeechSynthesis:**

Speak a silent utterance on app startup to initialize the engine:

```typescript
// On mount
const warmup = new SpeechSynthesisUtterance('');
warmup.volume = 0;
speechSynthesis.speak(warmup);
```

**Fix — Pre-load earcons:**

Load all earcon Audio objects at startup, not on first use:

```typescript
const earconCache = new Map<string, HTMLAudioElement>();
const EARCONS = ['success', 'error', 'navigation', 'file-open', 'file-save'];

function preloadEarcons() {
  for (const name of EARCONS) {
    const audio = new Audio(`earcons/${name}.wav`);
    audio.load(); // Force browser to fetch and decode
    earconCache.set(name, audio);
  }
}
```

**Fix — Consider native TTS for lower latency:**

Windows SAPI (via Rust/NAPI or edge-tts) has lower startup latency than Web Speech API
and supports SSML for better code reading. This is a larger change but would eliminate
the ~100–200ms first-utterance delay.

---

### 6. Electron Startup & Window Load (~1–3s)

**Where:** `src/main/main-voxide.ts`, renderer HTML/JS loading

**Current implementation:**
- Electron creates BrowserWindow
- Loads bundled HTML (or dev server)
- React hydrates, Monaco initializes
- ffmpeg pre-warms after `did-finish-load`

**Latency breakdown:**
| Component | Latency | Notes |
|-----------|---------|-------|
| Electron cold start | ~500–1000ms | Chromium init |
| HTML/JS bundle parse | ~200–500ms | Depends on bundle size |
| React hydration | ~100–300ms | Component tree mount |
| Monaco editor init | ~200–500ms | Code editor framework |
| ffmpeg pre-warm | ~300–800ms | Parallel with above |

**Fix — Eager pre-warming (parallel init):**

Start ffmpeg and Deepgram connection in parallel with window creation, not after load:

```typescript
app.whenReady().then(() => {
  // Start these immediately, don't wait for window
  const audioReady = preWarmAudio();
  const dgReady = preWarmDeepgram();
  
  // Window creation happens in parallel
  createMainWindow();
  
  // By the time user interacts, both are ready
});
```

**Fix — Monaco lazy load:**

Don't load Monaco until a file is opened. Show a lightweight placeholder editor first.
Monaco adds ~200–500ms to initial load even when no file is open.

---

### 7. File System Operations (~5–50ms per operation)

**Where:** `src/main/main-voxide.ts` IPC handlers

**Current implementation:**
- All fs calls are async (`fs.promises`)
- Path validation on every call (normalize + null byte check + absolute check)
- Directory reads return full stat info for each entry

**Problems:**
- Directory listing does `readdir` + individual `stat` per entry (N+1 pattern)
- No file content caching
- Large directories can take 50–200ms

**Fix — Use `readdir` with `withFileTypes`:**

```typescript
// Current: N+1 stat calls
const entries = await fs.readdir(dirPath);
for (const entry of entries) {
  const stat = await fs.stat(path.join(dirPath, entry)); // N calls
}

// Fixed: single syscall
const entries = await fs.readdir(dirPath, { withFileTypes: true });
// entries[i].isDirectory() — no additional stat needed
```

**Fix — LRU file cache:**

Cache recently read files (bounded to ~50MB) with modification time checks:

```typescript
const fileCache = new Map<string, { content: string, mtime: number }>();

async function cachedReadFile(filePath: string) {
  const stat = await fs.stat(filePath);
  const cached = fileCache.get(filePath);
  if (cached && cached.mtime === stat.mtimeMs) return cached.content;
  const content = await fs.readFile(filePath, 'utf-8');
  fileCache.set(filePath, { content, mtime: stat.mtimeMs });
  return content;
}
```

---

## The Rust Question

### Where Rust Makes Sense

| Module | Current | Rust Replacement | Expected Gain |
|--------|---------|-----------------|---------------|
| Audio capture | ffmpeg subprocess | WASAPI native binding | 60–120ms |
| Audio level calc | JS on main thread | SIMD RMS in Rust | ~5ms + unblocks event loop |
| Device enumeration | ffmpeg dshow parse | Windows Audio API | 200–500ms (on device list) |
| WAV encoding | JS buffer concat | Rust memcpy | ~1ms (negligible) |
| TTS engine | Web Speech API | Windows SAPI via Rust | 100–200ms first-utterance |

### Where Rust Does NOT Make Sense

- **Deepgram communication** — network-bound, not CPU-bound
- **Command regex matching** — already <5ms in JS
- **File I/O** — Node's fs is already native C++ under the hood
- **IPC** — Electron's IPC is already optimized
- **UI rendering** — React/DOM, not applicable

### Recommended Rust Module: `voxide-audio-native`

A single NAPI module providing:

```rust
#[napi]
pub struct AudioCapture {
    // WASAPI shared-mode capture
    // Ring buffer with configurable size
    // Callback-based audio delivery to Node
}

#[napi]
impl AudioCapture {
    #[napi(constructor)]
    pub fn new(sample_rate: u32, callback: JsFunction) -> Self { ... }

    #[napi]
    pub fn list_devices() -> Vec<AudioDevice> { ... }

    #[napi]
    pub fn start(&self, device_id: &str) -> Result<()> { ... }

    #[napi]
    pub fn stop(&self) -> Result<()> { ... }

    #[napi]
    pub fn get_level(&self) -> f32 { ... }  // Lock-free atomic read
}
```

This replaces `audio.ts` entirely while keeping the same IPC interface. The renderer
and Deepgram integration code remain unchanged.

**Build integration:**
- Use `napi-rs` for Rust ↔ Node bindings
- Add `"nativeModules"` to electron-builder config
- Cross-compile for x64 and arm64 Windows

---

## Priority Order

| Priority | Fix | Effort | Latency Saved |
|----------|-----|--------|---------------|
| **P0** | Act on interim results for commands | Small | 200–500ms |
| **P0** | Keep Deepgram WebSocket alive | Small | 100–300ms |
| **P1** | Push audio levels (eliminate polling) | Small | Frees IPC channel |
| **P1** | Reduce endpointing thresholds | Trivial | 150–250ms |
| **P1** | Fuzzy command matching before Claude | Medium | 500–2000ms (when hit) |
| **P1** | Pre-warm SpeechSynthesis + earcons | Small | 100–200ms first use |
| **P2** | Parallel startup (ffmpeg + Deepgram + window) | Small | 300–500ms startup |
| **P2** | Batch IPC calls for file operations | Medium | 10–30ms per op |
| **P2** | readdir with withFileTypes | Trivial | 20–100ms for dirs |
| **P2** | Trim Claude context payload | Small | 100–300ms |
| **P3** | Rust WASAPI audio capture | Large | 60–120ms |
| **P3** | Rust-based TTS (SAPI) | Large | 100–200ms |
| **P3** | Monaco lazy load | Medium | 200–500ms startup |

---

## Implementation Phases

### Phase 1 — Quick Wins (1–2 days)

All changes in existing TypeScript, no new dependencies:

1. Match commands on interim transcripts (useVoiceCommands.ts)
2. Keep Deepgram WebSocket alive with KeepAlive (deepgram.ts)
3. Lower endpointing to 150ms, utterance_end_ms to 300ms (deepgram.ts)
4. Push audio levels via webContents.send instead of polling (main-voxide.ts + preload)
5. Pre-warm SpeechSynthesis with silent utterance (useTTS.ts)
6. Pre-load all earcon Audio objects on mount (useTTS.ts)
7. Use `readdir({ withFileTypes: true })` (main-voxide.ts)

**Expected result:** Command latency drops from ~800ms to ~300–400ms for known commands.

### Phase 2 — Smarter Processing (3–5 days)

1. Fuzzy command matching layer (new utility, ~200 lines)
2. Trim Claude context to +-20 lines around cursor
3. Cache recent Claude classifications (5-second TTL)
4. Batch IPC for file open (content + stat + dir listing in one call)
5. Parallel startup: pre-warm ffmpeg + Deepgram connection during window load
6. Speculative file path resolution on interim matches

**Expected result:** Claude fallback hit rate drops 40–60%. Startup feels instant.

### Phase 3 — Rust Native Audio (1–2 weeks)

1. Set up `voxide-audio-native` crate with napi-rs
2. Implement WASAPI shared-mode capture
3. Implement native device enumeration
4. Atomic audio level reads (no IPC needed for level)
5. Integrate into main-voxide.ts, replacing audio.ts ffmpeg logic
6. Update electron-builder for native module packaging
7. Remove ffmpeg dependency for audio capture (keep for any other use)

**Expected result:** Audio capture latency drops from ~80ms to ~10ms. No ffmpeg dependency
for core voice functionality. Event loop never blocked by audio processing.

### Phase 4 — Native TTS (optional, 1 week)

1. Add Windows SAPI bindings to Rust module
2. SSML support for better code reading
3. Lower-latency utterance start (~10ms vs ~100ms)
4. Queue management in Rust (no JS overhead)

---

## Measuring Success

Add latency instrumentation to track the pipeline:

```typescript
// In useVoiceCommands.ts
const t0 = performance.now();
onTranscript(transcript, isFinal) {
  const transcriptReceived = performance.now();
  console.log(`[latency] audio→transcript: ${transcriptReceived - t0}ms`);
  
  const match = matchCommand(transcript);
  const matchDone = performance.now();
  console.log(`[latency] match: ${matchDone - transcriptReceived}ms`);
  
  await executeCommand(match);
  const execDone = performance.now();
  console.log(`[latency] execute: ${execDone - matchDone}ms`);
  console.log(`[latency] total: ${execDone - t0}ms`);
}
```

Target metrics:
- **Voice → first interim transcript:** < 300ms
- **Voice → command execution (known command):** < 400ms
- **Voice → command execution (Claude fallback):** < 1200ms
- **App startup → ready for voice:** < 2s
- **TTS response start:** < 100ms after command completes
