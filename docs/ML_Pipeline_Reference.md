# VapeGuard / Mistio -- ML Pipeline: Complete Technical Reference

> **Author:** Auto-generated from codebase analysis
> **Date:** 2026-03-02
> **Purpose:** Comprehensive reference for anyone working on the ML detection pipeline

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [End-to-End Data Flow Diagram](#2-end-to-end-data-flow-diagram)
3. [Training Data & Labels](#3-training-data--labels)
4. [Training Pipeline](#4-training-pipeline)
5. [The 29-Feature Vector](#5-the-29-feature-vector)
6. [Model Architecture & Files](#6-model-architecture--files)
7. [Runtime Inference Chain (File-by-File)](#7-runtime-inference-chain-file-by-file)
8. [Configuration Constants](#8-configuration-constants)
9. [Known Pitfalls & Gotchas](#9-known-pitfalls--gotchas)
10. [Legacy / Dead Code](#10-legacy--dead-code)

---

## 1. High-Level Overview

**What this system does:** An ESP32-C6 sensor board collects environmental readings (PM1, PM2.5, PM10, gas resistance, humidity, temperature, sound level) and POSTs them to a FastAPI cloud backend. The backend runs a stateful detection pipeline: it watches for sudden spikes in PM2.5, collects a confirmation window of data, extracts 29 engineered features from that window, and feeds them to an ensemble of ML models (XGBoost + Random Forest + KNN). The ensemble returns a soft-voted classification -- one of `["vape", "cologne", "hair spray", "cleaning", "shower", "normal", "other"]` -- with confidence scores. Confirmed events are stored in MongoDB and broadcast to a React dashboard via WebSocket.

**The two key guarantees:**
- The models are trained on the EXACT same 29-feature vector that the runtime extracts. This is enforced by sharing `FEATURE_ORDER` from `backend/app/class_config.py` between training and inference.
- The detection pipeline is stateful per-device. Each device has its own state machine (`WARMUP -> CALIBRATING -> IDLE -> CONFIRMING -> COOLDOWN`) tracked in memory or Redis.

---

## 2. End-to-End Data Flow Diagram

```
  ESP32-C6 Sensor Node
  (PM sensor + BME680 + mic)
         |
         |  HTTP POST /api/sensors/data
         |  JSON: {device_id, pm25, pm10, pm1,
         |         humidity, temperature,
         |         gas_resistance, sound_level,
         |         timestamp}
         v
+--------------------------------------------------+
|  sensors.py :: receive_sensor_data()             |
|                                                  |
|  1. Sanitize payload (defaults, type coercion)   |
|  2. Store raw sample -> MongoDB "samples" coll   |
|  3. Update device "last_seen"                    |
|  4. Call detector.process_sample(device_id, data)|
|  5. If event returned: store -> MongoDB "events" |
|  6. Broadcast via WebSocket                      |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  detector.py :: Detector.process_sample()        |
|                                                  |
|  State Machine (per device):                     |
|                                                  |
|  WARMUP (90s)                                    |
|    |  Sensor hardware settling; discard data     |
|    v                                             |
|  CALIBRATING (60s)                               |
|    |  Build EWMA baseline with fast alpha (0.5)  |
|    |  Freeze baseline_pm25 at end                |
|    v                                             |
|  IDLE                                            |
|    |  Monitor for spikes:                        |
|    |    Trigger 1: delta >= D_PM25_SUS (10.0)    |
|    |    Trigger 2: slope >= SLOPE_SUS (2.0)      |
|    |  Slow drift correction when quiet >3 min    |
|    v                                             |
|  CONFIRMING (20s)                                |
|    |  Collect data for confirmation window       |
|    |  At end: _make_decision()                   |
|    |    - Fetch baseline samples [t0-10s, t0]    |
|    |    - Fetch event samples [t0, t0+20s]       |
|    |    - FeatureEngine.compute_features()       |
|    |    - ensemble.predict(features)             |
|    v                                             |
|  COOLDOWN (20s)                                  |
|    |  Suppress duplicate triggers                |
|    v                                             |
|  IDLE (loop)                                     |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  feature_engine.py :: FeatureEngine              |
|                                                  |
|  Input: baseline_samples[], event_samples[]      |
|  Output: Dict of 29 features                    |
|                                                  |
|  Categories:                                     |
|    - Start values (6): raw readings at t0        |
|    - Baselines (5): median of baseline window    |
|    - Peaks (3): max PM during event window       |
|    - Deltas (3): peak - baseline                 |
|    - Time dynamics (2): time-to-peak, rise slope |
|    - AUC (1): trapezoidal area above baseline    |
|    - Ratios (4): PM1/PM2.5, PM1/PM10 at start   |
|                  and peak                        |
|    - Humidity/gas dynamics (4): 20s deltas,      |
|                  0-10s slopes                    |
|    - Stability (1): PM2.5 stdev last 5s          |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  ensemble_predictor.py :: EnsemblePredictor      |
|                                                  |
|  1. Order features by FEATURE_ORDER              |
|  2. Replace None -> 0.0                          |
|  3. For each loaded model:                       |
|     - predict_proba(X)                           |
|     - Map model classes -> CLASS_ORDER            |
|  4. Average probabilities (soft voting)          |
|  5. Top class, margin, uncertainty check         |
|  6. Return {top_class, probs, confidence, ...}   |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  Event Document (stored in MongoDB "events")     |
|                                                  |
|  {event_id, device_id, t_start, t_decision,      |
|   timestamp (ISO string), status, top_class,     |
|   probs, top_prob, margin, event_features,       |
|   ensemble_detail, created_at}                   |
+--------------------------------------------------+
         |
         v
   WebSocket broadcast -> React Dashboard
```

---

## 3. Training Data & Labels

**File:** `backend/training/seed_event_labels.json`

This JSON array defines every labeled event used for training. Each entry has:

| Field | Description |
|-------|-------------|
| `event_id` | Unique identifier, e.g. `"vape_0013"` |
| `event_type` | One of: `vape`, `fire`, `clean_air`, `cooking`, `shower` |
| `start_time_zulu` | ISO-8601 UTC start timestamp |
| `end_time_zulu` | ISO-8601 UTC end (null = use default cap) |
| `notes` | Human notes about the event |

**Current label inventory (76 entries):**

| Event Type | Count | Date Range | Notes |
|-----------|-------|------------|-------|
| `vape` | 69 | 2025-12-31 to 2026-02-18 | First 12 dropped by `--drop-first-n-vape 12` (no matching sensor data in MongoDB). After dropping, 57 remain. Of those, 16 events (vape_0030-0041, vape_0048-0051) have saturated BME680 readings (humidity=100%, gas=0). |
| `fire` | 1 | 2026-02-15 | ~15 minutes of fire data, `end_time_zulu` is null -- capped at 25 min |
| `clean_air` | 2 | 2026-01-21, 2026-02-15 | `clean_air_0001` has NO matching sensor data (sensors started Feb 2). Only `clean_air_0002` (45 min) produces training windows. |
| `cooking` | 1 | 2026-02-13 | ~94 minutes |
| `shower` | 1 | 2026-02-13 | End time null, capped at 25 min |

**Default event duration caps** (when `end_time_zulu` is null):

```python
# from train_with_feature_engine.py
DEFAULT_EVENT_CAP = {
    "vape":      10 * 60,    # 10 minutes
    "fire":      25 * 60,    # 25 minutes
    "cooking":   25 * 60,    # 25 minutes
    "shower":    25 * 60,    # 25 minutes
    "clean_air": 60 * 60,    # 60 minutes
    "default":   10 * 60,    # 10 minutes
}
```

**Sensor data source:** MongoDB Atlas, database `vape-alert`, collection `samples`. Timestamps are stored as ISO-8601 strings (e.g. `"2026-02-12T06:07:54.282Z"`), NOT BSON dates. This is critical for querying -- you must use string comparison, not `datetime` range queries.

---

## 4. Training Pipeline

### 4A. The Correct Pipeline: `train_with_feature_engine.py`

**File:** `backend/train_with_feature_engine.py`

This is the ONLY training script that produces models compatible with runtime inference. It uses the same `FeatureEngine.compute_features()` function that runs at inference time, guaranteeing feature consistency.

**How it works, step by step:**

```
For each labeled event:
  1. Parse start/end times from the label
  2. Apply event duration cap if end_time is null
  3. Fetch ALL sensor samples from MongoDB in range [start-20s, end+10s]
  4. Slide a window through the event duration:
     - Window = 10s baseline + 20s event = 30s total
     - Stride = 5 seconds
     - Each position generates ONE training example
  5. For each window position:
     - baseline_samples = samples in [t-10s, t]
     - event_samples = samples in [t, t+20s]
     - features = FeatureEngine.compute_features(baseline, event)
     - Skip if either window has < 2 samples
  6. Collect (features_dict, event_type) pairs
```

**Window augmentation illustration:**

```
Event duration: |--------- 60 seconds ---------|
                |
Slide step: 5s  |
                |
Window 1:  [baseline 10s][event 20s]
Window 2:       [baseline 10s][event 20s]
Window 3:            [baseline 10s][event 20s]
...etc...

Each window -> 1 training example (29 features + label)
A 60-second vape event generates ~9 training windows
A 45-minute clean_air event generates ~530 training windows
```

**Model training:**

```python
# Train/test split: 80/20 stratified, then 15% of train becomes validation
X_train, X_test = train_test_split(X, y, test_size=0.20, stratify=y)
X_train, X_val  = train_test_split(X_train, y_train, test_size=0.15)

# Three models trained:
# 1. Random Forest (300 trees, balanced_subsample, sample weights)
# 2. KNN (k=7, distance-weighted)
# 3. XGBoost (400 estimators, max_depth=6, lr=0.05, subsample=0.9)
#    Uses LabelEncoder for class encoding, stores custom_classes_ attribute
```

**Command to run:**

```bash
python backend/train_with_feature_engine.py \
  --labels-file backend/training/seed_event_labels.json \
  --mongo-uri "mongodb+srv://allai:<pw>@vape-alert.xntahp3.mongodb.net/?appName=vape-alert" \
  --db-name vape-alert \
  --models-dir backend/models \
  --drop-first-n-vape 12
```

### 4B. The INCOMPATIBLE Pipeline (Do NOT use for production)

The two-step pipeline (`build_training_dataset.py` + `train_from_built_dataset.py`) generates 185-feature window-statistics models using pandas rolling statistics -- these are completely incompatible with the runtime 29-feature `FEATURE_ORDER`. If these files are ever recreated, models trained with them will silently produce garbage predictions at runtime because the feature vector dimensions and semantics differ entirely.

**NEVER use this pipeline for models that will run in production.**

---

## 5. The 29-Feature Vector

**Defined in:** `backend/app/class_config.py` as `FEATURE_ORDER`
**Computed by:** `backend/app/feature_engine.py` :: `FeatureEngine.compute_features()`

This is the single most important data structure in the entire ML pipeline. Every model expects these 29 features in this exact order:

| # | Feature Name | Category | Computation |
|---|-------------|----------|-------------|
| 1 | `pm1_start` | Start Value | PM1 reading at event onset (t0) |
| 2 | `pm25_start` | Start Value | PM2.5 reading at t0 |
| 3 | `pm10_start` | Start Value | PM10 reading at t0 |
| 4 | `humidity_start` | Start Value | Humidity at t0 |
| 5 | `gas_start` | Start Value | Gas resistance at t0 (KOhms) |
| 6 | `temp_start` | Start Value | Temperature at t0 |
| 7 | `pm25_base` | Baseline | Median PM2.5 over baseline window [t0-10s, t0] |
| 8 | `pm1_base` | Baseline | Median PM1 over baseline window |
| 9 | `pm10_base` | Baseline | Median PM10 over baseline window |
| 10 | `gas_base` | Baseline | Median gas resistance over baseline window |
| 11 | `humidity_base` | Baseline | Median humidity over baseline window |
| 12 | `pm25_peak` | Peak | Max PM2.5 during event window [t0, t0+20s] |
| 13 | `pm1_peak` | Peak | Max PM1 during event window |
| 14 | `pm10_peak` | Peak | Max PM10 during event window |
| 15 | `d_pm25_peak` | Delta | `pm25_peak - pm25_base` |
| 16 | `d_pm1_peak` | Delta | `pm1_peak - pm1_base` |
| 17 | `d_pm10_peak` | Delta | `pm10_peak - pm10_base` |
| 18 | `t_to_pm25_peak_sec` | Time Dynamic | Seconds from t0 to PM2.5 peak |
| 19 | `pm25_rise_slope` | Time Dynamic | `d_pm25_peak / max(t_to_peak, 1.0)` (ug/m3/sec) |
| 20 | `pm25_auc_above_base` | AUC | Trapezoidal area of PM2.5 above baseline |
| 21 | `r_pm1_pm25_start` | Ratio | `pm1_start / (pm25_start + 1e-6)` |
| 22 | `r_pm1_pm10_start` | Ratio | `pm1_start / (pm10_start + 1e-6)` |
| 23 | `r_pm1_pm25_peak` | Ratio | `pm1_peak / (pm25_peak + 1e-6)` |
| 24 | `r_pm1_pm10_peak` | Ratio | `pm1_peak / (pm10_peak + 1e-6)` |
| 25 | `humidity_delta_20s` | Gas/Humidity | `humidity_end - humidity_start` |
| 26 | `gas_delta_20s` | Gas/Humidity | `gas_end - gas_start` |
| 27 | `humidity_slope_0_10s` | Gas/Humidity | `(humidity_10s - humidity_start) / 10.0` |
| 28 | `gas_slope_0_10s` | Gas/Humidity | `(gas_10s - gas_start) / 10.0` |
| 29 | `pm25_std_last5s` | Stability | Standard deviation of PM2.5 in last 5 seconds |

**Why these features matter for discrimination:**

- **PM ratios** (features 21-24): Vape aerosol has a characteristic particle size distribution -- PM1/PM2.5 ratio near vape is different from cooking smoke or fire.
- **Rise slope and AUC** (features 19-20): Vape produces a sharp, short spike; cooking produces a slow sustained rise; fire produces a rapid escalation that does not decay.
- **Gas/humidity dynamics** (features 25-28): BME680 gas resistance drops with volatile organic compounds (from vape juice); humidity increases slightly from vape exhalation.
- **Stability** (feature 29): PM2.5 after a vape puff is noisy/turbulent vs. clean air which is stable.

---

## 6. Model Architecture & Files

**Directory:** `backend/models/`

| File | Model | Approx Size | Notes |
|------|-------|-------------|-------|
| `xgb_model.joblib` | XGBClassifier | ~871 KB | 400 estimators, max_depth=6, lr=0.05. Uses integer labels via LabelEncoder; has `custom_classes_` attribute for mapping back. |
| `rf_model.joblib` | RandomForestClassifier | ~330 KB | 300 estimators, `balanced_subsample` class weight. Has native `classes_` attribute with string labels. |
| `knn_model.joblib` | KNeighborsClassifier | ~10 KB | k=7, distance-weighted. Stores all training data internally. |

**Class labels the models were trained on:** Depends on what event types exist in the labels file and what `--allowed-types` permits. Default is `vape,fire,cooking,shower,clean_air`. The training script maps these to the raw event_type strings.

**Active model selection:**

The file `backend/app/model_config.py` contains a single variable:
```python
MODEL_TYPE = "rf"    # Currently Random Forest
```

This file is written by `backend/switch_model.py` -- never edit it manually. To switch:
```bash
python backend/switch_model.py rf    # or xgb, knn, svc, l_svm
```

**Important:** `model_config.py` controls the LEGACY single-model inference path (`inference.py`). The ENSEMBLE predictor (`ensemble_predictor.py`) loads ALL three models (xgb, rf, knn) simultaneously and soft-votes across them. The runtime detection pipeline (`detector.py`) uses the ensemble path, not the single-model path.

### CLASS_ORDER vs CLASSIFICATIONS

**File:** `backend/app/class_config.py`

```python
# CLASSIFICATIONS read from backend/classifications.txt:
CLASSIFICATIONS = ["normal", "vape", "cologne", "hair spray", "cleaning", "shower"]

# CLASS_ORDER rearranges for model probability indexing:
CLASS_ORDER = [CLASSIFICATIONS[1]] + CLASSIFICATIONS[2:] + [CLASSIFICATIONS[0], "other"]
# Result: ["vape", "cologne", "hair spray", "cleaning", "shower", "normal", "other"]
```

`CLASS_ORDER` is the master ordering used by `EnsemblePredictor` to index probability vectors. When a model returns `predict_proba()`, its per-class probabilities are mapped into this 7-element order. If a model was only trained on 5 classes (e.g., no "cologne" or "hair spray" data), the missing class slots get 0.0 probability.

---

## 7. Runtime Inference Chain (File-by-File)

### 7.1 Entry Point: `backend/app/routers/sensors.py`

**Function:** `receive_sensor_data(payload, request)` -- mounted at `POST /api/sensors/data`

Step-by-step:

1. **Sanitize payload:** Default `device_id` to `"unknown"`, ensure timestamp exists, coerce all numeric fields (`humidity`, `temperature`, `pm25`, `pm10`, `gas_resistance`, `sound_level`) to `float`, defaulting to `0.0` if missing/invalid.

2. **Store raw sample:** `await db.samples.insert_one(payload.copy())` into MongoDB `samples` collection. Also updates the device's `last_seen` timestamp in the `devices` collection.

3. **Run detector:** `detector.process_sample(device_id, payload)` returns `(event_doc, notification_type)`.

4. **Handle events:** If an event_doc was returned, store it in the `events` collection, broadcast via WebSocket, and process notifications (alert WebSocket broadcast if vape detected with sufficient confidence).

5. **Broadcast reading:** Always broadcasts the raw sensor reading to connected WebSocket clients for live chart display, with a `prediction` overlay showing the current detector state.

**Tamper endpoint:** `POST /api/sensors/tamper` handles accelerometer alerts from the MSA311 -- separate from the ML pipeline.

### 7.2 State Machine: `backend/app/detector.py`

**Class:** `Detector` (singleton instance: `detector`)

The detector maintains a per-device finite state machine. ALL timing uses **server time** (not sensor timestamps) to prevent freezing if the sensor clock is stuck.

**State transitions:**

```
                    +----------+
       First sample |  WARMUP  |  90 seconds
                    +----+-----+
                         |
                    +----v---------+
                    | CALIBRATING  |  60 seconds
                    +----+---------+
                         |  Freeze baseline
                    +----v---+
              +---->|  IDLE  |<-----------+
              |     +----+---+            |
              |          | Spike detected |
              |     +----v-------+        |
              |     | CONFIRMING |  20s   |
              |     +----+-------+        |
              |          | _make_decision()|
              |     +----v------+         |
              +-----| COOLDOWN  |  20s    |
                    +-----------+---------+
```

**WARMUP (90 seconds):**
- Discard sensor readings while hardware settles (BME680 heater stabilization, PMS5003 fan spin-up).
- No EWMA updates. No trigger checks.

**CALIBRATING (60 seconds):**
- Build an EWMA baseline using a fast alpha of `0.5` (converges quickly).
- At end: freeze `baseline_pm25` (plus baselines for pm10, humidity, temperature, gas_resistance) into device state. This frozen baseline is what IDLE uses for spike detection.

**IDLE:**
- Compare each incoming PM2.5 value against the frozen baseline.
- **Trigger 1 (delta):** If `pm25 - baseline >= D_PM25_SUS (10.0)`, trigger.
- **Trigger 2 (slope):** If `(pm25 - prev_pm25) / dt >= SLOPE_SUS (2.0)`, trigger.
- **Baseline drift:** If no triggers for `BASELINE_QUIET_SEC (180s)`, slowly nudge the baseline toward current ambient using `BASELINE_DRIFT_ALPHA (0.005)`. This corrects for multi-hour environmental changes (e.g., humidity shift from morning to afternoon).
- On trigger: generate a UUID `event_id`, snapshot the current baselines, transition to CONFIRMING, and return a "suspected" event document.

**CONFIRMING (20 seconds):**
- Simply waits until 20 seconds have elapsed since t0.
- Logs progress every ~5 seconds.
- At `duration >= CONFIRM_WINDOW_SEC`: calls `_make_decision()`.

**`_make_decision()` -- The ML Inference Point:**

```python
# 1. Define time windows
baseline_start = t0 - timedelta(seconds=10)   # 10s before trigger
event_end      = decision_time                  # ~20s after trigger

# 2. Fetch samples from the rolling buffer
all_samples = state_manager.get_samples(device_id, baseline_start, event_end)

# 3. Split into baseline [t0-10s, t0] and event [t0, t0+20s]
baseline_samples = [s for s in all_samples if s['timestamp'] <= t0]
event_samples    = [s for s in all_samples if s['timestamp'] > t0]

# 4. Extract 29 features
features = FeatureEngine.compute_features(baseline_samples, event_samples)

# 5. Run ensemble prediction
prediction = ensemble.predict(features)
```

- Returns a final event document with `top_class`, `probs`, `top_prob`, `margin`, `status` ("confirmed" or "uncertain"), and the raw feature vector (`event_features`) for debugging.
- Transitions to COOLDOWN.

**COOLDOWN (20 seconds):**
- Suppresses new triggers to avoid duplicate detections from the same aerosol cloud.
- After expiry, returns to IDLE.

### 7.3 State Management: `backend/app/state_manager.py`

**Class:** `DeviceStateManager` (singleton instance: `state_manager`)

Two storage backends:
- **Redis** (if `REDIS_URL` is configured): Uses hash maps (`device:{id}:state`) and lists (`device:{id}:samples`). Enables multi-worker deployments.
- **In-memory** (default fallback): Python dicts. Single-worker only.

**Rolling sample buffer:**
- Stores up to 200 samples (Redis) or 60 seconds (in-memory) per device.
- Samples are stored newest-first (insert at head).
- `get_samples(device_id, start, end)` returns samples in the time window, sorted oldest-first.
- All timestamps in storage are ISO-8601 strings; they are parsed back to `datetime` on retrieval.

**Device state fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `status` | str | Current state machine state |
| `t0` | datetime | Trigger onset time |
| `cooldown_until` | datetime | When cooldown expires |
| `ewma_pm25` | float | Current EWMA of PM2.5 |
| `baseline_pm25` | float | Frozen calibration baseline |
| `baseline_pm10` | float | Frozen PM10 baseline |
| `baseline_humidity` | float | Frozen humidity baseline |
| `baseline_temperature` | float | Frozen temperature baseline |
| `baseline_gas_resistance` | float | Frozen gas resistance baseline |
| `warmup_start` | datetime | Start of warmup phase |
| `calibration_start` | datetime | Start of calibration phase |
| `event_id` | str | UUID of current event being confirmed |
| `prev_pm25` | float | Previous PM2.5 for slope calculation |
| `prev_ts` | datetime | Previous sample timestamp for slope |
| `last_trigger_time` | datetime | Last trigger, for baseline drift gating |

### 7.4 Feature Extraction: `backend/app/feature_engine.py`

**Class:** `FeatureEngine` (all methods are static)

**`update_ewma(current, previous, alpha)`:** Standard EWMA: `S_t = alpha * x_t + (1-alpha) * S_{t-1}`. Used during calibration and baseline tracking.

**`compute_features(baseline_samples, event_samples)`:** The core feature extraction method. Takes two lists of sample dictionaries and returns a dictionary of 29 named features. Detailed computation for each feature group:

**Start Values (6 features):**
- Takes the first sample of `event_samples` (or last sample of `baseline_samples` if event is empty).
- Extracts raw `pm1`, `pm25`, `pm10`, `humidity`, `gas_resistance`, `temperature`.

**Baselines (5 features):**
- Computes the **median** of each sensor across the baseline window.
- Falls back to the start value if baseline is empty.

**Peaks (3 features):**
- `max()` of PM1, PM2.5, PM10 across event_samples.

**Deltas (3 features):**
- Peak minus baseline for each PM metric.
- Returns `None` if either value is missing (later replaced with `0.0` by the ensemble predictor).

**Time to Peak (1 feature) + Rise Slope (1 feature):**
- Finds the index of the PM2.5 peak in event_samples.
- Calculates time delta between first sample and peak sample using timestamps.
- Falls back to index-based time (assuming 1 Hz) if timestamp math fails.
- Slope = `d_pm25_peak / max(t_to_peak, 1.0)`.

**AUC Above Baseline (1 feature):**
- Trapezoidal integration of PM2.5 above the baseline level.
- For each consecutive pair of samples: `area += 0.5 * (h1 + h2) * dt`.
- Heights clamped to 0 (values below baseline contribute 0 area).

**Ratios (4 features):**
- `PM1 / (PM2.5 + epsilon)` and `PM1 / (PM10 + epsilon)` computed at both start and peak.
- Epsilon = 1e-6 to avoid division by zero.
- These ratios encode particle size distribution -- vape aerosol has a characteristic ultrafine signature.

**Humidity/Gas Dynamics (4 features):**
- `humidity_delta_20s`: Last sample humidity minus start humidity.
- `gas_delta_20s`: Last sample gas resistance minus start gas resistance.
- `humidity_slope_0_10s`: (humidity at 10s - humidity at start) / 10.0
- `gas_slope_0_10s`: (gas resistance at 10s - gas resistance at start) / 10.0
- The 10-second point is found by iterating event_samples until timestamp exceeds t0+10s.

**Stability (1 feature):**
- `pm25_std_last5s`: Standard deviation of PM2.5 readings in the last 5 seconds of the event window.
- Iterates backward from the last sample until the time gap exceeds 5 seconds.
- Returns 0.0 if fewer than 2 readings in the window.

### 7.5 Ensemble Prediction: `backend/app/ensemble_predictor.py`

**Class:** `EnsemblePredictor` (singleton instance: `ensemble`)

**Model loading (at import time):**
- Loads all models defined in `MODELS` dict from `class_config.py`:
  ```python
  MODELS = {"xgb": "xgb_model.joblib", "rf": "rf_model.joblib", "knn": "knn_model.joblib"}
  ```
- Tries multiple paths to find the models directory: `../models` relative to `app/`, then `backend/models` from CWD.
- Validates that each model has a `classes_` attribute and prints its class list.

**`predict(features)` -- the soft-voting ensemble:**

```
Step 1: Build feature vector
  - For each key in FEATURE_ORDER (29 features):
    - Get value from features dict
    - Replace None with 0.0
  - Result: numpy array shape (1, 29)

Step 2: Collect probabilities from each model
  - For each model (xgb, rf, knn):
    - Call model.predict_proba(X) -> array of class probabilities
    - Map model's native class ordering to CLASS_ORDER:
      - If model has custom_classes_ (XGBoost): use that mapping
      - If model has classes_ (sklearn): use that mapping
      - Integer class labels: map by index into CLASS_ORDER
    - Create full_probs vector of len(CLASS_ORDER), fill in known positions
    - Accumulate into sum_probs

Step 3: Average (soft vote)
  - avg_probs = sum_probs / num_valid_models

Step 4: Decision
  - top_class = CLASS_ORDER[argmax(avg_probs)]
  - margin = top_prob - second_highest_prob
  - If top_prob < MIN_TOP_PROB (0.40) OR margin < MIN_MARGIN (0.00):
      status = "uncertain"
  - Else:
      status = "confirmed"
```

**Return value:**

```python
{
    "top_class": "vape",              # Winning class label
    "probs": {                        # Per-class probabilities (all sum to ~1.0)
        "vape": 0.82,
        "cologne": 0.05,
        "hair spray": 0.03,
        "cleaning": 0.02,
        "shower": 0.01,
        "normal": 0.06,
        "other": 0.01
    },
    "top_prob": 0.82,                 # Highest probability
    "margin": 0.76,                   # Gap between 1st and 2nd
    "status": "confirmed",            # "confirmed" or "uncertain"
    "per_model": {                    # Individual model results
        "rf": {"vape": 0.85, ...},
        "xgb": {"vape": 0.80, ...},
        "knn": {"vape": 0.81, ...}
    },
    "confidence": 82.0                # top_prob * 100
}
```

**Fallback prediction:** If ALL models fail to load or predict, returns `top_class="normal"` with `status="uncertain"` and `confidence=0.0`.

### 7.6 Legacy Single-Model Inference: `backend/app/inference.py`

This file is an OLDER inference module from before the ensemble predictor existed. It is still loaded at startup (used by the `/health` endpoint to report model status) but is NOT used for actual detection. Key differences:

- Uses only 4 features: `humidity`, `pm25`, `particle_size` (derived from gas_resistance), `volume_spike` (from sound_level).
- Uses pandas DataFrames for prediction.
- Has a rule-based fallback: if gas_resistance < 50 AND pm25 > 35 AND warm+humid, predict "vape".
- Controlled by `MODEL_TYPE` from `model_config.py`.

**This module is effectively dead code for the ML pipeline.** The actual runtime detection path goes through `detector.py -> feature_engine.py -> ensemble_predictor.py`.

### 7.7 Application Startup: `backend/app/main.py`

- Creates FastAPI app with CORS middleware.
- Includes routers: events, devices, sensors, dashboard, admin, WebSocket.
- The `/health` endpoint calls `load_model()` from `inference.py` to check if a model file exists -- this is for monitoring only, not for inference.
- The ensemble predictor is instantiated at import time when `ensemble_predictor.py` is first imported (triggered by `detector.py` importing it).

### 7.8 WebSocket Broadcasting: `backend/app/ws.py`

- Maintains `active_connections` dict of connected WebSocket clients.
- `broadcast_event(event_type, data)`: Sends JSON to all connected clients. Auto-cleans stale connections.
- `broadcast_sensor_reading(device_id, data)`: Wraps sensor data in a `"sensor_data"` event.
- WebSocket endpoint at `/ws/events` with token-based authentication (via `validate_token()` -- currently a stub).

### 7.9 Model Switching: `backend/switch_model.py`

Simple CLI tool that overwrites `backend/app/model_config.py`:

```bash
python backend/switch_model.py rf    # Options: xgb, knn, svc, l_svm, rf
```

Writes:
```python
MODEL_TYPE = "rf"
```

This only affects the legacy `inference.py` path. The ensemble predictor always loads all three models regardless.

---

## 8. Configuration Constants

**All thresholds are in:** `backend/app/config.py`

| Constant | Value | Purpose |
|----------|-------|---------|
| `D_PM25_SUS` | `10.0` ug/m3 | PM2.5 delta threshold to trigger CONFIRMING |
| `SLOPE_SUS` | `2.0` ug/m3/s | PM2.5 rise rate threshold |
| `BASELINE_WINDOW_SEC` | `10` s | Duration of pre-trigger baseline window |
| `CONFIRM_WINDOW_SEC` | `20` s | Duration of confirmation collection |
| `COOLDOWN_SEC` | `20` s | Post-decision suppression period |
| `EWMA_ALPHA` | `0.1` | Smoothing factor for IDLE baseline (slow) |
| `EWMA_ALPHA_CALIBRATION` | `0.5` | Smoothing factor during calibration (fast) |
| `BASELINE_DRIFT_ALPHA` | `0.005` | Very slow baseline nudge during quiet periods |
| `BASELINE_QUIET_SEC` | `180` s | Quiet time required before baseline drift kicks in |
| `MIN_TOP_PROB` | `0.40` | Minimum top-class probability to be "confirmed" |
| `MIN_MARGIN` | `0.00` | Minimum gap between 1st and 2nd class (currently disabled at 0) |
| `WARMUP_DURATION_SEC` | `90` s | Hardware settling period |
| `CALIBRATION_DURATION_SEC` | `60` s | Baseline establishment period |

**Training constants** (in `train_with_feature_engine.py`):

| Constant | Value | Purpose |
|----------|-------|---------|
| `BASELINE_SEC` | `10` s | Matches `BASELINE_WINDOW_SEC` |
| `EVENT_SEC` | `20` s | Matches `CONFIRM_WINDOW_SEC` |
| `SLIDE_STEP` | `5` s | Window sliding stride for data augmentation |
| `MIN_SAMPLES` | `2` | Minimum samples in either sub-window to keep the example |

---

## 9. Known Pitfalls & Gotchas

### 9.1 The 29 vs 185 Feature Incompatibility

The two-step pipeline (`build_training_dataset.py` + `train_from_built_dataset.py`) produces 185-feature models. These are INCOMPATIBLE with the runtime 29-feature `FEATURE_ORDER`. Only `train_with_feature_engine.py` produces compatible models. There is no dimension check at runtime -- the model will either error on shape mismatch or, worse, interpret features in the wrong order silently.

### 9.2 scikit-learn Version Sensitivity

Models were trained with **scikit-learn 1.3.2**. Loading with a different version produces `UserWarning` about version mismatch and can cause:
- Different internal tree structures being deserialized incorrectly.
- Subtle probability distribution shifts.
- The legacy `inference.py` path falling back to rule-based detection on any load error.

### 9.3 MongoDB Timestamp Format

Timestamps in the `samples` collection are stored as ISO-8601 **strings** (e.g., `"2026-02-12T06:07:54.282Z"`), NOT BSON dates. This means:
- `$gte`/`$lt` queries with Python `datetime` objects return 0 results.
- You must use string comparison: `{"timestamp": {"$gte": "2026-02-12T00:00:00"}}`.
- `no_cursor_timeout=True` is banned on Atlas free tier (raises `OperationFailure` code 8000).

### 9.4 Window Length Alignment

Training uses **30-second windows** (10s baseline + 20s event) with a **5-second stride**. The runtime also uses 30-second windows (10s baseline + 20s confirm). Training and runtime ARE aligned at 30 seconds.

### 9.5 clean_air_0001 Produces Zero Windows

The label `clean_air_0001` has dates `2026-01-21` to `2026-01-22`, but MongoDB sensor data only starts around `2026-02-02`. This label fetches zero matching samples and generates zero training windows. It is effectively a no-op in training.

### 9.6 Saturated BME680 Events

Vape events `vape_0030` through `vape_0041` and `vape_0048` through `vape_0051` (16 events total) have saturated BME680 readings (`humidity=100%`, `gas_resistance=0 KOhms`). This means features like `gas_start`, `gas_base`, `gas_delta_20s`, `gas_slope_0_10s`, `humidity_delta_20s`, and `humidity_slope_0_10s` are unreliable for these events. The models were trained on this data, which may reduce their sensitivity to gas/humidity-based discrimination.

### 9.7 XGBoost Label Encoding

XGBoost requires integer labels. The training script uses `LabelEncoder` to convert string labels to integers, then stores the mapping as `model.custom_classes_`. The ensemble predictor checks for `custom_classes_` first, then `classes_`, to decode predictions back to strings. If this attribute is missing or corrupted, XGBoost predictions will be mapped by raw integer index into `CLASS_ORDER`, which may be incorrect.

### 9.8 None Feature Handling

When `FeatureEngine.compute_features()` encounters missing sensor readings, it returns `None` for affected features. The `EnsemblePredictor` replaces all `None` values with `0.0` before prediction:
```python
val = features.get(key)
if val is None:
    val = 0.0
```
This is a crude imputation strategy. Zero may or may not be a reasonable default for each feature (e.g., `gas_base=0.0` is very different from a real reading of ~400 KOhms).

### 9.9 Authentication is a Stub

`backend/app/auth.py` :: `validate_token()` is not implemented. All endpoints, including the sensor data intake, are effectively public.

### 9.10 Dual Inference Paths

There are TWO inference paths in the codebase:
- **Active path:** `detector.py` -> `feature_engine.py` -> `ensemble_predictor.py` (29 features, soft-voting ensemble)
- **Legacy path:** `inference.py` (4 features, single model, rule-based fallback)

Only the active path is used for detection. The legacy path is only called by the `/health` endpoint to check if a model file exists.

---

## 10. Legacy / Dead Code

| File/Module | Status | Why It Still Exists |
|-------------|--------|-------------------|
| `backend/app/inference.py` | Legacy | Used by `/health` endpoint for model status check only. NOT used for actual inference. Contains a completely different 4-feature prediction path. |
| `backend/app/model_config.py` | Partially legacy | `MODEL_TYPE` only affects `inference.py`. The ensemble predictor ignores it and loads all three models. |
| `backend/switch_model.py` | Partially legacy | Only affects `inference.py` via `model_config.py`. Has no effect on ensemble prediction. |
| `backend/classifications.txt` includes `"shower"` | Active but incomplete | "shower" is listed as a class but `shower_0001` is the only shower training event. Model may not reliably distinguish showers. |

---

## Critical File Paths Summary

| Purpose | Path |
|---------|------|
| Main app entry | `backend/app/main.py` |
| Sensor data intake | `backend/app/routers/sensors.py` |
| Detection state machine | `backend/app/detector.py` |
| Feature extraction | `backend/app/feature_engine.py` |
| Ensemble inference | `backend/app/ensemble_predictor.py` |
| Feature order + class config | `backend/app/class_config.py` |
| Thresholds & settings | `backend/app/config.py` |
| State management | `backend/app/state_manager.py` |
| Training labels | `backend/training/seed_event_labels.json` |
| Training script (correct) | `backend/train_with_feature_engine.py` |
| Model files | `backend/models/rf_model.joblib`, `xgb_model.joblib`, `knn_model.joblib` |
| Model switcher | `backend/switch_model.py` |
| Active model config | `backend/app/model_config.py` |
| Class list | `backend/classifications.txt` |
| Legacy inference (dead) | `backend/app/inference.py` |
| Database connection | `backend/app/database.py` |
| WebSocket broadcast | `backend/app/ws.py` |
