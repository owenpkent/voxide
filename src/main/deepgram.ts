import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk'
import { PassThrough } from 'stream'

type TranscriptCallback = (transcript: string, isFinal: boolean) => void

export interface BatchTranscriptResult {
  transcript: string
  confidence: number
  duration: number
}

// Convert raw PCM buffer to WAV format
function pcmToWav(pcmBuffer: Buffer, sampleRate: number = 16000, channels: number = 1, bitsPerSample: number = 16): Buffer {
  const byteRate = sampleRate * channels * bitsPerSample / 8
  const blockAlign = channels * bitsPerSample / 8
  const dataSize = pcmBuffer.length
  const headerSize = 44
  const fileSize = headerSize + dataSize - 8
  
  const header = Buffer.alloc(headerSize)
  
  // RIFF header
  header.write('RIFF', 0)
  header.writeUInt32LE(fileSize, 4)
  header.write('WAVE', 8)
  
  // fmt chunk
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)           // fmt chunk size
  header.writeUInt16LE(1, 20)            // audio format (1 = PCM)
  header.writeUInt16LE(channels, 22)     // number of channels
  header.writeUInt32LE(sampleRate, 24)   // sample rate
  header.writeUInt32LE(byteRate, 28)     // byte rate
  header.writeUInt16LE(blockAlign, 32)   // block align
  header.writeUInt16LE(bitsPerSample, 34) // bits per sample
  
  // data chunk
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  
  return Buffer.concat([header, pcmBuffer])
}

