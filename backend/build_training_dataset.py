import argparse
import json
import os
import random
import shutil
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from pymongo import MongoClient
from sklearn.model_selection import GroupKFold, GroupShuffleSplit


DEFAULT_EVENT_CAP_SECONDS = {
    "wave": 10 * 60,
    "shower": 25 * 60,
    "cooking": 25 * 60,
    "fire": 25 * 60,
    "vape": 10 * 60,
    "default": 10 * 60,
}

EXCLUDED_FIELDS = {
    "_id",
    "timestamp",
    "device_id",
    "org_id",
    "school",
    "event_id",
    "status",
    "prediction",
    "message",
    "created_at",
    "updated_at",
}


@dataclass
class EventLabel:
    event_id: str
    event_type: str
    start_time_zulu: str
    end_time_zulu: Optional[str] = None
    notes: Optional[str] = None


def parse_ts(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        text = text.replace(" ", "T")
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def to_zulu(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def reset_artifacts(output_dir: Path) -> None:
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)


def purge_legacy_models(models_dir: Path) -> List[str]:
    removed = []
    if not models_dir.exists():
        return removed
    for p in models_dir.glob("*.joblib"):
        p.unlink(missing_ok=True)
        removed.append(str(p))
    return removed


def load_labels(path: Path) -> List[EventLabel]:
    if not path.exists():
        raise FileNotFoundError(f"Labels file not found: {path}")

    if path.suffix.lower() == ".csv":
        df = pd.read_csv(path)
        records = df.to_dict(orient="records")
    else:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, dict) and "events" in payload:
            records = payload["events"]
        elif isinstance(payload, list):
            records = payload
        else:
            raise ValueError("JSON labels file must be a list or contain an 'events' array.")

    labels: List[EventLabel] = []
    for rec in records:
        if not rec.get("event_id") or not rec.get("event_type") or not rec.get("start_time_zulu"):
            raise ValueError(f"Invalid label row, missing required fields: {rec}")
        labels.append(
            EventLabel(
                event_id=str(rec["event_id"]),
                event_type=str(rec["event_type"]).strip(),
                start_time_zulu=str(rec["start_time_zulu"]).strip(),
                end_time_zulu=(str(rec["end_time_zulu"]).strip() if rec.get("end_time_zulu") else None),
                notes=(str(rec["notes"]).strip() if rec.get("notes") else None),
            )
        )
    labels.sort(key=lambda e: parse_ts(e.start_time_zulu) or datetime.min.replace(tzinfo=timezone.utc))
    return labels


def fetch_samples(
    mongo_uri: str,
    db_name: str,
    collection_name: str,
    min_ts: datetime,
    max_ts: datetime,
) -> pd.DataFrame:
    client = MongoClient(mongo_uri)
    coll = client[db_name][collection_name]

    rows: List[Dict[str, Any]] = []
    cursor = coll.find({}, no_cursor_timeout=True)
    for doc in cursor:
        ts = parse_ts(doc.get("timestamp"))
        if ts is None:
            continue
        if ts < min_ts or ts > max_ts:
            continue

        row: Dict[str, Any] = {"timestamp": ts}
        for k, v in doc.items():
            if k in EXCLUDED_FIELDS:
                continue
            if isinstance(v, (int, float, np.number)):
                row[k] = float(v)
                continue
            if isinstance(v, str):
                try:
                    row[k] = float(v)
                except ValueError:
                    pass
        rows.append(row)
    cursor.close()
    client.close()

    if not rows:
        return pd.DataFrame(columns=["timestamp"])

    df = pd.DataFrame(rows).sort_values("timestamp").drop_duplicates(subset=["timestamp"], keep="last")
    df = df.reset_index(drop=True)
    return df


def pick_cap_seconds(event_type: str, cap_config: Dict[str, int]) -> int:
    return int(cap_config.get(event_type, cap_config.get("default", 10 * 60)))


