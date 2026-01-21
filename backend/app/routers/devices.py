from fastapi import APIRouter, HTTPException, Body, Depends
from app.database import db
from app.auth import validate_token
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
    allowed_device_ids: Optional[set] = None
    if school:
        allowed_device_ids = set()
        async for device in db.devices.find({"org_id": school}):
            device_id = device.get("device_id")
            if device_id:
                allowed_device_ids.add(device_id)
        if school and allowed_device_ids is not None and len(allowed_device_ids) == 0:
            return []

    pipeline = []
    if allowed_device_ids:
        pipeline.append({"$match": {"device_id": {"$in": list(allowed_device_ids)}}})
    pipeline.extend([
        {"$group": {"_id": "$device_id"}},
        {"$project": {"device_id": "$_id", "_id": 0}}
    ])
    
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
