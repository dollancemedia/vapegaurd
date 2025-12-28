import os
import argparse
import pandas as pd
from pymongo import MongoClient
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import joblib

# --- Config ---
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "vape-alert")
# Sentinel for invalid feature values (outside any sensor's valid range)
INVALID_SENTINEL = -1000.0
# Feature order for training/prediction
FEATURE_COLS = ["humidity", "pm25", "particle_size", "volume_spike"]
# Threshold to alert if raw particle_size frequently falls outside [100, 400]
OUT_RANGE_ALERT_THRESHOLD = 0.30

# --- DB connection ---
client = MongoClient(MONGODB_URI)
db = client[DATABASE_NAME]


def get_newest_event():
    """Fetch the newest event by timestamp; fallback to _id order if needed."""
    try:
        cur = db.events.find({}).sort("timestamp", -1).limit(1)
        return next(cur, None)
    except Exception:
        cur = db.events.find({}).sort("_id", -1).limit(1)
        return next(cur, None)


def _coerce_number(value):
    """Strict coercion for training: return float or None (invalid), never silent defaults."""
    try:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        # Attempt string-to-float
        return float(value)
    except Exception:
        return None


def _derive_features(event):
    """Derive model features; invalid inputs set to sentinel so XGBoost treats them as missing."""
    humidity_raw = _coerce_number(event.get("humidity"))
    humidity = humidity_raw if humidity_raw is not None else INVALID_SENTINEL

    pm25_raw = _coerce_number(event.get("pm25"))
    pm25 = pm25_raw if pm25_raw is not None else INVALID_SENTINEL

    gas_resistance_raw = _coerce_number(event.get("gas_resistance"))
    if gas_resistance_raw is None:
        particle_size = INVALID_SENTINEL
    else:
        particle_size = max(100, min(400, 400 - (gas_resistance_raw * 2)))

    mic_available = bool(event.get("mic_available", True))
    sound_level_raw = _coerce_number(event.get("sound_level"))
    if mic_available:
        if sound_level_raw is None:
            volume_spike = INVALID_SENTINEL
        else:
            volume_spike = sound_level_raw if sound_level_raw > 0 else 0.0
    else:
        # When mic is not available, inference uses 0.0; keep it consistent
        volume_spike = 0.0

    return {
        "humidity": float(humidity),
        "pm25": float(pm25),
        "particle_size": float(particle_size),
        "volume_spike": float(volume_spike),
    }


def _label_from_feedback_or_verified(event):
    """Resolve ground-truth label: 1=vape, 0=normal.
    Priority: actual_class->latest feedback->verified->None.
    """
    # First priority: actual_class field (human-labeled ground truth)
    actual_class = event.get("actual_class")
    if actual_class and actual_class != "none":
        return 1 if actual_class == "vape" else 0
    
    # Second priority: latest feedback by timestamp
    eid = str(event.get("_id"))
    fb_cursor = db.feedback.find({"event_id": eid}).sort("timestamp", -1).limit(1)
    fb = next(iter(fb_cursor), None)
    if fb:
        t = fb.get("feedback_type")
        if t == "false_positive":
            return 0
        if t == "false_negative":
            return 1
        if t == "correct_detection":
            pc = event.get("predicted_class", "normal")
            return 1 if pc == "vape" else 0
        # "other" or unknown -> skip
        return None

    # Third priority: verified events adopt predicted_class
    if event.get("verified") is True:
        pc = event.get("predicted_class", "normal")
        return 1 if pc == "vape" else 0

    return None


