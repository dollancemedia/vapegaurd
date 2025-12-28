#!/usr/bin/env python3
import argparse
import json
import sys
import time
from typing import Optional

try:
    import serial
    from serial.tools import list_ports
except ImportError:
    print("pyserial is not installed. Please install it with: pip install pyserial", file=sys.stderr)
    sys.exit(1)

# requests is optional, only needed if forwarding to API
try:
    import requests  # type: ignore
except Exception:
    requests = None

DEFAULT_BAUD = 115200
DEFAULT_URL = "http://localhost:8000/api/sensors/data"

VENDOR_HINTS = [
    "USB",
    "UART",
    "CP210",
    "Silicon Labs",
    "Espressif",
    "Arduino",
    "CH340",
]

# Only forward payloads that look like real sensor readings
EXPECTED_SENSOR_KEYS = {
    "humidity",
    "temperature",
    "pm25",
    "pm10",
    "gas_resistance",
    "sound_level",
}


def pick_port(preferred: Optional[str] = None) -> Optional[str]:
    ports = list(list_ports.comports())
    if not ports:
        print("No serial ports detected.")
        return None

    print("Detected serial ports:")
    for p in ports:
        print(f"- {p.device}: {p.description}")

    if preferred:
        for p in ports:
            if p.device.lower() == preferred.lower():
                print(f"Using preferred port: {p.device}")
                return p.device
        print(f"Preferred port '{preferred}' not found among detected ports.")

    # Heuristic: choose the first port with a helpful vendor hint
    for p in ports:
        desc = (p.description or "")
        if any(hint.lower() in desc.lower() for hint in VENDOR_HINTS):
            print(f"Auto-selected port by description match: {p.device} ({desc})")
            return p.device

    # Fallback: last detected port
    print(f"Fallback to last detected port: {ports[-1].device}")
    return ports[-1].device


def extract_json(line: str) -> Optional[dict]:
    # Try to find a JSON object within the line
    start = line.find("{")
    if start == -1:
        return None
    candidate = line[start:].strip()
    # Trim trailing non-JSON characters
    # Attempt to balance braces roughly
    brace_count = 0
    trimmed = []
    for ch in candidate:
        trimmed.append(ch)
        if ch == "{":
            brace_count += 1
        elif ch == "}":
            brace_count -= 1
            if brace_count == 0:
                break
    candidate = "".join(trimmed)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def forward_to_api(payload: dict, url: str, timeout: float = 5.0) -> None:
    if requests is None:
        print("requests library not available; skipping forward.")
        return
    try:
        resp = requests.post(url, json=payload, timeout=timeout)
        print(f"[API] POST {url} -> {resp.status_code}")
        if resp.status_code >= 200 and resp.status_code < 300:
            print(f"[API] Response: {resp.text[:300]}")
        else:
            print(f"[API] Error Response: {resp.text[:300]}")
    except Exception as e:
        print(f"[API] Exception posting to {url}: {e}")


def run_serial_monitor(port: Optional[str], baud: int, forward: bool, url: str):
    chosen = pick_port(port)
    if not chosen:
        print("No usable serial port found.")
        return

    print(f"Opening serial port {chosen} at {baud} baud...")
    try:
        ser = serial.Serial(chosen, baudrate=baud, timeout=1)
    except Exception as e:
        print(f"Failed to open serial port {chosen}: {e}")
        return

    try:
        print("Reading from serial. Press Ctrl+C to stop.")
        while True:
            try:
                line_bytes = ser.readline()
                if not line_bytes:
                    # No data in this interval
                    continue
                try:
                    line = line_bytes.decode("utf-8", errors="ignore").strip()
                except Exception:
                    line = repr(line_bytes)
                if not line:
                    continue
                print(line)

                payload = extract_json(line)
                if payload:
                    print(f"[Parsed JSON] keys: {list(payload.keys())}")
                    if forward:
                        if any(k in payload for k in EXPECTED_SENSOR_KEYS):
                            forward_to_api(payload, url)
                        else:
                            print("[Forward] Skipped non-sensor JSON")
            except KeyboardInterrupt:
                print("Stopping serial monitor...")
                break
            except Exception as e:
                print(f"Serial read error: {e}")
                time.sleep(0.25)
    finally:
        try:
            ser.close()
        except Exception:
            pass
        print("Serial port closed.")


def main():
    parser = argparse.ArgumentParser(description="ESP32 Serial Monitor (optional API forward)")
    parser.add_argument("--port", help="COM port (e.g., COM3). If omitted, auto-detect.")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD, help=f"Baud rate (default {DEFAULT_BAUD})")
    parser.add_argument("--forward", action="store_true", help="Forward parsed JSON to backend API")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Backend API URL for forwarding (default {DEFAULT_URL})")

    args = parser.parse_args()
    run_serial_monitor(args.port, args.baud, args.forward, args.url)


if __name__ == "__main__":
    main()