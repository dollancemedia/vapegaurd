# Local Demo Setup — Convention Guide

Run the full Mistio stack offline on your laptop.
The production site (`dashboard.mistio.app`) is completely unaffected.

---

## Prerequisites

| Tool | Install |
|------|---------|
| MongoDB Community | https://www.mongodb.com/try/download/community |
| Python 3.10+ | `brew install python` |
| Node.js 18+ | `brew install node` |
| mongodump / mongorestore | included with MongoDB tools |
| Arduino IDE | for ESP32 reflash |

---

## Step 1 — Clone your Atlas database to local MongoDB

> Run this **at home / on internet** before the convention.

```bash
# Export from Atlas (use your real Atlas URI)
mongodump \
  --uri "mongodb+srv://<user>:<password>@<cluster>.mongodb.net/vape-alert" \
  --out ./mongo_backup

# Import into local MongoDB
mongorestore \
  --uri "mongodb://localhost:27017" \
  --db vape-alert \
  ./mongo_backup/vape-alert
```

Verify it worked:
```bash
mongosh mongodb://localhost:27017/vape-alert --eval "db.devices.countDocuments()"
```

---

## Step 2 — Start the backend

```bash
cd backend

# Point to local MongoDB  (keep your production .env intact — don't overwrite it)
export MONGODB_URI="mongodb://localhost:27017"
export DATABASE_NAME="vape-alert"

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Test it:
```bash
curl http://localhost:8000/health
# should return {"status":"ok","db_connected":true,...}
```

---

## Step 3 — Start the frontend

```bash
cd frontend

# .env.local is already committed — it sets REACT_APP_LOCAL_DEMO=true
# This skips Clerk, starts in "Example High School" demo mode,
# and proxies all API calls to localhost:8000 automatically.

npm start
# Opens http://localhost:3000
```

What you'll see:
- **"Example High School"** as the school name
- **Skeleton/loading SVG** for the map (anonymised)
- **DEMO badge** in the header instead of a user avatar
- No login screen — goes straight to the dashboard

---

## Step 4 — Flash the ESP32 for local demo

Open `esp32_vape_sensor/esp32_vape_sensor_local.ino` in Arduino IDE.

Edit the three constants at the top:
```cpp
const char* WIFI_SSID     = "ConventionWiFi";     // ← WiFi name
const char* WIFI_PASSWORD = "password123";         // ← WiFi password
const char* BACKEND_HOST  = "192.168.1.100";       // ← your laptop's IP
```

**Find your laptop's IP:**
```bash
# Mac
ipconfig getifaddr en0

# or
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Libraries to install in Arduino IDE (Tools → Manage Libraries):
- `Adafruit BME680`
- `Adafruit Unified Sensor`
- `Adafruit MSA301`   ← covers MSA311 (same register map)
- `ArduinoJson`

Select board: **Adafruit Feather ESP32-C6** (or ESP32-C6 DevKitC-1), then Upload.

---

## Step 5 — At the convention

1. Connect laptop to convention WiFi (same network the ESP32 will use)
2. Start MongoDB: `mongod`
3. Start backend: `export MONGODB_URI=mongodb://localhost:27017 && uvicorn app.main:app --host 0.0.0.0 --port 8000`
4. Start frontend: `cd frontend && npm start`
5. Open `http://localhost:3000` in Chrome — present in fullscreen

### Demo flow

| Action | What the audience sees |
|--------|----------------------|
| Live sensor data arriving | PM2.5, temperature, humidity graphs move in real time |
| **Move / shake the device** | MSA311 fires → **TAMPER ALERT** banner on dashboard |
| **Click "Demo Alert" button** in the side panel | Vape detection alert with confidence score, red indicator |
| Click button again | Alert clears back to normal |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Backend can't connect to MongoDB | Make sure `mongod` is running: `brew services start mongodb-community` |
| Frontend shows blank page | Check console — make sure `REACT_APP_LOCAL_DEMO=true` is set (it should be via `.env.local`) |
| ESP32 can't reach backend | Check `BACKEND_HOST` IP matches your laptop's actual IP on the current WiFi |
| No tamper alerts | Confirm MSA311 is wired to SDA=GPIO6, SCL=GPIO7; check Serial Monitor for "MSA311 OK" |
| BMV080 not found | Normal — sensor falls back to PMS5003 or zero values; demo still works |
