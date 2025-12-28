# Development Notes

## Legacy and Unused Code
The following files and directories appear to be legacy or unused and could be considered for removal to clean up the project:

- **`backend_express_backup/`**: Contains an old Node.js/Express backend. Currently using Python/FastAPI.
- **`sensor_reader_standalone/`**: Standalone Arduino sketch, likely replaced by `esp32_vape_sensor`.
- **`simulate_sensor.py`**: Script for generating fake sensor data. Ensure this is not running if you want real data.
- **`test_websocket.py`**: Testing script for WebSockets.
- **`xgboost-test.py`**: ML model testing script.
- **`esp32_vape_sensor/bme_server/`**: Contains various test sketches. The main firmware seems to be `esp32_vape_sensor.ino`.
- **`backend/cleanup_devices.py`**: Temporary utility script used to remove stale device data from MongoDB. Can be removed after verification.

## Code Cleanup Log
- **`frontend/src/services/deviceService.js`**: Removed `mockDevices` array and associated logic. The frontend now strictly relies on `/api/devices` and real-time WebSocket updates.
- **`esp32_vape_sensor_002.ino`**: Removed `diagnosePMSConnection` function and calls. Cleaned up "Crash Investigation" comments.
- **`backend/cleanup_devices.py`**: Created and executed to remove stale devices (`ESP32_SIM_001`, `85215b85`, `esp32c6-001`).

## Production Preparation
Before deploying to production:
1. Remove the above legacy files.
2. Ensure `uvicorn` is run with `--host 0.0.0.0` if external access is needed, or use a proper production server setup (Gunicorn/Nginx).
3. Update ESP32 firmware with production API endpoints and WiFi credentials.
4. **Secure the Admin API**: The new `POST /api/admin/retrain` endpoint is currently open. In production, this must be protected by authentication (e.g., API key or Admin login) or removed if not needed.
5. **Model Switching**: The `backend/switch_model.py` script is a development tool. In production, ensure `backend/app/model_config.py` is set to the desired stable model.

## Hardware Environment
- **Target Board**: Adafruit ESP32 Feather V2 (Huzzah32).
- **Arduino IDE Board Selection**: "Adafruit ESP32 Feather V2".
- **Flash Settings**: Default (usually 80MHz, 921600 baud upload).
- **Pinout**:
  - PMS RX: GPIO 33 (Connects to PMS5003 TX)
  - PMS TX: GPIO 27 (Connects to PMS5003 RX)
  - I2C: 23 (SDA), 22 (SCL)

## Running the Backend
To ensure the ESP32 can connect to the backend, `uvicorn` must be started with host binding to `0.0.0.0`:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Model Management
To switch between different AI models, use the `switch_model.py` script in the `backend` directory.

**Available Models:**
- `xgb`: XGBoost (default)
- `knn`: K-Nearest Neighbors
- `svc`: Support Vector Classifier (RBF Kernel)
- `l_svm`: Linear SVM
- `rf`: Random Forest

**Usage:**
```bash
python backend/switch_model.py knn  # Switch to KNN
python backend/switch_model.py xgb  # Switch to XGBoost
python backend/switch_model.py rf   # Switch to Random Forest
```
This updates `backend/app/model_config.py`. The server will auto-reload in dev mode.

## Research & Visualization
A separate environment for analyzing sensor data and AI model performance is available in the `research/` directory.

**Key File:** `research/visualize.py`

**Features:**
1.  **Figure 1 (Fan Charts):** Visualizes aggregated sensor data (Temp, Humidity, PM2.5, Gas) over 60s intervals.
    *   Columns: Combined, Vape Only, Normal Only.
    *   Data Source: MongoDB collection `research-events`.
2.  **Figure 2 (AI Confidence):** Plots model confidence over time.
    *   Split into Correct Predictions (Full & Zoomed) and Incorrect Predictions.
    *   Data Source: MongoDB collection `research-ais`.
3.  **Figure 3 (Confusion Matrices):** Heatmaps showing True/False Positives/Negatives for all 5 models.
    *   Data Source: MongoDB collection `research-ais`.

**Usage:**
```bash
python research/visualize.py
```
*Requires `research/requirements.txt` dependencies.*