def infer_end_time_for_event(
    samples_df: pd.DataFrame,
    start_dt: datetime,
    event_type: str,
    cap_seconds: Dict[str, int],
    baseline_seconds: int = 60,
    rolling_seconds: int = 30,
    sustained_seconds: int = 60,
) -> Tuple[datetime, Dict[str, Any]]:
    if "pm25" not in samples_df.columns:
        cap = pick_cap_seconds(event_type, cap_seconds)
        end_dt = start_dt + timedelta(seconds=cap)
        return end_dt, {
            "end_inferred": True,
            "end_inferred_failed": True,
            "inference_reason": "pm25_missing",
            "baseline_pm": None,
            "target_baseline_threshold": None,
            "cap_seconds": cap,
        }

    cap = pick_cap_seconds(event_type, cap_seconds)
    hard_end = start_dt + timedelta(seconds=cap)

    pre = samples_df[(samples_df["timestamp"] >= start_dt - timedelta(seconds=baseline_seconds)) & (samples_df["timestamp"] < start_dt)]
    baseline_vals = pre["pm25"].dropna()
    if baseline_vals.empty:
        fallback_pre = samples_df[samples_df["timestamp"] < start_dt].tail(30)["pm25"].dropna()
        baseline_vals = fallback_pre

    baseline_pm = float(np.median(baseline_vals)) if not baseline_vals.empty else 0.0
    threshold = max(9.0, baseline_pm + 2.0)

    span = samples_df[(samples_df["timestamp"] >= start_dt) & (samples_df["timestamp"] <= hard_end)][["timestamp", "pm25"]].dropna()
    if span.empty:
        return hard_end, {
            "end_inferred": True,
            "end_inferred_failed": True,
            "inference_reason": "no_samples_in_cap",
            "baseline_pm": baseline_pm,
            "target_baseline_threshold": threshold,
            "cap_seconds": cap,
        }

    span = span.set_index("timestamp").sort_index()
    roll_med = span["pm25"].rolling(f"{rolling_seconds}s", min_periods=1).median()
    cond = roll_med < threshold

    cond_true_start: Optional[datetime] = None
    inferred_end: Optional[datetime] = None
    for ts, is_true in cond.items():
        if bool(is_true):
            if cond_true_start is None:
                cond_true_start = ts.to_pydatetime()
            if (ts.to_pydatetime() - cond_true_start).total_seconds() >= sustained_seconds:
                inferred_end = ts.to_pydatetime()
                break
        else:
            cond_true_start = None

    if inferred_end is None:
        inferred_end = hard_end
        failed = True
        reason = "cap_reached_without_baseline_return"
    else:
        failed = False
        reason = "baseline_return_detected"

    return inferred_end, {
        "end_inferred": True,
        "end_inferred_failed": failed,
        "inference_reason": reason,
        "baseline_pm": baseline_pm,
        "target_baseline_threshold": threshold,
        "cap_seconds": cap,
    }


def build_derived_events(
    labels: List[EventLabel],
    samples_df: pd.DataFrame,
    cap_config: Dict[str, int],
) -> pd.DataFrame:
    rows = []
    for ev in labels:
        start_dt = parse_ts(ev.start_time_zulu)
        if start_dt is None:
            continue

        if ev.end_time_zulu:
            end_dt = parse_ts(ev.end_time_zulu)
            if end_dt is None:
                raise ValueError(f"Invalid end_time_zulu for event_id={ev.event_id}")
            meta = {
                "end_inferred": False,
                "end_inferred_failed": False,
                "inference_reason": "provided",
                "baseline_pm": None,
                "target_baseline_threshold": None,
                "cap_seconds": pick_cap_seconds(ev.event_type, cap_config),
            }
        else:
            end_dt, meta = infer_end_time_for_event(
                samples_df=samples_df,
                start_dt=start_dt,
                event_type=ev.event_type,
                cap_seconds=cap_config,
            )

        rows.append(
            {
                "event_id": ev.event_id,
                "event_type": ev.event_type,
                "start_time_zulu": to_zulu(start_dt),
                "end_time_zulu": to_zulu(end_dt),
                "duration_seconds": (end_dt - start_dt).total_seconds(),
                "notes": ev.notes or "",
                **meta,
            }
        )
    derived = pd.DataFrame(rows).sort_values("start_time_zulu").reset_index(drop=True)
    return derived


