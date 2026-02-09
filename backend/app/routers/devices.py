from fastapi import APIRouter, HTTPException, Body, Depends
from app.database import db
from app.auth import validate_token
from app.state_manager import state_manager
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from pydantic import BaseModel

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
            sort=[("timestamp", -1)]
        )
        
        # Get latest raw sample (for real-time values even if no event)
        latest_sample = await db.samples.find_one(
            {"device_id": device_id},
            sort=[("timestamp", -1)]
        )
        
        # Determine which data to show
        # We want the NEWEST info, whether it's a raw sample or a confirmed event
        current_data = {}
        
        # 1. Determine base data source
        try:
            if latest_sample and latest_event:
                # Safe comparison: Convert to strings or compare if same type
                # Timestamps are likely ISO strings if inserted by sensors.py
                t_sample = str(latest_sample.get("timestamp", ""))
                t_event = str(latest_event.get("timestamp", ""))
                
                if t_sample > t_event:
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
        elif "status" not in current_data:
            current_data["status"] = "monitoring"
            
        # 3. Ensure defaults for frontend
        current_data.setdefault("top_class", "normal")
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
