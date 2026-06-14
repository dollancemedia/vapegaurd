"""
Train models from saved training session JSON files.

Usage:
    python train_from_session.py backend/training/serial_captures/session_*.json

Reads one or more session files saved by training_collector.py,
combines them, and trains models using the same FeatureEngine pipeline
that the runtime uses for inference.
"""

import sys
import json
import argparse
import numpy as np
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter

BACKEND_DIR = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.feature_engine import FeatureEngine
from app.class_config import FEATURE_ORDER

MODELS_DIR = BACKEND_DIR / "models"

BASELINE_SEC = 10
EVENT_SEC = 20
SLIDE_STEP = 5


def load_session(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    samples = []
    for s in data["samples"]:
        sample = dict(s)
        ts = sample.get("timestamp")
        if isinstance(ts, str):
            sample["timestamp"] = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        samples.append(sample)

    events = data.get("events", [])
    return samples, events


def build_rows(samples, events):
    rows = []

    for ev in events:
        start = ev["start_idx"]
        end = ev["end_idx"]
        label = ev["label"]

        t = start
        while t + EVENT_SEC <= end:
            base_start = max(0, t - BASELINE_SEC)
            baseline = samples[base_start:t]
            event = samples[t:t + EVENT_SEC]
            if len(baseline) >= 2 and len(event) >= 3:
                try:
                    feats = FeatureEngine.compute_features(baseline, event)
                    rows.append((feats, label))
                except Exception:
                    pass
            t += SLIDE_STEP

        if end - start < EVENT_SEC and end - start >= 5:
            base_start = max(0, start - BASELINE_SEC)
            baseline = samples[base_start:start]
            event = samples[start:end]
            if len(baseline) >= 2 and len(event) >= 3:
                try:
                    feats = FeatureEngine.compute_features(baseline, event)
                    rows.append((feats, label))
                except Exception:
                    pass

    event_ranges = sorted([(e["start_idx"], e["end_idx"]) for e in events])
    clean_ranges = []
    prev_end = 0
    for (s, e) in event_ranges:
        gap_start = prev_end
        gap_end = max(0, s - 5)
        if gap_end - gap_start >= BASELINE_SEC + EVENT_SEC:
            clean_ranges.append((gap_start, gap_end))
        prev_end = e + 5
    total = len(samples)
    if total - prev_end >= BASELINE_SEC + EVENT_SEC:
        clean_ranges.append((prev_end, total))

    for (rng_start, rng_end) in clean_ranges:
        t = rng_start + BASELINE_SEC
        while t + EVENT_SEC <= rng_end:
            baseline = samples[t - BASELINE_SEC:t]
            event = samples[t:t + EVENT_SEC]
            if len(baseline) >= 2 and len(event) >= 3:
                try:
                    feats = FeatureEngine.compute_features(baseline, event)
                    rows.append((feats, "normal"))
                except Exception:
                    pass
            t += SLIDE_STEP

    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sessions", nargs="+", help="Session JSON files")
    ap.add_argument("--models-dir", default=str(MODELS_DIR))
    args = ap.parse_args()

    all_rows = []
    for path in args.sessions:
        print(f"Loading {path}...")
        samples, events = load_session(path)
        rows = build_rows(samples, events)
        print(f"  {len(samples)} samples, {len(events)} events -> {len(rows)} windows")
        all_rows.extend(rows)

    if not all_rows:
        print("ERROR: No training windows generated!")
        sys.exit(1)

    X = np.array([[float(f.get(k) or 0.0) for k in FEATURE_ORDER] for f, _ in all_rows])
    y = np.array([l for _, l in all_rows])

    counts = Counter(y)
    print(f"\nTotal: {len(X)} windows | {len(FEATURE_ORDER)} features")
    print(f"Classes: {dict(counts)}")

    if len(set(y)) < 2:
        print("ERROR: Need at least 2 classes (vape + normal)")
        sys.exit(1)

    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import LabelEncoder, StandardScaler
    from sklearn.utils.class_weight import compute_sample_weight
    import joblib

    try:
        from xgboost import XGBClassifier
        xgb_avail = True
    except ImportError:
        xgb_avail = False

    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.20, random_state=42, stratify=y)
    except ValueError:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.20, random_state=42)

    sw = compute_sample_weight("balanced", y=y_train)
    models_dir = Path(args.models_dir)
    models_dir.mkdir(parents=True, exist_ok=True)

    rf = RandomForestClassifier(n_estimators=300, random_state=42,
                                class_weight="balanced_subsample")
    rf.fit(X_train, y_train, sample_weight=sw)
    joblib.dump(rf, models_dir / "rf_model.joblib")
    acc = float((rf.predict(X_test) == y_test).mean())
    print(f"  RF:  accuracy={acc:.1%} -> {models_dir / 'rf_model.joblib'}")

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    lr = LogisticRegression(random_state=42, max_iter=1000,
                            class_weight="balanced", solver="lbfgs",
                            multi_class="multinomial")
    lr.fit(X_train_s, y_train, sample_weight=sw)
    lr._scaler = scaler
    joblib.dump(lr, models_dir / "lr_model.joblib")
    acc = float((lr.predict(scaler.transform(X_test)) == y_test).mean())
    print(f"  LR:  accuracy={acc:.1%} -> {models_dir / 'lr_model.joblib'}")

    if xgb_avail:
        le = LabelEncoder()
        yt_enc = le.fit_transform(y_train)
        xgb = XGBClassifier(random_state=42, eval_metric="mlogloss",
                            n_estimators=400, max_depth=6,
                            learning_rate=0.05, subsample=0.9,
                            colsample_bytree=0.9)
        xgb.fit(X_train, yt_enc, sample_weight=sw)
        xgb.custom_classes_ = le.classes_
        joblib.dump(xgb, models_dir / "xgb_model.joblib")
        y_pred = le.classes_[xgb.predict(X_test)]
        acc = float((y_pred == y_test).mean())
        print(f"  XGB: accuracy={acc:.1%} -> {models_dir / 'xgb_model.joblib'}")

    print(f"\nDone. Models saved to {models_dir}/")


if __name__ == "__main__":
    main()
