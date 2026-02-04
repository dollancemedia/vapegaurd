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
        # If we have a recent sample, it's likely newer than the last "event"
        # We want to show the physics values from the sample, but maybe status from event?
        # Actually, simpler: if sample is newer, use sample values. 
        # But sample doesn't have "status" or "top_class" usually.
        
        current_data = latest_event
        
        # Check if sample is newer or if event doesn't exist
        is_sample_newer = False
        if latest_sample:
            if not latest_event:
                is_sample_newer = True
            else:
                # Compare timestamps (assuming ISO strings)
                t_sample = latest_sample.get("timestamp", "")
                t_event = latest_event.get("timestamp", "")
                if t_sample > t_event:
                    is_sample_newer = True
        
        if is_sample_newer:
            # Base the display object on the sample
            current_data = latest_sample.copy()
            
            # Get real-time state from State Manager
            # This ensures we see "CALIBRATING" or "CONFIRMING" even if no event is generated yet
            real_time_state = state_manager.get_state(device_id)
            rt_status = "monitoring"
            if real_time_state:
                rt_status = real_time_state.get("status", "monitoring")
            
            # Default status fields
            current_data.setdefault("status", rt_status)
            current_data.setdefault("top_class", "normal")
            current_data.setdefault("confidence", 0)
            
            # If there was a recent event (e.g. within 1 minute), maybe we should persist the status?
            # But "monitoring" is safer if we are just polling.
            # The detector updates state_manager, we could query that for "CALIBRATING" etc.
            # For now, let's just ensure we have DATA (non-zero physics).

        # Get stats (counts)raw sample (for real-time values even if no event)
        latest_sample = await db.samples.find_one(
            {"device_id": device_id},
            sort=[("timestamp", -1)]
        )
        
        # Use sample as source of truth for current readings if it's newer
        current_data = latest_event
        if latest_sample:
            # If no event or sample is newer
            if not latest_event or (latest_sample.get("timestamp", "") > latest_event.get("timestamp", "")):
                # Construct a display object from sample
                current_data = latest_sample.copy()
                # Add default event fields to satisfy frontend
                if "status" not in current_data:
                    current_data["status"] = "monitoring" 
                if "top_class" not in current_data:
                    current_data["top_class"] = "normal"
                if "confidence" not in current_data:
                    current_data["confidence"] = 0

        
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
            "last_seen": device_doc.get("last_seen") or (latest_event.get("timestamp") if latest_event else None),
            "last_location": latest_event.get("location") if latest_event else None,
            # Fallback to metadata if no event location
            "map_location": None, 
            "name_override": None,
            "location_override": None
        }
        
        # Apply metadata overrides
        if metadata:
            if metadata.get("x") is not None and metadata.get("y") is not None:
                summary["map_location"] = {"x": float(metadata["x"]), "y": float(metadata["y"])}
            if metadata.get("name"):
                summary["name_override"] = metadata.get("name")
            if metadata.get("location"):
                summary["location_override"] = metadata.get("location")
                
        # If the latest event has an _id, convert it to string
        if latest_event and "_id" in latest_event:
            latest_event["_id"] = str(latest_event["_id"])
            summary["latest_event"] = latest_event
            
        device_summaries.append(summary)
        
    return device_summaries
