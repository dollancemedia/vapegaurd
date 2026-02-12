from fastapi import APIRouter, HTTPException, Request
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from app.database import db
from app.ws import broadcast_event, broadcast_sensor_reading
from app.detector import detector
from app.config import settings
from app.state_manager import state_manager

router = APIRouter()
logger = logging.getLogger(__name__)

# Alert Configuration (Mock or Env based for now, ideally per-org in DB)
# In a real app, fetch these from db.org_settings based on org_id
DEFAULT_NOTIFY_ON_SUSPICION = True
DEFAULT_NOTIFY_ONLY_IF_VAPE = True

async def process_notifications(event_doc: Dict[str, Any], notification_type: str, org_id: str):
    """
    Handles notification logic based on rules.
    """
    # TODO: Fetch actual org settings
    notify_on_suspicion = DEFAULT_NOTIFY_ON_SUSPICION
    notify_only_if_vape = DEFAULT_NOTIFY_ONLY_IF_VAPE
    
    should_notify = False
    message = ""
    
    top_class = event_doc.get("top_class")
    status = event_doc.get("status")

    if notification_type == "suspicious":
        if notify_on_suspicion:
            should_notify = True
            message = f"Suspicious activity detected at {event_doc.get('device_id')}"
            
    elif notification_type == "confirmed":
        confidence = event_doc.get("confidence")
        if confidence is None:
            confidence = float(event_doc.get("top_prob", 0) or 0) * 100.0

        if notify_only_if_vape:
            if top_class == "vape" and status != "uncertain":
                should_notify = True
                message = f"Vape detected at {event_doc.get('device_id')} ({confidence:.1f}%)"
        else:
            # Notify on any confirmed class (excluding uncertain if desired, or include)
            if status != "uncertain":
                should_notify = True
                message = f"{top_class} detected at {event_doc.get('device_id')}"

    if should_notify:
        logger.info(f"SENDING NOTIFICATION: {message}")
        # Here you would call email/SMS/Push service
        # For now, we broadcast a special alert event
        await broadcast_event("alert", {
            "message": message,
            "event_id": event_doc.get("event_id"),
            "device_id": event_doc.get("device_id"),
            "level": "warning" if notification_type == "suspicious" else "critical"
        })

