from fastapi import APIRouter, HTTPException
from app.database import db
from app.inference import predict
from datetime import datetime, timedelta
from typing import Dict, Any

router = APIRouter()

@router.post("/data", status_code=201)
async def receive_sensor_data(payload: Dict[str, Any]):
    """
    Receive sensor data from ESP32 devices or simulation.
    Process the data through the ML model and store results.
    """
    try:
        # Ensure a timestamp if not provided
        payload.setdefault("timestamp", datetime.utcnow().isoformat())
        
        # Ensure device_id is present
        if "device_id" not in payload:
            payload["device_id"] = "unknown"
        
        # Run the ML model prediction
        result = predict(payload)
        
        # Build full document with sensor data and prediction results
        doc = {**payload, **result}
        
        # Add verified field (default to False)
        doc.setdefault("verified", False)
        
        # Insert into MongoDB events collection
        insert_result = await db.events.insert_one(doc)
        
        # Replace _id with its string form for JSON response
        doc["_id"] = str(insert_result.inserted_id)
        
        # Return the processed document
        return {
            "status": "success",
            "message": "Sensor data processed successfully",
            "event_id": doc["_id"],
            "prediction": {
                "predicted_class": result.get("predicted_class"),
                "confidence": result.get("confidence")
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing sensor data: {str(e)}")

@router.get("/status")
async def get_sensor_status():
    """
    Get the status of sensor data reception.
    """
    try:
        # Get count of recent sensor data (last hour)
        one_hour_ago = (datetime.utcnow() - timedelta(hours=1)).isoformat()
        recent_count = await db.events.count_documents({
            "timestamp": {"$gte": one_hour_ago}
        })
        
        return {
            "status": "active",
            "recent_events": recent_count,
            "last_updated": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting sensor status: {str(e)}")