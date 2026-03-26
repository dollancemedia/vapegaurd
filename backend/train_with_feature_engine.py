"""
train_with_feature_engine.py

Trains ML models using the SAME 29-feature vector that the runtime inference
pipeline (feature_engine.py / FEATURE_ORDER) uses.  This ensures the saved
models are compatible with ensemble_predictor.predict() at runtime.

For each labeled event we slide a (10 s baseline + 20 s event) window through
the event duration in 5-second steps to create multiple training examples.

Usage (from repo root):
    python backend/train_with_feature_engine.py \
        --labels-file backend/training/seed_event_labels.json \
        --mongo-uri "mongodb+srv://allai:<pw>@..." \
        --db-name vape-alert \
        --models-dir backend/models \
        --drop-first-n-vape 12

All arguments have sensible defaults and will read MONGODB_URI / DATABASE_NAME
from a backend/.env file automatically if python-dotenv is installed.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ── make "app" importable from backend/ ─────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent))

import joblib
import numpy as np
import pandas as pd
from pymongo import MongoClient
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.utils.class_weight import compute_sample_weight

try:
    from xgboost import XGBClassifier
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

from app.feature_engine import FeatureEngine
from app.class_config import FEATURE_ORDER

# ── constants ────────────────────────────────────────────────────────────────
BASELINE_SEC = 10      # seconds of baseline before event onset
EVENT_SEC    = 20      # seconds of event window (mirrors CONFIRM_WINDOW_SEC)
SLIDE_STEP   = 5       # stride in seconds for sliding window augmentation
MIN_SAMPLES  = 2       # minimum samples required in either window

DEFAULT_EVENT_CAP = {
    "vape":     10 * 60,
    "fire":     25 * 60,
    "cooking":  25 * 60,
    "shower":   25 * 60,
    "clean_air": 60 * 60,
    "default":  10 * 60,
}


# ── helpers ──────────────────────────────────────────────────────────────────
def parse_zulu(s: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def iso_str(dt: datetime) -> str:
    """UTC datetime → ISO string without sub-seconds (for string pre-filter)."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def load_labels(path: Path) -> List[Dict]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict) and "events" in data:
        data = data["events"]
    return data


def fetch_window(coll, lo: datetime, hi: datetime) -> List[Dict]:
    """
    Fetch samples between lo and hi using ISO-string comparison.
    Timestamps are stored as ISO-8601 strings (e.g. "2026-02-12T06:07:54.282Z").
    """
    lo_str = iso_str(lo)
    hi_str = iso_str(hi) + "Z"   # append Z so it sorts after any .mmmZ doc at same second
    docs = list(coll.find(
        {"timestamp": {"$gte": lo_str, "$lte": hi_str}},
        {"_id": 0}
    ).batch_size(500))
    # Parse timestamps to datetime for FeatureEngine
    for d in docs:
        ts = d.get("timestamp")
        if isinstance(ts, str):
            try:
                d["timestamp"] = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                pass
    return docs


def rows_for_event(coll, start_dt: datetime, end_dt: datetime,
                   event_type: str) -> List[Tuple[Dict, str]]:
    """
    Slide a (BASELINE_SEC + EVENT_SEC) window through [start_dt, end_dt]
    in SLIDE_STEP increments.  Returns list of (features_dict, event_type).
    """
    results = []
    # Fetch all samples in a generous window (baseline before + full event + buffer)
    fetch_lo = start_dt - timedelta(seconds=BASELINE_SEC + 10)
    fetch_hi = end_dt   + timedelta(seconds=10)
    all_samples = fetch_window(coll, fetch_lo, fetch_hi)

    if not all_samples:
        return results

    # Build a lookup-friendly list sorted by timestamp
    all_samples.sort(key=lambda d: d["timestamp"])

    # Slide onset time through the event duration
    t = start_dt
    while t + timedelta(seconds=EVENT_SEC) <= end_dt:
        base_lo = t - timedelta(seconds=BASELINE_SEC)
        base_hi = t
        evt_lo  = t
        evt_hi  = t + timedelta(seconds=EVENT_SEC)

        baseline = [d for d in all_samples
                    if base_lo <= d["timestamp"] < base_hi]
        event    = [d for d in all_samples
                    if evt_lo  <= d["timestamp"] < evt_hi]

        if len(baseline) >= MIN_SAMPLES and len(event) >= MIN_SAMPLES:
            try:
                feats = FeatureEngine.compute_features(baseline, event)
                results.append((feats, event_type))
            except Exception as e:
                pass  # skip bad windows silently

        t += timedelta(seconds=SLIDE_STEP)

    return results


def build_feature_matrix(rows: List[Tuple[Dict, str]]) -> Tuple[np.ndarray, np.ndarray]:
    X_list, y_list = [], []
    for feats, label in rows:
        vec = [float(feats.get(k) or 0.0) for k in FEATURE_ORDER]
        X_list.append(vec)
        y_list.append(label)
    return np.array(X_list, dtype=float), np.array(y_list)


