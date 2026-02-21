import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from pymongo import MongoClient, UpdateOne


def parse_ts(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        text = value.strip().replace(" ", "T")
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


def load_labels(path: Path) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and "events" in payload:
        return payload["events"]
    raise ValueError("Labels must be a list or a dict with 'events'.")


def summarize_samples(coll, start_dt: datetime, end_dt: datetime) -> Dict[str, Any]:
    rows = list(
        coll.find({"timestamp": {"$gte": to_zulu(start_dt), "$lte": to_zulu(end_dt)}}).sort("timestamp", 1)
    )
    if not rows:
        return {"sample_count": 0}

    def avg(name: str) -> Optional[float]:
        vals = []
        for r in rows:
            v = r.get(name)
            try:
                vals.append(float(v))
            except Exception:
                pass
        if not vals:
            return None
        return float(sum(vals) / len(vals))

    return {
        "sample_count": len(rows),
        "humidity": avg("humidity"),
        "pm25": avg("pm25"),
        "pm10": avg("pm10"),
        "temperature": avg("temperature"),
        "gas_resistance": avg("gas_resistance"),
        "sound_level": avg("sound_level"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Restore/upsert labeled events into MongoDB events collection.")
    parser.add_argument("--labels-file", default="backend/training/seed_event_labels.json")
    parser.add_argument("--mongo-uri", default=os.getenv("MONGODB_URI", "mongodb://localhost:27017"))
    parser.add_argument("--db-name", default=os.getenv("DATABASE_NAME", "vape-alert"))
    parser.add_argument("--events-collection", default="events")
    parser.add_argument("--samples-collection", default="samples")
    parser.add_argument("--apply", action="store_true", help="Apply writes. Without this flag, dry-run only.")
    args = parser.parse_args()

    labels = load_labels(Path(args.labels_file))
    client = MongoClient(args.mongo_uri)
    db = client[args.db_name]
    events_coll = db[args.events_collection]
    samples_coll = db[args.samples_collection]

    ops: List[UpdateOne] = []
    preview: List[Dict[str, Any]] = []

    for i, rec in enumerate(labels, start=1):
        event_id = str(rec.get("event_id", f"restored_{i:05d}"))
        event_type = str(rec.get("event_type", "unknown"))
        start_dt = parse_ts(rec.get("start_time_zulu"))
        if start_dt is None:
            continue
        end_dt = parse_ts(rec.get("end_time_zulu")) or start_dt

        summary = summarize_samples(samples_coll, start_dt, end_dt) if end_dt >= start_dt else {"sample_count": 0}
        doc = {
            "event_id": event_id,
            "event_type": event_type,
            "timestamp": to_zulu(start_dt),
            "t_start": to_zulu(start_dt),
            "t_end": to_zulu(end_dt),
            "duration_seconds": max(0.0, (end_dt - start_dt).total_seconds()),
            "restored_from_labels": True,
            "verified": True,
            "actual_class": event_type,
            "predicted_class": event_type,
            "status": "confirmed",
            "notes": rec.get("notes", ""),
            "updated_at": datetime.now(timezone.utc),
        }
        for k, v in summary.items():
            if v is not None:
                doc[k] = v

        ops.append(
            UpdateOne(
                {"event_id": event_id},
                {"$set": doc, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
                upsert=True,
            )
        )
        if len(preview) < 5:
            preview.append({"event_id": event_id, "event_type": event_type, "timestamp": doc["timestamp"], "sample_count": doc.get("sample_count", 0)})

    print(json.dumps({"dry_run": not args.apply, "candidate_events": len(ops), "preview": preview}, indent=2, default=str))

    if args.apply and ops:
        res = events_coll.bulk_write(ops, ordered=False)
        print(
            json.dumps(
                {
                    "upserted_count": res.upserted_count,
                    "modified_count": res.modified_count,
                    "matched_count": res.matched_count,
                },
                indent=2,
            )
        )

    client.close()


if __name__ == "__main__":
    main()
