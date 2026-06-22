# HANDOFF.md — Mistio / VapeGuard Session Transfer (v13)

## 1. Project Overview

Full-stack IoT vape detection: ESP32-C6 sensors -> FastAPI backend (ML inference) -> React dashboard. See `CLAUDE.md` for architecture, commands, env vars, and known issues.

**Key directories:** `backend/app/` (FastAPI + ML), `frontend/src/` (React + Clerk auth + Zustand), `esp32_vape_sensor_v3/` (firmware), `backend/models/` (joblib ML models).

**Deployment:** Backend on Railway, Frontend on Vercel (auto-deploy from `main`), DB on MongoDB Atlas (`vape-alert`).

## 2. What Was Fixed This Session (v6 — 2026-06-04/05)

### ML Models Retrained for BMV080 — DONE
- **Problem:** Models were trained on old PMS5003 sensor data (Dec 2025 - Feb 2026). After upgrading to BMV080 particulate sensor, the models produced incorrect classifications because the BMV080's PM signature differs from PMS5003.
- **Fix:** Collected fresh BMV080 training data — 22 vape events + 2 clean air windows (30 min each). Created `backend/training/bmv080_labels.json`. Trained using `train_with_feature_engine.py` with `--drop-first-n-vape 0` and `--allowed-types "vape,clean_air"`.
- **Results:** 174 training windows (144 vape, 30 clean air). RF: 100% acc, XGBoost: 100% acc, KNN: 88.6% acc. Models deployed to Railway.
- **Note:** 12 of 22 vape events (the June 5-6 batch) produced 0 training windows — their data may not have landed in MongoDB yet. The 10 events from June 4 provided sufficient data. More training data will improve robustness — especially for other classes (cologne, cleaning products, etc).

### Battery Voltage Monitoring — ADDED
- **Problem:** No way to track battery state or power consumption without an external sensor.
- **Fix:** Added `readBatteryVoltage()` to firmware v3.5.0. Reads from Feather ESP32-C6's built-in voltage divider on pin A1 (GPIO1), 2:1 ratio. Battery voltage + free heap included in every POST payload as `battery_voltage` and `free_heap`.
- **LiFePO4 voltage reference:** 3.6V = full, 3.2-3.3V = 20-80% (flat zone), 3.0V = nearly empty, 2.8V = dead.
- **Firmware changes:** `BATT_PIN` define, `analogReadResolution(12)` in setup, `readBatteryVoltage()` function, voltage in POST payload and serial debug output.

### WiFi NVS Override — ADDED
- **Problem:** Device had school WiFi creds in NVS, wouldn't connect at home for testing/training.
- **Fix:** Added NVS override block in `setup()` that writes WiFi creds on every boot (before `loadDeviceIdentity()`). Currently set to home network. **Must be changed back to school WiFi before deployment.**
- **Location:** `esp32_vape_sensor_v3.ino` setup(), ~5 lines before `loadDeviceIdentity()` call.

### Firmware Version Bumped to v3.5.0
- Resolved merge conflict (was stuck between "3.4.4" and "3.4.rizz").
- Flashed via USB to COM3 (port changed from COM4 after replug).

### Training Script Unicode Fix
- `train_with_feature_engine.py` line 303: replaced `→` with `->` to fix `UnicodeEncodeError` on Windows cp1252 console.

## 2a. What Was Fixed (v4 + v5)

### Device Silently Dying — FIXED
- **Problem:** Device would work for ~5-45 minutes then stop posting data to dashboard. No crash, no serial output — just dead. Root cause: multiple hang/leak paths with zero recovery.
- **Fixes (v3.4.x):**
  - **Watchdog re-enabled** — `esp_task_wdt_deinit()` in setup disabled WDT but never re-enabled it. Now re-enabled after setup with 60s timeout. Fed in `loop()` and `idleSleep()`.
  - **I2C timeout** — `Wire.setTimeout(100)` prevents MSA311 bus lockup from hanging forever.
  - **POST dead timer** — auto-reboots if no successful HTTP POST in 5 minutes (`POST_DEAD_MS = 300000`).
  - **Heap guard** — auto-reboots if free heap drops below 30KB (`HEAP_MIN_BYTES = 30000`), before TLS can't allocate.
  - **POST error logging** — now prints heap alongside error code for diagnostics.
- **Result:** Device self-heals by rebooting instead of silently dying. Serial shows `REBOOT: no POST in Xs` or `REBOOT: heap critical` if triggered.

### Tamper Detection — FIXED & TUNED (v4 + v5)
- **Problem 1:** Adafruit_MSA301 library sometimes returned frozen/stale values for the MSA311 chip. Tamper wouldn't trigger even when shaking.
- **Fix:** Rewrote `checkAndSendTamper()` to use **raw I2C register reads** (0x02-0x07) instead of `msa.getEvent()`. Added frozen sensor detection — if raw values identical for 10 consecutive reads, auto re-inits the MSA311.
- **Problem 2:** MSA311 ±4g 12-bit scale factor was wrong: `9.81/1024` → correct is `9.81/512`. Gravity was reading ~4.5 m/s² instead of ~9.8, so deviation from gravity could never reach threshold 12.0.
- **Fix:** Corrected scale factor in `esp32_vape_sensor_v3.ino` line ~1261. TAMPER_THRESHOLD lowered from 12.0 → 6.0. Confirmed gravity now reads ~9.06 m/s².
- **Problem 3:** BLE crash (`NimBLEDevice::deinit(true)`) caused Guru Meditation / Store access fault on ESP32-C6, which incremented the triple-reset counter and forced a 2-min captive portal.
- **Fix:** Replaced `NimBLEDevice::deinit(true)` with just stopping advertising + disconnecting clients. No crash.

### Tamper Dashboard Notifications — FIXED
- **Problem:** `'tamper'` was missing from the `isCritical` array in `NotificationController.js` `processAlert()`.
- **Fix:** Added `'tamper'` to `isCritical`: `['vape', 'fire', 'alarm', 'tamper']` at line 87.
- End-to-end flow now works: device shake → magenta flash → tamper POST → backend broadcast → WebSocket → dashboard notification (orange, 700Hz).

## 2b. What Was Fixed v5 Session (Dashboard Data Fixes)

### Dashboard Showing 0s During Detection — FIXED
- **File:** `frontend/src/services/deviceService.js` lines 110-126
- **Problem:** `|| 0` coerced all undefined sensor fields (pm25, humidity, temperature, gasResistance) to 0 when REST polling returned them missing. Cards showed "0 μg/m³" during active detection.
- **Fix:** Changed to `?? undefined` — undefined fields now stay undefined, preserving last-known values from WS.

### Polling Wiping WebSocket Sensor Data — FIXED
- **File:** `frontend/src/hooks/useDevices.js` lines 20-37 (`fetchDevices`)
- **Problem:** `setDevices(data)` on every 5s poll replaced all device state with fresh REST data, losing any richer sensor fields that WebSocket had just delivered.
- **Fix:** Merge-by-timestamp — if the existing WS data is newer than the polled data, preserve existing sensorData + status. Otherwise merge REST fields onto WS fields.

### Git Push Account Popup — FIXED
- `git config --global credential.https://github.com.username dollancemedia` — always selects dollancemedia account without popup.

## 3. What Was Fixed Last Session (v3)

### WiFi Modem Sleep — WORKING
- `esp_wifi_set_ps(WIFI_PS_MIN_MODEM)` after STARTUP. WiFi stays associated, radio sleeps between DTIM beacons. ~15-20mA idle vs ~80mA before.

### BMV080 Duty Cycle Mode — WORKING
- Built-in duty cycle mode (`SF_BMV080_MODE_DUTY_CYCLE` with 60s period) instead of reset/init. Continuous during STARTUP/DEEP_SENSE, duty cycle during SNIFF.

### Heartbeat Every Sniff — WORKING
- `heartbeatInterval = 1` — every sniff (60s) sends a POST. Smooth dashboard graphs.

## 2b2. What Was Fixed (v8 — 2026-06-06)

### WebSocket Dying After Vape Events — FIXED
- **Problem:** WebSocket had a hard cap of 5 reconnect attempts with 3s intervals. After any connection drop (common during burst activity from DEEP_SENSE, Railway proxy timeouts, or network blips), the WS would permanently die after 15s and never recover. Dashboard showed stale "Vape Detected" status until manual page reload.
- **Fix (useWebSocket.js):**
  - Removed hard `maxReconnectAttempts = 5` cap entirely
  - Added exponential backoff: 3s → 6s → 12s → 24s → 30s cap, retries indefinitely
  - Removed `1008` (Policy Violation) from no-reconnect codes so auth-rejected connections retry after token refresh
  - Attempts reset to 0 after 5s of stable connection
- **Fix (ws.py backend):** Server now responds to client heartbeat pings with pong messages. Previously client sent `{"type":"ping"}` but server just discarded it — Railway's proxy could drop idle connections that never exchanged data.
- **Fix (NotificationController.js + MobileDashboard.js):** Added `enabled: !!token` so WebSocket doesn't attempt connection before Clerk token is fetched. Previously wasted connection attempts on auth failures.
- **Fix (MobileDashboard.js):** Reduced REST polling from 5s to 15s (matches desktop) to reduce server load.

### "12:00 AM" Ghost Timestamps — FIXED
- **Problem:** Firmware's `getISOTimestamp()` falls back to `String(millis())` before NTP sync (e.g., `"45000"`). JavaScript's `new Date("45000")` creates year 45000, January 1, midnight — a valid date that passes `isNaN()` checks. Dashboard showed phantom "12:00 AM" entries with 0 PM2.5.
- **Fix (DeviceDetailPanel.js):** `fmtTime()` now rejects dates with `year < 2020` or `year > 2100`, returning empty string.
- **Fix (sensors.py backend — intake):** Incoming sensor data with non-ISO timestamps (no `T` character, e.g., `"45000"`) are replaced with server UTC time before storing to MongoDB. Prevents future ghost entries.
- **Fix (sensors.py backend — REST):** `/sensors/sensor-data` endpoint filters out existing bad timestamps from response. Old ghost entries in MongoDB won't show up in history.
- **Fix (Devices.js + MobileDashboard.js):** History fetch validates timestamps before rendering — entries with non-ISO or out-of-range timestamps are skipped.

### Low-Confidence Vape Showing Red Alarm — FIXED
- **Problem:** All status classifiers (DeviceList, DeviceMap, Devices page) showed red "alarm" status for ANY `predictedClass === 'vape'` regardless of confidence. A 15% ghost detection triggered full red alarm on the device card, map marker, and map hover tooltip. NotificationController also fired notifications for any vape prediction regardless of confidence.
- **Fix:** Applied confidence >= 40% gate consistently across ALL components:
  - **DeviceDetailPanel.js** `getStatus()` — already fixed in v7
  - **DeviceList.js** `getStatusClass()` — now requires `confidence >= 40` for alarm, shows warning for 0-40%
  - **DeviceMap.js** `getDeviceVisuals()` — same gate, shows orange "uncertain" marker instead of red
  - **DeviceMap.js** hover tooltip — same gate, shows "Uncertain" badge instead of "Alert"
  - **Devices.js** `getDevStatusClass()` — same gate
  - **NotificationController.js** — both `sensor_data` and `event_update` handlers now skip notification if `confidence < 40%`
- **Result:** Low-confidence ghost detections (vibration, gas drift) show yellow/orange "Uncertain" with no notification. Only >=40% triggers red alarm + notification.

