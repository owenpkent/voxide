/**
 * audio-native.ts — Drop-in replacement for audio.ts using the native WASAPI module.
 *
 * This wraps the Rust voxide-audio NAPI module to match the same interface
 * that main-voxide.ts expects from AudioCapture. The key difference is that
 * streaming uses a callback instead of a PassThrough stream — we bridge that
 * here by writing callback chunks into a PassThrough for Deepgram compatibility.
 */

import { PassThrough } from 'stream';
import path from 'path';

// Load the native module from the native/ directory.
// In production builds, electron-builder copies it to the app resources.
const nativeModulePath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '..', '..', 'native', 'voxide-audio')
    : path.join(process.resourcesPath, 'native', 'voxide-audio');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const native = require(nativeModulePath);

interface NativeAudioCapture {
    start(): Promise<void>;
    stop(): void;
    startPersistent(): Promise<void>;
    isRunning(): boolean;
    getAudioLevel(): number;
    enableStreaming(callback: (err: null, chunk: Buffer) => void): void;
    disableStreaming(): void;
    startBuffering(): void;
    stopBuffering(): Buffer | null;
    getBufferedAudio(): Buffer | null;
}

/**
 * AudioCapture — WASAPI-based audio capture via Rust native module.
 *
 * API matches the ffmpeg-based AudioCapture class so main-voxide.ts can
 * switch between them with zero changes to the IPC handlers.
 */
export class AudioCapture {
    private native: NativeAudioCapture;
    private audioStream: PassThrough | null = null;
    private streamingEnabled = false;

    constructor(deviceName?: string) {
        this.native = new native.AudioCapture(deviceName ?? null);
    }

    /**
     * List available audio input devices.
     * Uses Windows Audio Session API directly — no ffmpeg device scan needed.
     */
    static getAvailableDevices(): string[] {
        return native.AudioCapture.getAvailableDevices();
    }

    /** Start capturing audio. Resolves when WASAPI stream is active. */
    async start(): Promise<void> {
        return this.native.start();
    }

    /** Stop capturing and release the WASAPI device. */
    stop(): void {
        this.disableStreaming();
        this.native.stop();
    }

    /** Start and keep alive (idempotent — safe to call multiple times). */
    async startPersistent(): Promise<void> {
        return this.native.startPersistent();
    }

    /** Whether the capture stream is active. */
    isRunning(): boolean {
        return this.native.isRunning();
    }

    /**
     * Current audio level (0.0–1.0).
     * Calculated in Rust on the audio thread with exponential smoothing.
     */
    getAudioLevel(): number {
        return this.native.getAudioLevel();
    }

    /** Get the current PassThrough stream (for Deepgram). */
    getStream(): PassThrough | null {
        return this.audioStream;
    }

    /**
     * Enable streaming mode. Creates a PassThrough that receives PCM chunks
     * from the native audio callback.
     *
     * The Deepgram SDK expects a Node readable stream, so we bridge the
     * native callback into a PassThrough here.
     */
    enableStreaming(): PassThrough {
        if (this.audioStream && this.streamingEnabled) {
            return this.audioStream;
        }

        this.audioStream = new PassThrough();
        this.streamingEnabled = true;

        this.native.enableStreaming((_err: null, chunk: Buffer) => {
            if (this.streamingEnabled && this.audioStream && !this.audioStream.destroyed) {
                this.audioStream.write(chunk);
            }
        });

        return this.audioStream;
    }

    /** Disable streaming and clean up the PassThrough. */
    disableStreaming(): void {
        this.streamingEnabled = false;
        this.native.disableStreaming();
        if (this.audioStream) {
            this.audioStream.destroy();
            this.audioStream = null;
        }
    }

    /** Start buffering audio chunks in memory (Rust side). */
    startBuffering(): void {
        this.native.startBuffering();
    }

    /** Stop buffering and return accumulated PCM data. */
    stopBuffering(): Buffer | null {
        return this.native.stopBuffering();
    }

    /** Get buffered audio without stopping. */
    getBufferedAudio(): Buffer | null {
        return this.native.getBufferedAudio();
    }
}