def detect_numeric_channels(df: pd.DataFrame) -> List[str]:
    channels = [c for c in df.columns if c != "timestamp"]
    numeric_channels = []
    for c in channels:
        if pd.api.types.is_numeric_dtype(df[c]):
            numeric_channels.append(c)
    numeric_channels.sort()
    return numeric_channels


def compute_window_features(window: pd.DataFrame, channels: List[str], window_seconds: int) -> Dict[str, Any]:
    feats: Dict[str, Any] = {}
    slopes: Dict[str, float] = {}
    deltas: Dict[str, float] = {}

    for ch in channels:
        sub = window[["timestamp", ch]].dropna()
        if sub.empty:
            continue
        vals = sub[ch].astype(float).to_numpy()
        t = (sub["timestamp"] - sub["timestamp"].iloc[0]).dt.total_seconds().to_numpy()
        if t.size == 0:
            continue

        feats[f"{ch}__mean"] = float(np.mean(vals))
        feats[f"{ch}__median"] = float(np.median(vals))
        feats[f"{ch}__std"] = float(np.std(vals, ddof=1)) if len(vals) > 1 else 0.0
        feats[f"{ch}__min"] = float(np.min(vals))
        feats[f"{ch}__max"] = float(np.max(vals))
        feats[f"{ch}__p10"] = float(np.percentile(vals, 10))
        feats[f"{ch}__p90"] = float(np.percentile(vals, 90))

        if len(vals) > 1 and len(np.unique(t)) > 1:
            slope = float(np.polyfit(t, vals, 1)[0])
        else:
            slope = 0.0
        delta = float(vals[-1] - vals[0]) if len(vals) > 1 else 0.0
        dvals = np.diff(vals) if len(vals) > 1 else np.array([0.0])

        feats[f"{ch}__slope"] = slope
        feats[f"{ch}__delta"] = delta
        feats[f"{ch}__max_derivative"] = float(np.max(dvals)) if dvals.size else 0.0
        feats[f"{ch}__min_derivative"] = float(np.min(dvals)) if dvals.size else 0.0
        peak_idx = int(np.argmax(vals))
        feats[f"{ch}__time_to_peak_sec"] = float(t[peak_idx]) if peak_idx < len(t) else 0.0
        feats[f"{ch}__auc"] = float(np.trapz(vals, t)) if len(vals) > 1 else float(vals[0] * window_seconds)

        slopes[ch] = slope
        deltas[ch] = delta

    if "pm25" in slopes and "humidity" in slopes:
        h_slope = slopes["humidity"]
        h_delta = deltas.get("humidity", 0.0)
        eps = 1e-6
        feats["cross__pm25_slope_over_humidity_slope"] = float(slopes["pm25"] / (h_slope if abs(h_slope) > eps else eps))
        feats["cross__pm25_delta_over_humidity_delta"] = float(deltas.get("pm25", 0.0) / (h_delta if abs(h_delta) > eps else eps))

        corr_df = window[["pm25", "humidity"]].dropna()
        if len(corr_df) > 1:
            feats["cross__corr_pm25_humidity"] = float(corr_df["pm25"].corr(corr_df["humidity"]))
        else:
            feats["cross__corr_pm25_humidity"] = 0.0

    return feats


def generate_windows(
    samples_df: pd.DataFrame,
    events_df: pd.DataFrame,
    channels: List[str],
    window_seconds: int,
    stride_seconds: int,
) -> pd.DataFrame:
    out_rows: List[Dict[str, Any]] = []
    win_delta = timedelta(seconds=window_seconds)
    stride = timedelta(seconds=stride_seconds)

    for _, ev in events_df.iterrows():
        start_dt = parse_ts(ev["start_time_zulu"])
        end_dt = parse_ts(ev["end_time_zulu"])
        if start_dt is None or end_dt is None or end_dt <= start_dt:
            continue

        t = start_dt
        while t + win_delta <= end_dt:
            w_end = t + win_delta
            window = samples_df[(samples_df["timestamp"] >= t) & (samples_df["timestamp"] < w_end)]
            if len(window) < 2:
                t += stride
                continue

            feats = compute_window_features(window, channels, window_seconds)
            row = {
                "event_id": ev["event_id"],
                "event_type": ev["event_type"],
                "window_start_zulu": to_zulu(t),
                "window_end_zulu": to_zulu(w_end),
            }
            row.update(feats)
            out_rows.append(row)
            t += stride

    windows_df = pd.DataFrame(out_rows)
    if windows_df.empty:
        return windows_df
    windows_df = windows_df.sort_values(["window_start_zulu", "event_id"]).reset_index(drop=True)
    return windows_df