### Live Readings Disappearing During Detection — INVESTIGATED
- **Symptom:** During/after vape detection, the Live Readings cards (humidity, PM2.5, temp, gas) disappear from the device detail panel.
- **Root cause:** During COOLDOWN (20s) + next SNIFF (up to 60s), no sensor data is broadcast. The `LiveReadings` component returns `null` if `sd.humidity === undefined`. If a REST poll returns device data where the sensor fields are undefined (because the `devices` collection stores metadata, not live readings), the merge logic may lose previously-WS-sourced sensor values during the 80s data gap.
- **Status:** Partially addressed by the WebSocket reconnection fix (WS stays alive longer, so data keeps flowing). The 80s gap after COOLDOWN is by design — firmware is sleeping. A full fix would require sending a "normal" heartbeat during COOLDOWN or having the frontend show "last known" values with a stale indicator instead of hiding the cards.

### v8 Files Changed (exact files touched this session)

**3 commits pushed to `main` on 2026-06-06:**

| Commit | Files | What |
|---|---|---|
| `0aa86fc` | `backend/app/config.py`, `backend/app/detector.py`, `backend/app/routers/sensors.py`, `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino`, `frontend/src/components/DeviceDetailPanel.js` | Previous session's threshold + detection + confidence-gated status (was never pushed) |
| `0d7e4e7` | `frontend/src/hooks/useWebSocket.js`, `frontend/src/components/NotificationController.js`, `frontend/src/components/DeviceDetailPanel.js`, `frontend/src/pages/Devices.js`, `frontend/src/pages/MobileDashboard.js`, `backend/app/routers/sensors.py`, `backend/app/ws.py` | WebSocket reconnection fix + ghost timestamp fix |
| `7687996` | `frontend/src/components/NotificationController.js`, `frontend/src/components/DeviceList.js`, `frontend/src/components/DeviceMap.js`, `frontend/src/pages/Devices.js` | Confidence >= 40% gate on all alarm indicators + notifications |

**Per-file change summary:**

| File | Changes |
|---|---|
| `backend/app/config.py` | `D_PM25_SUS` 10→3, `SLOPE_SUS` 2→0.5 |
| `backend/app/detector.py` | Server-side spike detection, `force_deep_sense` in state |
| `backend/app/routers/sensors.py` | `deep_sense_complete` guard, `_has_real_sensor_data` flag, `force_deep_sense` in response, timestamp sanitization (replace non-ISO with server UTC), sensor-data endpoint filters invalid timestamps |
| `backend/app/ws.py` | Ping/pong: server responds to `{"type":"ping"}` with `{"type":"pong"}` |
| `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino` | `LOCAL_SPIKE_THRESHOLD` 8→3, `isLocalSpike()` PM2.5≤0 reject + deltaPM25>1.0 for gas-only, `force_deep_sense` response handling, state-change break after POST |
| `frontend/src/hooks/useWebSocket.js` | Removed 5-attempt hard cap, exponential backoff (3s→30s), removed 1008 from no-reconnect, removed unused `maxReconnectAttempts` |
| `frontend/src/components/DeviceDetailPanel.js` | `fmtTime()` year validation (<2020 or >2100 → empty), `getStatus()` confidence≥40% gate |
| `frontend/src/components/DeviceList.js` | `getStatusClass()` confidence≥40% gate |
| `frontend/src/components/DeviceMap.js` | `getDeviceVisuals()` + tooltip confidence≥40% gate, orange "uncertain" for <40% |
| `frontend/src/components/NotificationController.js` | `enabled: !!token`, confidence<40% → skip notification for both sensor_data and event_update |
| `frontend/src/pages/Devices.js` | `getDevStatusClass()` confidence≥40% gate, `isValidTimestamp()` filter on history fetch |
| `frontend/src/pages/MobileDashboard.js` | `enabled: !!token`, poll 5s→15s, `isValidTimestamp()` filter on history fetch |

### v8 Detection Flow After Fixes

```
Sensor reads PM2.5 spike (delta > 3.0 from baseline)
  → isLocalSpike() confirms (rejects PM2.5≤0, requires delta>1.0 for gas-only)
  → Firmware enters DEEP_SENSE (30s of 1Hz sampling)
  → Backend receives samples, broadcasts sensor_reading with prediction.type="suspected"
  → Dashboard shows yellow "Suspected Event" on device card/map/panel
  → deep_sense_complete arrives → backend runs ML
  → If confidence >= 40%:
      → event_update broadcast with top_class="vape"
      → Dashboard shows RED alarm on card/map/panel
      → Notification fires (toast + sound)
  → If confidence < 40%:
      → event_update broadcast with status="uncertain"
      → Dashboard shows ORANGE "Uncertain" on card/map/panel
      → NO notification fires
  → Firmware enters COOLDOWN (20s) → SNIFF (60s heartbeat)
  → Next heartbeat: prediction.type="normal" → dashboard recovers
```

## 2e. What Was Fixed (v9 — 2026-06-06)

### Full Codebase Audit & Pipeline Overhaul

A comprehensive audit of the entire codebase (firmware, backend, frontend) was performed. The audit identified three fatal problems compounding into ~15% detection accuracy even when vaping directly at the sensor:

1. **BMV080 sensor produces unreliable data** during DEEP_SENSE — the mode switch warmup was too short, so most reads returned 0/stale values
2. **ML pipeline had no sanity checks** — it ran inference on garbage data (negative PM2.5 deltas, zero readings) and output garbage predictions
3. **Dashboard WebSocket architecture was broken** — duplicate connections, stale status lingering 50-80s, charts too zoomed out to show BMV080-scale spikes

All fixes organized into three tiers. Tiers 1 and 2 implemented this session. Tier 3 (retraining) must wait until the fixed pipeline produces clean data.

---

### TIER 1: Detection Pipeline Fixes

#### Fix T1-1: BMV080 Warmup Increased (firmware)
- **Problem:** `wakeHeavySensors()` only waited 500ms after switching BMV080 from duty-cycle to continuous mode. The BMV080's internal measurement cycle needs ~3-5s to stabilize. Most reads during DEEP_SENSE returned `false`, leaving `lastPM25` at 0.
- **Fix:** `wakeHeavySensors()` delay 500ms → 3000ms. SNIFF-path additional warmup 2000ms → 3000ms. Total warmup before first read: ~6 seconds.
- **Files:** `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino` — `wakeHeavySensors()` + STATE_SNIFF case

#### Fix T1-2: Zero PM2.5 Readings Rejected System-Wide (firmware + backend)
- **Problem:** When `bmv.readSensor()` returned false or PM25=0 (failed read), the code kept the stale value (often 0 from boot). These zeros corrupted: EWMA baselines, ring buffer data, DEEP_SENSE event windows, ML features, and dashboard display.
- **Fix (firmware):**
  - `readAllSensors()`: If `bmv.PM25()` returns 0, keep previous valid values instead of overwriting with zero
  - `burstReadBMV080()`: Treat PM25=0 same as a failed read (-1), exclude from averaging. If no valid reads in burst, previous values preserved
  - `updateLocalBaseline()`: Skip entirely if `lastPM25 <= 0` — prevents baseline drift toward zero
- **Fix (backend `detector.py`):**
  - `startup` handler: requires `pm25 > 0` before updating EWMA/baseline
  - `sniff` handler: requires `pm25 > 0` before baseline drift or spike detection
- **Files:** `esp32_vape_sensor_v3.ino` — `readAllSensors()`, `burstReadBMV080()`, `updateLocalBaseline()`. `backend/app/detector.py` — `_handle_v3_sample()` startup + sniff branches

#### Fix T1-3: Pre-Inference Sanity Checks (backend)
- **Problem:** Backend ran ML inference on ANY data from DEEP_SENSE, even when features were physically impossible for vape (negative PM2.5 deltas, zero readings). Model output was garbage-in-garbage-out at ~15-20% confidence.
- **Fix:** Both `_v3_make_decision()` and `_make_decision()` now:
  1. Filter out zero-PM2.5 samples from event and baseline windows before computing features
  2. If fewer than 3 valid event samples after filtering → skip ML, return `{top_class: "normal", top_prob: 1.0}`
  3. If `d_pm25_peak <= 0` (PM2.5 went DOWN during event — physically impossible for vape) → skip ML, return `{top_class: "normal", top_prob: 1.0}`
  4. Log reason for skip: `"insufficient_valid_samples"` or `"negative_pm25_delta"` in `event_features`/`ensemble_detail`
- **Files:** `backend/app/detector.py` — `_v3_make_decision()`, `_make_decision()`

#### Fix T1-4: Cooldown Heartbeat (firmware)
- **Problem:** After DEEP_SENSE, firmware entered COOLDOWN (20s silence) then SNIFF (up to 60s until next heartbeat). During the 50-80s gap, no sensor_reading broadcasts were sent. Dashboard stayed stuck on last detection status until the next heartbeat overwrote it.
- **Fix:** At the start of COOLDOWN, firmware sends one `postSensorData()` with `duty_state: "cooldown"`. Dashboard receives this immediately and clears detection status. Uses a static `cooldownHeartbeatSent` flag to send exactly once per cooldown.
- **Files:** `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino` — STATE_COOLDOWN case

#### Firmware Version Bumped to v3.7.0
- Covers all Tier 1 firmware changes. Needs reflash to COM3.

---

### TIER 2: Dashboard Fixes

#### Fix T2-5: Shared WebSocket Context (frontend)
- **Problem:** Three components independently opened their own WebSocket connections to `/ws/events`: `Devices.js`, `MobileDashboard.js`, and `NotificationController.js`. On desktop this meant 2 simultaneous WS connections per tab; on mobile also 2. Doubled server load on Railway, caused message race conditions, and wasted reconnection attempts.
- **Fix:** Created `useSharedWebSocket.js` — a React context provider that manages a single WebSocket connection at the App level. All consumers subscribe via `useSharedWebSocket(onMessage)` hook. Token management (Clerk auth) is centralized in the provider.
  - `App.js`: Wraps `<AppContent>` in `<SharedWebSocketProvider>`
  - `Devices.js`: Replaced `useWebSocket(...)` with `useSharedWebSocket(handleWebSocketMessage)`, removed token fetching
  - `MobileDashboard.js`: Same replacement, removed token fetching
  - `NotificationController.js`: Same replacement, removed token fetching + `useAuth` import
- **Files:** `frontend/src/hooks/useSharedWebSocket.js` (NEW), `frontend/src/App.js`, `frontend/src/pages/Devices.js`, `frontend/src/pages/MobileDashboard.js`, `frontend/src/components/NotificationController.js`
- **Note:** The old `useWebSocket.js` hook is preserved — still used by `TrainAI.js` and `RawDataCard.js`

#### Fix T2-6: Auto-Scaling Charts (frontend)
- **Problem:** The sensor trends chart in DeviceDetailPanel had hardcoded Y-axis max values (PM2.5: 200, Gas: 70). The BMV080 reports PM2.5 of 4-20 μg/m³, so a spike from 5→12 was invisible — only 3.5% of the chart height. The "All" view normalized each metric to `value / hardcoded_max * 100%`, making BMV080 data flat lines at the bottom.
- **Fix:**
  - **Single-metric view:** Computes actual data min/max from visible data, adds 30% padding (minimum 1 unit), and sets explicit `yMin`/`yMax` on the Y axis. A 5→12 spike now fills most of the chart.
  - **"All" view:** Each metric is normalized to its own **visible data range** (`(value - dataMin) / (dataMax - dataMin) * 100%`) instead of the hardcoded max. All four metrics now use the full 0-100% range regardless of absolute scale. Tooltip still shows real values.
- **Files:** `frontend/src/components/DeviceDetailPanel.js` — `useChartConfig()`

