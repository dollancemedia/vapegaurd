from fastapi import APIRouter, HTTPException, Body
from app.database import db
from app.state_manager import state_manager
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
import logging
import math

router = APIRouter()
logger = logging.getLogger(__name__)

# Training classes (superset of production classifications)
TRAINING_CLASSES = [
    "vape", "cologne", "body_spray", "hair_spray",
    "cleaning_spray", "shower_steam", "fire", "clean_air"
]

# Default collection targets per class
DEFAULT_TARGETS = {
    "vape": 500,
    "cologne": 100,
    "body_spray": 80,
    "hair_spray": 60,
    "cleaning_spray": 60,
    "shower_steam": 100,
    "fire": 30,
    "clean_air": 200,
}


@router.get("/classes")
async def get_training_classes():
    """Return the list of valid training classes."""
    return {"classes": TRAINING_CLASSES}


@router.get("/targets")
async def get_targets():
    """Return per-class collection targets."""
    return {"targets": DEFAULT_TARGETS}


@router.get("/progress")
async def get_progress():
    """Return per-class collected count vs target, plus priority suggestion."""
    pipeline = [
        {"$match": {"status": {"$ne": "discarded"}}},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
    ]
    cursor = db.training_labels.aggregate(pipeline)
    counts = {}
    async for doc in cursor:
        counts[doc["_id"]] = doc["count"]

    progress = {}
    lowest_ratio = float("inf")
    priority = None

    for cls, target in DEFAULT_TARGETS.items():
        collected = counts.get(cls, 0)
        ratio = collected / target if target > 0 else 1.0
        progress[cls] = {
            "collected": collected,
            "target": target,
            "ratio": round(ratio, 3),
        }
        if ratio < lowest_ratio:
            lowest_ratio = ratio
            priority = cls

    return {"progress": progress, "priority": priority}


@router.get("/baseline-status/{device_id}")
async def get_baseline_status(device_id: str):
    """Check if a device's sensor readings are stable enough to start recording.

    Looks at recent samples and checks PM2.5 variance and slope.
    """
    state = state_manager.get_state(device_id)

    # Get recent samples from the rolling buffer
    now = datetime.now(timezone.utc)
    from datetime import timedelta
    samples = state_manager.get_samples(
        device_id,
        now - timedelta(seconds=15),
        now,
    )

    if len(samples) < 5:
        return {
            "stable": False,
            "reason": "Not enough samples (need at least 5 in last 15s)",
            "sample_count": len(samples),
            "snapshot": None,
        }

    # Compute PM2.5 stats
    pm25_vals = [s.get("pm25", 0) for s in samples]
    mean_pm25 = sum(pm25_vals) / len(pm25_vals)
    variance = sum((v - mean_pm25) ** 2 for v in pm25_vals) / len(pm25_vals)
    std_pm25 = math.sqrt(variance)

    # Compute slope (simple linear regression on PM2.5)
    n = len(pm25_vals)
    x_mean = (n - 1) / 2.0
    numerator = sum((i - x_mean) * (v - mean_pm25) for i, v in enumerate(pm25_vals))
    denominator = sum((i - x_mean) ** 2 for i in range(n))
    slope = numerator / denominator if denominator > 0 else 0

    stable = std_pm25 < 3.0 and abs(slope) < 0.5

    # Build a baseline snapshot from latest sample
    latest = samples[-1]
    snapshot = {
        "pm25": latest.get("pm25", 0),
        "pm10": latest.get("pm10", 0),
        "pm1": latest.get("pm1", 0),
        "humidity": latest.get("humidity", 0),
        "temperature": latest.get("temperature", 0),
        "gas_resistance": latest.get("gas_resistance", 0),
    }

    return {
        "stable": stable,
        "reason": None if stable else f"PM2.5 std={std_pm25:.1f} slope={slope:.2f}",
        "sample_count": len(samples),
        "std_pm25": round(std_pm25, 2),
        "slope": round(slope, 3),
        "snapshot": snapshot,
    }


async def _next_label_id(event_type: str) -> str:
    """Generate the next sequential label ID for a given event type."""
    # Find the highest existing number for this type
    cursor = db.training_labels.find(
        {"event_type": event_type},
        {"label_id": 1}
    ).sort("label_id", -1).limit(1)

    last_num = 0
    async for doc in cursor:
        label_id = doc.get("label_id", "")
        # Extract number from e.g. "vape_0058"
        parts = label_id.rsplit("_", 1)
        if len(parts) == 2:
            try:
                last_num = int(parts[1])
            except ValueError:
                pass

    return f"{event_type}_{last_num + 1:04d}"


@router.post("/labels", status_code=201)
async def create_label(payload: dict = Body(...)):
    """Create a new training label."""
    event_type = payload.get("event_type")
    if not event_type or event_type not in TRAINING_CLASSES:
        raise HTTPException(
            status_code=400,
            detail=f"event_type must be one of {TRAINING_CLASSES}",
        )

    device_id = payload.get("device_id")
    if not device_id:
        raise HTTPException(status_code=400, detail="device_id is required")

    label_id = await _next_label_id(event_type)
    now_str = datetime.utcnow().isoformat(timespec="milliseconds") + "Z"

    doc = {
        "label_id": label_id,
        "device_id": device_id,
        "event_type": event_type,
        "start_time_zulu": payload.get("start_time_zulu"),
        "end_time_zulu": payload.get("end_time_zulu"),
        "distance_ft": payload.get("distance_ft"),
        "session_id": payload.get("session_id"),
        "notes": payload.get("notes", ""),
        "metadata": payload.get("metadata", {}),
        "baseline_snapshot": payload.get("baseline_snapshot", {}),
        "status": "confirmed",
        "created_at": now_str,
    }

    result = await db.training_labels.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


@router.get("/labels")
async def list_labels(
    session_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 50,
):
    """List training labels with optional filters."""
    query = {"status": {"$ne": "discarded"}}
    if session_id:
        query["session_id"] = session_id
    if event_type:
        query["event_type"] = event_type

    cursor = db.training_labels.find(query).sort("created_at", -1).limit(limit)
    labels = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        labels.append(doc)
    return labels


@router.put("/labels/{label_id}")
async def update_label(label_id: str, payload: dict = Body(...)):
    """Update a training label (relabel, add notes, discard)."""
    update_fields = {}
    if "event_type" in payload:
        if payload["event_type"] not in TRAINING_CLASSES:
            raise HTTPException(
                status_code=400,
                detail=f"event_type must be one of {TRAINING_CLASSES}",
            )
        update_fields["event_type"] = payload["event_type"]
    if "notes" in payload:
        update_fields["notes"] = payload["notes"]
    if "status" in payload:
        if payload["status"] not in ("confirmed", "discarded", "pending"):
            raise HTTPException(status_code=400, detail="Invalid status")
        update_fields["status"] = payload["status"]
    if "distance_ft" in payload:
        update_fields["distance_ft"] = payload["distance_ft"]
    if "metadata" in payload:
        update_fields["metadata"] = payload["metadata"]

    if not update_fields:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = await db.training_labels.update_one(
        {"label_id": label_id},
        {"$set": update_fields},
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Label not found")

    updated = await db.training_labels.find_one({"label_id": label_id})
    updated["_id"] = str(updated["_id"])
    return updated


@router.delete("/labels/{label_id}")
async def delete_label(label_id: str):
    """Soft-delete a training label by marking it as discarded."""
    result = await db.training_labels.update_one(
        {"label_id": label_id},
        {"$set": {"status": "discarded"}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Label not found")
    return {"message": f"Label {label_id} discarded"}
