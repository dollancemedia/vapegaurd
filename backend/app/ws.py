from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from typing import List, Dict, Any
import json
import asyncio
from datetime import datetime
import logging
from app.auth import validate_token

router = APIRouter()
logger = logging.getLogger(__name__)

# Store active connections
active_connections: Dict[str, WebSocket] = {}

# Broadcast functions needed by other modules
async def broadcast_event(event_type: str, data: Dict[str, Any]) -> None:
    """Broadcast an event to all connected clients.
    Removes stale/disconnected clients to prevent repeated 1001 errors.
    """
    if not active_connections:
        return

    message = {
        "type": event_type,
        "data": data,
        "timestamp": datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
    }

    # Track clients that fail during send so we can clean them up
    stale_client_ids: List[str] = []
    for client_id, connection in list(active_connections.items()):
        try:
            await connection.send_json(message)
        except WebSocketDisconnect:
            # Client already went away; mark for removal
            stale_client_ids.append(client_id)
            logger.info(f"Client {client_id} disconnected during broadcast")
        except Exception as e:
            # Any other send error; remove so we don't keep erroring
            stale_client_ids.append(client_id)
            logger.error(f"Error broadcasting to client {client_id}: {str(e)}")

    # Remove stale connections
    for client_id in stale_client_ids:
        conn = active_connections.pop(client_id, None)
        try:
            if conn:
                await conn.close()
        except Exception:
            # Ignore close errors
            pass

async def broadcast_sensor_reading(device_id: str, sensor_data: Dict[str, Any]) -> None:
    """Broadcast sensor reading to all connected clients"""
    await broadcast_event("sensor_data", {
        "device_id": device_id,
        "sensor_data": sensor_data,
        "status": "normal"
    })

@router.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(None)):
    """WebSocket endpoint for real-time event streaming
    
    This endpoint allows clients to connect and receive real-time sensor data updates
    from ESP32 devices. It handles client connections and disconnections.
    """
    # Authenticate connection
    user = await validate_token(token)
    if not user:
        # Close with Policy Violation if no valid token
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    client_id = f"client_{len(active_connections) + 1}"
    active_connections[client_id] = websocket
    
    # Send initial connection confirmation
    await websocket.send_json({
        "type": "connection_established",
        "message": "WebSocket connection established",
        "timestamp": datetime.utcnow().isoformat(timespec="milliseconds") + "Z"
    })
    
    try:
        # Keep the connection open by waiting for client messages.
        # Most clients won't send anything; this blocks until disconnect,
        # which lets us detect closure cleanly.
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        # Remove connection when client disconnects
        if client_id in active_connections:
            del active_connections[client_id]
    except Exception as e:
        logger.error(f"Error in WebSocket connection: {str(e)}")
        if client_id in active_connections:
            del active_connections[client_id]