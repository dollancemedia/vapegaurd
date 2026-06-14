"""
Interactive training data collection helper.

Run this while vaping at the sensor. Press ENTER each time you vape,
type 'done' when finished. Outputs a labels JSON file for training.

Usage:
    python collect_training_data.py
"""

import json
import sys
from datetime import datetime, timezone, timedelta

LABELS_PATH = "backend/training/bmv080_v2_labels.json"

def utc_now():
    return datetime.now(timezone.utc)

def fmt(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

def fmt_local(dt):
    local = dt.astimezone()
    return local.strftime("%I:%M:%S %p")

def main():
    print("=" * 60)
    print("  Vape Training Data Collection")
    print("=" * 60)
    print()
    print("  BEFORE YOU START:")
    print("  1. Make sure sensor is ON and posting data (check dashboard)")
    print("  2. Let it sit idle for at least 5 minutes first")
    print("  3. Have your vape ready")
    print()
    print("  DURING COLLECTION:")
    print("  - Press ENTER right BEFORE each vape puff at the sensor")
    print("  - Vape from ~6 inches away, exhale toward sensor")
    print("  - Wait 2-3 minutes between puffs (let PM2.5 return to baseline)")
    print("  - Vary intensity: short puffs and long draws")
    print("  - Type 'done' when finished (minimum 15 events)")
    print()

    input("Press ENTER when you're ready to start (sensor should be idle)... ")
    print()

    session_start = utc_now()
    clean_air_start = session_start - timedelta(minutes=5)
    print(f"  Session started at {fmt_local(session_start)} (UTC: {fmt(session_start)})")
    print(f"  Clean air window: last 5 min before now")
    print()

    events = []
    vape_num = 0

    while True:
        prompt = f"  [{len(events)} events] Press ENTER to mark vape (or 'done'): "
        try:
            inp = input(prompt)
        except (EOFError, KeyboardInterrupt):
            print("\n  Interrupted.")
            break

        stripped = inp.strip().lower()
        if stripped == "done":
            break
        if stripped == "skip":
            print("  (skipped)")
            continue

        vape_num += 1
        ts = utc_now()
        events.append({
            "event_id": f"vape_v2_{vape_num:03d}",
            "event_type": "vape",
            "start_time_zulu": fmt(ts),
            "end_time_zulu": None,
            "notes": ""
        })
        print(f"    -> Vape #{vape_num} recorded at {fmt_local(ts)} (UTC: {fmt(ts)})")
        print(f"       Now vape at the sensor, then wait 2-3 min before next one")
        print()

    session_end = utc_now()
    print()
    print(f"  Session ended at {fmt_local(session_end)}")
    print(f"  Total vape events: {len(events)}")

    if len(events) < 5:
        print(f"\n  WARNING: Only {len(events)} events. Recommend at least 15-20 for good training.")

    # Build full labels: clean air windows + vape events
    all_events = []

    # Clean air window 1: 5 min before session start
    all_events.append({
        "event_id": "clean_air_v2_001",
        "event_type": "clean_air",
        "start_time_zulu": fmt(clean_air_start),
        "end_time_zulu": fmt(session_start),
        "notes": "Pre-session idle baseline"
    })

    # Clean air window 2: from session end + 2 min onward (30 min)
    # The user should leave the sensor idle after the session
    clean2_start = session_end + timedelta(minutes=2)
    clean2_end = clean2_start + timedelta(minutes=30)
    all_events.append({
        "event_id": "clean_air_v2_002",
        "event_type": "clean_air",
        "start_time_zulu": fmt(clean2_start),
        "end_time_zulu": fmt(clean2_end),
        "notes": "Post-session idle (leave sensor running 30 min after done)"
    })

    # Add all vape events
    all_events.extend(events)

    labels = {"events": all_events}

    with open(LABELS_PATH, "w", encoding="utf-8") as f:
        json.dump(labels, f, indent=2)

    print(f"\n  Labels saved to: {LABELS_PATH}")
    print(f"  Events: {len(events)} vape + 2 clean_air windows")
    print()
    print("  NEXT STEPS:")
    print("  1. Leave the sensor idle for 30 min (for clean_air_v2_002)")
    print("  2. Then run the training command (Claude will help)")
    print()
    print(f"  Training command preview:")
    print(f'  python backend/train_with_feature_engine.py \\')
    print(f'    --labels-file {LABELS_PATH} \\')
    print(f'    --mongo-uri "mongodb+srv://allai:<pw>@vape-alert.xntahp3.mongodb.net/?appName=vape-alert" \\')
    print(f'    --db-name vape-alert \\')
    print(f'    --models-dir backend/models \\')
    print(f'    --drop-first-n-vape 0 \\')
    print(f'    --allowed-types "vape,clean_air"')

if __name__ == "__main__":
    main()