#### Fix T2-7: Stale Detection Status Auto-Clear (frontend)
- **Problem:** If a WebSocket message set a device to "vape"/"suspected"/etc. and then no subsequent message arrived to clear it (WS drop, COOLDOWN silence, network issue), the dashboard showed the stale detection status indefinitely until hard refresh.
- **Fix:** When a device enters a non-normal detection state via WebSocket, a 90-second timer starts. If no new WS message clears the status before the timer fires, the device is automatically reset to `{status: 'online', predictedClass: 'normal', confidence: 0}`. Timer is cancelled when a "normal" message arrives.
- **Files:** `frontend/src/pages/Devices.js`, `frontend/src/pages/MobileDashboard.js` — `staleClearTimersRef` + logic in `handleWebSocketMessage`

---

### v9 Files Changed

**Committed and pushed in v9 session (commit `edd703f`).**

| File | Changes |
|---|---|
| `backend/app/detector.py` | T1-2: zero-PM rejection in startup/sniff. T1-3: sanity checks in `_v3_make_decision()` and `_make_decision()` (filter zeros, skip ML if <3 valid or d_pm25_peak<=0) |
| `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino` | T1-1: BMV080 warmup 500ms→3s + SNIFF warmup 2s→3s. T1-2: `readAllSensors()` keeps previous on PM25=0, `burstReadBMV080()` excludes zeros, `updateLocalBaseline()` skips on zero. T1-4: COOLDOWN heartbeat. Version 3.6.0→3.7.0 |
| `frontend/src/hooks/useSharedWebSocket.js` | NEW — shared WS context provider + `useSharedWebSocket()` hook |
| `frontend/src/App.js` | T2-5: import + wrap AppContent in `<SharedWebSocketProvider>` |
| `frontend/src/components/NotificationController.js` | T2-5: switched from `useWebSocket` to `useSharedWebSocket`, removed token/auth management |
| `frontend/src/pages/Devices.js` | T2-5: switched to `useSharedWebSocket`, removed token. T2-7: stale auto-clear timers |
| `frontend/src/pages/MobileDashboard.js` | T2-5: switched to `useSharedWebSocket`, removed token. T2-7: stale auto-clear timers |
| `frontend/src/components/DeviceDetailPanel.js` | T2-6: auto-scaling Y axis for single-metric + min-max normalization for "All" view |

### v9 Detection Flow After Fixes

```
Sensor reads PM2.5 spike (delta > 3.0 from baseline)
  → isLocalSpike() confirms (rejects PM2.5<=0, requires delta>1.0 for gas-only)
  → Firmware enters DEEP_SENSE (30s of 1Hz sampling)
  → wakeHeavySensors() waits 3s (was 0.5s) for BMV080 to stabilize
  → readAllSensors() rejects PM25=0, keeps previous valid values
  → Backend receives samples, filters out zero-PM readings
  → Broadcasts sensor_reading with prediction.type="suspected"
  → Dashboard shows yellow "Suspected Event" (via shared single WS connection)
  → deep_sense_complete arrives → backend runs sanity checks:
      → If <3 valid samples or d_pm25_peak<=0 → skip ML → "normal" at 100%
      → Otherwise → run ML ensemble on cleaned feature vector
  → If confidence >= 40%:
      → Dashboard shows RED alarm, notification fires
  → If confidence < 40%:
      → Dashboard shows ORANGE "Uncertain", NO notification
  → Firmware enters COOLDOWN → immediately sends one heartbeat (T1-4)
  → Dashboard clears detection status within 1-2 seconds
  → If WS drops and no heartbeat arrives: auto-clear after 90s (T2-7)
  → Chart shows spikes at actual data scale, not lost in 0-200 range (T2-6)
```

### v9 Dashboard Bug Status Update (from Section 7)

| Bug | Status |
|---|---|
| B1 (double broadcast) | Already fixed in v8 — `broadcast_event("event_update", ...)` for events, `broadcast_sensor_reading(...)` for live data |
| F1 (stale closure) | **FIXED v8** — `devicesRef` pattern already in Devices.js |
| F2 (fmtTime) | **FIXED v8** — year validation already in DeviceDetailPanel.js |
| F3 (confidence undefined%) | **FIXED v8** — `(h.confidence ?? 0).toFixed(1)` already in RecentEvents |
| F4 (selectedDevice stale) | **FIXED v8** — useEffect re-sync already in Devices.js |
| F5 (duplicate WS) | **FIXED v9** — shared WebSocket context (T2-5) |
| F6 (redundant poll) | **FIXED v9** — NotificationController no longer has its own polling; removed in T2-5 refactor |

---

## 2f. What Was Fixed (v10 — 2026-06-07)

### Session Summary

Deployed all v9 changes (Tier 1 + Tier 2), flashed firmware, and discovered three critical issues that were preventing the detection pipeline from working end-to-end. All three fixed and verified with a live vape test showing real PM2.5 decay curve (53→47→23→20→17→16→15→14→11→10→7→5 μg/m³).

---

### Fix V10-1: OTA Downgrade Loop — FIXED

- **Problem:** After flashing v3.7.0, the device immediately OTA "updated" back to v3.4.4 (then v3.4.2 after we changed active). The `/firmware/latest` endpoint used `latest_version != current_version` to determine if an update was available — any version difference triggered OTA, including downgrades.
- **Fix (backend `firmware.py`):** Replaced `!=` with proper semver tuple comparison: `parse_ver(latest) > parse_ver(current)`. Only offers OTA when the server version is strictly newer.
- **Fix (firmware `esp32_vape_sensor_v3.ino`):** Added client-side semver guard in `checkForOTA()`. Parses both versions with `sscanf`, compares as `major*10000 + minor*100 + patch`. If server version <= current, logs `"[OTA] Skipping downgrade"` and returns.
- **Fix (server state):** Uploaded v3.7.0 binary to backend as active firmware via `/api/firmware/upload`. OTA now correctly returns `update_available: false` for devices already on v3.7.0.
- **Files:** `backend/app/routers/firmware.py`, `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino`
- **Commits:** `af795f0` (backend semver fix), `28fb220` (firmware guard + PM2.5 fix)

### Fix V10-2: PM2.5 = 0 Rejected as Invalid — FIXED

- **Problem:** The BMV080 correctly reports PM2.5 = 0.0 μg/m³ in clean indoor air. But ALL code treated 0 as "sensor not ready" and rejected it:
  - `readAllSensors()`: `if (newPM25 > 0)` — rejected 0, kept stale previous value
  - `burstReadBMV080()`: `if (val > 0)` — excluded 0 from burst averaging
  - `updateLocalBaseline()`: `if (lastPM25 <= 0) return` — never updated baseline
  - `isLocalSpike()`: `if (lastPM25 <= 0) return false` — never detected spikes
  - Backend `detector.py`: `if pm25 > 0` in startup/sniff handlers — never calibrated backend baselines
- **Impact:** Baseline never froze during STARTUP (0 calibration samples), device appeared offline, no detection possible.
- **Fix (firmware):** Changed all `> 0` guards to `>= 0` (or removed entirely). PM2.5 = 0 is now accepted as valid clean-air reading. Only `readSensor() == false` (no data available from sensor) is treated as invalid.
- **Fix (backend `detector.py`):** Changed startup/sniff handlers from `pm25 > 0` to `pm25 >= 0`. Event sample filtering during DEEP_SENSE still uses `> 0` (during active vape, 0 = likely failed read). Baseline samples accept `>= 0`.
- **Files:** `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino` (4 functions), `backend/app/detector.py` (4 locations)
- **Commit:** `28fb220`

### Fix V10-3: BMV080 FIFO Stale Data — FIXED

- **Problem:** During DEEP_SENSE, PM2.5 stayed frozen at exactly 131.0 μg/m³ for all 14 reads while gas/temp/humidity changed normally. The vape cloud should show a decay curve.
- **Root cause:** The BMV080 accumulates 1 reading/sec in its internal FIFO. `readSensor()` calls `bmv080_serve_interrupt()` once, which dequeues ONE buffered reading. But the DEEP_SENSE loop took ~2s per iteration (1s HTTP POST + 1s delay), so it only called `readSensor()` every 2 seconds. This meant:
  - FIFO accumulated 2 readings per loop iteration
  - Each `readSensor()` call returned the OLDER buffered reading
  - The second (newer) reading stayed in the FIFO until next iteration
  - Result: always reading data that was 1-2 seconds stale, PM2.5 never updated
- **Fix (`readAllSensors()`):** Instead of calling `readSensor()` once, drain the entire FIFO in a `while` loop (capped at 10 iterations). The last value drained is the freshest reading.
- **Fix (`burstReadBMV080()`):** Added FIFO drain at the start (up to 60 stale readings from duty-cycle mode). Then moved `delay(BURST_DELAY_MS)` before each read instead of after, ensuring fresh data for each burst sample.
- **Fix (DEEP_SENSE timing):** Reduced `delay()` from 1000ms to 100ms since the HTTP POST already takes ~1s, giving ~1.1s total loop time matching the sensor's 1 reading/sec output rate.
- **Result:** PM2.5 now shows real decay curve: 53→47→23→26→20→17→16→16→19→21→15→14→11→13→15→14→12→11→10→7→7→6→5 μg/m³ over 23 reads. Previously: 131→131→131→...→131 for 14 reads.
- **Files:** `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino` — `readAllSensors()`, `burstReadBMV080()`, STATE_DEEP_SENSE case
- **Commit:** `a5d339f`

### V10 Serial Monitor Plot Script — ADDED

- Created `serial_plot.py` — real-time matplotlib graph of PM2.5 + gas resistance from serial output. Parses Sniff and READ debug lines. Usage: `python serial_plot.py`
- **File:** `serial_plot.py` (project root)

### v10 Commits Pushed to `main` (2026-06-07)

| Commit | Files | What |
|---|---|---|
| `edd703f` | 9 files (backend/detector.py, firmware, frontend×6, HANDOFF.md) | v9 Tier 1+2: BMV080 warmup, zero rejection, sanity checks, shared WS, auto-scale charts, stale clear |
| `af795f0` | `backend/app/routers/firmware.py` | OTA semver comparison fix (backend) |
| `28fb220` | `esp32_vape_sensor_v3.ino`, `backend/app/detector.py` | PM2.5=0 acceptance + OTA client-side downgrade guard |
| `a5d339f` | `esp32_vape_sensor_v3.ino` | BMV080 FIFO drain fix — real-time PM2.5 readings during DEEP_SENSE |

### v10 Detection Flow (Verified Working)

```
Sensor in SNIFF (60s intervals, duty-cycle mode)
  → burstReadBMV080() drains stale FIFO, reads fresh burst
  → PM2.5 = 0 in clean air (valid, accepted for baseline)
  → Baseline tracks at ~0 μg/m³ in clean indoor air
  → Vape exhaled at sensor → PM2.5 spikes to 28-131 μg/m³
  → isLocalSpike() detects delta > 3.0 threshold
  → Firmware enters DEEP_SENSE
  → readAllSensors() drains FIFO each iteration → gets freshest PM2.5
  → 23 reads over 30s showing real decay curve (53→47→23→...→5)
  → deep_sense_complete → backend runs sanity checks + ML
  → ML outputs classification (currently 18% "uncertain" — models need retraining)
  → Cooldown heartbeat clears dashboard status
  → Back to SNIFF
```

### v10 Pipeline Status

| Component | Status |
|---|---|
| BMV080 sensor reads | **WORKING** — real-time PM2.5 values, 0 accepted as clean air |
| FIFO drain | **WORKING** — no more stale/frozen readings |
| Baseline calibration | **WORKING** — freezes at ~0 μg/m³ in clean air |
| Spike detection | **WORKING** — triggers DEEP_SENSE on delta > 3.0 |
| DEEP_SENSE data capture | **WORKING** — 23 reads with real decay curve |
| Backend sanity checks | **WORKING** — skips ML on garbage data |
| OTA updates | **WORKING** — semver comparison, v3.7.0 uploaded as active |
| ML model accuracy | **BROKEN** — 18% confidence, models trained on garbage data. **Tier 3 retraining is next.** |
| Dashboard display | **PARTIALLY WORKING** — data flows but shows "uncertain" due to bad models |

