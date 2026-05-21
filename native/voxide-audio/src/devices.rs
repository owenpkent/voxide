/// Audio device enumeration using cpal (WASAPI on Windows).

use cpal::traits::{DeviceTrait, HostTrait};

/// List all available audio input device names.
pub fn list_input_devices() -> anyhow::Result<Vec<String>> {
    let host = cpal::default_host();
    let devices = host.input_devices()?;
    let mut names = Vec::new();
    for device in devices {
        if let Ok(name) = device.name() {
            names.push(name);
        }
    }
    Ok(names)
}

/// Find a specific input device by name, or fall back to the default.
pub fn find_device(name: Option<&str>) -> anyhow::Result<cpal::Device> {
    let host = cpal::default_host();

    if let Some(target) = name {
        let devices = host.input_devices()?;
        for device in devices {
            if let Ok(dev_name) = device.name() {
                if dev_name == target {
                    return Ok(device);
                }
            }
        }
        // Partial match fallback
        let devices = host.input_devices()?;
        for device in devices {
            if let Ok(dev_name) = device.name() {
                if dev_name.contains(target) || target.contains(&dev_name) {
                    return Ok(device);
                }
            }
        }
    }

    // Default device
    host.default_input_device()
        .ok_or_else(|| anyhow::anyhow!("No default audio input device found"))
}
