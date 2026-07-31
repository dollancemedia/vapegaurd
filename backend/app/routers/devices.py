from fastapi import APIRouter, HTTPException, Body, Depends
from app.database import db
from app.auth import validate_token
from app.state_manager import state_manager
from typing import List, Optional, Dict
from datetime import datetime, timedelta, timezone as dt_timezone
from pydantic import BaseModel

try:
    from zoneinfo import ZoneInfo          # stdlib on Python 3.9+
except ImportError:                        # pragma: no cover
    ZoneInfo = None

router = APIRouter()

class DeviceRegister(BaseModel):
    device_id: str
    school: str
    school_name: Optional[str] = None

@router.post("/register")
async def register_device(device: DeviceRegister, user = Depends(validate_token)):
    """Register a new device or update existing one"""
    # Normalize MAC: remove colons and uppercase
    device_id = device.device_id.upper().replace(":", "")
    
    # Basic validation
    if len(device_id) != 12:
         raise HTTPException(status_code=400, detail="Invalid MAC address format")

    update_data = {
        "device_id": device_id,
        "org_id": device.school,
        "updated_at": datetime.utcnow()
    }
    
    if device.school_name:
        update_data["school_name"] = device.school_name
    
    # Check if device already exists to preserve created_at
    existing = await db.devices.find_one({"device_id": device_id})
    if not existing:
        update_data["created_at"] = datetime.utcnow()
        # Initialize default metadata if needed
        await db.device_metadata.update_one(
            {"device_id": device_id},
            {"$setOnInsert": {"name": f"Device {device_id[-4:]}", "location": "Unassigned"}},
            upsert=True
        )

    await db.devices.update_one(
        {"device_id": device_id},
        {"$set": update_data},
        upsert=True
    )
    
    return {"status": "success", "device_id": device_id, "org_id": device.school}


class DeviceLocation(BaseModel):
    x: float
    y: float

class DeviceInfoUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[Dict[str, str]] = None

@router.post("/{device_id}/recalibrate")
async def recalibrate_device(device_id: str):
    """Force device back to calibration mode by resetting baseline state."""
    device_exists = await db.devices.find_one({"device_id": device_id}, {"_id": 1})
    if not device_exists:
        raise HTTPException(status_code=404, detail="Device not found")

    now = datetime.utcnow().isoformat() + "Z"
    state_manager.update_state(device_id, {
        "status": "CALIBRATING",
        "calibration_start": now,
        "ewma_pm25": None,
        "t0": None,
        "cooldown_until": None
    })

    return {
        "status": "success",
        "device_id": device_id,
        "message": "Recalibration started",
        "calibration_start": now
    }

@router.put("/{device_id}/info")
async def update_device_info(device_id: str, info: DeviceInfoUpdate):
    """Update device name and location info"""
    update_data = {}
    if info.name is not None:
        update_data["name"] = info.name
    if info.location is not None:
        update_data["location"] = info.location
    
    if not update_data:
        return {"status": "no_change", "device_id": device_id}

    await db.device_metadata.update_one(
        {"device_id": device_id},
        {"$set": update_data},
        upsert=True
    )
    return {"status": "success", "device_id": device_id, "updated": update_data}

@router.put("/{device_id}/location")
async def update_device_location(device_id: str, location: DeviceLocation):
    """Update the map coordinates for a device"""
    await db.device_metadata.update_one(
        {"device_id": device_id},
        {"$set": {"x": location.x, "y": location.y}},
        upsert=True
    )
    return {"status": "success", "device_id": device_id, "location": location}