def train_all(X_train, y_train, X_val, y_val, seed):
    models = {}
    sw = compute_sample_weight("balanced", y=y_train)

    # Random Forest — strong ensemble learner, handles feature interactions
    rf = RandomForestClassifier(n_estimators=300, random_state=seed,
                                class_weight="balanced_subsample")
    rf.fit(X_train, y_train, sample_weight=sw)
    models["rf"] = rf

    # Logistic Regression — well-calibrated probabilities, fast inference
    # Replaces KNN: better probability calibration, no distance metric issues
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    lr = LogisticRegression(
        random_state=seed, max_iter=1000,
        class_weight="balanced", solver="lbfgs",
        multi_class="multinomial", C=1.0
    )
    lr.fit(X_train_scaled, y_train, sample_weight=sw)
    # Attach scaler so inference can use it
    lr._scaler = scaler
    models["lr"] = lr

    # XGBoost — gradient boosted trees, typically best performer
    if XGB_AVAILABLE:
        le = LabelEncoder()
        yt_enc = le.fit_transform(y_train)
        yv_enc = le.transform(y_val)
        xgb = XGBClassifier(
            random_state=seed, eval_metric="mlogloss",
            n_estimators=400, max_depth=6,
            learning_rate=0.05, subsample=0.9, colsample_bytree=0.9,
        )
        xgb.fit(X_train, yt_enc, sample_weight=sw)
        xgb.custom_classes_ = le.classes_
        xgb._val_accuracy = float((xgb.predict(X_val) == yv_enc).mean())
        models["xgb"] = xgb

    return models


# ── main ─────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="Train runtime models via FeatureEngine (29 features).")
    ap.add_argument("--labels-file",    default="backend/training/seed_event_labels.json")
    ap.add_argument("--mongo-uri",      default=os.getenv("MONGODB_URI", "mongodb://localhost:27017"))
    ap.add_argument("--db-name",        default=os.getenv("DATABASE_NAME", "vape-alert"))
    ap.add_argument("--collection",     default="samples")
    ap.add_argument("--models-dir",     default="backend/models")
    ap.add_argument("--drop-first-n-vape", type=int, default=12)
    ap.add_argument("--allowed-types",  default="vape,fire,cooking,shower,clean_air")
    ap.add_argument("--seed",           type=int, default=42)
    ap.add_argument("--test-size",      type=float, default=0.20)
    args = ap.parse_args()

    labels_path = Path(args.labels_file)
    models_dir  = Path(args.models_dir)
    models_dir.mkdir(parents=True, exist_ok=True)

    allowed = {t.strip() for t in args.allowed_types.split(",") if t.strip()}
    labels  = load_labels(labels_path)

    # Filter allowed types
    labels = [ev for ev in labels if ev.get("event_type", "") in allowed]

    # Drop first N vape events (chronologically)
    vape_events = sorted(
        [ev for ev in labels if ev["event_type"] == "vape"],
        key=lambda e: parse_zulu(e["start_time_zulu"]) or datetime.min.replace(tzinfo=timezone.utc),
    )
    drop_ids = {ev["event_id"] for ev in vape_events[:args.drop_first_n_vape]}
    labels = [ev for ev in labels if ev["event_id"] not in drop_ids]

    print(f"Labels after filtering: {len(labels)} events")
    from collections import Counter
    print(f"  type counts: {dict(Counter(ev['event_type'] for ev in labels))}")
    print(f"  dropped vape ids: {sorted(drop_ids)}")

    # Connect
    client = MongoClient(args.mongo_uri)
    coll   = client[args.db_name][args.collection]

    # Build training rows
    all_rows: List[Tuple[Dict, str]] = []
    for ev in labels:
        start_dt = parse_zulu(ev["start_time_zulu"])
        if start_dt is None:
            print(f"  SKIP {ev['event_id']} — bad start_time")
            continue

        cap_sec  = DEFAULT_EVENT_CAP.get(ev["event_type"], DEFAULT_EVENT_CAP["default"])
        if ev.get("end_time_zulu"):
            end_dt = parse_zulu(ev["end_time_zulu"]) or (start_dt + timedelta(seconds=cap_sec))
        else:
            end_dt = start_dt + timedelta(seconds=cap_sec)

        rows = rows_for_event(coll, start_dt, end_dt, ev["event_type"])
        print(f"  {ev['event_id']} ({ev['event_type']}): {len(rows)} windows")
        all_rows.extend(rows)

    client.close()

    if not all_rows:
        raise RuntimeError("No training windows generated. Check MongoDB connectivity and labels.")

    X, y = build_feature_matrix(all_rows)
    print(f"\nTotal: {len(X)} windows | {len(FEATURE_ORDER)} features | classes: {sorted(set(y))}")

    class_counts = Counter(y)
    print(f"Class distribution: {dict(class_counts)}")

    # Train/test split (stratified where possible)
    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=args.test_size, random_state=args.seed, stratify=y
        )
    except ValueError:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=args.test_size, random_state=args.seed
        )
    X_train, X_val, y_train, y_val = train_test_split(
        X_train, y_train, test_size=0.15, random_state=args.seed + 1
    )
    print(f"Split: train={len(X_train)} val={len(X_val)} test={len(X_test)}")

    models = train_all(X_train, y_train, X_val, y_val, seed=args.seed)

    save_map = {"rf": "rf_model.joblib", "lr": "lr_model.joblib", "xgb": "xgb_model.joblib"}
    report = {"n_features": len(FEATURE_ORDER), "feature_order": FEATURE_ORDER,
              "class_distribution": dict(class_counts), "models": {}}

    for name, model in models.items():
        path = models_dir / save_map[name]
        joblib.dump(model, path)
        X_test_input = model._scaler.transform(X_test) if hasattr(model, '_scaler') else X_test
        y_pred = model.predict(X_test_input)
        if hasattr(model, "custom_classes_"):
            y_pred = model.custom_classes_[y_pred.astype(int)]
        rep = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
        acc = float(rep.get("accuracy", 0.0))
        f1  = float(rep.get("weighted avg", {}).get("f1-score", 0.0))
        print(f"  {name}: test_acc={acc:.3f}  weighted_f1={f1:.3f}  → {path}")
        report["models"][name] = {"accuracy": acc, "weighted_f1": f1, "path": str(path)}
        if hasattr(model, "_val_accuracy"):
            report["models"][name]["val_accuracy"] = float(model._val_accuracy)

    print("\nTraining complete.")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
