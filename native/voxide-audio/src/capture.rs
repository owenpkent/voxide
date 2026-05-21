/// Core capture engine.
///
/// Architecture: The cpal Stream is !Send (WASAPI COM requirement), so it must
/// live on a dedicated thread. We split into:
///   - SharedState (Send+Sync): audio level, buffers, streaming callback
///   - Audio thread: owns the cpal Stream, writes into SharedState
///   - CaptureInner: main-thread handle, communicates with audio thread via channels

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread::JoinHandle;

use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::StreamConfig;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use parking_lot::Mutex;

use crate::devices;
use crate::level;

/// State shared between the audio callback and the Node main thread.
/// This struct is Send+Sync — no cpal types inside.
pub struct SharedState {
    /// Smoothed audio level stored as u64 bits (atomic f64).
    audio_level: AtomicU64,
    /// Whether streaming is active.
    streaming_enabled: AtomicBool,
    /// Callback + buffering state behind a mutex (only locked briefly).
    mutable: Mutex<MutableState>,
}

struct MutableState {
    stream_callback: Option<ThreadsafeFunction<Vec<u8>, ErrorStrategy::Fatal>>,
    buffering: bool,
    buffer: Vec<Vec<u8>>,
    buffer_bytes: usize,
}

// Safety: SharedState only contains atomics and a Mutex of Send types.
unsafe impl Send for SharedState {}
unsafe impl Sync for SharedState {}

impl SharedState {
    fn new() -> Self {
        Self {
            audio_level: AtomicU64::new(0.0f64.to_bits()),
            streaming_enabled: AtomicBool::new(false),
            mutable: Mutex::new(MutableState {
                stream_callback: None,
                buffering: false,
                buffer: Vec::new(),
                buffer_bytes: 0,
            }),
        }
    }

    fn set_level(&self, level: f64) {
        self.audio_level
            .store(level.to_bits(), Ordering::Relaxed);
    }

    pub fn get_level(&self) -> f64 {
        f64::from_bits(self.audio_level.load(Ordering::Relaxed))
    }
}

/// Commands sent to the audio thread.
enum AudioCmd {
    Start {
        device_name: Option<String>,
        result_tx: mpsc::Sender<anyhow::Result<()>>,
    },
    Stop,
    Shutdown,
}

/// Main-thread handle for the capture engine.
pub struct CaptureInner {
    shared: Arc<SharedState>,
    cmd_tx: Option<mpsc::Sender<AudioCmd>>,
    thread: Option<JoinHandle<()>>,
    running: Arc<AtomicBool>,
    device_name: Option<String>,
}

impl CaptureInner {
    pub fn new(device_name: Option<String>) -> Self {
        let shared = Arc::new(SharedState::new());
        let running = Arc::new(AtomicBool::new(false));
        let (cmd_tx, cmd_rx) = mpsc::channel();

        let shared_clone = shared.clone();
        let running_clone = running.clone();

        let thread = std::thread::Builder::new()
            .name("voxide-audio".into())
            .spawn(move || {
                audio_thread_main(cmd_rx, shared_clone, running_clone);
            })
            .expect("Failed to spawn audio thread");

        Self {
            shared,
            cmd_tx: Some(cmd_tx),
            thread: Some(thread),
            running,
            device_name,
        }
    }

    /// Start capturing. Blocks until the audio stream is active.
    pub fn start(&self) -> anyhow::Result<()> {
        let device_name = self.device_name.as_deref();
        if self.running.load(Ordering::Relaxed) {
            return Ok(());
        }
        let (result_tx, result_rx) = mpsc::channel();
        if let Some(ref tx) = self.cmd_tx {
            tx.send(AudioCmd::Start {
                device_name: device_name.map(String::from),
                result_tx,
            })
            .map_err(|_| anyhow::anyhow!("Audio thread not running"))?;
        }
        result_rx
            .recv()
            .map_err(|_| anyhow::anyhow!("Audio thread died"))?
    }

    pub fn stop(&self) {
        if let Some(ref tx) = self.cmd_tx {
            let _ = tx.send(AudioCmd::Stop);
        }
        // Wait briefly for the thread to process the stop
        std::thread::sleep(std::time::Duration::from_millis(10));
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }

    pub fn audio_level(&self) -> f64 {
        self.shared.get_level()
    }

    pub fn enable_streaming(
        &self,
        callback: ThreadsafeFunction<Vec<u8>, ErrorStrategy::Fatal>,
    ) {
        let mut state = self.shared.mutable.lock();
        state.stream_callback = Some(callback);
        self.shared.streaming_enabled.store(true, Ordering::Release);
    }

