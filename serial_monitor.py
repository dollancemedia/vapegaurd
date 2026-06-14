"""
Training serial monitor — watches for DEEP_SENSE triggers and auto-records
timestamps. Just vape at the sensor and this script logs every confirmed event.

Press Ctrl+C when done to save the labels JSON.

Usage: python serial_monitor.py
"""

import serial
import json
from datetime import datetime, timezone, timedelta

PORT = "COM3"
BAUD = 115200
LABELS_PATH = "backend/training/bmv080_v2_labels.json"

ser = serial.Serial(PORT, BAUD, timeout=1)

events = []
session_start = datetime.now(timezone.utc)
in_deep_sense = False

print("=" * 60)
print("  TRAINING MONITOR")
print("=" * 60)
print(f"  Listening on {PORT}")
print(f"  Session started: {session_start.strftime('%I:%M:%S %p')} UTC")
print()
print("  Just vape at the sensor. This script auto-records every")
print("  DEEP_SENSE trigger. Press Ctrl+C when done to save labels.")
print("=" * 60)
print()

try:
    while True:
        line = ser.readline().decode("utf-8", errors="ignore").strip()
        if not line:
            continue

        # Highlight important lines
        if "LOCAL SPIKE" in line or "DEEP_SENSE" in line.upper():
            if "entering DEEP_SENSE" in line or "SNIFF -> DEEP_SENSE" in line:
                if not in_deep_sense:
                    in_deep_sense = True
                    ts = datetime.now(timezone.utc)
                    events.append(ts)
                    n = len(events)
                    local = ts.astimezone().strftime("%I:%M:%S %p")
                    print(f"\n  >>>  VAPE #{n} DETECTED  —  {local}  <<<\n")
            print(f"  ** {line}")
        elif "Deep sense complete" in line:
            in_deep_sense = False
            print(f"  ** {line}")
        elif "COOLDOWN" in line or "cooldown" in line.lower():
            print(f"  -- {line}")
        elif "Heartbeat" in line:
            print(f"  . {line}")
        elif "Sniff #" in line:
            print(f"  . {line}")
        elif "State:" in line:
            print(f"  >> {line}")
        elif "Baseline frozen" in line:
            print(f"\n  ++ {line}\n")
        else:
            print(f"     {line}")

except KeyboardInterrupt:
    pass

ser.close()
session_end = datetime.now(timezone.utc)

print()
print("=" * 60)
print(f"  SESSION COMPLETE — {len(events)} vape events recorded")
print("=" * 60)

if not events:
    print("  No events detected. Nothing to save.")
else:
    # Build labels
    all_events = []

    # Clean air: 5 min before first event
    clean_start = session_start
    clean_end = events[0] - timedelta(seconds=30)
    if clean_end > clean_start:
        all_events.append({
            "event_id": "clean_air_v2_001",
            "event_type": "clean_air",
            "start_time_zulu": clean_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end_time_zulu": clean_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "notes": "Pre-training idle baseline"
        })

    # Clean air: 30 min after last event
    clean2_start = events[-1] + timedelta(minutes=2)
    clean2_end = clean2_start + timedelta(minutes=30)
    all_events.append({
        "event_id": "clean_air_v2_002",
        "event_type": "clean_air",
        "start_time_zulu": clean2_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end_time_zulu": clean2_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "notes": "Post-training idle (leave sensor running 30 min)"
    })

    # Vape events
    for i, ts in enumerate(events, 1):
        all_events.append({
            "event_id": f"vape_v2_{i:03d}",
            "event_type": "vape",
            "start_time_zulu": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end_time_zulu": None,
            "notes": ""
        })

    labels = {"events": all_events}
    with open(LABELS_PATH, "w", encoding="utf-8") as f:
        json.dump(labels, f, indent=2)

    print(f"\n  Saved to: {LABELS_PATH}")
    print(f"  {len(events)} vape events + clean air windows")
    for i, ts in enumerate(events, 1):
        local = ts.astimezone().strftime("%I:%M:%S %p")
        utc = ts.strftime("%H:%M:%S UTC")
        print(f"    #{i}: {local} ({utc})")
    print(f"\n  Leave sensor idle 30 min, then tell Claude to train.")
