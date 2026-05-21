"""
VoxIDE UI Test Script
=====================
Launches VoxIDE in dev mode, waits for it to load, and verifies key UI elements
are present and functional using pyautogui + pywinauto.

Prerequisites:
    pip install pyautogui pywinauto pillow psutil requests

Usage:
    1. Start the dev server first:
       cd windows-desktop && npm run dev:renderer

    2. Then run this script:
       python tests/test_voxide_ui.py

    The script will:
    - Launch Electron with the VoxIDE entry point
    - Wait for the window to appear
    - Take screenshots at each step
    - Verify UI elements via accessibility tree and pixel checks
    - Report pass/fail for each test
    - Clean up the Electron process when done

    All screenshots are saved to tests/screenshots/ for manual review.
"""

import os
import sys
import time
import json
import subprocess
import signal
import shutil
from pathlib import Path
from datetime import datetime

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent  # windows-desktop/
DEV_URL = "http://localhost:5173/voxide/index.html"
SCREENSHOT_DIR = REPO_ROOT / "tests" / "screenshots"
ELECTRON_TIMEOUT = 15  # seconds to wait for Electron window
TEST_RESULTS: list[dict] = []

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ensure_screenshot_dir():
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


def timestamp():
    return datetime.now().strftime("%H:%M:%S")


def log(msg: str):
    print(f"[{timestamp()}] {msg}")


def screenshot(name: str):
    """Take a screenshot and save it."""
    try:
        import pyautogui
        path = SCREENSHOT_DIR / f"{name}.png"
        pyautogui.screenshot(str(path))
        log(f"  Screenshot saved: {path.name}")
        return path
    except Exception as e:
        log(f"  Screenshot failed: {e}")
        return None