---

### TIER 3: Retraining (NOT YET DONE — pipeline now verified clean)

#### Why Existing Training Data Is Invalid

The current models (trained 2026-06-05) were trained on data collected through the same broken pipeline that Tier 1 fixes address:
- BMV080 warmup was too short → training vape events contain mostly zero/stale PM2.5 readings
- Zero readings were not filtered → models learned that "zeros + negative deltas = vape" instead of "elevated PM2.5 + humidity spike + gas drop = vape"
- 100% training accuracy with only 10 vape events and 2 clean_air windows → overfitting on garbage patterns
- No negative examples (vibration, gas drift, environmental changes) → model can't distinguish real events from noise
- Only 2 classes (vape, clean_air) → no cologne/hairspray/cleaning discrimination

**The models must be retrained from scratch after Tier 1 is deployed.**

#### Retraining Plan

**Step 1 — Deploy Tier 1 + Tier 2 fixes**
- Push backend changes to Railway (detector.py sanity checks + zero rejection)
- Push frontend changes to Vercel (shared WS, auto-scale charts, stale clear)
- Flash firmware v3.7.0 (BMV080 warmup, zero rejection, cooldown heartbeat)

**Step 2 — Verify clean data pipeline**
- Vape directly at the sensor, watch serial output
- Confirm: DEEP_SENSE samples show non-zero PM2.5 (e.g., 8-20 μg/m³, not 0)
- Confirm: `d_pm25_peak` is positive in the backend logs
- Confirm: baseline doesn't drift toward zero between events
- If PM2.5 still reads 0 during DEEP_SENSE, increase warmup further or investigate BMV080 hardware

**Step 3 — Collect fresh training data**
- **Vape events (20+ events recommended):**
  - Vape directly at sensor from ~6 inches away
  - Wait 2-3 minutes between events (let sensor return to baseline)
  - Vary vape duration and intensity (short puffs vs long draws)
  - Label each event in a new labels JSON file with start/end timestamps from serial output
- **Clean air (2-3 windows of 30+ minutes each):**
  - Sensor sitting idle in normal room conditions
  - Label as `clean_air` with start/end timestamps
- **Negative examples (important for false positive reduction):**
  - Physical bumps/vibration: bump the desk, shake the sensor (label as `clean_air` or new `vibration` class)
  - Environmental changes: open a window, turn on a fan, turn on HVAC (label as `clean_air`)
  - Gas drift: let the BME680 warm up from cold start, capture the natural 15-20min drift period (label as `clean_air`)
- **Other substances (if available):**
  - Cologne, hair spray, cleaning products (label as their respective classes)

**Step 4 — Train new models**
```bash
python backend/train_with_feature_engine.py \
  --labels-file backend/training/bmv080_v2_labels.json \
  --mongo-uri "mongodb+srv://allai:<pw>@vape-alert.xntahp3.mongodb.net/?appName=vape-alert" \
  --db-name vape-alert \
  --models-dir backend/models \
  --drop-first-n-vape 0 \
  --allowed-types "vape,clean_air"
```
If using multiple classes: `--allowed-types "vape,clean_air,cologne,hair_spray"`

**Step 5 — Validate**
- Check training accuracy per class (should be >85% on test set, not 100% which suggests overfitting)
- Verify feature importance — `d_pm25_peak`, `pm25_auc_above_base`, `pm25_rise_slope` should be top features for vape detection
- Deploy new models to Railway
- Test end-to-end: vape at sensor → DEEP_SENSE → ML prediction → dashboard shows >=40% confidence vape alert

#### Feature Order Note

`class_config.py:FEATURE_ORDER` currently has **35 features** (29 original + 6 new: `pressure_start`, `temp_humidity_ratio`, `gas_temp_interaction`, `pm25_decay_rate`, `gas_recovery_slope`, `pm_ratio_peak`). The current models were trained with the old 29-feature order; the ensemble predictor truncates to match (`X_input = X[:, :n_expected]`). When retraining, the new models will automatically use all 35 features since `train_with_feature_engine.py` uses the same `FeatureEngine.compute_features()` that produces 35 features. The 6 new features (decay dynamics, cross-sensor interactions) should improve discrimination between vape (fast PM decay, high PM ratio) and fire/cooking (slow decay, low PM ratio).

## 2c. What Was Fixed (v7 — 2026-06-05)

### Detection Not Triggering (BMV080 Threshold Mismatch) — PARTIALLY FIXED
- **Problem:** `LOCAL_SPIKE_THRESHOLD = 8.0` was calibrated for the PMS5003 sensor (which reports PM2.5 of 50-200+ during vape). The BMV080 reports much lower values (baseline ~4.7, vape peak ~8-20 μg/m³). Delta never exceeded 8.0, so the firmware never entered DEEP_SENSE and ML models never ran. All events showed "Normal 0.0%".
- **Fix (firmware):** Lowered `LOCAL_SPIKE_THRESHOLD` from 8.0 to 3.0. Made it remotely configurable via schedule endpoint (`spike_threshold` and `gas_drop_ratio` fields).
- **Fix (backend):** Lowered `D_PM25_SUS` from 10.0 to 3.0 and `SLOPE_SUS` from 2.0 to 0.5 in `config.py`.
- **Fix (backend):** Added server-side spike detection in the v3 `sniff` handler in `detector.py`. If the backend detects an elevated PM2.5 delta from a heartbeat, it sets `force_deep_sense=True` in the state and returns it in the POST response. The firmware reads this and enters DEEP_SENSE.
- **Fix (firmware):** Added `force_deep_sense` response handling in `postSensorData()`. When the server requests DEEP_SENSE, firmware wakes sensors, posts batch data, and enters STATE_DEEP_SENSE. Added state-change break check after `postSensorData()` to avoid sleeping.
- **Still open:** Lowering the threshold to 3.0 introduced false positives — see "Ghost Detection" section below.

### Ghost Signal False Positive — PARTIALLY FIXED
- **Problem:** After lowering threshold to 3.0, the gas drop ratio trigger (`LOCAL_GAS_DROP_RATIO = 0.85`) fires on natural BME680 drift even when PM2.5 = 0. Gas resistance can fluctuate 10-15% normally (e.g. 299.8 → 252.8 kΩ = ratio 0.843 < 0.85). With PM2.5 at 0 (failed sensor read), this fires DEEP_SENSE, collects 30s of zero PM data, and the ML model outputs "vape" at 20% confidence.
- **Fix (firmware v3.6.0 second flash):** `isLocalSpike()` now: (1) returns false immediately if `lastPM25 <= 0` (failed sensor read), (2) requires `deltaPM25 > 1.0` for gas-drop-only triggers.
- **Fix (frontend):** `getStatus()` in DeviceDetailPanel.js now requires `confidence >= 40%` for "Vape Detected" status. Below 40%, shows "Uncertain — Low confidence (X%)".
- **Still open:** Physical bumps (vibration) may cause the BMV080 MEMS mirror to produce momentary false PM2.5 spikes that exceed the 3.0 threshold — see full analysis below.

### Dashboard Zero-Data on deep_sense_complete — FIXED
- **Problem:** When firmware sends `deep_sense_complete`, the payload only has `device_id`, `org_id`, `duty_state`, `timestamp` — no sensor data. Backend sanitization coerced missing fields to 0.0 and broadcast a sensor_reading with all zeros, overwriting the dashboard.
- **Fix:** Added `_has_real_sensor_data` flag (checked before sanitization) and `duty_state != "deep_sense_complete"` guard in `sensors.py`. Zero-data payloads no longer trigger sensor_reading broadcasts.

### Firmware Bumped to v3.6.0
- `LOCAL_SPIKE_THRESHOLD`: 8.0 → 3.0 (non-const, remotely configurable)
- `LOCAL_GAS_DROP_RATIO`: remains 0.85 (now remotely configurable)
- `isLocalSpike()`: rejects PM2.5 ≤ 0, requires PM2.5 delta > 1.0 for gas-only trigger
- Added `force_deep_sense` command handling in POST response
- Added `spike_threshold` and `gas_drop_ratio` to `fetchSchedule()`
- State-change break after `postSensorData()` in SNIFF case

## 2d. Comprehensive Detection Pipeline Bug Analysis (2026-06-05)

This section documents all known issues with the detection pipeline end-to-end, from sensor read to dashboard display. Fixing these requires changes across firmware, backend, and frontend.

### Bug 1: BMV080 Frequently Returns 0 PM2.5 (Sensor Read Failures)

**Symptom:** Dashboard shows PM2.5 = 0 μg/m³ even though the air isn't clean. Chart shows sudden drops to 0 followed by recovery.

**Root cause:** The BMV080 uses duty cycle mode during SNIFF. On each sniff:
1. `wakeHeavySensors()` switches BMV080 from duty_cycle → continuous mode, waits 500ms
2. 2-second delay for "laser warmup"
3. `burstReadBMV080()` tries `BURST_TOTAL_READS` (5) reads, discarding first `BURST_DISCARD`

If the BMV080's internal measurement cycle hasn't completed within the 2.5s warmup, all reads return `false` → `lastPM25` stays at its previous value (or 0 from boot). During DEEP_SENSE, `readAllSensors()` calls `bmv.readSensor()` once per second — if it returns false, `lastPM25` keeps its stale value.

**Impact:** Zero PM2.5 readings corrupt:
- The baseline EWMA (drifts toward 0 over time)
- The ring buffer (batch_baseline data is zeros)
- DEEP_SENSE event windows (30 seconds of 0 → ML features are garbage)
- Dashboard display (shows 0 μg/m³)

**Fix needed:** In `burstReadBMV080()` and `readAllSensors()`, if no valid reading is obtained, keep the previous non-zero value instead of leaving `lastPM25` at 0. Alternatively, increase the BMV080 warmup delay or retry until a valid read is obtained.

### Bug 2: "12:00 AM" Ghost Timestamps

**Symptom:** Recent Events list shows multiple entries timestamped "12:00 AM" with 0 μg/m³ and 0.0% confidence, interleaved with correct timestamps.

**Root cause:** `getISOTimestamp()` in firmware (line 291-303) has a fallback:
```c
if (timesynced) { /* return ISO string */ }
return String(millis());  // e.g. "45000", "120000"
```
When `timesynced` is false (before NTP sync completes, or if NTP fails), timestamps are raw millisecond strings like `"45000"`. JavaScript's `new Date("45000")` interprets numeric strings as year numbers: year 45000, January 1, midnight → `fmtTime()` shows "12:00 AM". The `isNaN()` check doesn't catch it because it IS a valid (absurd) date.

This happens during:
- Device boot before NTP sync (STARTUP posts)
- After WiFi reconnection if NTP re-sync fails
- Ring buffer data cached before NTP sync (sent as `batch_baseline` on spike)

