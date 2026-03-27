"""
Firmware management endpoints for OTA updates.

- POST /upload          — Upload a new firmware binary (from dashboard)
- GET  /latest          — Check for updates (called by ESP32 sensors)
- GET  /download/{id}   — Download a firmware binary
- GET  /list            — List all firmware versions (for dashboard)
- DELETE /{id}          — Delete a firmware version
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
from bson import ObjectId
import io

from app.database import db

router = APIRouter()

# Max firmware size: 2MB (OTA slot is 1.875MB, but binary is smaller)
MAX_FIRMWARE_SIZE = 2 * 1024 * 1024


@router.post("/upload")
async def upload_firmware(
    file: UploadFile = File(...),
    version: str = Form(...),
    changelog: str = Form(""),
):
    """Upload a new firmware .bin file."""
    if not file.filename.endswith(".bin"):
        raise HTTPException(400, "File must be a .bin firmware binary")

    content = await file.read()
    if len(content) > MAX_FIRMWARE_SIZE:
        raise HTTPException(400, f"Firmware too large ({len(content)} bytes, max {MAX_FIRMWARE_SIZE})")
    if len(content) < 1024:
        raise HTTPException(400, "File too small to be a valid firmware")

    # Check for duplicate version
    existing = await db.firmware.find_one({"version": version})
    if existing:
        raise HTTPException(409, f"Version {version} already exists")

    doc = {
        "version": version,
        "changelog": changelog,
        "filename": file.filename,
        "size": len(content),
        "binary": content,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True,
    }
    result = await db.firmware.insert_one(doc)

    # Mark all other versions as inactive
    await db.firmware.update_many(
        {"_id": {"$ne": result.inserted_id}},
        {"$set": {"is_active": False}},
    )

    return {
        "status": "success",
        "id": str(result.inserted_id),
        "version": version,
        "size": len(content),
    }


@router.get("/latest")
async def check_latest(
    device_id: str = Query(""),
    current_version: str = Query(""),
):
    """Called by ESP32 sensors to check if an update is available."""
    active = await db.firmware.find_one(
        {"is_active": True},
        {"binary": 0},  # exclude binary from response
    )

    if not active:
        return {"update_available": False, "version": current_version}

    latest_version = active["version"]
    update_available = latest_version != current_version

    # Track that this device checked in
    if device_id:
        await db.devices.update_one(
            {"device_id": device_id},
            {"$set": {
                "firmware_version": current_version,
                "last_ota_check": datetime.now(timezone.utc).isoformat(),
            }},
        )

    response = {
        "update_available": update_available,
        "version": latest_version,
        "current_version": current_version,
    }

    if update_available:
        response["download_url"] = f"https://vapegaurd-production.up.railway.app/api/firmware/download/{str(active['_id'])}"
        response["size"] = active.get("size", 0)
        response["changelog"] = active.get("changelog", "")

    return response


@router.get("/download/{firmware_id}")
async def download_firmware(firmware_id: str):
    """Download a firmware binary. Called by ESP32 httpUpdate."""
    try:
        oid = ObjectId(firmware_id)
    except Exception:
        raise HTTPException(400, "Invalid firmware ID")

    doc = await db.firmware.find_one({"_id": oid})
    if not doc or "binary" not in doc:
        raise HTTPException(404, "Firmware not found")

    return StreamingResponse(
        io.BytesIO(doc["binary"]),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{doc.get("filename", "firmware.bin")}"',
            "Content-Length": str(len(doc["binary"])),
            "X-Firmware-Version": doc["version"],
        },
    )


@router.get("/list")
async def list_firmware():
    """List all uploaded firmware versions (for dashboard)."""
    cursor = db.firmware.find({}, {"binary": 0}).sort("uploaded_at", -1)
    results = []
    async for doc in cursor:
        results.append({
            "id": str(doc["_id"]),
            "version": doc["version"],
            "changelog": doc.get("changelog", ""),
            "filename": doc.get("filename", ""),
            "size": doc.get("size", 0),
            "uploaded_at": doc.get("uploaded_at", ""),
            "is_active": doc.get("is_active", False),
        })
    return results


@router.put("/activate/{firmware_id}")
async def activate_firmware(firmware_id: str):
    """Set a specific firmware version as the active one for OTA."""
    try:
        oid = ObjectId(firmware_id)
    except Exception:
        raise HTTPException(400, "Invalid firmware ID")

    doc = await db.firmware.find_one({"_id": oid}, {"binary": 0})
    if not doc:
        raise HTTPException(404, "Firmware not found")

    # Deactivate all, then activate this one
    await db.firmware.update_many({}, {"$set": {"is_active": False}})
    await db.firmware.update_one({"_id": oid}, {"$set": {"is_active": True}})

    return {"status": "success", "active_version": doc["version"]}


@router.delete("/{firmware_id}")
async def delete_firmware(firmware_id: str):
    """Delete a firmware version."""
    try:
        oid = ObjectId(firmware_id)
    except Exception:
        raise HTTPException(400, "Invalid firmware ID")

    result = await db.firmware.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Firmware not found")

    return {"status": "deleted"}
