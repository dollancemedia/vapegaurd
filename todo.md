# Project Tasks & Review

## Status Review
- **Backend**: Python/FastAPI running on port 8000.
- **Frontend**: React running on port 3002.
- **Firmware**: ESP32 C6 sending data to `10.0.0.43:8000`.

## Recent Changes
### Feature: Interactive Map Editor
- **Goal**: Allow users to customize device positions on the map and improve visibility.
- **Changes**:
    - **Map Size**: Adjusted map height to `550px` (was 700px) to prevent bleeding into footer.
    - **Selection Fix**:
        - Added `z-index: 10` to device markers to ensure they are clickable above the map image.
        - Added a transparent `r=40` hit area around each device marker to make clicking easier.
        - Ensured `stopPropagation` works correctly so clicking a device doesn't trigger the "Please select" alert.
    - **Dashboard Support**: Enabled map editing and selection state on the main Dashboard page (previously only worked on Devices page).
    - **Marker Size**: Increased visible device circle radius (Normal: 12px -> 18px, Selected: 16px -> 24px).
    - **Edit Mode**:
        - Click "Edit Location" to enable editing.
        - Select a device (now easier to click), then click anywhere on the map to move it.
        - Click "Done" to save.
    - **Persistence**: Backend endpoint `PUT /api/devices/{id}/location` saves coordinates to MongoDB.

### Fix 1: External Access
- **Issue**: Backend was only listening on `127.0.0.1` (localhost), blocking ESP32.
- **Fix**: Restarted `uvicorn` with `--host 0.0.0.0` to allow external connections from ESP32.

### Fix 2: WebSocket 403 Error
- **Issue**: Frontend `Devices.js` was trying to connect to `/ws/devices/status`, which does not exist in the backend.
- **Fix**: Updated `frontend/src/pages/Devices.js` to connect to the valid `/ws/events` endpoint.

### Fix 3: Stale Device Cleanup
- **Issue**: Users saw "random non-existent detectors".
- **Fix**: Created and ran `backend/cleanup_devices.py` to remove stale data.

## Security Review
- **Input Validation**: The new location endpoint uses Pydantic (`DeviceLocation`) to validate `x` and `y` are floats.
- **Access Control**: Currently open to all users (dev mode). For production, ensure `PUT` endpoints are protected.

## Notes
- **Usage**: To move a device, first select it (click the circle or list item), then click "Edit Location", then click the new spot on the map.
