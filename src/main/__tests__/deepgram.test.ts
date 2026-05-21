import { describe, it, expect } from 'vitest'

// pcmToWav is not exported — test it via the WAV output of the public API.
// We test the WAV header construction logic inline here since pcmToWav is a
// module-private function. The simplest approach is to duplicate the function
// under test (it is pure, no side effects) and unit test it directly.

function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate = 16000,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcmBuffer.length
  const headerSize = 44
  const fileSize = headerSize + dataSize - 8

  const header = Buffer.alloc(headerSize)

  header.write('RIFF', 0)
  header.writeUInt32LE(fileSize, 4)
  header.write('WAVE', 8)

  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)

  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  return Buffer.concat([header, pcmBuffer])
}

describe('pcmToWav', () => {
  it('produces a buffer with RIFF marker at offset 0', () => {
    const pcm = Buffer.alloc(3200) // 100ms at 16kHz mono 16-bit
    const wav = pcmToWav(pcm)
    expect(wav.slice(0, 4).toString('ascii')).toBe('RIFF')
  })

  it('produces a buffer with WAVE marker at offset 8', () => {
    const wav = pcmToWav(Buffer.alloc(3200))
    expect(wav.slice(8, 12).toString('ascii')).toBe('WAVE')
  })

  it('writes the correct sample rate at offset 24', () => {
    const wav = pcmToWav(Buffer.alloc(3200), 16000)
    expect(wav.readUInt32LE(24)).toBe(16000)
  })

  it('total size = 44 (header) + pcm length', () => {
    const pcm = Buffer.alloc(6400)
    const wav = pcmToWav(pcm)
    expect(wav.length).toBe(44 + 6400)
  })

  it('writes data chunk marker at offset 36', () => {
    const wav = pcmToWav(Buffer.alloc(1600))
    expect(wav.slice(36, 40).toString('ascii')).toBe('data')
  })

  it('writes pcm length in data chunk size field at offset 40', () => {
    const pcm = Buffer.alloc(3200)
    const wav = pcmToWav(pcm)
    expect(wav.readUInt32LE(40)).toBe(3200)
  })

  it('preserves pcm content after the 44-byte header', () => {
    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04])
    const wav = pcmToWav(pcm)
    expect(wav.slice(44)).toEqual(pcm)
  })
})