@router.delete("/{device_id}")
async def delete_device(device_id: str, user = Depends(validate_token)):
    """Delete a device, its metadata, and all associated events"""
    # Delete from devices registry
    r1 = await db.devices.delete_one({"device_id": device_id})
    
    # Delete metadata
    r2 = await db.device_metadata.delete_one({"device_id": device_id})
    
    # Delete all events for this device (to ensure it disappears from dashboard)
    r3 = await db.events.delete_many({"device_id": device_id})
    
    if r1.deleted_count == 0 and r2.deleted_count == 0 and r3.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
        
    return {
        "status": "success", 
        "message": "Device deleted",
        "deleted_counts": {
            "registry": r1.deleted_count,
            "metadata": r2.deleted_count,
            "events": r3.deleted_count
        }
    }

# ── Schedule timezone handling ───────────────────────────────────────────────
# The dashboard sets LOCAL wall-clock hours plus an IANA timezone; that pair is
# the stored source of truth. The firmware is deliberately timezone-blind: it
# runs on NTP UTC and compares against UTC values, so every conversion happens
# here.
#
# The UTC window is recomputed on each GET rather than frozen at save time.
# That is what makes DST self-correcting: when Pacific flips PDT->PST the
# offset changes, and since the device re-fetches every 5 minutes it picks up
# the new UTC window without anyone touching the schedule.

