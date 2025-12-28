# VapeGuard - Real-time Vape Detection System

A comprehensive IoT-based vape detection system using ESP32-C6, machine learning, and real-time monitoring.

## 🏗️ Architecture

```
┌─────────────┐    WiFi     ┌─────────────┐    HTTP/WS   ┌─────────────┐
│   ESP32-C6  │ ──────────► │   Backend   │ ────────────► │  Frontend   │
│   Sensors   │             │  (FastAPI)  │              │   (React)   │
└─────────────┘             └─────────────┘              └─────────────┘
                                    │
                                    ▼
                            ┌─────────────┐
                            │  MongoDB    │
                            │   Atlas     │
                            └─────────────┘
                                    │
                                    ▼
                            ┌─────────────┐
                            │  XGBoost    │
                            │ ML Model    │
                            └─────────────┘
```

## 🚀 Features

### Hardware (ESP32-C6)
- **Multi-sensor Detection**: MQ-2 smoke sensor, DHT22 temperature/humidity, air quality sensor
- **WiFi Connectivity**: Real-time data transmission
- **Local Alerts**: LED and buzzer notifications
- **Zigbee Ready**: ESP32-C6 supports Zigbee mesh networking (future feature)
- **Low Power**: Optimized for continuous operation

### Backend (FastAPI + MongoDB)
- **Real-time API**: RESTful endpoints for sensor data
- **Machine Learning**: XGBoost model for vape detection
- **Data Storage**: MongoDB Atlas for scalable data storage
- **WebSocket Support**: Real-time updates to frontend
- **Vercel Deployment**: Serverless deployment ready

### Frontend (React)
- **Real-time Dashboard**: Live sensor readings and alerts
- **Device Management**: Monitor and control ESP32 devices
- **Event History**: Track and analyze detection events
- **Responsive Design**: Works on desktop and mobile
- **Vercel Deployment**: Static site deployment ready

### Machine Learning
- **XGBoost Model**: High-accuracy vape detection
- **Feature Engineering**: Advanced sensor data processing
- **Real-time Inference**: Sub-second prediction times
- **Confidence Scoring**: Reliability metrics for each prediction

## 📁 Project Structure

```
vape-project/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── main.py         # FastAPI application
│   │   ├── config.py       # Configuration settings
│   │   ├── models/         # Data models
│   │   ├── routers/        # API endpoints
│   │   └── ml/             # Machine learning models
│   └── requirements.txt    # Python dependencies
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   └── App.js          # Main application
│   ├── public/             # Static assets
│   └── package.json        # Node.js dependencies
├── esp32_vape_sensor/      # ESP32-C6 Arduino code
│   └── esp32_vape_sensor.ino
├── vercel.json             # Vercel deployment config
├── DEPLOYMENT_GUIDE.md     # Detailed deployment instructions
└── README.md               # This file
```

## 🛠️ Quick Start & Run Commands

### Prerequisites
- Node.js 16+ and npm
- Python 3.8+
- Arduino IDE with ESP32 support
- MongoDB (Running locally or via Atlas)

### 1. Start the Database
Ensure MongoDB is running.
- **Windows Service**: Usually runs automatically.
- **Manual**: Run `mongod` in a separate terminal.

### 2. Start the Backend
The backend **must** listen on `0.0.0.0` to accept connections from the ESP32.

```powershell
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
*   **Success Indicator**: Logs show `Uvicorn running on http://0.0.0.0:8000`.

### 3. Start the Frontend
Open a **new terminal**.

```powershell
cd frontend
$env:PORT=3002; npm start
```
*   **Success Indicator**: Browser opens to `http://localhost:3002`.

### 4. Power the ESP32
Plug in your ESP32. It is pre-configured to connect to your WiFi and send data to `10.0.0.43:8000`.

---

## 🔧 Hardware Setup
1. **Board**: Adafruit ESP32 Feather V2
2. **Connections**:
   - PMS5003 TX → ESP32 RX (GPIO 16)
   - PMS5003 RX → ESP32 TX (GPIO 17)
   - Power & Ground