def fetch_dataset(limit=None, exclude_id=None):
    """Build X (features) and y (labels) from events with feedback/verified.
    Invalid features are set to a sentinel and counted; rows are kept.
    Excludes the event with exclude_id (e.g., newest) and maintains chronological order.
    Also tracks raw particle_size (400 - 2*gas_resistance) out-of-range frequency to suggest better bounds.
    """
    query = {} if exclude_id is None else {"_id": {"$ne": exclude_id}}
    cursor = db.events.find(query).sort("timestamp", 1)  # ascending order
    if limit:
        cursor = cursor.limit(int(limit))

    X_rows, y_rows = [], []
    stats = {"rows_total": 0, "rows_labeled": 0}
    invalid_counts = {"humidity": 0, "pm25": 0, "particle_size": 0, "volume_spike": 0}
    ps_raw_stats = {"total": 0, "below_100": 0, "above_400": 0, "min": None, "max": None}

    for ev in cursor:
        stats["rows_total"] += 1
        y = _label_from_feedback_or_verified(ev)
        if y is None:
            continue
        stats["rows_labeled"] += 1

        # Monitor raw particle_size range from gas_resistance
        gas_resistance_raw = _coerce_number(ev.get("gas_resistance"))
        if gas_resistance_raw is not None:
            ps_raw = 400 - (gas_resistance_raw * 2)
            ps_raw_stats["total"] += 1
            if ps_raw < 100:
                ps_raw_stats["below_100"] += 1
            elif ps_raw > 400:
                ps_raw_stats["above_400"] += 1
            # Track min/max observed
            if ps_raw_stats["min"] is None or ps_raw < ps_raw_stats["min"]:
                ps_raw_stats["min"] = ps_raw
            if ps_raw_stats["max"] is None or ps_raw > ps_raw_stats["max"]:
                ps_raw_stats["max"] = ps_raw

        feats = _derive_features(ev)
        if feats["humidity"] == INVALID_SENTINEL:
            invalid_counts["humidity"] += 1
        if feats["pm25"] == INVALID_SENTINEL:
            invalid_counts["pm25"] += 1
        if feats["particle_size"] == INVALID_SENTINEL:
            invalid_counts["particle_size"] += 1
        if feats["volume_spike"] == INVALID_SENTINEL:
            invalid_counts["volume_spike"] += 1

        X_rows.append(feats)
        y_rows.append(y)

    # Print validation summary
    print("Training data validation summary:")
    print(f"  total events scanned: {stats['rows_total']}")
    print(f"  labeled events: {stats['rows_labeled']}")
    print("  invalid feature counts (set to sentinel):")
    for k, v in invalid_counts.items():
        print(f"    - {k}: {v}")

    # Particle size raw range monitoring
    if ps_raw_stats["total"] > 0:
        low_pct = ps_raw_stats["below_100"] / ps_raw_stats["total"]
        high_pct = ps_raw_stats["above_400"] / ps_raw_stats["total"]
        print("  particle_size raw out-of-range:")
        print(f"    - below 100: {ps_raw_stats['below_100']} ({low_pct:.1%})")
        print(f"    - above 400: {ps_raw_stats['above_400']} ({high_pct:.1%})")
        print(f"    - observed min/max: {ps_raw_stats['min']:.1f} / {ps_raw_stats['max']:.1f}")
        if low_pct > OUT_RANGE_ALERT_THRESHOLD or high_pct > OUT_RANGE_ALERT_THRESHOLD:
            suggested_min = ps_raw_stats['min'] if ps_raw_stats['min'] is not None else 100
            suggested_max = ps_raw_stats['max'] if ps_raw_stats['max'] is not None else 400
            print("  Suggestion:")
            print(f"    Consider expanding particle_size bounds to [{suggested_min:.1f}, {suggested_max:.1f}] or removing clamping.")
            print("    If you change bounds, mirror the logic in backend/app/inference.py to keep training and serving consistent.")

    X = pd.DataFrame(X_rows)
    y = pd.Series(y_rows, name="target")
    return X, y


