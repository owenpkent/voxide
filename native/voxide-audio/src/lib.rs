mod capture;
mod devices;
mod level;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction};
use napi_derive::napi;

use capture::CaptureInner;

/// Native audio capture using WASAPI (Windows) via cpal.
/// Drop-in replacement for the ffmpeg-based AudioCapture in audio.ts.
///
/// Audio format: PCM S16LE, 16 kHz, mono — matching Deepgram's expected input.
#[napi]
pub struct AudioCapture {
    inner: CaptureInner,
}

#[napi]
impl AudioCapture {
    #[napi(constructor)]
    pub fn new(device_name: Option<String>) -> Self {
        Self {
            inner: CaptureInner::new(device_name),
        }
    }

    /// List available audio input devices.
    #[napi]
    pub fn get_available_devices() -> Result<Vec<String>> {
        devices::list_input_devices()
            .map_err(|e| Error::from_reason(format!("Failed to list audio devices: {e}")))
    }

    /// Start capturing audio from the selected device.
    /// Resolves once audio is flowing.
    #[napi]
    pub fn start(&self, env: Env) -> Result<napi::JsObject> {
        let inner_ptr = &self.inner as *const CaptureInner as usize;
        env.execute_tokio_future(
            async move {
                // Safety: CaptureInner communicates via channels, the pointer is stable
                // because AudioCapture is prevent from being GC'd while the future is alive.
                let inner = unsafe { &*(inner_ptr as *const CaptureInner) };
                inner
                    .start()
                    .map_err(|e| Error::from_reason(format!("Failed to start capture: {e}")))
            },
            |_env, _: ()| Ok(()),
        )
    }

    /// Stop capturing and release the device.
    #[napi]
    pub fn stop(&self) {
        self.inner.stop();
    }

    /// Start and keep alive (pre-warm). Same as start() but idempotent.
    #[napi]
    pub fn start_persistent(&self, env: Env) -> Result<napi::JsObject> {
        if self.inner.is_running() {
            return env.execute_tokio_future(async { Ok(()) }, |_env, _: ()| Ok(()));
        }
        self.start(env)
    }

    /// Whether the capture stream is currently active.
    #[napi]
    pub fn is_running(&self) -> bool {
        self.inner.is_running()
    }

    /// Current audio level (0.0–1.0), smoothed via exponential moving average.
    #[napi]
    pub fn get_audio_level(&self) -> f64 {
        self.inner.audio_level()
    }

    /// Enable streaming mode. Returns raw PCM chunks via the provided callback.
    #[napi(ts_args_type = "callback: (err: null, chunk: Buffer) => void")]
    pub fn enable_streaming(&self, callback: JsFunction) -> Result<()> {
        let tsfn: ThreadsafeFunction<Vec<u8>, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx| {
                let buf = Buffer::from(ctx.value);
                Ok(vec![buf])
            })?;
        self.inner.enable_streaming(tsfn);
        Ok(())
    }

    /// Disable streaming mode.
    #[napi]
    pub fn disable_streaming(&self) {
        self.inner.disable_streaming();
    }

    /// Start buffering audio chunks in memory.
    #[napi]
    pub fn start_buffering(&self) {
        self.inner.start_buffering();
    }

    /// Stop buffering and return the accumulated PCM data.
    #[napi]
    pub fn stop_buffering(&self) -> Option<Buffer> {
        self.inner.stop_buffering().map(|v| v.into())
    }

    /// Get current buffered audio without stopping.
    #[napi]
    pub fn get_buffered_audio(&self) -> Option<Buffer> {
        self.inner.get_buffered_audio().map(|v| v.into())
    }
}
