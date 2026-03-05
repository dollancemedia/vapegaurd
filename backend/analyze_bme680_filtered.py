"""
analyze_bme680_filtered.py

Filtered analysis excluding events where BME680 was saturated
(humidity=100% or gas_resistance=0).
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

LABELS_FILE = Path(__file__).resolve().parent / "training" / "seed_event_labels.json"
MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DATABASE_NAME", "vape-alert")
COLLECTION = "samples"
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

    vape_events = sorted(
        [ev for ev in labels if ev["event_type"] == "vape"],
        key=lambda e: parse_zulu(e["start_time_zulu"]) or datetime.min.replace(tzinfo=timezone.utc),
    )
    clean_air_events = [ev for ev in labels if ev["event_type"] == "clean_air"]

    drop_ids = {ev["event_id"] for ev in vape_events[:DROP_FIRST_N_VAPE]}
    vape_events = [ev for ev in vape_events if ev["event_id"] not in drop_ids]

    client = MongoClient(MONGO_URI)
    coll = client[DB_NAME][COLLECTION]

    # Results containers
    humidity_deltas_5s = []
    humidity_deltas_10s = []
    gas_deltas_5s = []
    gas_deltas_10s = []
    humidity_baselines = []
    gas_baselines = []
    peak_hum_20s = []
    min_gas_20s_list = []

    # Two-reading deltas (what you'd see with consecutive 5s reads)
    hum_consec_deltas = []
    gas_consec_deltas = []

    valid_count = 0
    saturated_count = 0

    for ev in vape_events:
        start_dt = parse_zulu(ev["start_time_zulu"])
        if start_dt is None:
            continue

        pre_samples = fetch_window(coll, start_dt - timedelta(seconds=30), start_dt)
        post_samples = fetch_window(coll, start_dt, start_dt + timedelta(seconds=30))

        if not pre_samples or not post_samples:
            continue

        baseline_10s = [s for s in pre_samples if (start_dt - s["timestamp"]).total_seconds() <= 10]
        if not baseline_10s:
            baseline_10s = pre_samples[-3:]

        base_hum_vals = [s["humidity"] for s in baseline_10s if s.get("humidity") is not None and 0 < s["humidity"] < 99.9]
        base_gas_vals = [s["gas_resistance"] for s in baseline_10s if s.get("gas_resistance") is not None and s["gas_resistance"] > 1.0]

        if not base_hum_vals or not base_gas_vals:
            saturated_count += 1
            continue

        valid_count += 1
        base_hum = statistics.median(base_hum_vals)
        base_gas = statistics.median(base_gas_vals)
        humidity_baselines.append(base_hum)
        gas_baselines.append(base_gas)

        # Get ALL post-event samples with valid readings
        valid_post = [s for s in post_samples
                     if s.get("humidity") is not None and 0 < s["humidity"] < 99.9
                     and s.get("gas_resistance") is not None and s["gas_resistance"] > 1.0]

        # Consecutive 5s deltas (simulating what ESP sees)
        for i in range(1, len(valid_post)):
            dt = (valid_post[i]["timestamp"] - valid_post[i-1]["timestamp"]).total_seconds()
            if 3 <= dt <= 7:  # roughly 5s apart
                hum_consec_deltas.append(valid_post[i]["humidity"] - valid_post[i-1]["humidity"])
                gas_consec_deltas.append(valid_post[i]["gas_resistance"] - valid_post[i-1]["gas_resistance"])

        for target_sec, hum_deltas, gas_deltas in [
            (5, humidity_deltas_5s, gas_deltas_5s),
            (10, humidity_deltas_10s, gas_deltas_10s),
        ]:
            best_sample = None
            best_diff = float("inf")
            for s in valid_post:
                diff = abs((s["timestamp"] - start_dt).total_seconds() - target_sec)
                if diff < best_diff:
                    best_diff = diff
                    best_sample = s

            if best_sample and best_diff < 3.0:
                hum_deltas.append(best_sample["humidity"] - base_hum)
                gas_deltas.append(best_sample["gas_resistance"] - base_gas)

        # Peak/min in 20s
        first_20s = [s for s in valid_post if (s["timestamp"] - start_dt).total_seconds() <= 20]
        if first_20s:
            peak_hum_20s.append(max(s["humidity"] for s in first_20s) - base_hum)
            min_gas_20s_list.append(min(s["gas_resistance"] for s in first_20s) - base_gas)

    # Clean air analysis
    clean_hum_consec = []
    clean_gas_consec = []
    clean_hum_10s_delta = []
    clean_gas_10s_delta = []

    for ev in clean_air_events:
        start_dt = parse_zulu(ev["start_time_zulu"])
        end_dt = parse_zulu(ev.get("end_time_zulu"))
        if start_dt is None or end_dt is None:
            continue

        # Get all clean air samples
        t = start_dt
        while t + timedelta(minutes=2) <= end_dt:
            chunk = fetch_window(coll, t, t + timedelta(minutes=2))
            valid_chunk = [s for s in chunk
                          if s.get("humidity") is not None and 0 < s["humidity"] < 99.9
                          and s.get("gas_resistance") is not None and s["gas_resistance"] > 1.0]

            for i in range(1, len(valid_chunk)):
                dt_sec = (valid_chunk[i]["timestamp"] - valid_chunk[i-1]["timestamp"]).total_seconds()
                if 3 <= dt_sec <= 7:
                    clean_hum_consec.append(abs(valid_chunk[i]["humidity"] - valid_chunk[i-1]["humidity"]))
                    clean_gas_consec.append(abs(valid_chunk[i]["gas_resistance"] - valid_chunk[i-1]["gas_resistance"]))

            # 10s deltas in clean air
            for i in range(len(valid_chunk)):
                for j in range(i+1, len(valid_chunk)):
                    dt_sec = (valid_chunk[j]["timestamp"] - valid_chunk[i]["timestamp"]).total_seconds()
                    if 8 <= dt_sec <= 12:
                        clean_hum_10s_delta.append(abs(valid_chunk[j]["humidity"] - valid_chunk[i]["humidity"]))
                        clean_gas_10s_delta.append(abs(valid_chunk[j]["gas_resistance"] - valid_chunk[i]["gas_resistance"]))
                        break

            t += timedelta(minutes=2)

    client.close()

    def print_stats(name, values):
        if not values:
            print(f"  {name}: NO DATA")
            return
        values_sorted = sorted(values)
        n = len(values_sorted)
        print(f"  {name} (n={n}):")
        print(f"    Mean:   {statistics.mean(values):.4f}")
        print(f"    Median: {statistics.median(values):.4f}")
        if n > 1:
            print(f"    Stdev:  {statistics.stdev(values):.4f}")
        print(f"    Min:    {min(values):.4f}")
        print(f"    Max:    {max(values):.4f}")
        for pct in [5, 10, 25, 50, 75, 90, 95]:
            idx = min(n-1, max(0, int(n * pct / 100)))
            print(f"    P{pct:02d}:    {values_sorted[idx]:.4f}")

    print(f"\n{'='*80}")
    print(f"FILTERED BME680 ANALYSIS (excluding saturated sensors)")
    print(f"Valid events: {valid_count}  |  Saturated/excluded: {saturated_count}")
    print(f"{'='*80}")

    print("\n--- VAPE: Humidity Delta (event - baseline) ---")
    print_stats("At 5 seconds", humidity_deltas_5s)
    print_stats("At 10 seconds", humidity_deltas_10s)
    print_stats("Peak in 20s window", peak_hum_20s)

    print("\n--- VAPE: Gas Resistance Delta (event - baseline, KOhms) ---")
    print_stats("At 5 seconds", gas_deltas_5s)
    print_stats("At 10 seconds", gas_deltas_10s)
    print_stats("Min (worst drop) in 20s window", min_gas_20s_list)

    print("\n--- VAPE: Consecutive 5s Deltas (what ESP sees between reads) ---")
    print_stats("Humidity consecutive delta", hum_consec_deltas)
    print_stats("Gas resistance consecutive delta", gas_consec_deltas)

    print("\n--- Baseline Values ---")
    print_stats("Humidity baseline (%RH)", humidity_baselines)
    print_stats("Gas resistance baseline (KOhms)", gas_baselines)

    print(f"\n{'='*80}")
    print("CLEAN AIR BASELINE NOISE")
    print(f"{'='*80}")
    print_stats("Humidity: abs(consecutive 5s delta)", clean_hum_consec)
    print_stats("Gas: abs(consecutive 5s delta)", clean_gas_consec)
    print_stats("Humidity: abs(10s delta)", clean_hum_10s_delta)
    print_stats("Gas: abs(10s delta)", clean_gas_10s_delta)

    # Threshold recommendation
    print(f"\n{'='*80}")
    print("THRESHOLD RECOMMENDATIONS")
    print(f"{'='*80}")

    if clean_gas_consec:
        gas_noise_p95 = sorted(clean_gas_consec)[min(len(clean_gas_consec)-1, int(len(clean_gas_consec)*0.95))]
        gas_noise_p99 = sorted(clean_gas_consec)[min(len(clean_gas_consec)-1, int(len(clean_gas_consec)*0.99))]
    else:
        gas_noise_p95 = gas_noise_p99 = "N/A"

    if clean_hum_consec:
        hum_noise_p95 = sorted(clean_hum_consec)[min(len(clean_hum_consec)-1, int(len(clean_hum_consec)*0.95))]
        hum_noise_p99 = sorted(clean_hum_consec)[min(len(clean_hum_consec)-1, int(len(clean_hum_consec)*0.99))]
    else:
        hum_noise_p95 = hum_noise_p99 = "N/A"

    print(f"\n  Clean air noise floor (consecutive 5s reads):")
    print(f"    Humidity P95: {hum_noise_p95}")
    print(f"    Humidity P99: {hum_noise_p99}")
    print(f"    Gas P95: {gas_noise_p95}")
    print(f"    Gas P99: {gas_noise_p99}")

    if gas_deltas_10s:
        # How many vape events show gas drop > X at 10s?
        for thresh in [1, 2, 3, 5, 7]:
            caught = sum(1 for d in gas_deltas_10s if d <= -thresh)
            pct = caught / len(gas_deltas_10s) * 100
            print(f"    Gas drop >= {thresh} KOhms at 10s catches: {caught}/{len(gas_deltas_10s)} = {pct:.1f}% of vape events")

    if humidity_deltas_10s:
        for thresh in [0.1, 0.2, 0.5, 1.0]:
            caught = sum(1 for d in humidity_deltas_10s if d >= thresh)
            pct = caught / len(humidity_deltas_10s) * 100
            print(f"    Humidity rise >= {thresh}%RH at 10s catches: {caught}/{len(humidity_deltas_10s)} = {pct:.1f}% of vape events")

    # Combined threshold analysis
    print(f"\n  Combined threshold analysis (OR logic, 10s window):")
    if gas_deltas_10s and humidity_deltas_10s:
        n = min(len(gas_deltas_10s), len(humidity_deltas_10s))
        for gas_t, hum_t in [(2, 0.2), (3, 0.3), (2, 0.5), (1.5, 0.15)]:
            caught = sum(1 for i in range(n)
                        if gas_deltas_10s[i] <= -gas_t or humidity_deltas_10s[i] >= hum_t)
            pct = caught / n * 100
            print(f"    gas_drop>={gas_t} OR hum_rise>={hum_t}: {caught}/{n} = {pct:.1f}%")


if __name__ == "__main__":
    main()