def cap_multiclass_distribution(windows_df: pd.DataFrame, seed: int) -> pd.DataFrame:
    if windows_df.empty:
        return windows_df
    counts = windows_df["event_type"].value_counts()
    if counts.empty:
        return windows_df
    median_count = int(counts.median())
    cap = max(median_count * 3, median_count + 1)
    rng = random.Random(seed)

    keep_idxs: List[int] = []
    for label, group in windows_df.groupby("event_type"):
        idxs = list(group.index)
        if len(idxs) > cap:
            keep_idxs.extend(rng.sample(idxs, cap))
        else:
            keep_idxs.extend(idxs)
    keep_idxs.sort()
    return windows_df.loc[keep_idxs].reset_index(drop=True)


def build_binary_wave_vs_rest(
    windows_df: pd.DataFrame,
    seed: int,
    max_ratio: float = 1.0,
) -> pd.DataFrame:
    if windows_df.empty:
        return pd.DataFrame()

    positives = windows_df[windows_df["event_type"] == "wave"].copy()
    if positives.empty:
        return pd.DataFrame()

    hard_negative_types = {"shower", "cooking", "fire"}
    hard_negs = windows_df[(windows_df["event_type"] != "wave") & (windows_df["event_type"].isin(hard_negative_types))]
    clean_air_negs = windows_df[(windows_df["event_type"] != "wave") & (windows_df["event_type"] == "clean_air")]
    other_negs = windows_df[(windows_df["event_type"] != "wave") & (~windows_df["event_type"].isin(hard_negative_types | {"clean_air"}))]

    target_neg = min(int(len(positives) * max_ratio), len(windows_df) - len(positives))
    target_neg = max(target_neg, len(positives))

    rng = random.Random(seed)
    selected = []

    def sample_from(df: pd.DataFrame, n: int) -> int:
        if n <= 0 or df.empty:
            return 0
        take = min(n, len(df))
        selected.extend(rng.sample(list(df.index), take))
        return take

    hard_target = int(target_neg * 0.6)
    taken = sample_from(hard_negs, hard_target)
    taken += sample_from(clean_air_negs, target_neg - taken)
    taken += sample_from(other_negs, target_neg - taken)

    if taken < target_neg:
        remaining = windows_df[(windows_df["event_type"] != "wave") & (~windows_df.index.isin(selected))]
        sample_from(remaining, target_neg - taken)

    negs = windows_df.loc[sorted(set(selected))].copy()
    positives = positives.copy()

    positives["binary_label"] = 1
    negs["binary_label"] = 0
    out = pd.concat([positives, negs], ignore_index=True)
    out = out.sample(frac=1.0, random_state=seed).reset_index(drop=True)
    return out


def optional_time_split_by_day(df: pd.DataFrame) -> Dict[str, Any]:
    if df.empty or "window_start_zulu" not in df.columns:
        return {"info": "time_split_skipped_missing_window_start"}
    working = df.copy()
    working["window_start_dt"] = pd.to_datetime(working["window_start_zulu"], utc=True, errors="coerce")
    working = working.dropna(subset=["window_start_dt"]).reset_index(drop=True)
    if working.empty:
        return {"info": "time_split_skipped_no_valid_timestamps"}

    working["day"] = working["window_start_dt"].dt.strftime("%Y-%m-%d")
    unique_days = sorted(working["day"].unique())
    if len(unique_days) < 3:
        return {"info": "time_split_skipped_need_at_least_3_days"}

    n_days = len(unique_days)
    train_end = max(1, int(n_days * 0.70))
    val_end = max(train_end + 1, int(n_days * 0.85))
    train_days = set(unique_days[:train_end])
    val_days = set(unique_days[train_end:val_end])
    test_days = set(unique_days[val_end:])

    train_idx = working[working["day"].isin(train_days)].index.tolist()
    val_idx = working[working["day"].isin(val_days)].index.tolist()
    test_idx = working[working["day"].isin(test_days)].index.tolist()

    return {
        "train_indices": train_idx,
        "val_indices": val_idx,
        "test_indices": test_idx,
        "train_days": sorted(train_days),
        "val_days": sorted(val_days),
        "test_days": sorted(test_days),
        "info": "time_split_by_day_created",
    }