@router.post("/data", status_code=200)
async def receive_sensor_data(payload: Dict[str, Any], request: Request):
    """
    Ingest sensor data, run stateful detection, store to DB, and broadcast updates.
    """
    try:
        # 1. Clean & Sanitize Payload
        if not payload:
            return {"status": "error", "message": "Empty payload"}

        # Ensure defaults
        payload.setdefault("device_id", "unknown")
        payload.setdefault("org_id", "unknown")
        # Ensure timestamp is present (Detector handles parsing, but we need it for raw storage too)
        if "timestamp" not in payload:
             payload["timestamp"] = datetime.utcnow().isoformat(timespec="milliseconds") + "Z"

        # Sanitize numerics
        numeric_fields = ["humidity", "temperature", "pm25", "pm10", "gas_resistance", "sound_level"]
        for field in numeric_fields:
            val = payload.get(field)
            try:
                if val is None:
                    payload[field] = 0.0
                else:
                    payload[field] = float(val)
            except (ValueError, TypeError):
                payload[field] = 0.0

        # 2. Store Raw Sample (Async)
        try:
            # We copy payload to avoid mutation issues if any
            await db.samples.insert_one(payload.copy())
            
            # Update Device 'last_seen' to keep it Online in Dashboard
            await db.devices.update_one(
                {"device_id": payload.get("device_id")},
                {"$set": {
                    "last_seen": datetime.utcnow().isoformat() + "Z",
                    "updated_at": datetime.utcnow().isoformat() + "Z"
                }},
                upsert=False 
            )
        except Exception as e:
            logger.error(f"Failed to store raw sample or update device: {e}")

        # 3. Run Detector
        event_doc, notification_type = detector.process_sample(payload.get("device_id"), payload)
        
        # 4. Handle Events
        stored_event_id = None
        if event_doc:
            # Add org_id to event doc
            event_doc["school"] = payload.get("org_id")
            
            try:
                # Store event
                res = await db.events.insert_one(event_doc)
                stored_event_id = str(res.inserted_id)
                event_doc["_id"] = stored_event_id
                
                # Broadcast Event Update to Dashboard
                await broadcast_event("sensor_data", event_doc)
                
                # Handle Notifications
                await process_notifications(event_doc, notification_type, payload.get("org_id"))
                
            except Exception as e:
                logger.error(f"Failed to process event storage/broadcast: {e}")

        # 5. Broadcast Raw Reading (for live charts)
        # Get real-time state
        current_state = state_manager.get_state(payload.get("device_id"))
        current_status = current_state.get("status", "IDLE") if current_state else "IDLE"
        
        display_type = "normal"
        if current_status == "CALIBRATING":
            display_type = "calibrating"
        elif current_status == "CONFIRMING":
             display_type = "suspected"
             
        # Override with specific event details if this sample triggered an event
        if event_doc:
             if event_doc.get("status") == "confirmed":
                 display_type = event_doc.get("top_class", "vape")
             elif event_doc.get("status") == "uncertain":
                 display_type = "uncertain"
             elif event_doc.get("status") == "suspected":
                 display_type = "suspected"

        # We construct a reading object compatible with frontend expectations
        sensor_reading = {
            "device_id": payload.get("device_id"),
            "school": payload.get("org_id"),
            "timestamp": payload.get("timestamp"),
            "humidity": payload.get("humidity"),
            "pm25": payload.get("pm25"),
            "pm10": payload.get("pm10"),
            "gas_resistance": payload.get("gas_resistance"),
            "temperature": payload.get("temperature"),
            "sound_level": payload.get("sound_level", 0),
            # Add prediction info
            "prediction": {
                "type": display_type,
                "confidence": event_doc.get("top_prob", 0) * 100 if event_doc else 0,
                "status": current_status
            }
        }
        
        try:
            await broadcast_sensor_reading(payload.get("device_id"), sensor_reading)
        except Exception as e:
            logger.error(f"Broadcast reading failed: {e}")

        return {
            "status": "success",
            "message": "Processed",
            "event_id": stored_event_id,
            "state": notification_type or "monitoring"
        }

    except Exception as e:
        logger.exception(f"Error processing sensor data: {e}")
        return {"status": "error", "message": str(e)}

@router.get("/status")
async def get_sensor_status():
    """Basic status for recent sensor ingestion."""
    try:
        # Use simple utcnow
        one_hour_ago = (datetime.utcnow() - timedelta(hours=1)).isoformat()
        recent_count = await db.events.count_documents({"timestamp": {"$gte": one_hour_ago}})
        return {
            "status": "active",
            "recent_events": recent_count,
            "last_updated": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting sensor status: {e}")

@router.get("/sensor-data")
async def get_sensor_data(limit: int = 50):
    """Recent sensor data formatted for the frontend dashboard.
    Fetches from 'samples' collection to show raw environmental data history.
    """
    try:
        # Fetch from SAMPLES, not EVENTS, so we see the continuous stream
        cursor = db.samples.find().sort("timestamp", -1).limit(limit)
        sensor_data = []
        async for doc in cursor:
            # Format for frontend
            # Note: Raw samples might not have 'status' or 'top_class', default to normal
            sensor_reading = {
                "device_id": doc.get("device_id", "unknown"),
                "timestamp": doc.get("timestamp"),
                "humidity": doc.get("humidity", 0),
                "pm25": doc.get("pm25", 0),
                "pm10": doc.get("pm10", 0),
                "temperature": doc.get("temperature", 0),
                "gas_resistance": doc.get("gas_resistance", 0),
                "prediction": {
                    "type": doc.get("top_class", "normal"), # Samples usually don't have this
                    "confidence": doc.get("confidence", 0),
                    "status": doc.get("status", "monitoring")
                }
            }
            sensor_data.append(sensor_reading)
        return sensor_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting sensor data: {e}")
