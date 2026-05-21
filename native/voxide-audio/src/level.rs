/// Audio level calculation — RMS + peak blending with exponential smoothing.
/// Mirrors the algorithm in audio.ts but runs on the audio thread.

const SMOOTHING: f64 = 0.35;

/// Calculate the instantaneous level from a PCM S16LE buffer.
/// Returns a value in 0.0–1.0.
pub fn calc_raw_level(samples: &[i16]) -> f64 {
    if samples.is_empty() {
        return 0.0;
    }

    let mut sum_sq: f64 = 0.0;
    let mut peak: i16 = 0;

    for &s in samples {
        sum_sq += (s as f64) * (s as f64);
        let abs = s.unsigned_abs();
        if abs > peak.unsigned_abs() {
            peak = s;
        }
    }

    let rms = (sum_sq / samples.len() as f64).sqrt() / 32768.0;
    let peak_norm = (peak.unsigned_abs() as f64) / 32768.0;

    // Blend: 60% peak, 40% RMS (matches audio.ts formula)
    let raw = (peak_norm * 0.6 + rms * 0.4).min(1.0);

    // Power curve boost for quiet speech
    raw.powf(0.6)
}

/// Apply exponential smoothing. Rise fast, fall slow.
pub fn smooth(current: f64, new_sample: f64) -> f64 {
    let alpha = if new_sample > current {
        SMOOTHING * 1.5 // Rise fast
    } else {
        SMOOTHING * 0.7 // Fall slow
    };
    current * (1.0 - alpha) + new_sample * alpha
}
