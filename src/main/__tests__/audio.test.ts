import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Audio buffering state machine — mirrors AudioCapture buffering logic.
// Pure logic tests; no actual ffmpeg processes spawned.
// ---------------------------------------------------------------------------

interface BufferState {
  isBuffering: boolean
  audioBuffer: Buffer[]
}

function startBuffering(state: BufferState): BufferState {
  return { isBuffering: true, audioBuffer: [] }
}

function addChunk(state: BufferState, chunk: Buffer): BufferState {
  if (!state.isBuffering) return state
  return { ...state, audioBuffer: [...state.audioBuffer, Buffer.from(chunk)] }
}

function stopBuffering(state: BufferState): { state: BufferState; result: Buffer | null } {
  if (state.audioBuffer.length === 0) {
    return { state: { isBuffering: false, audioBuffer: [] }, result: null }
  }
  const fullBuffer = Buffer.concat(state.audioBuffer)
  return { state: { isBuffering: false, audioBuffer: [] }, result: fullBuffer }
}

function getBufferedAudio(state: BufferState): Buffer | null {
  if (state.audioBuffer.length === 0) return null
  return Buffer.concat(state.audioBuffer)
}

describe('startBuffering', () => {
  it('sets isBuffering to true', () => {
    const initial: BufferState = { isBuffering: false, audioBuffer: [] }
    const next = startBuffering(initial)
    expect(next.isBuffering).toBe(true)
  })

  it('clears any previously buffered chunks', () => {
    const initial: BufferState = {
      isBuffering: false,
      audioBuffer: [Buffer.from([0x01, 0x02])],
    }
    const next = startBuffering(initial)
    expect(next.audioBuffer).toHaveLength(0)
  })
})

describe('addChunk', () => {
  it('appends chunk when buffering is active', () => {
    const state: BufferState = { isBuffering: true, audioBuffer: [] }
    const next = addChunk(state, Buffer.from([0x01, 0x02]))
    expect(next.audioBuffer).toHaveLength(1)
    expect(next.audioBuffer[0]).toEqual(Buffer.from([0x01, 0x02]))
  })

  it('does NOT append chunk when buffering is inactive', () => {
    const state: BufferState = { isBuffering: false, audioBuffer: [] }
    const next = addChunk(state, Buffer.from([0x01, 0x02]))
    expect(next.audioBuffer).toHaveLength(0)
  })

  it('accumulates multiple chunks in order', () => {
    let state: BufferState = { isBuffering: true, audioBuffer: [] }
    state = addChunk(state, Buffer.from([0x01]))
    state = addChunk(state, Buffer.from([0x02]))
    state = addChunk(state, Buffer.from([0x03]))
    expect(state.audioBuffer).toHaveLength(3)
  })
})

describe('stopBuffering', () => {
  it('returns null when no audio was buffered', () => {
    const state: BufferState = { isBuffering: true, audioBuffer: [] }
    const { result } = stopBuffering(state)
    expect(result).toBeNull()
  })

  it('returns concatenated buffer when chunks exist', () => {
    const state: BufferState = {
      isBuffering: true,
      audioBuffer: [Buffer.from([0x01, 0x02]), Buffer.from([0x03, 0x04])],
    }
    const { result } = stopBuffering(state)
    expect(result).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x04]))
  })

  it('sets isBuffering to false after stop', () => {
    const state: BufferState = { isBuffering: true, audioBuffer: [Buffer.from([0x01])] }
    const { state: next } = stopBuffering(state)
    expect(next.isBuffering).toBe(false)
  })

  it('clears audioBuffer after stop', () => {
    const state: BufferState = {
      isBuffering: true,
      audioBuffer: [Buffer.from([0x01])],
    }
    const { state: next } = stopBuffering(state)
    expect(next.audioBuffer).toHaveLength(0)
  })

  it('total byte count equals sum of chunk sizes', () => {
    const chunk1 = Buffer.alloc(3200)  // 100ms @ 16kHz
    const chunk2 = Buffer.alloc(3200)
    const state: BufferState = { isBuffering: true, audioBuffer: [chunk1, chunk2] }
    const { result } = stopBuffering(state)
    expect(result?.length).toBe(6400)
  })
})

describe('getBufferedAudio', () => {
  it('returns null when buffer is empty', () => {
    const state: BufferState = { isBuffering: true, audioBuffer: [] }
    expect(getBufferedAudio(state)).toBeNull()
  })

  it('returns current buffer content without stopping', () => {
    const state: BufferState = {
      isBuffering: true,
      audioBuffer: [Buffer.from([0xAA, 0xBB])],
    }
    const result = getBufferedAudio(state)
    expect(result).toEqual(Buffer.from([0xAA, 0xBB]))
    // State should be unchanged (buffering still active)
    expect(state.isBuffering).toBe(true)
    expect(state.audioBuffer).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Audio duration estimation
// 16000 samples/sec × 2 bytes/sample (16-bit PCM) = 32000 bytes/sec
// ---------------------------------------------------------------------------

describe('audio duration estimation', () => {
  const BYTES_PER_SECOND = 32000

  it('1 second of audio = 32000 bytes', () => {
    const duration = 32000 / BYTES_PER_SECOND
    expect(duration).toBe(1)
  })

  it('100ms of audio ≈ 3200 bytes', () => {
    const bytes = 0.1 * BYTES_PER_SECOND
    expect(bytes).toBe(3200)
  })

  it('estimates duration from byte count', () => {
    const byteCount = 64000
    const duration = byteCount / BYTES_PER_SECOND
    expect(duration).toBe(2)
  })

  it('silence check: max sample in silent buffer is 0', () => {
    const silentBuffer = Buffer.alloc(3200, 0)
    let maxSample = 0
    for (let i = 0; i < silentBuffer.length - 1; i += 2) {
      const sample = Math.abs(silentBuffer.readInt16LE(i))
      if (sample > maxSample) maxSample = sample
    }
    expect(maxSample).toBe(0)
  })

  it('silence check: max sample in loud buffer is > 0', () => {
    const loudBuffer = Buffer.alloc(4)
    loudBuffer.writeInt16LE(10000, 0)
    loudBuffer.writeInt16LE(-8000, 2)
    let maxSample = 0
    for (let i = 0; i < loudBuffer.length - 1; i += 2) {
      const sample = Math.abs(loudBuffer.readInt16LE(i))
      if (sample > maxSample) maxSample = sample
    }
    expect(maxSample).toBe(10000)
  })
})

// ---------------------------------------------------------------------------
// Keyword boosting — parse from newline-separated settings string
// ---------------------------------------------------------------------------

describe('keyword parsing from settings', () => {
  it('splits newline-separated keywords into array', () => {
    const raw = 'GitConnect\nOAuth\nrefactor'
    const keywords = raw.split('\n').map(s => s.trim()).filter(Boolean)
    expect(keywords).toEqual(['GitConnect', 'OAuth', 'refactor'])
  })

  it('trims whitespace from each keyword', () => {
    const raw = '  GitConnect  \n  OAuth  '
    const keywords = raw.split('\n').map(s => s.trim()).filter(Boolean)
    expect(keywords).toEqual(['GitConnect', 'OAuth'])
  })

  it('filters empty lines', () => {
    const raw = 'GitConnect\n\n\nOAuth\n'
    const keywords = raw.split('\n').map(s => s.trim()).filter(Boolean)
    expect(keywords).toEqual(['GitConnect', 'OAuth'])
  })

  it('returns empty array for empty string', () => {
    const raw = ''
    const keywords = raw.split('\n').map(s => s.trim()).filter(Boolean)
    expect(keywords).toHaveLength(0)
  })
})
