# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**VapeGuard / Mistio** — A full-stack IoT vape detection system. ESP32-C6 sensors send environmental readings (particulate matter, gas, humidity, sound) to a FastAPI backend that runs ML inference and stores events in MongoDB. A React dashboard displays real-time device status and analytics.

## Commands

### Backend
```bash
# Run dev server
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Install dependencies
cd backend && pip install -r requirements.txt
```

### Frontend
```bash
# Run dev server (http://localhost:3002)
cd frontend && npm start

# Build for production
cd frontend && npm run build

# Install dependencies
cd frontend && npm install
```

### Model Training

**The correct training command** (produces models compatible with the runtime 29-feature inference pipeline):
```bash
python backend/train_with_feature_engine.py \
  --labels-file backend/training/seed_event_labels.json \
  --mongo-uri "mongodb+srv://allai:<pw>@vape-alert.xntahp3.mongodb.net/?appName=vape-alert" \
  --db-name vape-alert \
  --models-dir backend/models \
  --drop-first-n-vape 12
```

Alternatively, use the two-step pipeline (builds intermediate artifacts first):
```bash
# Step 1 — build windowed dataset
python backend/build_training_dataset.py \
  --labels-file backend/training/seed_event_labels.json \
  --mongo-uri "mongodb+srv://..." \
  --db-name vape-alert \
  --output-dir backend/training_artifacts \
  --window-seconds 60 \
  --drop-first-n-vape 12 \
  --overlap-json "{\"fire\":0.5,\"clean_air\":0.5}"

# Step 2 — train from artifacts
python backend/train_from_built_dataset.py \
  --artifacts-dir backend/training_artifacts \
  --models-dir backend/models
```
**Warning**: The two-step pipeline generates 185-feature window-statistics models, which are INCOMPATIBLE with the runtime's 29-feature `FEATURE_ORDER`. Only `train_with_feature_engine.py` (step 1 above) produces models that work at runtime.

## Architecture

### Data Flow
```
ESP32-C6 sensors
  → POST /api/sensors/data  (FastAPI)
  → DeviceStateManager (rolling 120-sample buffer, EWMA baselines)
  → Detector (state machine: IDLE → BASELINE → POTENTIAL → CONFIRMED → COOLDOWN)
  → FeatureEngine (30s window: deltas, slopes, AUC, ratios)
  → EnsemblePredictor (XGBoost primary + RF/KNN fallbacks, soft voting)
  → Event stored in MongoDB
  → WebSocket broadcast to dashboard
```

### Backend (`backend/app/`)
- **`main.py`** — FastAPI app, CORS config, router registration
- **`config.py`** — All thresholds (EWMA_ALPHA, BASELINE_WINDOW_SEC=10, CONFIRM_WINDOW_SEC=20, COOLDOWN_SEC=15, D_PM25_SUS=10.0)
- **`detector.py`** — State machine for detection pipeline
- **`feature_engine.py`** — Feature extraction from sensor rolling window
- **`ensemble_predictor.py`** — Soft-voting ensemble across loaded models
- **`state_manager.py`** — Per-device state; supports Redis or in-memory
- **`inference.py`** — Model loading from `backend/models/*.joblib`
- **`routers/sensors.py`** — Main data intake endpoint
- **`routers/devices.py`** — Device registration and recalibration
- **`routers/events.py`** — Event CRUD and verification
- **`auth.py`** — **STUB** — `validate_token()` is not implemented; most endpoints have no auth enforcement

### Frontend (`frontend/src/`)
- **State**: Zustand store
- **Real-time**: `useWebSocket.js` hook with socket.io-client
- **API**: `services/api.js` (Axios, baseURL from `REACT_APP_API_URL`)
- **Auth**: Clerk (`@clerk/clerk-react`)
- **Key pages**: `Devices.js`, `Analytics.js`, `Settings.js`

### ML Models (`backend/models/`)
- `xgb_model.joblib` — XGBoost (~871KB)
- `rf_model.joblib` — Random Forest (~330KB)
- `knn_model.joblib` — KNN (~10KB)
- `svc_model.joblib` — SVM (~27KB)

Active model is controlled by `backend/app/model_config.py` (`MODEL_TYPE = "rf"` etc.), which is written by `switch_model.py` — do not edit manually.

`backend/app/class_config.py` defines two critical constants that **must stay in sync with training**:
- `FEATURE_ORDER` — the 29-feature list passed to every model (order matters)
- `CLASSIFICATIONS` — read from `backend/classifications.txt`; defaults to `["normal", "vape", "cologne", "hair spray", "cleaning"]`

Models were trained with scikit-learn 1.3.2. Loading with a different version produces warnings and may trigger fallback to rule-based detection (low gas resistance + high PM2.5).

## Environment Variables

### Backend (set in Railway)
```
MONGODB_URI=mongodb+srv://...
DATABASE_NAME=vape-alert
REDIS_URL=          # optional; falls back to in-memory state
CLERK_SECRET_KEY=   # optional; auth is currently a stub
```

### Frontend (set in Vercel / `.env.local`)
```
REACT_APP_API_URL=https://vapegaurd-production.up.railway.app/api
REACT_APP_WS_URL=wss://vapegaurd-production.up.railway.app
REACT_APP_CLERK_PUBLISHABLE_KEY=pk_live_...
```

## Deployment
- **Backend**: Railway (`backend/Procfile`: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`)
- **Frontend**: Vercel (static React, `vercel.json` routes `/api/*` and falls back to `index.html`)
- **Database**: MongoDB Atlas, database name `vape-alert`

## Known Issues
- `validate_token()` in `auth.py` is a stub — all endpoints are effectively public
- MongoDB timestamps are stored as **ISO-8601 strings** (e.g. `"2026-02-12T06:07:54.282Z"`), not BSON dates. BSON date range queries (`$gte`/`$lt` with `datetime` objects) return 0 results — always use string comparison or Python-side filtering. `no_cursor_timeout=True` is also banned on Atlas free tier (raises `OperationFailure` code 8000).
- `build_training_dataset.py` generates 185-feature models; `train_with_feature_engine.py` generates the correct 29-feature models matching `FEATURE_ORDER`. Only the 29-feature models work with runtime inference.
- `clean_air_0001` label (Jan 21–22) has no corresponding samples data (samples collection starts Feb 2). It generates 0 training windows.
- `landingpage/` is legacy; use `mistio-web/` for the landing page
