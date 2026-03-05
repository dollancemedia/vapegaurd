"""
analyze_bme680_thresholds.py

Queries MongoDB for raw sensor data around labeled vape events to determine
BME680 humidity and gas resistance change patterns in the first 5-10 seconds.
Also characterizes clean_air baseline variability.

Usage:
    cd backend
    python analyze_bme680_thresholds.py
"""

import json
import os
import sys
import statistics
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

from pymongo import MongoClient

# ── Config ──
LABELS_FILE = Path(__file__).resolve().parent / "training" / "seed_event_labels.json"
MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DATABASE_NAME", "vape-alert")
COLLECTION = "samples"

# We skip the first 12 vape events (unstable early data)
DROP_FIRST_N_VAPE = 12


def parse_zulu(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def iso_str(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def fetch_window(coll, lo, hi):
    lo_str = iso_str(lo)
    hi_str = iso_str(hi) + "Z"
    docs = list(coll.find(
        {"timestamp": {"$gte": lo_str, "$lte": hi_str}},
        {"_id": 0, "timestamp": 1, "humidity": 1, "gas_resistance": 1, "pm25": 1, "temperature": 1}
    ).sort("timestamp", 1))
    for d in docs:
        ts = d.get("timestamp")
        if isinstance(ts, str):
            try:
                d["timestamp"] = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                pass
    return docs


def main():
    with open(LABELS_FILE, "r") as f:
        labels = json.load(f)

    # Separate vape and clean_air events
    vape_events = sorted(
        [ev for ev in labels if ev["event_type"] == "vape"],
        key=lambda e: parse_zulu(e["start_time_zulu"]) or datetime.min.replace(tzinfo=timezone.utc),
    )
    clean_air_events = [ev for ev in labels if ev["event_type"] == "clean_air"]

    # Drop first N vape events
    drop_ids = {ev["event_id"] for ev in vape_events[:DROP_FIRST_N_VAPE]}
    vape_events = [ev for ev in vape_events if ev["event_id"] not in drop_ids]

    print(f"Analyzing {len(vape_events)} vape events (dropped first {DROP_FIRST_N_VAPE})")
    print(f"Analyzing {len(clean_air_events)} clean_air events")

    client = MongoClient(MONGO_URI)
    coll = client[DB_NAME][COLLECTION]

    # ── Analyze vape events ──
    # For each vape event, get 30s before (baseline) and 30s after (event onset)
    humidity_deltas_5s = []
    humidity_deltas_10s = []
    gas_deltas_5s = []
    gas_deltas_10s = []
    humidity_baselines = []
    gas_baselines = []
    humidity_slopes_5s = []
    gas_slopes_5s = []

    # Also track per-event details
    event_details = []

    for ev in vape_events:
        start_dt = parse_zulu(ev["start_time_zulu"])
        if start_dt is None:
            continue

        # Fetch 30s before and 30s after event start
        pre_samples = fetch_window(coll, start_dt - timedelta(seconds=30), start_dt)
        post_samples = fetch_window(coll, start_dt, start_dt + timedelta(seconds=30))

        if not pre_samples or not post_samples:
            print(f"  {ev['event_id']}: no data (pre={len(pre_samples)}, post={len(post_samples)})")
            continue

        # Baseline: last 10s before event
        baseline_10s = [s for s in pre_samples
                       if (start_dt - s["timestamp"]).total_seconds() <= 10]

        if not baseline_10s:
            baseline_10s = pre_samples[-3:]  # fallback to last 3 samples

        # Baseline values
        base_hum_vals = [s["humidity"] for s in baseline_10s if s.get("humidity") is not None and s["humidity"] > -900]
        base_gas_vals = [s["gas_resistance"] for s in baseline_10s if s.get("gas_resistance") is not None and s["gas_resistance"] > -900]

        if not base_hum_vals or not base_gas_vals:
            print(f"  {ev['event_id']}: missing baseline BME680 data")
            continue

        base_hum = statistics.median(base_hum_vals)
        base_gas = statistics.median(base_gas_vals)

        humidity_baselines.append(base_hum)
        gas_baselines.append(base_gas)

        # Find samples at ~5s and ~10s after event start
        detail = {
            "event_id": ev["event_id"],
            "base_humidity": base_hum,
            "base_gas": base_gas,
        }

        for target_sec, hum_deltas, gas_deltas, hum_slopes, gas_slopes in [
            (5, humidity_deltas_5s, gas_deltas_5s, humidity_slopes_5s, gas_slopes_5s),
            (10, humidity_deltas_10s, gas_deltas_10s, None, None),
        ]:
            # Find sample closest to target_sec after event start
            best_sample = None
            best_diff = float("inf")
            for s in post_samples:
                diff = abs((s["timestamp"] - start_dt).total_seconds() - target_sec)
                if diff < best_diff:
                    best_diff = diff
                    best_sample = s

            if best_sample and best_diff < 3.0:
                hum_val = best_sample.get("humidity")
                gas_val = best_sample.get("gas_resistance")
                actual_t = (best_sample["timestamp"] - start_dt).total_seconds()

                if hum_val is not None and hum_val > -900:
                    d_hum = hum_val - base_hum
                    hum_deltas.append(d_hum)
                    detail[f"d_humidity_{target_sec}s"] = d_hum
                    detail[f"humidity_{target_sec}s"] = hum_val
                    if hum_slopes is not None and actual_t > 0:
                        hum_slopes.append(d_hum / actual_t)

                if gas_val is not None and gas_val > -900:
                    d_gas = gas_val - base_gas
                    gas_deltas.append(d_gas)
                    detail[f"d_gas_{target_sec}s"] = d_gas
                    detail[f"gas_{target_sec}s"] = gas_val
                    if gas_slopes is not None and actual_t > 0:
                        gas_slopes.append(d_gas / actual_t)
            else:
                detail[f"note_{target_sec}s"] = f"no sample within 3s of t+{target_sec}"

        # Also get peak humidity and min gas in the first 20s
        first_20s = [s for s in post_samples
                    if (s["timestamp"] - start_dt).total_seconds() <= 20]
        hum_vals_20s = [s["humidity"] for s in first_20s if s.get("humidity") is not None and s["humidity"] > -900]
        gas_vals_20s = [s["gas_resistance"] for s in first_20s if s.get("gas_resistance") is not None and s["gas_resistance"] > -900]

        if hum_vals_20s:
            detail["peak_humidity_20s"] = max(hum_vals_20s)
            detail["d_peak_humidity_20s"] = max(hum_vals_20s) - base_hum
        if gas_vals_20s:
            detail["min_gas_20s"] = min(gas_vals_20s)
            detail["d_min_gas_20s"] = min(gas_vals_20s) - base_gas

        event_details.append(detail)

    # ── Analyze clean_air baseline variability ──
    clean_humidity_stds = []
    clean_gas_stds = []
    clean_humidity_maxdeltas = []
    clean_gas_maxdeltas = []

    for ev in clean_air_events:
        start_dt = parse_zulu(ev["start_time_zulu"])
        end_dt = parse_zulu(ev.get("end_time_zulu"))
        if start_dt is None or end_dt is None:
            continue

        # Sample clean air in 5-minute chunks
        t = start_dt
        while t + timedelta(minutes=5) <= end_dt:
            chunk = fetch_window(coll, t, t + timedelta(minutes=5))
            if len(chunk) >= 10:
                hum_vals = [s["humidity"] for s in chunk if s.get("humidity") is not None and s["humidity"] > -900]
                gas_vals = [s["gas_resistance"] for s in chunk if s.get("gas_resistance") is not None and s["gas_resistance"] > -900]

                if len(hum_vals) >= 5:
                    clean_humidity_stds.append(statistics.stdev(hum_vals))
                    # Max delta between consecutive samples (5s apart)
                    consec_deltas = [abs(hum_vals[i+1] - hum_vals[i]) for i in range(len(hum_vals)-1)]
                    clean_humidity_maxdeltas.append(max(consec_deltas))

                if len(gas_vals) >= 5:
                    clean_gas_stds.append(statistics.stdev(gas_vals))
                    consec_deltas = [abs(gas_vals[i+1] - gas_vals[i]) for i in range(len(gas_vals)-1)]
                    clean_gas_maxdeltas.append(max(consec_deltas))

            t += timedelta(minutes=5)

    client.close()

    # ── Print Results ──
    print("\n" + "="*80)
    print("BME680 VAPE EVENT ANALYSIS")
    print("="*80)

    def print_stats(name, values):
        if not values:
            print(f"  {name}: NO DATA")
            return
        values_sorted = sorted(values)
        n = len(values_sorted)
        print(f"  {name} (n={n}):")
        print(f"    Mean:   {statistics.mean(values):.3f}")
        print(f"    Median: {statistics.median(values):.3f}")
        print(f"    Stdev:  {statistics.stdev(values):.3f}" if n > 1 else "    Stdev: N/A")
        print(f"    Min:    {min(values):.3f}")
        print(f"    Max:    {max(values):.3f}")
        print(f"    P5:     {values_sorted[max(0, int(n*0.05))]:.3f}")
        print(f"    P10:    {values_sorted[max(0, int(n*0.10))]:.3f}")
        print(f"    P25:    {values_sorted[max(0, int(n*0.25))]:.3f}")
        print(f"    P75:    {values_sorted[min(n-1, int(n*0.75))]:.3f}")
        print(f"    P90:    {values_sorted[min(n-1, int(n*0.90))]:.3f}")
        print(f"    P95:    {values_sorted[min(n-1, int(n*0.95))]:.3f}")

    print("\n--- Humidity Delta (event - baseline) ---")
    print_stats("At 5 seconds", humidity_deltas_5s)
    print_stats("At 10 seconds", humidity_deltas_10s)

    print("\n--- Gas Resistance Delta (event - baseline, KOhms) ---")
    print_stats("At 5 seconds", gas_deltas_5s)
    print_stats("At 10 seconds", gas_deltas_10s)

    print("\n--- Humidity Slope (%RH per second, first 5s) ---")
    print_stats("Slope 0-5s", humidity_slopes_5s)

    print("\n--- Gas Resistance Slope (KOhms per second, first 5s) ---")
    print_stats("Slope 0-5s", gas_slopes_5s)

    print("\n--- Baseline Values (pre-event) ---")
    print_stats("Humidity baseline (%RH)", humidity_baselines)
    print_stats("Gas resistance baseline (KOhms)", gas_baselines)

    print("\n--- Peak Changes in First 20s ---")
    peak_hum = [d.get("d_peak_humidity_20s") for d in event_details if d.get("d_peak_humidity_20s") is not None]
    min_gas = [d.get("d_min_gas_20s") for d in event_details if d.get("d_min_gas_20s") is not None]
    print_stats("Peak humidity delta (20s window)", peak_hum)
    print_stats("Min gas resistance delta (20s window)", min_gas)

    print("\n" + "="*80)
    print("CLEAN AIR BASELINE VARIABILITY")
    print("="*80)
    print_stats("Humidity stdev (5-min chunks)", clean_humidity_stds)
    print_stats("Humidity max consecutive delta", clean_humidity_maxdeltas)
    print_stats("Gas resistance stdev (5-min chunks)", clean_gas_stds)
    print_stats("Gas resistance max consecutive delta", clean_gas_maxdeltas)

    print("\n" + "="*80)
    print("PER-EVENT DETAILS")
    print("="*80)
    for d in event_details:
        print(f"\n  {d['event_id']}:")
        for k, v in d.items():
            if k != "event_id":
                if isinstance(v, float):
                    print(f"    {k}: {v:.3f}")
                else:
                    print(f"    {k}: {v}")


if __name__ == "__main__":
    main()