def _utc_offset_minutes(tz_name: Optional[str], at: Optional[datetime] = None) -> int:
    """DST-aware UTC offset for tz_name, in minutes. Positive = ahead of UTC."""
    if not tz_name or ZoneInfo is None:
        return 0
    try:
        at = at or datetime.now(dt_timezone.utc)
        off = at.astimezone(ZoneInfo(tz_name)).utcoffset()
        return int(off.total_seconds() // 60) if off else 0
    except Exception:
        return 0


def _to_utc_window(start_min: int, end_min: int, days, tz_name, at=None):
    """Convert a local wall-clock window to UTC.

    Returns (utc_start_min, utc_end_min, utc_days, wraps_midnight, offset_min).

    `utc_days` is keyed to the weekday the window *starts* on in UTC, which can
    differ from the local weekday (e.g. 08:00 in Tokyo is 23:00 UTC the day
    before). The firmware applies the same rule when the window wraps.
    """
    off = _utc_offset_minutes(tz_name, at)
    u_start = start_min - off
    u_end = end_min - off
    shift = u_start // 1440              # floor division: correct for negatives
    u_start_mod = u_start % 1440
    u_end_mod = u_end % 1440
    try:
        u_days = sorted({(int(d) + shift) % 7 for d in (days or [])})
    except (TypeError, ValueError):
        u_days = []
    return u_start_mod, u_end_mod, u_days, u_start_mod > u_end_mod, off


class DeviceSchedule(BaseModel):
    enabled: bool = False
    timezone: Optional[str] = "America/Los_Angeles"

    # Local wall-clock schedule — the source of truth. Older dashboards sent
    # these as start_hour/start_minute/..., so both spellings are accepted.
    local_start_hour: Optional[int] = None
    local_start_minute: Optional[int] = None
    local_end_hour: Optional[int] = None
    local_end_minute: Optional[int] = None
    local_active_days: Optional[list] = None

    start_hour: Optional[int] = None
    start_minute: Optional[int] = None
    end_hour: Optional[int] = None
    end_minute: Optional[int] = None
    active_days: Optional[list] = None

    sniff_interval_sec: Optional[int] = 60
    deep_sense_sec: Optional[int] = 30
    heartbeat_interval: Optional[int] = 4
    cooldown_sec: Optional[int] = 20
    # Detector knobs the firmware already parses in fetchSchedule()
    spike_threshold: Optional[float] = None
    gas_drop_ratio: Optional[float] = None

def _schedule_response(device_id: str, doc: Optional[dict]) -> dict:
    """Build the schedule payload.

    `start_hour`/`end_hour`/`active_days` are UTC — the firmware consumes these
    directly and does no timezone math. `local_*` + `timezone` are what the
    dashboard renders and edits.
    """
    tz = (doc or {}).get("timezone") or "America/Los_Angeles"

    if not doc:
        # Nothing saved: hand the device a genuinely unrestricted UTC window
        # rather than converting a local full-day (which would wrap and look
        # like a real constraint). local_* are just sensible form defaults.
        return {
            "device_id": device_id,
            "enabled": False,
            "start_hour": 0, "start_minute": 0,
            "end_hour": 23, "end_minute": 59,
            "active_days": [0, 1, 2, 3, 4, 5, 6],
            "wraps_midnight": False,
            "timezone": tz,
            "utc_offset_minutes": _utc_offset_minutes(tz),
            "local_start_hour": 8, "local_start_minute": 0,
            "local_end_hour": 15, "local_end_minute": 0,
            "local_active_days": [1, 2, 3, 4, 5],
            "sniff_interval_sec": 60,
            "deep_sense_sec": 30,
            "heartbeat_interval": 4,
            "cooldown_sec": 20,
            "spike_threshold": None,
            "gas_drop_ratio": None,
        }

    enabled = doc.get("enabled", False)
    l_sh = doc.get("local_start_hour", doc.get("start_hour", 0)) or 0
    l_sm = doc.get("local_start_minute", doc.get("start_minute", 0)) or 0
    l_eh = doc.get("local_end_hour", doc.get("end_hour", 23))
    l_eh = 23 if l_eh is None else l_eh
    l_em = doc.get("local_end_minute", doc.get("end_minute", 59))
    l_em = 59 if l_em is None else l_em
    l_days = doc.get("local_active_days", doc.get("active_days")) or [1, 2, 3, 4, 5]

    u_start, u_end, u_days, wraps, off = _to_utc_window(
        l_sh * 60 + l_sm, l_eh * 60 + l_em, l_days, tz)

    return {
        "device_id": device_id,
        "enabled": enabled,
        # ── UTC: what the firmware uses ──
        "start_hour": u_start // 60,
        "start_minute": u_start % 60,
        "end_hour": u_end // 60,
        "end_minute": u_end % 60,
        "active_days": u_days,
        "wraps_midnight": wraps,
        # ── Local: what the dashboard shows ──
        "timezone": tz,
        "utc_offset_minutes": off,
        "local_start_hour": l_sh,
        "local_start_minute": l_sm,
        "local_end_hour": l_eh,
        "local_end_minute": l_em,
        "local_active_days": sorted(int(d) for d in l_days),
        # ── Tuning knobs ──
        "sniff_interval_sec": doc.get("sniff_interval_sec", 60),
        "deep_sense_sec": doc.get("deep_sense_sec", 30),
        "heartbeat_interval": doc.get("heartbeat_interval", 4),
        "cooldown_sec": doc.get("cooldown_sec", 20),
        "spike_threshold": doc.get("spike_threshold"),
        "gas_drop_ratio": doc.get("gas_drop_ratio"),
    }


@router.get("/{device_id}/schedule")
async def get_device_schedule(device_id: str):
    """Active-hours schedule. UTC fields are for the ESP32, local_* for the UI.

    UTC is derived on every request so a DST transition corrects itself without
    the schedule being re-saved.
    """
    doc = await db.device_schedules.find_one({"device_id": device_id})
    return _schedule_response(device_id, doc)


@router.put("/{device_id}/schedule")
async def update_device_schedule(device_id: str, schedule: DeviceSchedule):
    """Store a schedule. The dashboard sends LOCAL hours plus an IANA timezone;
    we persist that pair as the source of truth and cache a UTC snapshot for
    debugging. Reads always recompute UTC, so the snapshot never goes stale in
    a way that affects the device."""
    s = schedule

    def pick(new, old, default):
        if new is not None:
            return new
        return old if old is not None else default

    l_sh = pick(s.local_start_hour, s.start_hour, 8)
    l_sm = pick(s.local_start_minute, s.start_minute, 0)
    l_eh = pick(s.local_end_hour, s.end_hour, 15)
    l_em = pick(s.local_end_minute, s.end_minute, 0)
    l_days = pick(s.local_active_days, s.active_days, [1, 2, 3, 4, 5])

    for name, val in (("hour", l_sh), ("hour", l_eh)):
        if not (0 <= int(val) <= 23):
            raise HTTPException(status_code=422, detail=f"{name} out of range: {val}")
    for name, val in (("minute", l_sm), ("minute", l_em)):
        if not (0 <= int(val) <= 59):
            raise HTTPException(status_code=422, detail=f"{name} out of range: {val}")
    if any(int(d) < 0 or int(d) > 6 for d in l_days):
        raise HTTPException(status_code=422, detail="active_days must be 0-6 (0=Sun)")

    tz = s.timezone or "America/Los_Angeles"
    if ZoneInfo is not None and s.timezone:
        try:
            ZoneInfo(tz)
        except Exception:
            raise HTTPException(status_code=422, detail=f"Unknown timezone: {tz}")

    u_start, u_end, u_days, wraps, off = _to_utc_window(
        l_sh * 60 + l_sm, l_eh * 60 + l_em, l_days, tz)

    data = {
        "device_id": device_id,
        "enabled": s.enabled,
        "timezone": tz,
        "local_start_hour": int(l_sh),
        "local_start_minute": int(l_sm),
        "local_end_hour": int(l_eh),
        "local_end_minute": int(l_em),
        "local_active_days": sorted(int(d) for d in l_days),
        # Cached UTC snapshot — informational; GET recomputes.
        "start_hour": u_start // 60,
        "start_minute": u_start % 60,
        "end_hour": u_end // 60,
        "end_minute": u_end % 60,
        "active_days": u_days,
        "wraps_midnight": wraps,
        "utc_offset_minutes": off,
        "sniff_interval_sec": s.sniff_interval_sec,
        "deep_sense_sec": s.deep_sense_sec,
        "heartbeat_interval": s.heartbeat_interval,
        "cooldown_sec": s.cooldown_sec,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    if s.spike_threshold is not None:
        data["spike_threshold"] = s.spike_threshold
    if s.gas_drop_ratio is not None:
        data["gas_drop_ratio"] = s.gas_drop_ratio

    await db.device_schedules.update_one(
        {"device_id": device_id}, {"$set": data}, upsert=True)

    return {"status": "success", "device_id": device_id,
            "schedule": _schedule_response(device_id, data)}

@router.get("/", response_model=List[dict])
async def get_device_summary(school: Optional[str] = None):
    """Get a summary of all devices and their recent activity"""
    
    # 1. First, get the list of RELEVANT DEVICES from the registry
    query = {}
    if school:
        # If school is "admin" (case-insensitive), show all devices
        if school.lower() == "admin":
            pass
        else:
            query["org_id"] = school
            
    devices_cursor = db.devices.find(query)
    
    device_summaries = []
    
    # 2. Iterate through each registered device
    async for device_doc in devices_cursor:
        device_id = device_doc.get("device_id")
        if not device_id:
            continue
            
        # 3. Fetch metadata and stats for THIS device
        metadata = await db.device_metadata.find_one({"device_id": device_id})
        
        # Get latest event (for status/alerts)
        latest_event = await db.events.find_one(
            {"device_id": device_id},
            sort=[("timestamp", -1), ("created_at", -1)]
        )
        
        # Get latest raw sample (for real-time values even if no event)
        latest_sample = await db.samples.find_one(
            {"device_id": device_id},
            sort=[("timestamp", -1)]
        )
        
        # Determine which data to show
        # We want the NEWEST info, whether it's a raw sample or a confirmed event
        current_data = {}

        def to_dt(value):
            if isinstance(value, datetime):
                return value
            if isinstance(value, str):
                try:
                    return datetime.fromisoformat(value.replace("Z", "+00:00"))
                except ValueError:
                    return None
            return None

        def best_ts(doc: Optional[dict]):
            if not doc:
                return None
            return (
                to_dt(doc.get("timestamp"))
                or to_dt(doc.get("t_decision"))
                or to_dt(doc.get("created_at"))
                or to_dt(doc.get("t_start"))
            )
        
        # 1. Determine base data source
        try:
            if latest_sample and latest_event:
                t_sample = best_ts(latest_sample)
                t_event = best_ts(latest_event)
                
                if t_sample and t_event:
                    if t_sample > t_event:
                        current_data = latest_sample.copy()
                    else:
                        current_data = latest_event.copy()
                elif t_sample:
                     current_data = latest_sample.copy()
                else:
                    current_data = latest_event.copy()
            elif latest_sample:
                current_data = latest_sample.copy()
            elif latest_event:
                current_data = latest_event.copy()
        except Exception:
             # Fallback if comparison fails
             current_data = latest_sample.copy() if latest_sample else (latest_event.copy() if latest_event else {})
            
        # 2. Get Real-Time State (Override status)
        # This ensures we see "CALIBRATING" or "CONFIRMING" immediately
        rt_state = state_manager.get_state(device_id)
        if rt_state:
            current_data["status"] = rt_state.get("status", "monitoring")
            current_data["ewma_pm25"] = rt_state.get("ewma_pm25")
            current_data["baseline_pm25"] = rt_state.get("baseline_pm25")
            current_data["baseline_pm10"] = rt_state.get("baseline_pm10")
            current_data["baseline_humidity"] = rt_state.get("baseline_humidity")
            current_data["baseline_temperature"] = rt_state.get("baseline_temperature")
            current_data["baseline_gas_resistance"] = rt_state.get("baseline_gas_resistance")
        elif "status" not in current_data:
            current_data["status"] = "monitoring"
            
        # 3. Ensure defaults for frontend
        current_data.setdefault("top_class", "normal")
        current_data.setdefault("predicted_class", current_data.get("top_class", "normal"))
        if "confidence" not in current_data and current_data.get("top_prob") is not None:
            try:
                current_data["confidence"] = float(current_data.get("top_prob", 0)) * 100.0
            except (TypeError, ValueError):
                current_data["confidence"] = 0
        current_data.setdefault("confidence", 0)
        
        # Get stats (counts)
        event_count = await db.events.count_documents({"device_id": device_id})
        
        # Calculate recent events (last 24h)
        one_day_ago = (datetime.utcnow() - timedelta(days=1)).isoformat()
        recent_count = await db.events.count_documents({
            "device_id": device_id,
            "timestamp": {"$gte": one_day_ago}
        })
        
        verified_count = await db.events.count_documents({
            "device_id": device_id,
            "verified": True
        })

        # 4. Build the summary object
        summary = {
            "device_id": device_id,
            "total_events": event_count,
            "recent_events": recent_count,
            "verified_events": verified_count,
            "last_seen": device_doc.get("last_seen"),
            "last_location": latest_event.get("location") if latest_event else None,
            "map_location": None, 
            "name_override": None,
            "location_override": None
        }
        
        # Attach current_data as "latest_event" for frontend compatibility
        if current_data:
            if "_id" in current_data:
                current_data["_id"] = str(current_data["_id"])
            summary["latest_event"] = current_data
            
            # If device_doc.last_seen is old or missing, use the data timestamp
            if not summary["last_seen"]:
                summary["last_seen"] = current_data.get("timestamp")
        
        # Apply metadata overrides
        if metadata:
            if metadata.get("x") is not None and metadata.get("y") is not None:
                summary["map_location"] = {"x": float(metadata["x"]), "y": float(metadata["y"])}
            if metadata.get("name"):
                summary["name_override"] = metadata.get("name")
            if metadata.get("location"):
                summary["location_override"] = metadata.get("location")
            
        device_summaries.append(summary)
        
    return device_summaries