**Impact:** Dashboard history is polluted with phantom midnight entries. These entries also have PM2.5 = 0 (sensor wasn't ready during boot), making the chart look broken.

**Fix needed (firmware):** Change fallback to return an obviously invalid timestamp that the frontend can filter:
```c
return "1970-01-01T00:00:00.000Z";  // or don't POST at all until timesynced
```

**Fix needed (frontend):** In `fmtTime()`, reject dates before 2020:
```js
if (d.getFullYear() < 2020) return '';
```

### Bug 3: Physical Vibration Causes False Spike Detection

**Symptom:** User bumps the sensor with their leg → device enters DEEP_SENSE → ML predicts "vape" at low confidence → dashboard shows "Vape Detected".

**Root cause:** The BMV080's MEMS mirror is vibration-sensitive. A physical impact causes the mirror to oscillate, producing false particle counts for 1-2 readings. If the momentary false PM2.5 exceeds baseline by 3.0 μg/m³, `isLocalSpike()` triggers DEEP_SENSE. The subsequent 30 seconds of real data show PM2.5 = 0 (no actual particles), but the ML model still outputs a classification.

**How it manifests:** The ML model receives features with baseline ~5 μg/m³ and event window ~0 μg/m³ (negative delta). It was never trained on this pattern (vibration-caused zero data). Instead of classifying as "normal", the model may output "vape" at low probability (~20%) because its training data didn't include this degenerate case. Since `MIN_TOP_PROB = 0.40`, these events are flagged as "uncertain" by the backend, but the frontend was treating ANY `predictedClass === 'vape'` as "Vape Detected" regardless of confidence. (Frontend fix applied — now requires ≥40% confidence.)

**Fix needed (firmware):** Require sustained elevation, not a single-sample spike. For example:
- Require 2 consecutive sniffs above threshold before triggering DEEP_SENSE
- Or add a secondary burst read to confirm the spike before entering DEEP_SENSE
- Or raise `LOCAL_SPIKE_THRESHOLD` to 5.0 (trades off detection sensitivity for fewer false positives)

**Fix needed (ML):** Retrain models with "vibration/bump" as a negative class, or add a pre-inference sanity check: if `d_pm25_peak` is negative (event PM2.5 < baseline PM2.5), skip ML and classify as "normal".

### Bug 4: "Vape Detected" Status Sticks for 50-80 Seconds

**Symptom:** After a detection event (real or false), the dashboard shows "Vape Detected" for over a minute, then reverts to "Normal".

**Root cause:** After DEEP_SENSE completes, the firmware enters COOLDOWN (20s of sleep) → then SNIFF (next heartbeat up to 60s later). During this 50-80s window, no sensor_reading broadcasts are sent to the dashboard. The last broadcast was the event prediction (e.g., "vape" at 20%), which stays in the frontend's `sensorData.predictedClass` until a new broadcast overwrites it.

**Impact:** False positives feel worse because they linger on screen.

**Fix options:**
- Send a "normal" sensor_reading broadcast when entering COOLDOWN
- Or have the frontend auto-clear detection status after COOLDOWN_SEC + a grace period
- Or send a heartbeat during COOLDOWN

### Bug 5: DEEP_SENSE Collects 30 Seconds of Bad Data (Garbage In → Garbage Out)

**Symptom:** After a false trigger, the ML model runs on 30 seconds of near-zero PM2.5 data and still produces a classification (usually "vape" at ~20% or "normal").

**Root cause:** During DEEP_SENSE, `readAllSensors()` calls `bmv.readSensor()` once per second. If the BMV080 returns false (no new data ready), `lastPM25` keeps its previous value. For a false trigger (vibration spike → actual PM2.5 = 0), the 30-second window is filled with ~0 PM2.5, humidity/gas from the BME680 (which is fine), and stale PM values.

The ML feature engine computes:
- `d_pm25_peak` = 0 - 5 = **-5** (negative delta — impossible for real vape)
- `pm25_auc_above_base` = 0 (no area above baseline)
- `pm25_rise_slope` = negative

These features are physically impossible for a vape event. The model wasn't trained on this pattern, so its output is unpredictable.

**Fix needed (backend):** Add a pre-inference sanity check in `_v3_make_decision()` and `_make_decision()`: if `d_pm25_peak <= 0` (PM2.5 peak is at or below baseline), skip ML inference and return `{"status": "confirmed", "top_class": "normal", "top_prob": 1.0}`. Real vape events ALWAYS produce a positive PM2.5 delta.

### Bug 6: Training Data Quality

**Context:** Models were retrained on 2026-06-04/05 with BMV080 data. Training labels are in `backend/training/bmv080_labels.json`.

**Issues:**
- Only 10 of 22 labeled vape events produced training windows (June 4 events). The 12 June 5-6 events had 0 windows — their data either wasn't in MongoDB or timestamps didn't align.
- Vape events were spread over 2 days with hours-long gaps between sessions. Within a session, events were 2-10 minutes apart. The training script uses a 60-second window around each labeled time, which is correct — but the models have only seen 10 distinct vape events.
- No negative-class training data exists for: physical vibration, BME680 gas drift, BMV080 read failures, or environmental changes (door opening, HVAC cycling). The models cannot distinguish these from vape.
- Only "vape" and "clean_air" classes. No cologne, hair spray, cleaning product data with BMV080 yet.

**Recommendation:** Before retraining, collect labeled data for:
1. Physical bumps/vibration (shake sensor, bump desk)
2. Environmental changes (open window, turn on fan)
3. Spray events (cologne, cleaning products)
4. Then retrain with `--allowed-types "vape,clean_air,vibration,environmental"` (or fold vibration/environmental into clean_air)

### Summary: What Happens During a Ghost Detection (End-to-End)

1. **Trigger:** BMV080 MEMS mirror vibrates from leg bump → one burst read reports PM2.5 = 3-5 μg/m³ above baseline → OR → BME680 gas resistance drifts 15% (natural) while PM2.5 = 0
2. **`isLocalSpike()` returns true** → firmware enters DEEP_SENSE
3. **30 seconds of DEEP_SENSE:** BMV080 reads at 1Hz. Most/all reads return false (no actual particles). `lastPM25` stays at 0. BME680 data is real. 30 samples with PM2.5=0 are POSTed and stored in MongoDB.
4. **`deep_sense_complete`:** Firmware sends minimal payload. Backend runs ML inference on 30 samples of 0 PM2.5 vs baseline of ~5 PM2.5. Features are degenerate (negative deltas, zero AUC).
5. **ML output:** Model predicts "vape" at 20% (garbage-in-garbage-out). Backend marks as "uncertain" (below 40% threshold) but still stores the event with `top_class: "vape"`.
6. **Dashboard:** `sensor_reading` broadcast during DEEP_SENSE set `predictedClass = "vape"` and `confidence = 20.1`. Frontend showed "Vape Detected" (now fixed to show "Uncertain" below 40%). PM2.5 cards show 0. Chart drops to 0.
7. **COOLDOWN + next SNIFF (50-80s):** No new broadcasts. Dashboard stays stuck on "Vape Detected" / 0 PM2.5.
8. **Next heartbeat:** Sends real PM2.5 (~5 μg/m³), `prediction.type = "normal"`. Dashboard recovers.
9. **History pollution:** 30 entries with PM2.5=0 remain in MongoDB and show up in the dashboard's "Recent Events" and chart indefinitely.

## 4. What's Still Open

### OTA Firmware Updates — SCAFFOLDED, UNTESTED
- Backend firmware endpoints fully built (`/api/firmware/upload`, `/latest`, `/download/{id}`).
- Firmware v3.4.1 binary **already uploaded** to backend (MongoDB `firmware` collection, marked `is_active: true`).
- Device checks OTA on boot and every 24h (`OTA_CHECK_INTERVAL = 86400000`).
- `checkForOTA()` in firmware: GETs `/api/firmware/latest`, compares versions, downloads .bin via `httpUpdate`.
- **Not yet tested end-to-end.** Next version bump would be a good chance to test — upload new .bin to backend, reboot device, confirm it OTA updates.
- Arduino build cache .bin location: `C:\Users\mrjra\AppData\Local\arduino\sketches\CF341153942BCAF4E67D3DE6F14904CF\esp32_vape_sensor_v3.ino.bin`
- Upload command: `curl -X POST "https://vapegaurd-production.up.railway.app/api/firmware/upload" -F "file=@<path>.bin;filename=firmware_vX.Y.Z.bin" -F "version=X.Y.Z" -F "changelog=..."`

### BLE Provisioning — BROKEN, NEEDS SPECIALIST ⚠️

**What it should do:** On first boot (no NVS WiFi creds), device advertises as `MISTIO-58E6C5F5B9CC` over BLE. Dashboard (React/Web Bluetooth) connects and writes SSID, PASS, ORG to three GATT characteristics. Device saves to NVS, connects WiFi, and continues normally. On future boots, NVS creds are loaded and BLE is skipped.

**Current symptom:** Device advertises correctly (confirmed in Chrome scan). Chrome connects, dashboard completes the provisioning flow and shows "registered". But the ESP32 **never receives any writes** — none of the `[BLE] Received SSID/PASS/ORG` serial lines ever print. Device stays stuck in the BLE wait loop forever.

**Dashboard-side error:** Chrome Web Bluetooth reports `"GATT Server is disconnected. Cannot perform GATT operations."` — meaning the BLE connection drops before or during the GATT write attempt.

**Serial output on boot (no NVS creds):**
```
[BLE] Heap before init: 265652
[BLE] Advertising as: MISTIO-58E6C5F5B9CC (heap: 237752)
[BLE] No WiFi creds — waiting for BLE provisioning...
<nothing after this, even during provisioning attempt>
```
Not even `[BLE] Client disconnected, re-advertising` prints, suggesting the `onDisconnect` server callback isn't firing either.

**What was tried and didn't work:**
1. `volatile bool bleProvisioned` — fixes compiler register-caching of the flag across FreeRTOS tasks. Correct fix but didn't resolve the underlying connection drop.
2. Clearing Chrome's remembered BLE devices at `chrome://settings/content/bluetoothDevices` — ruled out stale GATT handle cache.
3. Splitting advertisement into main adv (service UUID only, 21 bytes) + scan response (name only, 20 bytes) — fixed the 31-byte advertisement packet overflow that was caused by cramming name+128-bit UUID into one packet (38 bytes). Did not fix the GATT disconnect.

**Key code locations in `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino`:**
- BLE GATT write callbacks: lines ~1349–1368 (`BLEProvisionCallback::onWrite`)
- Server disconnect callback: lines ~1370–1375 (`MistioBLEServerCB::onDisconnect`)
- `startBLEProvisioning()`: lines ~1377–1419 — initializes NimBLE, creates service + 3 write characteristics, starts advertising
- `stopBLEProvisioning()`: lines ~1421–1438 — stops advertising, disconnects clients, **does NOT call `NimBLEDevice::deinit(true)`** (that crashes ESP32-C6 with Store access fault)
- `checkBLEProvisioning()`: lines ~1440–1485 — saves creds to NVS, connects WiFi
- BLE wait loop in `setup()`: lines ~418–426

**NimBLE service/characteristic layout:**
```
Service:    6E400001-B5A3-F393-E0A9-E50E24DCCA9E
SSID char:  6E400002-...  WRITE | WRITE_NR
PASS char:  6E400003-...  WRITE | WRITE_NR
ORG char:   6E400004-...  WRITE | WRITE_NR
```

**Dashboard Web Bluetooth code:** `frontend/src/components/AddDeviceModal.js` lines 36–141
- Uses `navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'MISTIO-' }], optionalServices: [BLE_SERVICE_UUID] })`
- Calls `device.gatt.connect()` → `getPrimaryService()` → `getCharacteristic()` → `writeValue()` for each of the 3 chars
- If writes succeed, calls `/api/devices/register` on backend (this succeeds — device shows on dashboard)
- The writes resolve without throwing (Chrome thinks they succeeded) but ESP32 never sees them

**Hypotheses not yet ruled out:**
- NimBLE connection parameter negotiation failure on ESP32-C6 RISC-V (connection interval/supervision timeout rejected by Chrome's BLE stack → immediate disconnect)
- `NimBLEServerCallbacks::onDisconnect` signature mismatch with the installed NimBLE-Arduino version (NimBLE 2.x changed the signature to `onDisconnect(NimBLEServer*, NimBLEConnInfo&, int reason)` — if the compiled library uses 2.x, the old 1.x callback never fires, and reconnect-after-disconnect never happens)
- Chrome Web Bluetooth doing an ATT write to a handle that NimBLE auto-responded to (with success) without invoking the application callback — i.e., NimBLE version-specific GATT write handling bug
- ESP32-C6 (RISC-V) + Arduino-esp32 3.x NimBLE task priority or stack size issue where the GATT response task doesn't get enough CPU before Chrome's connection timeout

**Board/environment:**
- Board: Adafruit Feather ESP32-C6 (RISC-V, single-core)
- Arduino-esp32 core: 3.x (exact version unknown — check Arduino IDE boards manager)
- NimBLE-Arduino library version: unknown — check Arduino IDE library manager
- Firmware: v3.4.3

### MSA311 Frozen Values — MITIGATED
- Raw I2C reads + auto re-init after 10 frozen reads. May still occur but now recovers automatically instead of staying stuck.

### ~~Frontend Not Yet Deployed~~ — DEPLOYED (v10)
- All frontend changes (shared WS, auto-scale charts, stale clear, confidence gates) pushed to `main` and auto-deployed to Vercel.

## 5. Current Firmware State (v3.7.0, FLASHED AND RUNNING)

### Key Config
```
FIRMWARE_VERSION = "3.7.0"
WARMUP_SEC = 45, CALIBRATION_SEC = 15 (60s total STARTUP)
sniffIntervalMs = 60000 (60s between sniffs)
heartbeatInterval = 1 (POST every sniff)
deepSenseSec = 30, cooldownSec = 20
TAMPER_THRESHOLD = 6.0
HTTP_TIMEOUT_MS = 8000
WDT_TIMEOUT_SEC = 60
POST_DEAD_MS = 300000 (5 min)
HEAP_MIN_BYTES = 30000
BATT_PIN = 1 (A1, voltage divider 2:1)
WiFi NVS override: sweethome (CHANGE BEFORE SCHOOL DEPLOY)
BMV080 warmup: 3000ms in wakeHeavySensors() + 3000ms SNIFF delay
PM2.5 = 0 accepted: valid clean-air reading (was rejected as "sensor not ready")
BMV080 FIFO drain: readAllSensors() drains all buffered readings, uses freshest
DEEP_SENSE delay: 100ms (was 1000ms; HTTP POST already takes ~1s)
burstReadBMV080(): drains stale FIFO before burst, delay before each read
OTA semver guard: client-side check prevents downgrade to older firmware
Cooldown heartbeat: one POST at COOLDOWN start to clear dashboard immediately
```

### Architecture
- **WiFi modem sleep (MIN_MODEM)** — radio sleeps between DTIM beacons, WiFi stays associated. ~15-20mA idle.
- **BMV080 duty cycle mode** — laser pulses every ~30-60s during SNIFF, continuous during STARTUP/DEEP_SENSE.
- **Tamper via raw I2C polling** — reads MSA311 registers directly every 1s during idleSleep(). Auto re-inits on frozen values.
- **Watchdog (60s)** — reboots on any hang (I2C lockup, TLS stuck).
- **Health monitors** — POST dead timer (5 min) + heap guard (30KB) trigger soft reboot.
- **Global `WiFiClientSecure secClient`** — reused for all HTTPS POSTs, `secClient.stop()` before each new connection.
- **BLE provisioning BROKEN** — NimBLE initializes and advertises but GATT writes never reach callbacks. See Section 4 for full bug report.

### Self-Healing Summary
| Guard | Trigger | Recovery |
|---|---|---|
| Watchdog (60s) | I2C bus lockup, TLS hang, any freeze | Hard reboot |
| POST dead timer (5 min) | WiFi permanent drop, heap leak kills TLS | Soft reboot via `ESP.restart()` |
| Heap guard (30KB) | TLS memory leak | Soft reboot before hard crash |
| I2C timeout (100ms) | MSA311 holds SDA low | Skips read, continues |
| MSA311 frozen detection (10 reads) | Library returning stale data | Auto re-init sensor |

### Power Budget (estimated)
```
ESP32 + WiFi modem sleep idle: ~18mA
BMV080 duty cycle (avg):       ~0.5-1mA
BME680 idle (forced mode):     ~0.15mA
MSA311:                        ~0.01mA
Sensor board LEDs (3x):        ~3-6mA (hardwired, can't disable in software)
Total idle:                    ~22-25mA
Active sniff + POST (7s/60s):  ~80mA

Average: ~25-30mA
40Ah battery, 8h school day: ~165-200 school days
```

### Compile & Flash
```bash
cd "C:/Users/mrjra/OneDrive - MSFT/Vape Project"
./arduino-cli.exe compile --fqbn "esp32:esp32:esp32c6:PartitionScheme=min_spiffs,CDCOnBoot=cdc" esp32_vape_sensor_v3/
./arduino-cli.exe upload -p COM4 --fqbn "esp32:esp32:esp32c6:PartitionScheme=min_spiffs,CDCOnBoot=cdc" esp32_vape_sensor_v3/
```

### Serial Monitor (PowerShell)
```powershell
powershell -ExecutionPolicy Bypass -File serial_read.ps1
```

## 6. Key Decisions This Session

| Decision | Rationale |
|---|---|
| Watchdog 60s timeout | Long enough for TLS handshake + POST (8s timeout), short enough to recover from hangs quickly. |
| POST dead timer 5 min | 5 sniff cycles worth of grace. If 5 consecutive POSTs fail, something is fundamentally broken. |
| Heap guard 30KB | WiFiClientSecure needs ~40KB for TLS. Below 30KB, TLS can't allocate and all POSTs fail anyway. |
| Tamper threshold 12.0 | Real-world testing: 1.0-5.0 triggered from fans, bumps, air. 12.0 (~1.2g deviation) requires vigorous shaking. |
| Raw I2C for tamper | Adafruit_MSA301 library returned frozen values for MSA311. Raw register reads are more reliable. |

## 7. Dashboard Bug Analysis (v4 session — NOT YET FIXED)

Deep analysis of all dashboard issues was completed. The following bugs were identified with root causes and exact fixes. **Implement in order — backend fixes (#1) unblock most frontend symptoms.**

### Backend Bugs

**BUG B1 — Double WebSocket broadcast (HIGHEST PRIORITY)**
- **File:** `backend/app/routers/sensors.py` lines 133 + 186
- **Problem:** Every sensor POST fires two broadcasts: `broadcast_event("sensor_data", event_doc)` at line 133 AND `broadcast_sensor_reading(device_id, sensor_reading)` at line 186. Frontend receives two `sensor_data` messages per reading — causes double re-renders, flickering gauges, and double history entries.
- **Fix:** Change line 133 from `broadcast_event("sensor_data", event_doc)` to `broadcast_event("event_update", event_doc)`. Then in `frontend/src/pages/Devices.js` and `NotificationController.js`, add `event_update` as a handled message type that updates status/class but NOT sensorData values (those come from `sensor_reading`). The `sensor_reading` broadcast at line 186 is the clean one — keep it as-is for live charts.

**BUG B2 — GET /sensor-data limit still 50 (was only partially fixed)**
- **File:** `backend/app/routers/sensors.py` line 272
- **Problem:** `get_sensor_data(limit: int = 50)` — default was changed to 200 in this session for one endpoint but the polling endpoint used by Devices.js may still hit the 50-item cap.
- **Fix:** Confirm `limit=200` is the default; already done for sensor-data endpoint.

**BUG B3 — MSA311 scale factor was wrong (FIXED this session)**
- `9.81/1024` → `9.81/512`, TAMPER_THRESHOLD 12→6. Confirmed working.

**BUG B4 — BLE crash on shutdown (FIXED this session)**
- Removed `NimBLEDevice::deinit(true)`. No more Guru Meditation on BLE disable.

### Frontend Bugs

**BUG F1 — Stale closure: `devices` in `handleWebSocketMessage` deps**
- **File:** `frontend/src/pages/Devices.js` line 385
- **Problem:** `useCallback([devices, updateDeviceStatus])` — `devices` in the dependency array means `handleWebSocketMessage` is recreated every time `devices` state changes. Since `useWebSocket` re-registers `onMessage` on each new ref, this causes the WS handler to re-subscribe repeatedly, dropping messages mid-cycle. Also causes unnecessary `deviceFromState` stale reads.
- **Fix:** Replace `devices` dep with a ref:
  ```js
  const devicesRef = useRef(devices);
  useEffect(() => { devicesRef.current = devices; }, [devices]);
  // In handleWebSocketMessage: const deviceFromState = devicesRef.current.find(d => d.id === deviceId);
  // Remove `devices` from useCallback deps → useCallback([updateDeviceStatus])
  ```

**BUG F2 — fmtTime returns "12:00 AM" for invalid timestamps**
- **File:** `frontend/src/components/DeviceDetailPanel.js` line 20
- **Problem:** `const fmtTime = (ts) => new Date(ts).toLocaleTimeString(...)` — when `ts` is `undefined`, `null`, or malformed, `new Date(undefined)` is `Invalid Date` and `.toLocaleTimeString()` returns `"12:00 AM"` (browser-dependent). Shows phantom 12:00 AM data points on charts.
- **Fix:**
  ```js
  const fmtTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  ```

**BUG F3 — `confidence` renders as `undefined%` in history table**
- **File:** `frontend/src/components/DeviceDetailPanel.js` line 394
- **Problem:** `{h.confidence}%` — when `h.confidence` is undefined, renders as `undefined%`.
- **Fix:** `{(h.confidence ?? 0).toFixed(1)}%`

**BUG F4 — `selectedDevice` goes stale after polling**
- **File:** `frontend/src/pages/Devices.js` around line 203
- **Problem:** `selectedDevice` is set via `setSelectedDevice(device)` on click, but polling calls `setDevices(newData)` which creates new device objects. `selectedDevice` still points to the old object reference. WS does sync it (line 374-382) but polling does not — so after each 5s poll, `selectedDevice` lags until next WS message.
- **Fix:** Add a useEffect that re-syncs selectedDevice from the devices array after each poll:
  ```js
  useEffect(() => {
    if (!selectedDevice) return;
    const updated = devices.find(d => d.id === selectedDevice.id);
    if (updated) setSelectedDevice(prev => ({ ...prev, ...updated }));
  }, [devices]);
  ```

**BUG F5 — Duplicate WebSocket connections (Devices.js + NotificationController.js)**
- **Files:** `frontend/src/pages/Devices.js` line 387, `frontend/src/components/NotificationController.js` line 245
- **Problem:** Both components open `useWebSocket('/ws/events', ...)` independently. Two separate WS connections to the same endpoint per client. Doubles server load; can cause messages to be handled by only one of the two handlers.
- **Fix:** Create a shared WS context (`WebSocketContext.js`) — single connection, multiple subscribers via context. Or: move all WS handling into `Devices.js` and pass alert triggers up/down via props or Zustand.

**BUG F6 — NotificationController 5s polling is redundant and conflicts**
- **File:** `frontend/src/components/NotificationController.js` line 177
- **Problem:** `setInterval(checkDevices, 5000)` polls `devices` from props every 5s to check for vape/fire. But Devices.js also polls every 5s (`setInterval(refreshDevices, 5000)` at Devices.js line 244). NotificationController reads `devices` from props which is passed from Devices.js — it's already updated by the Devices.js poll + WS. The NotificationController interval just re-checks already-stale data. It doesn't actually re-fetch — it reads from the `devices` prop, so this loop does nothing useful.
- **Fix:** Remove the `setInterval(checkDevices, 5000)` entirely. Handle all notification triggers inside `handleWebSocketMessage` (already done for WS path). The 5s poll logic (lines 140-178) can be deleted.

**BUG F7 — Polling wipes WebSocket sensor data (FIXED this session)**
- `useDevices.js` `fetchDevices` now merges by timestamp instead of `setDevices(data)`. Fixed.

**BUG F8 — `|| 0` turns undefined sensor values into 0 (FIXED this session)**
- `deviceService.js` now uses `?? undefined` for all sensor fields. Fixed.

**BUG F9 — MSA311 TAMPER_THRESHOLD and scale factor (FIXED this session)**
- Scale `9.81/1024` → `9.81/512`, threshold 12→6. Confirmed working on device.

### Fix Priority Order
1. **B1** (double broadcast) — eliminates most flickering and double-render issues
2. **F1** (stale closure) — stops handler churn on every state update  
3. **F2** (fmtTime) — kills the 12:00 AM phantom data points
4. **F4** (selectedDevice sync) — panel stops lagging after polls
5. **F3** (confidence) — cosmetic
6. **F5+F6** (duplicate WS + redundant poll) — cleanup, reduces server load

## 2g. What Was Done (v11 — 2026-06-09)

### Session Summary

Tier 3 training attempt. Built training tools, discovered most training data was wasted (8/12 events produced 0 windows), partially retrained on 4 good events, fixed offline device status bug.

---

### Fix V11-1: Offline Devices Showing Stale Vape Alert — FIXED

- **Problem:** When a device showed "vape" status and then went offline (turned off), the dashboard still displayed it with a red "Alert" indicator. The `getStatusClass()` function checked for vape/alarm BEFORE checking offline status, so stale `predictedClass: 'vape'` in frontend state took priority over the device being offline.
- **Fix:** Moved the offline check (`status === 'offline' || isOnline === false`) to the top of both `getStatusClass()` in `DeviceList.js` and `getDevStatusClass()` in `Devices.js`, before any alarm/vape checks.
- **Files:** `frontend/src/components/DeviceList.js`, `frontend/src/pages/Devices.js`
- **Commit:** `4fd5e7b` — pushed to main, auto-deployed to Vercel.

### Fix V11-2: Sniff Debug Line Never Printing — FIXED (firmware)

- **Problem:** With `heartbeatInterval = 1`, the condition `sniffCount % 1 == 0` is always true, so every sniff took the heartbeat POST path. The `Sniff #N: PM2.5=X.X (base=Y.Y, d=Z.Z)` debug line was in the `else` branch and NEVER executed. Serial monitor and `serial_plot.py` couldn't see PM2.5 values during SNIFF — only gas resistance data from STARTUP was visible.
- **Fix:** Moved the Sniff debug print to always execute after the burst read, before the heartbeat/spike check. Now every sniff prints sensor values to serial regardless of heartbeat interval.
- **Files:** `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino` — STATE_SNIFF case
- **Flashed** to device on 2026-06-09.

### Tier 3 Training Attempt — PARTIAL (4/12 events captured)

- **Labels file:** `backend/training/bmv080_v2_labels.json` — 12 vape events + 1 clean air window from 2026-06-09 training session.
- **Result:** Only 4 of 12 vape events produced training windows. Events 006-012 (midnight onward) all produced 0 windows — sensor was likely offline/disconnected during that period.
- **Models trained on 4 events:** 68 total windows (61 vape + 7 clean_air). RF: 92.9%, XGB: 92.9%, LR: 100%. Models saved to `backend/models/`. Better than the old garbage models but need more data.
- **Key insight:** With 60-second sniff intervals, vape clouds (~25s duration) are missed ~50% of the time if the user doesn't time it with the sniff cycle. Training must be done by watching for DEEP_SENSE trigger confirmation before labeling an event.

### Training Monitor Tool — CREATED

- **File:** `training_monitor.py` — Tkinter GUI that connects to COM3 serial, shows sensor state with visual indicators, auto-records timestamps when DEEP_SENSE triggers, and saves labels JSON on quit.
- **Features:**
  - Big colored circle: grey=waiting, green=sniffing, red=DEEP_SENSE, orange=cooldown
  - Countdown timer to next sniff (so user knows when to vape)
  - "VAPE NOW!" prompt when ~20s before next sniff
  - Auto-logs event timestamps when DEEP_SENSE triggers
  - Saves `backend/training/bmv080_v2_labels.json` on quit with clean air windows
- **Usage:** `python training_monitor.py` — vape when it says "VAPE NOW!", wait for red circle confirmation, Ctrl+C or Save button when done.

### v11 Files Changed

| File | Changes |
|---|---|
| `frontend/src/components/DeviceList.js` | Offline check moved before alarm check |
| `frontend/src/pages/Devices.js` | Same offline-first fix in `getDevStatusClass()` |
| `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino` | Sniff debug print always executes (moved before heartbeat check) |
| `training_monitor.py` | NEW — Tkinter training GUI with countdown + auto-labeling |
| `backend/training/bmv080_v2_labels.json` | Updated with v2 training session labels |

### v11 Training Workflow

```
1. Run: python training_monitor.py
2. Wait for green "SNIFFING" state
3. Watch countdown — when "VAPE NOW!" appears, exhale at sensor
4. If circle turns RED → event captured (auto-logged)
5. If nothing happens → sniff missed it, try again next cycle
6. Repeat until 15-20+ confirmed events
7. Save & Quit → labels JSON saved automatically
8. Leave sensor idle 30 min (clean air window)
9. Run training: python backend/train_with_feature_engine.py \
     --labels-file backend/training/bmv080_v2_labels.json \
     --mongo-uri "..." --db-name vape-alert \
     --models-dir backend/models \
     --drop-first-n-vape 0 --allowed-types "vape,clean_air"
```

### Current Model Status

- **Models in `backend/models/`:** Trained 2026-06-09 on 4 clean vape events (68 windows). RF/XGB 92.9%, LR 100%.
- **Improvement over v10:** Models now trained on real PM2.5 data (not zeros/stale readings). But only 4 events — need 15-20+ for robustness.
- **Not yet deployed to Railway** — deploy after collecting more training data.
- **IMMEDIATE NEXT STEP:** Run another training session using `training_monitor.py`, collect 15-20 confirmed DEEP_SENSE events, retrain, then deploy.

---

## 2h. What Was Done (v12 — 2026-06-13)

### Session Summary

Fundamentally redesigned the training data collection approach. The old workflow relied on the firmware's spike detection to gate data capture — a chicken-and-egg problem where you needed a working detector to collect data to train the detector. New approach: firmware runs in permanent 1Hz mode, user manually labels events via GUI.

---

### Training Mode Firmware — ADDED

- **Problem:** With 60s SNIFF polling, vape clouds (~25s duration) were missed ~50% of the time. The training monitor relied on the firmware entering DEEP_SENSE to capture events, but the spike detector missed most vapes. Months of training attempts failed because of this circular dependency.
- **Solution:** Added `#define TRAINING_MODE 0` compile flag to firmware. When set to `1`:
  - Skips WiFi/BLE entirely (no network needed)
  - Runs permanent 1Hz sensor reads via `readAllSensors()`
  - Prints `SENSOR: T=x H=x P=x G=x PM1=x PM25=x PM10=x` every second
  - Prints `WARMUP: N/45` during first 45 seconds, then `READY:` message
  - LED: orange flash during warmup, solid green when ready
  - No state machine, no spike detection, no sleep
  - Watchdog still fed, keepalive pulse still runs (power bank support)
- **To flash training mode:** Set `TRAINING_MODE` to `1`, compile + upload
- **To return to production:** Set `TRAINING_MODE` to `0`, compile + upload
- **Build command (CDC must be enabled for serial):**
  ```bash
  ./arduino-cli.exe compile --fqbn "esp32:esp32:adafruit_feather_esp32c6:CDCOnBoot=cdc" esp32_vape_sensor_v3/
  ./arduino-cli.exe upload --fqbn "esp32:esp32:adafruit_feather_esp32c6:CDCOnBoot=cdc" --port COM3 esp32_vape_sensor_v3/
  ```
- **Files:** `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino` — `TRAINING_MODE` define, `#if` blocks in `setup()` (skip WiFi) and `loop()` (continuous reads)

### Training Collector v3 — CREATED

- **File:** `training_collector.py` — Tkinter GUI for manual-label data collection
- **Key difference from v2:** User controls labeling (press button when vaping), not the firmware's spike detector
- **Features:**
  - Auto-detects COM port or accepts `--port COM5`
  - Live sensor bar charts (PM2.5, PM1, PM10, Gas, Humidity, Temp)
  - Big toggle button: MARK VAPE EVENT → STOP (with elapsed timer)
  - Auto-labels non-event periods as "normal" training data
  - Event log with duration, peak PM2.5, baseline PM2.5
  - TRAIN MODELS button — runs `FeatureEngine.compute_features()` (same as runtime), trains RF/XGB/LR, saves to `backend/models/`
  - SAVE & QUIT — saves raw session to `backend/training/serial_captures/`
  - Warmup detection from firmware WARMUP:/READY: messages
- **Training pipeline:**
  - Vape events: slides 20s windows through each labeled event with 5s step, using 10s before event start as baseline
  - Clean air: slides 30s windows (10s baseline + 20s event) through non-event gaps
  - Uses `FeatureEngine.compute_features()` — exact same code as runtime inference
  - Trains with balanced class weights + sample weighting
- **Usage:** `python training_collector.py --port COM3`

### Retrain From Sessions Script — CREATED

- **File:** `train_from_session.py` — CLI tool to retrain from saved session JSON files
- **Usage:** `python train_from_session.py backend/training/serial_captures/session_*.json`
- **Combines multiple sessions** for a larger dataset without requiring the sensor to be connected

### Training Tips Learned

- **Don't hotbox the sensor** — vape from 1-2 feet away, exhale toward sensor
- **Space events 3-5 min apart** — let PM2.5 return to baseline (<10) between events
- **Ventilate between sessions** — if ambient PM2.5 stays elevated, clean air data is contaminated
- **15-20 events minimum** — with sliding window augmentation, produces ~100+ training windows
- **Watch for external PM sources** — incense, cooking, dust can spike readings and corrupt clean air labels

### v12 Key Discovery: CDCOnBoot Required

- The Adafruit Feather ESP32-C6 board defaults to `CDCOnBoot=default` (disabled), which means `Serial` output over USB-Serial/JTAG doesn't work
- Must compile with `CDCOnBoot=cdc` flag for serial output
- Previous sessions may have had this set via Arduino IDE board settings but not documented
- **This is now documented in the compile command above**

### v12 Files Changed

| File | Changes |
|---|---|
| `esp32_vape_sensor_v3/esp32_vape_sensor_v3.ino` | `TRAINING_MODE` define + `#if` blocks in setup()/loop() for continuous 1Hz mode. Currently set to `1` (training mode). |
| `training_collector.py` | NEW — Manual-label training collector GUI |
| `train_from_session.py` | NEW — Retrain models from saved session JSON files |

### v12 Current State

- **Firmware:** Flashed with `TRAINING_MODE 1` — sensor running permanent 1Hz, no WiFi
- **Training data collected:** 0 events (session lost to process kill, restarted fresh)
- **IMMEDIATE NEXT STEP:** Collect 15-20 vape events using `training_collector.py`, train models, flash back to production (`TRAINING_MODE 0`), deploy models to Railway

### v12 Training Workflow

```
1. Firmware already flashed with TRAINING_MODE=1
2. python training_collector.py --port COM3
3. Wait 45s for warmup (orange → green)
4. Vape from 1-2 feet away → click MARK VAPE EVENT → wait 25-30s → click STOP
5. Wait 3-5 min between events (let PM2.5 drop below 10)
6. Repeat for 15-20 events
7. Click TRAIN MODELS
8. Set TRAINING_MODE back to 0 in firmware, reflash:
   ./arduino-cli.exe compile --fqbn "esp32:esp32:adafruit_feather_esp32c6:CDCOnBoot=cdc" esp32_vape_sensor_v3/
   ./arduino-cli.exe upload --fqbn "esp32:esp32:adafruit_feather_esp32c6:CDCOnBoot=cdc" --port COM3 esp32_vape_sensor_v3/
9. Upload models to Railway
10. Test end-to-end
```

---

## 2i. What Was Done (v13 — 2026-06-21)

### Session Summary

Complete landing page copy rewrite around three USPs + Next.js migration for SEO + blog system with 7 comparison/guide posts.

---

### Landing Page Copy Rewrite — DONE

Rewrote all website copy in `mistio-web/` around three real USPs that differentiate Mistio from every competitor:

1. **Battery-powered for 1 full year** — only vape detector on the market with year-long battery life
2. **Zero false alarms** — AI trained on cologne, deodorant, cleaning spray, hair spray
3. **Fastest install** — two screws, under one minute, no electrician/IT/wiring

**Files rewritten (in `mistio-web/`):**
- `Hero.tsx` — headline: "The only vape detector that runs on battery for 1 full year."
- `bounce-card-features.tsx` — 4 cards: 1-Year Battery, Zero False Alarms, 3-Second Install, Built for Schools
- `interactive-image-accordion.tsx` — "The Problem With Current Detection" (5 competitor pain points)
- `VideoTestimonials.tsx` — "What Happens After You Switch" + stats (1 Year / 3 Sec / 0 Wires)
- `ComparisonDemo.tsx` — "Their Setup vs. Ours"
- `HeroScrollDemo.tsx` — "Every alert, every location. One Dashboard."
- `ContactSection.tsx` — "See It For Yourself" with Calendly embed
- `stacked-circular-footer.tsx` — updated copyright, blog link

### Next.js Migration — DONE

Created `mistio-web-next/` with full Next.js 16 app (App Router, Tailwind v4, SSG).

**Why:** The old Vite SPA rendered client-side only — Google saw an empty `<div id="root"></div>`. AI crawlers (GPTBot, PerplexityBot) don't render JS at all, so the site was completely invisible to AI search. Next.js SSG pre-builds every page as complete HTML at build time.

**Project structure:**
```
mistio-web-next/
├── src/app/
│   ├── layout.tsx          # Root layout with full SEO metadata + JSON-LD
│   ├── page.tsx            # Landing page (all sections composed)
│   ├── globals.css         # Tailwind v4 + @tailwindcss/typography
│   ├── sitemap.ts          # Auto-generated sitemap from pages + blog posts
│   └── blog/
│       ├── page.tsx        # Blog index
│       └── [slug]/page.tsx # Blog post template (MDX + generateStaticParams)
├── src/components/         # All components ported from mistio-web/ with 'use client'
├── src/lib/
│   ├── utils.ts            # cn() utility
│   └── blog.ts             # MDX file reader (getAllPosts, getPostBySlug, getAllSlugs)
├── content/blog/           # 7 MDX blog posts
└── public/                 # All assets copied from mistio-web/public/
```

**Section order on landing page (matches original):**
Hero → Features (BouncyCards) → HeroScrollDemo → ComparisonDemo → Accordion → Testimonials → Contact → Footer

**Key dependencies added:** framer-motion, lucide-react, react-calendly, @radix-ui/react-label, @radix-ui/react-slot, class-variance-authority, clsx, tailwind-merge, gray-matter, next-mdx-remote, remark-gfm, @tailwindcss/typography

### SEO Infrastructure — DONE

**Meta tags in `layout.tsx`:**
- Title: "Mistio - The Only Battery-Powered Vape Detector for Schools"
- Description targeting "vape detector", "battery powered vape detector", "school vape detector"
- Open Graph + Twitter Card tags
- Keywords array with 15+ target terms
- Canonical URL: https://mistio.app

**JSON-LD structured data (3 schemas in `layout.tsx`):**
- Organization schema (Mistio, Fremont CA, contact info)
- Product schema (battery life: 1 year, install time: under 1 minute, connectivity: cellular)
- FAQPage schema (5 Q&As about battery, false alarms, install, privacy, competitors)

**Other SEO files:**
- `public/robots.txt` — allows all crawlers, points to sitemap
- `src/app/sitemap.ts` — auto-generates sitemap.xml from static pages + all blog posts
- Per-blog-post Article schema via `generateMetadata` + JSON-LD

### Blog System — DONE

**Infrastructure:**
- MDX files in `content/blog/` with frontmatter (title, description, date, keywords)
- `src/lib/blog.ts` — reads/parses MDX files, sorts by date
- Blog index at `/blog` with card layout
- Blog posts at `/blog/[slug]` with prose typography, Article schema, CTA footer
- `remark-gfm` plugin for GitHub-flavored markdown (tables, strikethrough)
- `generateStaticParams` for static generation of all posts at build time

**7 blog posts written:**
1. `mistio-vs-halo.mdx` — "Mistio vs HALO Smart Sensor: Which Vape Detector Actually Works?"
2. `mistio-vs-verkada.mdx` — "Mistio vs Verkada: Do You Need a Camera Company's Vape Detector?"
3. `mistio-vs-zeptive.mdx` — "Mistio vs Zeptive: Battery-Powered Vape Detection Compared"
4. `false-alarms-vape-detectors.mdx` — "Why Your Vape Detector Keeps Going Off (And How to Fix It)"
5. `battery-vs-wired-vape-detectors.mdx` — "Battery-Powered vs Wired Vape Detectors: The Real Cost"
6. `how-to-choose-vape-detector.mdx` — "How to Choose a Vape Detector for Your School in 2025"
7. `vape-detection-schools-guide.mdx` — "The Complete Guide to Vape Detection in K-12 Schools"

Each comparison post follows: short version summary → feature comparison table → detailed breakdowns → when each product makes sense → verdict. Tables render via remark-gfm.

### Build Verification — PASSING

```
next build → 13 static pages generated:
  /                           (landing page)
  /blog                       (blog index)
  /blog/[slug] × 7            (all blog posts via SSG)
  /sitemap.xml                (auto-generated)
  /_not-found                 (404)
```

### Fixes During Migration

- **Lucide-react removed brand icons** (Facebook, Twitter, Instagram, Linkedin) in latest version. Replaced with inline SVG components in `stacked-circular-footer.tsx`. Twitter → X icon.
- **Section order was accidentally shuffled** in initial page.tsx. Fixed back to match original Home.tsx order.
- **Blog tables not rendering** — missing `remark-gfm` plugin. Installed and wired into MDXRemote options.

### What's NOT Done Yet (SEO Next Steps)

**Immediate (this week):**
- Google Search Console — verify `mistio.app`, submit sitemap
- Google Business Profile — set up for Fremont, CA address
- Validate structured data via Google Rich Results Test

**Short-term (2-4 weeks):**
- Switch `<img>` tags to Next.js `<Image>` component (auto WebP, lazy loading)
- Add internal links between blog posts
- Write 8-13 more blog posts to reach 15-20 total (topical authority)
- Ideas: "Do vape detectors work in locker rooms?", "Vape detector vs smoke detector", "Cost of vaping in schools"

**Medium-term (1-3 months):**
- Backlinks from education blogs, school safety publications
- YouTube video (2-min install demo or side-by-side comparison)
- Reddit presence in r/k12sysadmin, r/edtech (Perplexity pulls from Reddit in ~47% of citations)

**SEO Timeline Expectations:**
- Weeks 1-4: Get indexed, rank for long-tail ("battery powered vape detector", "mistio vs halo")
- Months 3-6: Rank for mid-competition ("best vape detector for schools")
- Months 6-12: Compete for head terms ("vape detector") — HALO has years of domain authority head start

### Deployment

- **Old site (`mistio-web/`):** Vite SPA, currently on Vercel
- **New site (`mistio-web-next/`):** Next.js SSG, ready for Vercel deployment
- Need to create `vercel.json` and point `mistio.app` domain to the new Next.js app
- Old hash routes (#features, #testimonials) should redirect to new URL structure

---

## 8. Recommended Next Steps

### Website / SEO (from v13)
1. **Deploy Next.js site to Vercel** — Create `vercel.json`, point `mistio.app` domain to `mistio-web-next/`. **IMMEDIATE.**
2. **Google Search Console** — Verify domain, submit `mistio.app/sitemap.xml`.
3. **Google Business Profile** — Set up for Fremont, CA.
4. **Switch `<img>` to Next.js `<Image>`** — Auto WebP, lazy loading, better Lighthouse score.
5. **Write more blog posts** — Target 15-20 total. Focus on long-tail keywords.
6. **Backlinks + YouTube** — Education blogs, school safety publications, install demo video.

### Hardware / ML (from v10-v12)
7. **Collect more training data** — Use `training_collector.py` with `TRAINING_MODE 1` firmware. Need 15-20 confirmed events.
8. **Retrain models** — After collecting data. Models will use all 35 features.
9. **Deploy models to Railway** — After retraining with sufficient data.
10. **Flash firmware back to production** — Set `TRAINING_MODE 0`, change WiFi NVS to school network.
11. **Long-duration battery test** — Let device run on battery for days.
12. **Fix BLE provisioning** — See Section 4 for full bug report.

## 8b. Context Notes

- **Board**: Adafruit Feather ESP32-C6 with Stemma QT
- **I2C Power**: GPIO20 must be HIGH to power sensors
- **Default I2C**: SDA=19, SCL=18
- **NeoPixel**: GPIO9
- **MSA311 INT**: GPIO5 (NOT wired through Stemma QT — needs separate jumper)
- **Battery**: 40Ah — at ~25mA avg, ~200 school days
- **WiFi**: NVS override in setup() — currently `sweethome`/`rahul2008` for home testing. **Change before school deployment.** BLE provisioning still broken (Section 4).
- **Backend**: `https://vapegaurd-production.up.railway.app`
- **Clerk org**: `org_37a7Hu77TeY84J7XMffcNzieT12`
- **Device MAC**: `58:e6:c5:e3:ce:18` (shows as CE18, device_id = `58E6C5E3CE18`). Note: earlier sessions referenced B9CC — this is the correct MAC from esptool/serial.
- **NEVER run `esptool erase_flash`** — wipes PHY cal, USB-CDC config, NVS, I2C defaults
- **arduino-cli**: `C:/Users/mrjra/OneDrive - MSFT/Vape Project/arduino-cli.exe`
- **COM port**: COM3 (was COM4, changed after replug — always check)
- **arduino-cli (actual location)**: `C:\Users\mrjra\dev\Vape Project\arduino-cli.exe`
- **OTA firmware v3.7.0 uploaded** to backend MongoDB `firmware` collection (active). Semver comparison prevents downgrades. Client-side guard as safety net.
- **ML models**: Retrained 2026-06-05 with BMV080 data. Labels: `backend/training/bmv080_labels.json`. 22 vape + 2 clean_air events. RF/XGB 100%, KNN 88.6%. **MODELS ARE INVALID** — trained on garbage data (zero PM2.5 readings). Must retrain now that pipeline is clean. See Tier 3 plan in Section 2e.
- **OTA fix landed in v3.4.3**: `checkForOTA()` now uses a local `WiFiClientSecure checkClient` instead of reusing the global `secClient` — fixes the -1 connection refused bug caused by stale TLS state after `fetchSchedule()`
- **v9 changes (2026-06-06)**: Tier 1 + Tier 2 — all committed and pushed. See Section 2e.
- **v10 changes (2026-06-07)**: OTA semver fix, PM2.5=0 acceptance, BMV080 FIFO drain. All committed and pushed. Firmware flashed and verified with live vape test. See Section 2f.