def grouped_splits(
    df: pd.DataFrame,
    label_col: str,
    group_col: str,
    seed: int,
) -> Dict[str, Any]:
    if df.empty:
        return {"error": "empty_dataset"}

    groups = df[group_col].astype(str).to_numpy()
    y = df[label_col].astype(str).to_numpy()
    idx = np.arange(len(df))

    gss_outer = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=seed)
    train_val_idx, test_idx = next(gss_outer.split(idx, y, groups))

    train_val_df = df.iloc[train_val_idx].reset_index(drop=True)
    train_val_groups = train_val_df[group_col].astype(str).to_numpy()
    train_val_y = train_val_df[label_col].astype(str).to_numpy()
    train_val_local_idx = np.arange(len(train_val_df))

    gss_inner = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=seed + 1)
    train_idx_local, val_idx_local = next(gss_inner.split(train_val_local_idx, train_val_y, train_val_groups))

    train_idx = train_val_idx[train_idx_local]
    val_idx = train_val_idx[val_idx_local]

    cv_folds = []
    unique_groups = np.unique(groups)
    n_splits = min(5, len(unique_groups))
    if n_splits >= 2:
        gkf = GroupKFold(n_splits=n_splits)
        for fold, (tr, va) in enumerate(gkf.split(idx, y, groups), start=1):
            cv_folds.append(
                {
                    "fold": fold,
                    "train_indices": tr.tolist(),
                    "valid_indices": va.tolist(),
                    "train_group_count": int(len(np.unique(groups[tr]))),
                    "valid_group_count": int(len(np.unique(groups[va]))),
                }
            )

    return {
        "train_indices": train_idx.tolist(),
        "val_indices": val_idx.tolist(),
        "test_indices": test_idx.tolist(),
        "train_group_count": int(len(np.unique(groups[train_idx]))),
        "val_group_count": int(len(np.unique(groups[val_idx]))),
        "test_group_count": int(len(np.unique(groups[test_idx]))),
        "cv_folds": cv_folds,
        "n_rows": int(len(df)),
        "n_groups": int(len(unique_groups)),
    }


def parse_caps(caps_json: Optional[str]) -> Dict[str, int]:
    caps = dict(DEFAULT_EVENT_CAP_SECONDS)
    if not caps_json:
        return caps
    user_caps = json.loads(caps_json)
    for k, v in user_caps.items():
        caps[str(k)] = int(v)
    return caps