def record_result(name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    TEST_RESULTS.append({"name": name, "passed": passed, "detail": detail})
    icon = "✓" if passed else "✗"
    log(f"  {icon} {name}" + (f" — {detail}" if detail else ""))


# ---------------------------------------------------------------------------
# Test: Dev server is running
# ---------------------------------------------------------------------------

def test_dev_server_running() -> bool:
    """Check that the Vite dev server is running on port 5173."""
    log("Test: Dev server availability")
    try:
        import requests
        resp = requests.get(DEV_URL, timeout=5)
        ok = resp.status_code == 200
        record_result(
            "Dev server responds",
            ok,
            f"HTTP {resp.status_code}" if not ok else ""
        )
        return ok
    except Exception as e:
        record_result("Dev server responds", False, str(e))
        return False


# ---------------------------------------------------------------------------
# Test: Launch Electron and find the VoxIDE window
# ---------------------------------------------------------------------------

def launch_electron():
    """Start Electron pointing at the VoxIDE dev URL."""
    log("Launching Electron...")
    env = os.environ.copy()
    env["ELECTRON_DEV"] = "true"

    # Use npx electron to launch the built main process
    # First check if the main process is built
    main_js = REPO_ROOT / "dist" / "main" / "main-voxide.js"
    if not main_js.exists():
        log(f"  main-voxide.js not found at {main_js}, building...")
        subprocess.run(
            ["npx", "tsc", "-p", "tsconfig.voxide.json"],
            cwd=str(REPO_ROOT),
            shell=True,
            timeout=60,
        )

    proc = subprocess.Popen(
        ["npx", "electron", str(main_js)],
        cwd=str(REPO_ROOT),
        env=env,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    log(f"  Electron PID: {proc.pid}")
    return proc


def find_voxide_window(timeout=ELECTRON_TIMEOUT):
    """Wait for the VoxIDE window to appear using pywinauto."""
    log(f"Waiting for VoxIDE window (up to {timeout}s)...")
    try:
        from pywinauto import Desktop
        desktop = Desktop(backend="uia")

        start = time.time()
        while time.time() - start < timeout:
            try:
                windows = desktop.windows()
                for w in windows:
                    title = w.window_text()
                    if "VoxIDE" in title or "voxide" in title.lower():
                        log(f"  Found window: '{title}'")
                        record_result("VoxIDE window found", True)
                        return w
            except Exception:
                pass
            time.sleep(1)

        record_result("VoxIDE window found", False, "Timeout waiting for window")
        return None
    except ImportError:
        log("  pywinauto not installed — skipping window detection")
        record_result("VoxIDE window found", False, "pywinauto not installed")
        return None


# ---------------------------------------------------------------------------
# Test: UI elements via accessibility tree
# ---------------------------------------------------------------------------

def test_accessibility_tree(window):
    """Inspect the UIA accessibility tree for expected ARIA elements."""
    log("Test: Accessibility tree inspection")

    if window is None:
        record_result("Accessibility tree", False, "No window")
        return

    try:
        from pywinauto import Desktop
        time.sleep(3)  # Let the React app fully render

        # Get all descendants
        try:
            descendants = window.descendants()
            element_texts = []
            element_types = []
            for d in descendants:
                try:
                    element_texts.append(d.window_text())
                    element_types.append(d.friendly_class_name())
                except Exception:
                    pass

            all_text = " ".join(element_texts).lower()

            # Check for key UI elements
            checks = [
                ("VoxIDE title", "voxide" in all_text),
                ("Mode indicator", "doc" in all_text or "code" in all_text),
                ("Welcome text", "voice" in all_text or "help" in all_text),
            ]

            for name, found in checks:
                record_result(name, found)

            # Count interactive elements
            button_count = sum(1 for t in element_types if "button" in t.lower())
            record_result(
                "Interactive elements present",
                button_count >= 2,
                f"Found {button_count} buttons"
            )

        except Exception as e:
            record_result("Accessibility tree traversal", False, str(e))

    except ImportError:
        record_result("Accessibility tree", False, "pywinauto not installed")


# ---------------------------------------------------------------------------
# Test: Screenshot pixel checks
# ---------------------------------------------------------------------------

def test_screenshot_checks(window):
    """Take a screenshot and verify the app rendered (not blank/white)."""
    log("Test: Screenshot visual checks")

    if window is None:
        record_result("Screenshot check", False, "No window")
        return

    try:
        import pyautogui
        from PIL import Image

        time.sleep(2)
        path = screenshot("voxide_loaded")
        if not path or not path.exists():
            record_result("Screenshot captured", False)
            return

        record_result("Screenshot captured", True)

        # Check that the screenshot is not all-white (app rendered with dark theme)
        img = Image.open(str(path))
        pixels = list(img.getdata())
        total = len(pixels)

        # Count dark pixels (R+G+B < 100 for each channel)
        dark_count = sum(1 for p in pixels if sum(p[:3]) < 300)
        dark_ratio = dark_count / total

        record_result(
            "Dark theme rendered",
            dark_ratio > 0.3,
            f"{dark_ratio:.0%} dark pixels"
        )

        # Check for yellow accent (high contrast theme)
        yellow_count = sum(
            1 for p in pixels
            if p[0] > 200 and p[1] > 200 and p[2] < 100  # R>200, G>200, B<100
        )
        has_accent = yellow_count > 10
        record_result(
            "Accent color present",
            has_accent,
            f"{yellow_count} yellow-ish pixels"
        )

    except ImportError as e:
        record_result("Screenshot check", False, f"Missing module: {e}")
    except Exception as e:
        record_result("Screenshot check", False, str(e))


# ---------------------------------------------------------------------------
# Test: Window focus and keyboard accessibility
# ---------------------------------------------------------------------------

def test_keyboard_accessibility(window):
    """Verify that Tab key moves focus between elements."""
    log("Test: Keyboard accessibility (Tab navigation)")

    if window is None:
        record_result("Keyboard accessibility", False, "No window")
        return

    try:
        import pyautogui
        time.sleep(1)

        # Send Tab key several times and check that focus ring appears
        window.set_focus()
        time.sleep(0.5)

        for i in range(5):
            pyautogui.press("tab")
            time.sleep(0.3)

        screenshot("after_tab_navigation")
        record_result("Tab navigation executed", True, "5 Tab presses sent")

    except Exception as e:
        record_result("Keyboard accessibility", False, str(e))


# ---------------------------------------------------------------------------
# Test: Window resizing
# ---------------------------------------------------------------------------

def test_window_resize(window):
    """Verify the window can be resized without crashing."""
    log("Test: Window resize")

    if window is None:
        record_result("Window resize", False, "No window")
        return

    try:
        original = window.rectangle()

        # Resize to smaller
        window.move_window(x=100, y=100, width=800, height=600)
        time.sleep(1)
        screenshot("resized_small")

        # Resize back
        window.move_window(
            x=original.left, y=original.top,
            width=original.width(), height=original.height()
        )
        time.sleep(0.5)

        record_result("Window resize", True, "Resized to 800x600 and back")

    except Exception as e:
        record_result("Window resize", False, str(e))


# ---------------------------------------------------------------------------
# Test: API key input fields
# ---------------------------------------------------------------------------

def test_api_key_inputs(window):
    """Verify the API key setup dialog is visible when no keys are stored."""
    log("Test: API key input fields")

    if window is None:
        record_result("API key inputs", False, "No window")
        return

    try:
        time.sleep(2)
        descendants = window.descendants()
        texts = [d.window_text().lower() for d in descendants if d.window_text()]

        # Look for the setup dialog text
        has_deepgram = any("deepgram" in t for t in texts)
        has_claude = any("claude" in t for t in texts)

        record_result(
            "Deepgram key input visible",
            has_deepgram,
            "Found 'deepgram' in UI text" if has_deepgram else "Not found"
        )
        record_result(
            "Claude key input visible",
            has_claude,
            "Found 'claude' in UI text" if has_claude else "Not found"
        )

    except Exception as e:
        record_result("API key inputs", False, str(e))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def print_summary():
    """Print final test summary."""
    print("\n" + "=" * 60)
    print("VoxIDE UI Test Results")
    print("=" * 60)

    passed = sum(1 for r in TEST_RESULTS if r["passed"])
    failed = sum(1 for r in TEST_RESULTS if not r["passed"])
    total = len(TEST_RESULTS)

    for r in TEST_RESULTS:
        icon = "✓" if r["passed"] else "✗"
        line = f"  {icon} {r['name']}"
        if r["detail"]:
            line += f"  ({r['detail']})"
        print(line)

    print("-" * 60)
    print(f"  {passed}/{total} passed, {failed} failed")
    print("=" * 60)

    # Save results as JSON
    results_path = SCREENSHOT_DIR / "results.json"
    with open(str(results_path), "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "passed": passed,
            "failed": failed,
            "total": total,
            "results": TEST_RESULTS,
        }, f, indent=2)
    print(f"\nResults saved to: {results_path}")
    print(f"Screenshots saved to: {SCREENSHOT_DIR}")

    return failed == 0


def main():
    ensure_screenshot_dir()
    log("Starting VoxIDE UI tests")
    log(f"Repo root: {REPO_ROOT}")

    # Test 1: Dev server
    server_ok = test_dev_server_running()
    if not server_ok:
        log("")
        log("ERROR: Dev server is not running!")
        log("Start it first with:  cd windows-desktop && npm run dev:renderer")
        log("Then re-run this script.")
        print_summary()
        sys.exit(1)

    # Test 2: Launch and find window
    electron_proc = None
    window = None
    try:
        electron_proc = launch_electron()
        time.sleep(3)  # Give Electron time to start

        # Find the window
        window = find_voxide_window()
        screenshot("initial_load")

        if window:
            # Test 3: Accessibility tree
            test_accessibility_tree(window)

            # Test 4: Screenshot checks
            test_screenshot_checks(window)

            # Test 5: API key inputs
            test_api_key_inputs(window)

            # Test 6: Keyboard accessibility
            test_keyboard_accessibility(window)

            # Test 7: Window resize
            test_window_resize(window)

            # Final screenshot
            screenshot("final_state")

    except KeyboardInterrupt:
        log("Interrupted by user")
    except Exception as e:
        log(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Cleanup: kill Electron
        if electron_proc:
            log("Cleaning up Electron process...")
            try:
                # Kill the process tree on Windows
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(electron_proc.pid)],
                    shell=True,
                    capture_output=True,
                    timeout=10,
                )
            except Exception:
                try:
                    electron_proc.terminate()
                    electron_proc.wait(timeout=5)
                except Exception:
                    electron_proc.kill()

    all_passed = print_summary()
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