    pub fn disable_streaming(&self) {
        self.shared
            .streaming_enabled
            .store(false, Ordering::Release);
        let mut state = self.shared.mutable.lock();
        state.stream_callback = None;
    }

    pub fn start_buffering(&self) {
        let mut state = self.shared.mutable.lock();
        state.buffering = true;
        state.buffer.clear();
        state.buffer_bytes = 0;
    }

    pub fn stop_buffering(&self) -> Option<Vec<u8>> {
        let mut state = self.shared.mutable.lock();
        state.buffering = false;
        if state.buffer.is_empty() {
            return None;
        }
        let mut combined = Vec::with_capacity(state.buffer_bytes);
        for chunk in state.buffer.drain(..) {
            combined.extend_from_slice(&chunk);
        }
        state.buffer_bytes = 0;
        Some(combined)
    }

    pub fn get_buffered_audio(&self) -> Option<Vec<u8>> {
        let state = self.shared.mutable.lock();
        if state.buffer.is_empty() {
            return None;
        }
        let mut combined = Vec::with_capacity(state.buffer_bytes);
        for chunk in &state.buffer {
            combined.extend_from_slice(chunk);
        }
        Some(combined)
    }
}

impl Drop for CaptureInner {
    fn drop(&mut self) {
        if let Some(tx) = self.cmd_tx.take() {
            let _ = tx.send(AudioCmd::Shutdown);
        }
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }
}

/// The audio thread event loop. Owns the cpal Stream (which is !Send).
fn audio_thread_main(
    cmd_rx: mpsc::Receiver<AudioCmd>,
    shared: Arc<SharedState>,
    running: Arc<AtomicBool>,
) {
    // The cpal stream lives here — never crosses thread boundaries.
    let mut _stream: Option<cpal::Stream> = None;

    loop {
        match cmd_rx.recv() {
            Ok(AudioCmd::Start {
                device_name,
                result_tx,
            }) => {
                // Drop any existing stream first
                _stream = None;
                running.store(false, Ordering::Release);

                let result = build_and_start_stream(
                    device_name.as_deref(),
                    shared.clone(),
                    running.clone(),
                );

                match result {
                    Ok(stream) => {
                        _stream = Some(stream);
                        running.store(true, Ordering::Release);
                        let _ = result_tx.send(Ok(()));
                    }
                    Err(e) => {
                        let _ = result_tx.send(Err(e));
                    }
                }
            }
            Ok(AudioCmd::Stop) => {
                _stream = None;
                running.store(false, Ordering::Release);
                shared.set_level(0.0);
            }
            Ok(AudioCmd::Shutdown) => {
                _stream = None;
                running.store(false, Ordering::Release);
                break;
            }
            Err(_) => {
                // Channel closed, main thread dropped CaptureInner
                break;
            }
        }
    }
}

/// Build a cpal input stream for the given device.
fn build_and_start_stream(
    device_name: Option<&str>,
    shared: Arc<SharedState>,
    running: Arc<AtomicBool>,
) -> anyhow::Result<cpal::Stream> {
    let device = devices::find_device(device_name)?;

    let config = StreamConfig {
        channels: 1,
        sample_rate: cpal::SampleRate(16000),
        buffer_size: cpal::BufferSize::Fixed(512), // ~32ms at 16kHz
    };

    let stream = device.build_input_stream(
        &config,
        move |data: &[f32], _info: &cpal::InputCallbackInfo| {
            if !running.load(Ordering::Relaxed) {
                return;
            }

            // Convert f32 samples to i16
            let samples: Vec<i16> = data
                .iter()
                .map(|&s| {
                    let clamped = s.clamp(-1.0, 1.0);
                    (clamped * 32767.0) as i16
                })
                .collect();

            // Calculate and update audio level (lock-free atomic)
            let raw_level = level::calc_raw_level(&samples);
            let current = shared.get_level();
            let smoothed = level::smooth(current, raw_level);
            shared.set_level(smoothed);

            // Convert to S16LE bytes
            let mut bytes: Vec<u8> = Vec::with_capacity(samples.len() * 2);
            for s in &samples {
                bytes.extend_from_slice(&s.to_le_bytes());
            }

            // Lock once for both streaming and buffering
            let mut state = shared.mutable.lock();

            if shared.streaming_enabled.load(Ordering::Relaxed) {
                if let Some(ref cb) = state.stream_callback {
                    let _ =
                        cb.call(bytes.clone(), ThreadsafeFunctionCallMode::NonBlocking);
                }
            }

            if state.buffering {
                state.buffer_bytes += bytes.len();
                state.buffer.push(bytes);
            }
        },
        |err| {
            eprintln!("[voxide-audio] capture error: {err}");
        },
        None,
    )?;

    stream.play()?;
    Ok(stream)
}