def train_and_save_model(limit=None, save=True, skip_predict=False,
                         n_estimators=100, max_depth=None, max_features="sqrt",
                         random_state=8, use_scaler=True, model_filename=None):
    """
    Function to train and save the model, suitable for calling from other modules.
    """
    newest_event = get_newest_event()
    newest_id = newest_event.get("_id") if newest_event else None

    X, y = fetch_dataset(limit=limit, exclude_id=newest_id)
    if X.empty:
        msg = "No labeled events found. Add feedback or verified events before training."
        print(msg)
        return {"status": "error", "message": msg}

    vape_count = int(y.sum())
    normal_count = int(len(y) - vape_count)
    print(f"Dataset size: {len(y)} (vape={vape_count}, normal={normal_count})")

    # Build RandomForest pipeline (optional scaler)
    steps = []
    if use_scaler:
        steps.append(("scaler", StandardScaler()))

    # allow numeric or string max_features
    mf = max_features
    try:
        # if a numeric string was passed, convert to float
        if isinstance(max_features, str):
            mf = float(max_features)
    except Exception:
        mf = max_features

    rf = RandomForestClassifier(
        n_estimators=int(n_estimators),
        max_depth=(None if max_depth is None else int(max_depth)),
        max_features=mf,
        random_state=int(random_state),
    )
    steps.append(("rf", rf))
    clf = Pipeline(steps)
    clf.fit(X, y)

    # Persist model to backend/models (inference.py expects this path) unless save=False
    # allow custom filename (useful for CI/testing); default to models/rf_model.joblib
    if model_filename is None:
        out_path = os.path.join(os.path.dirname(__file__), "models", "rf_model.joblib")
    else:
        out_path = os.path.abspath(model_filename)
    if save:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        joblib.dump(clf, out_path)
        print(f"Model trained and saved to {out_path}")
    else:
        print("Model trained (not saved due to save=False)")

    # Predict newest entry only if model is intended for website and prediction not skipped
    do_predict = (not skip_predict) and save
    if do_predict and newest_event is not None:
        feats_new = _derive_features(newest_event)
        X_new = pd.DataFrame([feats_new])[FEATURE_COLS]
        proba = clf.predict_proba(X_new)[0]
        pred = int(clf.predict(X_new)[0])
        pred_label = "vape" if pred == 1 else "normal"
        print("\nNewest event prediction:")
        print(f"  event_id: {newest_id}")
        # Show both class probabilities as percentages and a single "confidence" value
        proba_normal = float(proba[0])
        proba_vape = float(proba[1])
        pct_normal = proba_normal * 100.0
        pct_vape = proba_vape * 100.0
        # confidence = max class percent
        confidence = max(pct_vape, pct_normal)
        print(f"  predicted: {pred_label} | proba_normal={pct_normal:.2f}%, proba_vape={pct_vape:.2f}% | confidence={confidence:.2f}%")
        print("  Raw event preserved; not modifying DB for website learning.")
    elif newest_event is None:
        print("No events found for newest prediction.")
    else:
        print("Skipping newest prediction.")
    
    return {
        "status": "success",
        "dataset_size": len(y),
        "vape_count": vape_count,
        "normal_count": normal_count,
        "model_path": out_path if save else None
    }


def main():
    parser = argparse.ArgumentParser(description="Train RandomForest on historical events; hold out newest for prediction.")
    parser.add_argument("--limit", type=int, default=None, help="Optional limit on number of events to use.")
    parser.add_argument("--no-save", action="store_true", help="Do not save model for website use.")
    parser.add_argument("--skip-predict", action="store_true", help="Skip predicting the newest event.")
    # RandomForest hyperparameters
    parser.add_argument("--n-estimators", type=int, default=100, help="Number of trees in the forest")
    parser.add_argument("--max-depth", type=int, default=None, help="Maximum depth of each tree (default: None)")
    parser.add_argument("--max-features", default="sqrt", help="Number of features to consider at each split (str or float). Default: 'sqrt'")
    parser.add_argument("--random-state", type=int, default=8, help="Random state for reproducibility")
    parser.add_argument("--no-scale", action="store_true", help="Disable StandardScaler in the pipeline")
    parser.add_argument("--model-file", type=str, default=None, help="Optional output model file path (default: models/rf_model.joblib)")

    args = parser.parse_args()

    train_and_save_model(
        limit=args.limit,
        save=not args.no_save,
        skip_predict=args.skip_predict,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        max_features=args.max_features,
        random_state=args.random_state,
        use_scaler=(not args.no_scale),
        model_filename=args.model_file,
    )


if __name__ == "__main__":
    main()