def main() -> None:
    parser = argparse.ArgumentParser(description="Deterministic dataset builder from raw timeseries + event labels.")
    parser.add_argument("--labels-file", type=str, default="backend/training/seed_event_labels.json")
    parser.add_argument("--mongo-uri", type=str, default=os.getenv("MONGODB_URI", "mongodb://localhost:27017"))
    parser.add_argument("--db-name", type=str, default=os.getenv("DATABASE_NAME", "vape-alert"))
    parser.add_argument("--samples-collection", type=str, default="samples")
    parser.add_argument("--output-dir", type=str, default="backend/training_artifacts")
    parser.add_argument("--purge-legacy-models", action="store_true", help="Delete backend/models/*.joblib before rebuild.")
    parser.add_argument("--window-seconds", type=int, default=10)
    parser.add_argument("--stride-seconds", type=int, default=0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--binary-max-ratio", type=float, default=1.0, help="Negative:positive ratio for wave-vs-rest (1.0 to 2.0 recommended).")
    parser.add_argument("--enable-time-split", action="store_true", help="Also emit optional day-based split metadata.")
    parser.add_argument("--caps-json", type=str, default=None, help='Example: {"vape":600,"shower":1500}')
    args = parser.parse_args()

    labels_file = Path(args.labels_file)
    output_dir = Path(args.output_dir)
    project_backend_dir = Path(__file__).resolve().parent
    stride_seconds = args.stride_seconds if args.stride_seconds > 0 else max(1, args.window_seconds // 2)
    cap_config = parse_caps(args.caps_json)

    reset_artifacts(output_dir)
    removed_models: List[str] = []
    if args.purge_legacy_models:
        removed_models = purge_legacy_models(project_backend_dir / "models")

    labels = load_labels(labels_file)
    if not labels:
        raise ValueError("No labels found.")

    starts = [parse_ts(ev.start_time_zulu) for ev in labels if parse_ts(ev.start_time_zulu) is not None]
    if not starts:
        raise ValueError("No valid event start times.")

    min_start = min(starts) - timedelta(seconds=120)
    max_end_candidates = []
    for ev in labels:
        s = parse_ts(ev.start_time_zulu)
        if s is None:
            continue
        if ev.end_time_zulu and parse_ts(ev.end_time_zulu):
            max_end_candidates.append(parse_ts(ev.end_time_zulu))
        else:
            max_end_candidates.append(s + timedelta(seconds=pick_cap_seconds(ev.event_type, cap_config)))
    max_end = max([m for m in max_end_candidates if m is not None]) + timedelta(seconds=120)

    samples_df = fetch_samples(
        mongo_uri=args.mongo_uri,
        db_name=args.db_name,
        collection_name=args.samples_collection,
        min_ts=min_start,
        max_ts=max_end,
    )
    if samples_df.empty:
        raise ValueError("No raw samples loaded from MongoDB in requested time span.")

    derived_events = build_derived_events(labels, samples_df, cap_config)
    channels = detect_numeric_channels(samples_df)
    windows_multiclass = generate_windows(
        samples_df=samples_df,
        events_df=derived_events,
        channels=channels,
        window_seconds=args.window_seconds,
        stride_seconds=stride_seconds,
    )
    windows_multiclass = cap_multiclass_distribution(windows_multiclass, seed=args.seed)

    clamped_ratio = min(max(args.binary_max_ratio, 1.0), 2.0)
    windows_binary = build_binary_wave_vs_rest(windows_multiclass, seed=args.seed, max_ratio=clamped_ratio)

    split_multi = grouped_splits(windows_multiclass, label_col="event_type", group_col="event_id", seed=args.seed)
    split_binary = (
        grouped_splits(windows_binary, label_col="binary_label", group_col="event_id", seed=args.seed)
        if not windows_binary.empty
        else {"info": "binary_wave_vs_rest_skipped_no_wave_labels"}
    )
    time_split = optional_time_split_by_day(windows_multiclass) if args.enable_time_split else {"info": "time_split_not_enabled"}

    derived_events.to_csv(output_dir / "derived_events.csv", index=False)
    derived_events.to_json(output_dir / "derived_events.json", orient="records", indent=2)
    windows_multiclass.to_csv(output_dir / "windows_multiclass.csv", index=False)
    if not windows_binary.empty:
        windows_binary.to_csv(output_dir / "windows_binary_wave_vs_rest.csv", index=False)

    with open(output_dir / "splits_multiclass.json", "w", encoding="utf-8") as f:
        json.dump(split_multi, f, indent=2)
    with open(output_dir / "splits_binary_wave_vs_rest.json", "w", encoding="utf-8") as f:
        json.dump(split_binary, f, indent=2)
    with open(output_dir / "splits_time_based_optional.json", "w", encoding="utf-8") as f:
        json.dump(time_split, f, indent=2)

    manifest = {
        "labels_file": str(labels_file),
        "mongo_db": args.db_name,
        "samples_collection": args.samples_collection,
        "output_dir": str(output_dir),
        "window_seconds": args.window_seconds,
        "stride_seconds": stride_seconds,
        "seed": args.seed,
        "binary_max_ratio": clamped_ratio,
        "cap_config": cap_config,
        "numeric_channels_detected": channels,
        "n_events": int(len(derived_events)),
        "n_windows_multiclass": int(len(windows_multiclass)),
        "n_windows_binary_wave_vs_rest": int(len(windows_binary)),
        "class_counts_multiclass": windows_multiclass["event_type"].value_counts().to_dict() if not windows_multiclass.empty else {},
        "removed_legacy_models": removed_models,
    }
    with open(output_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
