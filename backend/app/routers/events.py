from fastapi import APIRouter, HTTPException, Body
from app.database import db
from app.inference import predict
from datetime import datetime
from pathlib import Path
import os
from typing import Optional, List, Dict, Any
from bson import ObjectId

base_path = Path(__file__).resolve().parent.parent.parent
class_path = "classifications.txt"
class_path = base_path / class_path
CLASSIFICATIONS = []
if os.path.exists(class_path):
    with open(class_path, "r") as file:
        for line in file:
            CLASSIFICATIONS.append(line.strip())
else:
    print(f"file \"{class_path}\" not found")
    CLASSIFICATIONS = ["normal", "vape"]
CLASSIFICATIONS.append("none")

router = APIRouter()

@router.post("/", status_code=201)
async def create_event(payload: dict):
    # 1) Ensure a timestamp
    payload["timestamp"] = datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
    # 2) Run the model
    result = predict(payload)
    # 3) Build full document
    doc = {**payload, **result}
    # 4) Add verified field (default to False)
    doc.setdefault("verified", False)
    # 5) Add actual_class field (default to "none" for unverified data)
    doc.setdefault("actual_class", "none")
    # 6) Insert into MongoDB
    insert_result = await db.events.insert_one(doc)
    # 7) Replace _id with its string form
    doc["_id"] = str(insert_result.inserted_id)
    # 8) Return JSON‐friendly document
    return doc

@router.get("/", response_model=List[dict])
async def get_events(limit: int = 10):
    """Get recent events with optional limit"""
    cursor = db.events.find().sort("timestamp", -1).limit(limit)
    events = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        events.append(doc)
    return events

@router.get("/{event_id}", response_model=dict)
async def get_event(event_id: str):
    """Get a single event by ID"""
    try:
        doc = await db.events.find_one({"_id": ObjectId(event_id)})
        if doc is None:
            raise HTTPException(status_code=404, detail="Event not found")
        doc["_id"] = str(doc["_id"])
        return doc
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Event not found: {str(e)}")

@router.put("/{event_id}/verify", response_model=dict)
async def verify_event(event_id: str, verified: bool = Body(...)):
    """Update the verified status of an event"""
    try:
        result = await db.events.update_one(
            {"_id": ObjectId(event_id)},
            {"$set": {"verified": verified}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Event not found")
            
        updated_doc = await db.events.find_one({"_id": ObjectId(event_id)})
        updated_doc["_id"] = str(updated_doc["_id"])
        return updated_doc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating event: {str(e)}")

@router.post("/{event_id}/feedback", response_model=dict)
async def add_event_feedback(event_id: str, feedback: Dict[str, Any] = Body(...)):
    """Add user feedback for an event"""
    try:
        # Ensure the event exists
        event = await db.events.find_one({"_id": ObjectId(event_id)})
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Add timestamp to feedback
        feedback["timestamp"] = datetime.utcnow().isoformat()
        
        # Add event reference to feedback
        feedback["event_id"] = event_id
        
        # Insert feedback into feedback collection
        result = await db.feedback.insert_one(feedback)
        
        # Update the event with a reference to this feedback
        await db.events.update_one(
            {"_id": ObjectId(event_id)},
            {"$push": {"feedback_ids": str(result.inserted_id)}}
        )
        
        # Return the feedback with string ID
        feedback["_id"] = str(result.inserted_id)
        return feedback
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding feedback: {str(e)}")

@router.put("/{event_id}/label", response_model=dict)
async def label_event(event_id: str, actual_class: str = Body(...)):
    """Update the actual_class label of an event"""
    try:
        # Validate actual_class value
        if actual_class not in CLASSIFICATIONS:
            raise HTTPException(status_code=400, detail="actual_class must be 'vape', 'normal', or 'none'")
        
        result = await db.events.update_one(
            {"_id": ObjectId(event_id)},
            {"$set": {
                "actual_class": actual_class,
                "verified": actual_class != "none"  # Auto-set verified based on labeling
            }}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Event not found")
            
        updated_doc = await db.events.find_one({"_id": ObjectId(event_id)})
        updated_doc["_id"] = str(updated_doc["_id"])
        return updated_doc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error labeling event: {str(e)}")

@router.post("/label-by-time", response_model=dict)
async def label_events_by_time(
    start_time: str = Body(...),
    end_time: str = Body(...),
    inside_label: str = Body(...),
    outside_label: Optional[str] = Body(None)
):
    """Bulk label events within a time range (outside label optional)."""
    try:
        # Validate inside label
        valid_labels = CLASSIFICATIONS
        if inside_label not in valid_labels:
            raise HTTPException(status_code=400, detail="inside_label must be 'vape', 'normal', or 'none'")
        
        # Label events inside the time range
        inside_result = await db.events.update_many(
            {
                "timestamp": {
                    "$gte": start_time,
                    "$lte": end_time
                }
            },
            {"$set": {
                "actual_class": inside_label,
                "verified": inside_label != "none"
            }}
        )
        
        # Optionally label events outside the time range if outside_label provided
        outside_result = None
        if outside_label is not None:
            if outside_label not in valid_labels:
                raise HTTPException(status_code=400, detail="outside_label must be 'vape', 'normal', or 'none'")
            outside_result = await db.events.update_many(
                {
                    "$or": [
                        {"timestamp": {"$lt": start_time}},
                        {"timestamp": {"$gt": end_time}}
                    ]
                },
                {"$set": {
                    "actual_class": outside_label,
                    "verified": outside_label != "none"
                }}
            )
        
        return {
            "message": "Bulk labeling completed",
            "inside_range": {
                "matched": inside_result.matched_count,
                "modified": inside_result.modified_count,
                "label": inside_label
            },
            "outside_range": (
                {
                    "matched": outside_result.matched_count,
                    "modified": outside_result.modified_count,
                    "label": outside_label
                }
                if outside_result is not None else None
            ),
            "inside_count": inside_result.modified_count,
            "outside_count": outside_result.modified_count if outside_result is not None else 0,
            "time_range": {
                "start": start_time,
                "end": end_time
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error bulk labeling events: {str(e)}")
