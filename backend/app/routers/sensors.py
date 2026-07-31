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
        raw_ts = payload.get("timestamp")
        if not raw_ts or not isinstance(raw_ts, str) or "T" not in raw_ts:
            payload["timestamp"] = datetime.utcnow().isoformat(timespec="milliseconds") + "Z"

        # Check if payload has real sensor data before sanitization coerces None to 0
        _has_real_sensor_data = "humidity" in payload or "pm25" in payload

        # Sanitize numerics
        numeric_fields = ["humidity", "temperature", "pm25", "pm10", "pm1", "gas_resistance",
                          "pressure", "sound_level", "baseline_pm25", "baseline_gas"]
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
            # Use upsert=True so sensors auto-register on first data post
            device_update = {
                "last_seen": datetime.utcnow().isoformat() + "Z",
                "updated_at": datetime.utcnow().isoformat() + "Z",
            }
            if payload.get("firmware_version"):
                device_update["firmware_version"] = payload["firmware_version"]
            # Build $setOnInsert for auto-registration of new devices
            set_on_insert = {"created_at": datetime.utcnow().isoformat() + "Z"}
            if payload.get("org_id") and payload["org_id"] != "unknown":
                # Only set org_id on first insert (dashboard registration takes precedence)
                set_on_insert["org_id"] = payload["org_id"]
            await db.devices.update_one(
                {"device_id": payload.get("device_id")},
                {
                    "$set": device_update,
                    "$setOnInsert": set_on_insert
                },
                upsert=True
            )
            # Also ensure device_metadata exists for new devices
            await db.device_metadata.update_one(
                {"device_id": payload.get("device_id")},
                {"$setOnInsert": {"name": f"Device {payload.get('device_id', '')[-4:]}", "location": "Unassigned"}},
                upsert=True
            )
        except Exception as e:
            logger.error(f"Failed to store raw sample or update device: {e}")

        # 3. Run Detector
        # Keep streaming alive even if detector logic throws.
        event_doc = None
        notification_type = None
        try:
            event_doc, notification_type = detector.process_sample(payload.get("device_id"), payload)
        except Exception as e:
            logger.exception(f"Detector processing failed; continuing with raw stream: {e}")
        
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
                await broadcast_event("event_update", event_doc)
                
                # Handle Notifications
                await process_notifications(event_doc, notification_type, payload.get("org_id"))
                
            except Exception as e:
                logger.error(f"Failed to process event storage/broadcast: {e}")

        # 5. Broadcast Raw Reading (for live charts)
        # Skip broadcast for deep_sense_complete — it has no sensor data
        # and would overwrite the dashboard with zeros
        duty_state = payload.get("duty_state", "")

        if duty_state != "deep_sense_complete" and _has_real_sensor_data:
            current_state_for_display = state_manager.get_state(payload.get("device_id"))
            current_status = current_state_for_display.get("status", "IDLE") if current_state_for_display else "IDLE"

            display_type = "normal"
            if current_status == "WARMUP":
                display_type = "warmup"
            elif current_status == "CALIBRATING":
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

            server_ts = datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
            sensor_reading = {
                "device_id": payload.get("device_id"),
                "school": payload.get("org_id"),
                "timestamp": server_ts,
                "sensor_timestamp": payload.get("timestamp"),
                "humidity": payload.get("humidity"),
                "pm25": payload.get("pm25"),
                "pm10": payload.get("pm10"),
                "gas_resistance": payload.get("gas_resistance"),
                "temperature": payload.get("temperature"),
                "sound_level": payload.get("sound_level", 0),
                # Battery/health telemetry for live dashboard tiles
                "battery_voltage": payload.get("battery_voltage"),
                "battery_gauge_ok": payload.get("battery_gauge_ok"),
                "free_heap": payload.get("free_heap"),
                "wifi_rssi": payload.get("wifi_rssi"),
                "duty_state": duty_state,
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

        # Check if backend wants the device to enter DEEP_SENSE
        current_state = state_manager.get_state(payload.get("device_id"))
        should_force = bool(current_state.get("force_deep_sense")) if current_state else False

        response = {
            "status": "success",
            "message": "Processed",
            "event_id": stored_event_id,
            "state": notification_type or "monitoring",
            "force_deep_sense": should_force,
        }

        # Include prediction for sensor firmware (v3 reads this)
        if event_doc and event_doc.get("top_class"):
            response["prediction"] = {
                "predicted_class": event_doc.get("top_class"),
                "confidence": float(event_doc.get("top_prob", 0)) * 100,
            }

        return response

    except Exception as e:
        logger.exception(f"Error processing sensor data: {e}")
        return {"status": "error", "message": str(e)}

@router.post("/tamper", status_code=200)
async def receive_tamper_alert(payload: Dict[str, Any], request: Request):
    """
    Receive tamper/motion alert from MSA311 accelerometer on device.
    Stores a tamper event and broadcasts a notification to the dashboard.
    """
    try:
        device_id = payload.get("device_id", "unknown")
        org_id = payload.get("org_id", "unknown")
        timestamp = datetime.utcnow().isoformat(timespec="milliseconds") + "Z"

        tamper_doc = {
            "device_id": device_id,
            "org_id": org_id,
            "event_type": "tamper",
            "timestamp": timestamp,
            "accel_x": float(payload.get("accel_x", 0)),
            "accel_y": float(payload.get("accel_y", 0)),
            "accel_z": float(payload.get("accel_z", 0)),
        }

        # Store tamper event
        await db.events.insert_one(tamper_doc.copy())

        # Update device last_seen
        await db.devices.update_one(
            {"device_id": device_id},
            {"$set": {
                "last_seen": timestamp,
                "updated_at": timestamp,
            }},
            upsert=False,
        )

        # Broadcast tamper alert to dashboard
        await broadcast_event("tamper_alert", {
            "device_id": device_id,
            "org_id": org_id,
            "timestamp": timestamp,
            "accel_x": tamper_doc["accel_x"],
            "accel_y": tamper_doc["accel_y"],
            "accel_z": tamper_doc["accel_z"],
            "message": f"Tamper detected on device {device_id}",
            "level": "warning",
        })

        logger.info(f"Tamper alert from {device_id}: x={tamper_doc['accel_x']:.2f} y={tamper_doc['accel_y']:.2f} z={tamper_doc['accel_z']:.2f}")

        return {"status": "success", "message": "Tamper alert recorded"}

    except Exception as e:
        logger.exception(f"Error processing tamper alert: {e}")
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
async def get_sensor_data(limit: int = 200):
    """Recent sensor data formatted for the frontend dashboard.
    Fetches from 'samples' collection to show raw environmental data history.
    """
    try:
        # Fetch from SAMPLES, not EVENTS, so we see the continuous stream
        cursor = db.samples.find().sort("timestamp", -1).limit(limit)
        sensor_data = []
        async for doc in cursor:
            ts = doc.get("timestamp", "")
            if not isinstance(ts, str) or "T" not in ts:
                continue
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
                # Battery/health telemetry. None (not 0) when absent, so the
                # dashboard can distinguish "no reading" from "flat battery".
                "battery_voltage": doc.get("battery_voltage"),
                "battery_gauge_ok": doc.get("battery_gauge_ok"),
                "free_heap": doc.get("free_heap"),
                "wifi_rssi": doc.get("wifi_rssi"),
                "duty_state": doc.get("duty_state"),
                "firmware_version": doc.get("firmware_version"),
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
