from fastapi import APIRouter
from app.database import db
from app.inference import predict
from datetime import datetime

router = APIRouter()

@router.post("/", status_code=201)
async def create_event(payload: dict):
    payload.setdefault("timestamp", datetime.utcnow().isoformat())
    result = predict(payload)
    doc = {**payload, **result}
    await db.events.insert_one(doc)
    return doc

@router.get("/")
async def list_events(since: str = None, limit: int = 50):
    query = {}
    if since:
        query["timestamp"] = {"$gt": since}
    cursor = db.events.find(query).sort("timestamp", -1).limit(limit)
    return [await d for d in cursor]
