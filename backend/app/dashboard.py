from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from app.database import db
from datetime import datetime, timedelta, timezone
import re
from pathlib import Path
import os

router = APIRouter()
# Ensure templates path works both locally (cwd=backend) and on Vercel (cwd=root)
templates_dir = Path(__file__).resolve().parents[1] / "templates"
templates = Jinja2Templates(directory=str(templates_dir))

# Normalize timestamps for client-side parsing:
# - Trim microseconds to milliseconds
# - Ensure trailing 'Z' to indicate UTC
# - Handle datetime objects and various string formats
def _normalize_ts(ts):
    try:
        if ts is None:
            return datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
        if isinstance(ts, datetime):
            # Convert to UTC and output milliseconds with 'Z'
            if ts.tzinfo is not None:
                ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
            return ts.isoformat(timespec="milliseconds") + "Z"
        if isinstance(ts, str):
            s = ts.strip().replace(" ", "T")
            # Try parsing with Python first (handles 6-digit microseconds)
            try:
                if s.endswith("Z"):
                    dt = datetime.fromisoformat(s[:-1])
                else:
                    dt = datetime.fromisoformat(s)
                return dt.isoformat(timespec="milliseconds") + "Z"
            except Exception:
                # Fallback: regex trim fractional seconds to 3 digits
                m = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.(\d+))?", s)
                if m:
                    base = m.group(1)
                    frac = m.group(3) or "000"
                    frac3 = frac[:3].ljust(3, "0")
                    return f"{base}.{frac3}Z"
                return datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
        return datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
    except Exception:
        return datetime.utcnow().isoformat(timespec="milliseconds") + "Z"

@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    """Serve the real-time dashboard HTML page"""
    return templates.TemplateResponse("dashboard.html", {"request": request})

@router.get("/api/dashboard/recent-events")
async def recent_events():
    """Return recent events and summary stats for dashboard HTML"""
    try:
        # Fetch last 20 events
        cursor = db.events.find().sort("timestamp", -1).limit(20)
        events = []
        async for doc in cursor:
            # Convert ObjectId to string
            if doc.get("_id"):
                doc["_id"] = str(doc["_id"])
            # Normalize timestamp for client parsing
            doc["timestamp"] = _normalize_ts(doc.get("timestamp"))
            events.append(doc)

        # Compute stats
        total_events = await db.events.count_documents({})
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        recent_vapes = await db.events.count_documents({
            "timestamp": {"$gte": one_hour_ago.isoformat(timespec="milliseconds") + "Z"},
            "prediction.predicted_class": "vape"
        })

        latest_confidence = None
        if events:
            latest_confidence = events[0].get("prediction", {}).get("confidence")

        return {
            "events": events,
            "stats": {
                "total_events": int(total_events),
                "recent_vapes": int(recent_vapes),
                "last_updated": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
                "latest_confidence": latest_confidence
            }
        }
    except Exception as e:
        return {"events": [], "stats": {"total_events": 0, "recent_vapes": 0, "last_updated": datetime.utcnow().isoformat(timespec="milliseconds") + "Z", "error": str(e)}}

@router.get("/api/dashboard/live-stats")
async def live_stats():
    """Return latest event and prediction distribution for last 24h"""
    try:
        # Latest event
        latest = await db.events.find().sort("timestamp", -1).limit(1).to_list(length=1)
        latest_event = latest[0] if latest else None
        if latest_event and latest_event.get("_id"):
            latest_event["_id"] = str(latest_event["_id"])

        # Distribution
        day_ago = datetime.utcnow() - timedelta(hours=24)
        pipeline = [
            {"$match": {"timestamp": {"$gte": day_ago.isoformat(timespec="milliseconds") + "Z"}}},
            {"$group": {"_id": "$prediction.predicted_class", "count": {"$sum": 1}}}
        ]
        counts = await db.events.aggregate(pipeline).to_list(length=10)
        distribution = {c.get("_id") or "unknown": c.get("count", 0) for c in counts}

        return {
            "latest_event": latest_event,
            "distribution": distribution,
            "timestamp": datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
        }
    except Exception as e:
        return {"latest_event": None, "distribution": {}, "error": str(e), "timestamp": datetime.utcnow().isoformat(timespec="milliseconds") + "Z"}

@router.get("/api/dashboard/recent-events")
async def get_recent_events():
    """Get recent sensor events for dashboard"""
    
    # Get last 10 events
    raw_events = await db.events.find(
        {},
        {"_id": 0}
    ).sort("timestamp", -1).limit(10).to_list(length=10)
    
    # Reshape events to include nested prediction for template compatibility
    events = []
    for e in raw_events:
        prediction = {
            "predicted_class": e.get("predicted_class"),
            "confidence": e.get("confidence")
        }
        e["prediction"] = prediction
        # Normalize timestamp for client parsing
        e["timestamp"] = _normalize_ts(e.get("timestamp"))
        events.append(e)
    
    # Get stats
    total_events = await db.events.count_documents({})
    
    # Get recent vape detections (last hour)
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    recent_vapes = await db.events.count_documents({
        "predicted_class": "vape",
        "timestamp": {"$gte": one_hour_ago.isoformat(timespec="milliseconds") + "Z"}
    })
    
    return {
        "events": events,
        "stats": {
            "total_events": total_events,
            "recent_vapes": recent_vapes,
            "last_updated": datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
        }
    }

@router.get("/api/dashboard/live-stats")
async def get_live_stats():
    """Get live statistics for dashboard"""
    
    # Get latest event
    latest_event = await db.events.find_one(
        {},
        {"_id": 0},
        sort=[("timestamp", -1)]
    )
    
    # Get prediction distribution (last 24 hours)
    yesterday = datetime.utcnow() - timedelta(days=1)
    pipeline = [
        {"$match": {"timestamp": {"$gte": yesterday.isoformat(timespec="milliseconds") + "Z"}}},
        {"$group": {
            "_id": "$predicted_class",
            "count": {"$sum": 1},
            "avg_confidence": {"$avg": "$confidence"}
        }}
    ]
    
    prediction_stats = await db.events.aggregate(pipeline).to_list(length=None)
    
    return {
        "latest_event": latest_event,
        "prediction_distribution": prediction_stats,
        "timestamp": datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
    }