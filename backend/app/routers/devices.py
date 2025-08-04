from fastapi import APIRouter, HTTPException
from app.database import db
from typing import List
from datetime import datetime, timedelta

router = APIRouter()

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
        
        # If the latest event has an _id, convert it to string
        if latest_event and "_id" in latest_event:
            latest_event["_id"] = str(latest_event["_id"])
            device_summary["latest_event"] = latest_event
        
        devices.append(device_summary)
    
    return devices