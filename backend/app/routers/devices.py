from fastapi import APIRouter, HTTPException, Body
from app.database import db
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from pydantic import BaseModel

router = APIRouter()

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

@router.get("/", response_model=List[dict])
async def get_device_summary():
    """Get a summary of all devices and their recent activity"""
    # Get unique device IDs from events collection
    pipeline = [
        {"$group": {"_id": "$device_id"}},
        {"$project": {"device_id": "$_id", "_id": 0}}
    ]
    
    cursor = db.events.aggregate(pipeline)
    devices = []
    
    # For each device, get summary information
    async for device_doc in cursor:
        device_id = device_doc.get("device_id")
        if not device_id:
            continue
            
        # Get the most recent event for this device
        latest_event = await db.events.find_one(
            {"device_id": device_id},
            sort=[("timestamp", -1)]
        )
        
        # Get device metadata (coordinates, name, location)
        metadata = await db.device_metadata.find_one({"device_id": device_id})
        
        # Count total events for this device
        event_count = await db.events.count_documents({"device_id": device_id})
        
        # Count recent events (last 24 hours)
        one_day_ago = (datetime.utcnow() - timedelta(days=1)).isoformat()
        recent_count = await db.events.count_documents({
            "device_id": device_id,
            "timestamp": {"$gte": one_day_ago}
        })
        
        # Get verification stats
        verified_count = await db.events.count_documents({
            "device_id": device_id,
            "verified": True
        })
        
        # Build device summary
        device_summary = {
            "device_id": device_id,
            "total_events": event_count,
            "recent_events": recent_count,
            "verified_events": verified_count,
            "last_seen": latest_event.get("timestamp") if latest_event else None,
            "last_location": latest_event.get("location") if latest_event else None
        }

        # Include metadata from metadata collection if available
        if metadata and isinstance(metadata, dict):
            # Coordinates
            x = metadata.get("x")
            y = metadata.get("y")
            if x is not None and y is not None:
                device_summary["map_location"] = {"x": float(x), "y": float(y)}
            
            # Name override
            if metadata.get("name"):
                device_summary["name_override"] = metadata.get("name")
                
            # Location override
            if metadata.get("location"):
                device_summary["location_override"] = metadata.get("location")
        
        # If the latest event has an _id, convert it to string
        if latest_event and "_id" in latest_event:
            latest_event["_id"] = str(latest_event["_id"])
            device_summary["latest_event"] = latest_event
        
        devices.append(device_summary)
    
    return devices
