from fastapi import APIRouter, HTTPException, Request
import logging
from datetime import datetime, timedelta
from typing import Any, Dict

from app.database import db
from app.inference import predict
from app.ws import broadcast_event, broadcast_sensor_reading

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/data", status_code=200)
async def receive_sensor_data(payload: Dict[str, Any], request: Request):
    """
    Ingest sensor data, run prediction, store to DB, and broadcast updates.
    """
    try:
        # Basic payload logging
        try:
            raw_body = await request.body()
            print(f"[raw-body] len={len(raw_body)} preview={raw_body[:200]!r}")
        except Exception:
            pass

        payload_str = str(payload)
        print(
            f"[payload] keys={list(payload.keys())} preview={payload_str[:200]}"
        )

        if not payload:
            logger.warning("Empty payload received")
            return {
                "status": "error",
                "message": "Empty payload received",
                "prediction": {"predicted_class": "normal", "confidence": 0},
            }

        # Ensure timestamp and device_id
        payload.setdefault(
            "timestamp", datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
        )
        payload.setdefault("device_id", "unknown")

        # Clean payload to expected fields
        expected_fields = [
            "device_id",
            "org_id",
            "timestamp",
            "humidity",
            "temperature",
            "pm25",
            "pm10",
            "gas_resistance",
            "sound_level",
            "location",
            "mic_available",
        ]
        payload = {k: v for k, v in payload.items() if k in expected_fields}
        print(f"[cleaned] keys={list(payload.keys())}")

        # Sanitize numeric fields
        for field in [
            "humidity",
            "temperature",
            "pm25",
            "pm10",
            "gas_resistance",
            "sound_level",
        ]:
            try:
                if field not in payload or payload[field] is None:
                    payload[field] = 0.0
                elif isinstance(payload[field], str):
                    payload[field] = float(payload[field])
                elif not isinstance(payload[field], (int, float)):
                    payload[field] = 0.0
                if abs(float(payload[field])) > 10000:
                    payload[field] = 0.0
            except Exception:
                logger.warning(
                    f"Invalid {field} value: {payload.get(field)}, defaulting to 0"
                )
                payload[field] = 0.0

        # Run prediction
        try:
            result = predict(payload)
        except Exception as predict_error:
            logger.error(f"Prediction error: {predict_error}")
            result = {
                "predicted_class": "normal",
                "confidence": 0,
                "model_version": "error_fallback",
            }

        # Build event document
        doc = {
            "device_id": payload.get("device_id", "unknown"),
            "school": payload.get("org_id", "unknown"),
            "timestamp": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
            "humidity": payload.get("humidity", 0.0),
            "temperature": payload.get("temperature", 0.0),
            "pm25": payload.get("pm25", 0.0),
            "pm10": payload.get("pm10", 0.0),
            "gas_resistance": payload.get("gas_resistance", 0.0),
            "sound_level": payload.get("sound_level", 0.0),
            "mic_available": bool(payload.get("mic_available", True)),
            "predicted_class": result.get("predicted_class", "normal"),
            "confidence": result.get("confidence", 0.0),
            "model_version": result.get("model_version", "unknown"),
            "verified": False,
            "actual_class": "none",
        }

        stored = False
        doc_id = None

        # Store and broadcast (non-fatal on failure)
        try:
            insert_result = await db.events.insert_one(doc)
            doc_id = str(insert_result.inserted_id)
            stored = True
        except Exception as db_error:
            logger.error(f"DB insert failed: {db_error}")

        try:
            mic_available = bool(doc.get("mic_available", True))
            sensor_reading = {
                "device_id": doc.get("device_id", "unknown"),
                "school": doc.get("school", "unknown"),
                "timestamp": doc.get("timestamp"),
                "humidity": float(doc.get("humidity", 0)),
                "pm25": float(doc.get("pm25", 0)),
                "particle_size": float(doc.get("gas_resistance", 0)) / 10,
                "volume_spike": float(doc.get("sound_level", 0)) if mic_available else 0.0,
                "temperature": float(doc.get("temperature", 0)),
                "gas_resistance": float(doc.get("gas_resistance", 0)),
                "pm10": float(doc.get("pm10", 0)),
                "sound_level": float(doc.get("sound_level", 0)),
                "prediction": {
                    "type": doc.get("predicted_class", "normal"),
                    "predicted_class": doc.get("predicted_class", "normal"),
                    "confidence": float(doc.get("confidence", 0)),
                },
            }
            await broadcast_sensor_reading(
                sensor_reading.get("device_id", "unknown"), sensor_reading
            )
            if stored:
                await broadcast_event("sensor_data", {**doc, "_id": doc_id})
        except Exception as broadcast_error:
            logger.error(f"WebSocket broadcast failed: {broadcast_error}")

        return {
            "status": "success",
            "message": "Sensor data processed" + (" (not stored)" if not stored else ""),
            "event_id": doc_id,
            "prediction": {
                "predicted_class": result.get("predicted_class", "normal"),
                "confidence": result.get("confidence", 0),
            },
        }

    except Exception as e:
        logger.exception(f"Error processing sensor data, payload={payload}")
        return {
            "status": "error",
            "message": f"Error processing sensor data: {e}",
            "prediction": {"predicted_class": "normal", "confidence": 0},
        }


@router.get("/status")
async def get_sensor_status():
    """Basic status for recent sensor ingestion."""
    try:
        one_hour_ago = (
            datetime.utcnow() - timedelta(hours=1)
        ).isoformat(timespec="milliseconds") + "Z"
        recent_count = await db.events.count_documents({"timestamp": {"$gte": one_hour_ago}})
        return {
            "status": "active",
            "recent_events": recent_count,
            "last_updated": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting sensor status: {e}")


@router.get("/sensor-data")
async def get_sensor_data(limit: int = 50):
    """Recent sensor data formatted for the frontend dashboard."""
    try:
        cursor = db.events.find().sort("timestamp", -1).limit(limit)
        sensor_data = []
        async for doc in cursor:
            sensor_reading = {
                "device_id": doc.get("device_id", "unknown"),
                "timestamp": doc.get("timestamp"),
                "humidity": doc.get("humidity", 0),
                "pm25": doc.get("pm25", 0),
                "particle_size": doc.get("gas_resistance", 0) / 10,
                "volume_spike": doc.get("sound_level", 0),
                "temperature": doc.get("temperature", 0),
                "gas_resistance": doc.get("gas_resistance", 0),
                "pm10": doc.get("pm10", 0),
                "sound_level": doc.get("sound_level", 0),
                "prediction": {
                    "type": doc.get("predicted_class", "normal"),
                    "predicted_class": doc.get("predicted_class", "normal"),
                    "confidence": doc.get("confidence", 0),
                },
            }
            sensor_data.append(sensor_reading)
        return sensor_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting sensor data: {e}")