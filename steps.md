# Progress and Steps Taken

1.  **Issue Analysis**:
    -   User reported ESP32 data not appearing on the dashboard.
    -   User suspected "fake data" generation.
    -   Website running on `localhost:3002`, Backend on `localhost:8000`.

2.  **Findings**:
    -   **Backend Binding**: The FastAPI backend was running with default settings (`127.0.0.1`), which blocks external connections from the ESP32 (even on the same local network).
    -   **ESP32 Configuration**: The firmware is hardcoded to send data to `10.0.0.43:8000`. This is the correct local IP of the computer, but the backend was refusing the connection.
    -   **No Fake Data Code**: Reviewed `backend/app/ws.py`, `backend/app/routers/sensors.py`, and `esp32_vape_sensor.ino`. No active simulation code was found in the main path. Zero values are sent if sensors are disconnected, which is expected behavior.

3.  **Fix Applied**:
    -   Restarted the backend server with `uvicorn app.main:app --reload --host 0.0.0.0`. This allows the backend to accept connections from the ESP32 at `10.0.0.43`.

4.  **WebSocket Fix**:
    -   **Issue**: Frontend was throwing 403/404 errors connecting to `/ws/devices/status`.
    -   **Fix**: Updated `Devices.js` to use the correct `/ws/events` endpoint.
    -   **Result**: Frontend can now establish WebSocket connections without errors.

5.  **Hardware Update (ESP32 Huzzah Feather V2)**:
    -   **Board Change**: Migrated to Adafruit ESP32 Feather V2 (Huzzah32).
    -   **Pinout Confirmation**:
        -   **RX Pin**: GPIO 16 (labeled RX on board).
        -   **TX Pin**: GPIO 17 (labeled TX on board).
        -   **I2C**: SDA=23, SCL=22.
        -   **Mic**: A2 (GPIO 34).
        -   **LED**: GPIO 13.
    -   **Wiring Requirement**:
        -   PMS5003 **TX** wire -> Board **RX** pin (GPIO 16).
        -   PMS5003 **RX** wire -> Board **TX** pin (GPIO 17).

6.  **Troubleshooting "Invalid Header" Boot Loop**:
    -   **Symptom**: `invalid header: 0xffffffff` and continuous resets.
    -   **Cause**: Code compiled/uploaded for the wrong board (likely "LilyGo T-Display" or generic "ESP32 Dev Module") instead of the specific "Adafruit ESP32 Feather V2". This causes a mismatch in the bootloader and flash memory map.
    -   **Solution**: Select **"Adafruit ESP32 Feather V2"** in Arduino IDE (Tools > Board > Adafruit ESP32 Arduino > Adafruit ESP32 Feather V2).

7.  **Data Ingestion Troubleshooting (Current)**:
    -   **Issue**: ESP32 code is verified correct, but no data in DB. Backend is healthy.
    -   **Root Cause**: Backend was running on `localhost` (127.0.0.1) instead of exposing to network (`0.0.0.0`).
    -   **Fix**: Restarted backend with `--host 0.0.0.0`.

8.  **Next Steps**:
    -   Verify data flow from ESP32 to Backend.
    -   Implement blinking red circle and notifications.