export class DeepgramStreamer {
  private client: ReturnType<typeof createClient>
  private connection: LiveClient | null = null
  private isConnected: boolean = false
  private audioStream: PassThrough | null = null
  private dataHandler: ((chunk: Buffer) => void) | null = null
  private errorHandler: ((err: Error) => void) | null = null
  private endHandler: (() => void) | null = null

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Deepgram API key is required')
    }
    this.client = createClient(apiKey)
  }

  async start(audioStream: PassThrough, onTranscript: TranscriptCallback): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('Connecting to Deepgram...')

        const options = {
          model: 'nova-3',
          language: 'en-US',
          interim_results: true,
          punctuate: true,
          smart_format: true,
          dictation: true,
          vad_events: true,
          utterance_end_ms: 500,   // Reduced from 1000ms: finalize faster after silence
          endpointing: 200,        // Reduced from 300ms: shorter pause = end of sentence
          encoding: 'linear16' as const,
          sample_rate: 16000,
          channels: 1,
        }

        this.connection = this.client.listen.live(options)

        this.connection.on(LiveTranscriptionEvents.Open, () => {
          console.log('Deepgram connection opened')
          this.isConnected = true
          resolve()
        })

        this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
          if (data.channel?.alternatives?.[0]) {
            const transcript = data.channel.alternatives[0].transcript
            const isFinal = data.is_final === true

            if (transcript) {
              console.log(`[${isFinal ? 'final' : 'interim'}] ${transcript}`)
              onTranscript(transcript, isFinal)
            }
          }
        })

        this.connection.on(LiveTranscriptionEvents.Error, (err: Error) => {
          console.error('Deepgram error:', err.message)
          this.isConnected = false
        })

        this.connection.on(LiveTranscriptionEvents.Close, () => {
          console.log('Deepgram connection closed')
          this.isConnected = false
        })

        // Store stream reference so stop() can remove listeners
        this.audioStream = audioStream

        this.dataHandler = (chunk: Buffer) => {
          if (this.isConnected && this.connection) {
            try {
              const arrayBuffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)
              this.connection.send(arrayBuffer)
            } catch (err) {
              console.error('Error sending audio chunk:', (err as Error).message)
            }
          }
        }

        this.errorHandler = (err: Error) => {
          console.error('Audio stream error:', err.message)
          this.stop()
          reject(err)
        }

        this.endHandler = () => {
          console.log('Audio stream ended')
          this.stop()
        }

        audioStream.on('data', this.dataHandler)
        audioStream.on('error', this.errorHandler)
        audioStream.on('end', this.endHandler)

      } catch (err) {
        console.error('Failed to start Deepgram:', err)
        reject(err)
      }
    })
  }

  stop(): void {
    // Remove audio stream listeners before closing connection to prevent
    // stale chunks being sent if the ffmpeg stream outlives this session
    if (this.audioStream) {
      if (this.dataHandler)  this.audioStream.removeListener('data',  this.dataHandler)
      if (this.errorHandler) this.audioStream.removeListener('error', this.errorHandler)
      if (this.endHandler)   this.audioStream.removeListener('end',   this.endHandler)
      this.dataHandler = null
      this.errorHandler = null
      this.endHandler = null
      this.audioStream = null
    }
    if (this.connection) {
      console.log('Stopping Deepgram connection...')
      this.connection.finish()
      this.connection = null
      this.isConnected = false
    }
  }

  isLive(): boolean {
    return this.isConnected
  }

  async transcribeBatch(audioBuffer: Buffer, keywords?: string[]): Promise<BatchTranscriptResult> {
    console.log(`[Deepgram] Transcribing batch audio: ${audioBuffer.length} bytes`)
    
    // Calculate audio duration: 16000 samples/sec * 2 bytes/sample = 32000 bytes/sec
    const estimatedDuration = audioBuffer.length / 32000
    console.log(`[Deepgram] Estimated audio duration: ${estimatedDuration.toFixed(2)} seconds`)
    
    // Check if audio has any content (not just silence)
    let maxSample = 0
    for (let i = 0; i < Math.min(audioBuffer.length, 10000); i += 2) {
      const sample = Math.abs(audioBuffer.readInt16LE(i))
      if (sample > maxSample) maxSample = sample
    }
    console.log(`[Deepgram] Max sample in first 10KB: ${maxSample} (silence threshold ~500)`)
    
    if (maxSample < 500) {
      console.warn('[Deepgram] Audio appears to be mostly silence!')
    }
    
    try {
      // Convert raw PCM to WAV format for reliable processing
      const wavBuffer = pcmToWav(audioBuffer, 16000, 1, 16)
      console.log(`[Deepgram] Converted to WAV: ${wavBuffer.length} bytes`)
      console.log('[Deepgram] Calling transcribeFile API...')
      
      const transcribeOptions: Record<string, unknown> = {
        model: 'nova-3',
        language: 'en-US',
        punctuate: true,
        smart_format: true,
        dictation: true,
        mimetype: 'audio/wav',
      }
      if (keywords && keywords.length > 0) {
        transcribeOptions['keywords'] = keywords
        console.log(`[Deepgram] Keyword boosting: ${keywords.join(', ')}`)
      }

      const response = await this.client.listen.prerecorded.transcribeFile(
        wavBuffer,
        transcribeOptions as Parameters<typeof this.client.listen.prerecorded.transcribeFile>[1]
      )

      // Debug: Log the entire response object structure
      console.log('[Deepgram] Response type:', typeof response)
      console.log('[Deepgram] Response keys:', Object.keys(response || {}))
      console.log('[Deepgram] Full response:', JSON.stringify(response, null, 2).substring(0, 1500))
      
      // Try different ways to access the result
      const result = (response as any)?.result || response
      console.log('[Deepgram] Result type:', typeof result)
      console.log('[Deepgram] Result keys:', Object.keys(result || {}))
      
      // Check for error in response
      if ((response as any)?.error || (result as any)?.error) {
        console.error('[Deepgram] API returned error:', (response as any)?.error || (result as any)?.error)
      }
      
      const transcript = (result as any)?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
      const confidence = (result as any)?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0
      const duration = (result as any)?.metadata?.duration || 0

      console.log(`[Deepgram] Batch transcription complete: "${transcript}" (confidence: ${confidence}, duration: ${duration}s)`)
      
      return {
        transcript,
        confidence,
        duration
      }
    } catch (err: any) {
      console.error('[Deepgram] Batch transcription failed!')
      console.error('[Deepgram] Error message:', err?.message)
      console.error('[Deepgram] Error name:', err?.name)
      console.error('[Deepgram] Error stack:', err?.stack)
      console.error('[Deepgram] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
      throw err
    }
  }
}
