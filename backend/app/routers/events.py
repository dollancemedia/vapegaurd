from fastapi import APIRouter, HTTPException, Body
from app.database import db
from app.inference import predict
from datetime import datetime
from typing import Optional, List
from bson import ObjectId

router = APIRouter()

@router.post("/", status_code=201)
async def create_event(payload: dict):
    # 1) Ensure a timestamp
    payload.setdefault("timestamp", datetime.utcnow().isoformat())
    # 2) Run the model
    result = predict(payload)
    # 3) Build full document
    doc = {**payload, **result}
    # 4) Add verified field (default to False)
    doc.setdefault("verified", False)
    # 5) Insert into MongoDB
    insert_result = await db.events.insert_one(doc)
    # 6) Replace _id with its string form
    doc["_id"] = str(insert_result.inserted_id)
    # 7) Return JSON‐friendly document
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
