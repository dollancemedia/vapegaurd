/*
 * ESP32-C6 Vape Detection Sensor — Optimized WiFi Build v3
 *
 * Board: Adafruit Feather ESP32-C6 (with Stemma QT)
 *   I2C power pin: GPIO20 (must be HIGH to power Stemma QT sensors)
 *   Default I2C:   SDA=19, SCL=18
 *   NeoPixel:      GPIO9  (WS2812B, powered by I2C_POWER/3.3V)
 *
 * Sensors:
 *   BME680  — temperature, humidity, pressure, gas resistance  (I2C 0x77/0x76)
 *   MSA311  — 3-axis accelerometer for tamper detection         (I2C 0x62)
 *   BMV080  — particulate matter sensor                         (I2C 0x57)
 *
 * Optimizations (v3.3.0):
 *   - WiFi modem sleep (MIN_MODEM): radio sleeps between DTIM beacons (~15-20mA)
 *     WiFi stays associated — POSTs are instant, no reconnect needed.
 *   - MSA311 ISR-based tamper: latched interrupt + IRAM ISR catches every event,
 *     even during delay(). Works continuously through all states.
 *   - MSA311 at 62.5Hz instead of 500Hz
 *   - POST every sniff (every 60s) — cheap with modem sleep
 *   - Removed microphone (no hardware)
 *
 * Power budget (60s sniff cycle, modem sleep):
 *   Idle 53s × 18mA + Active 7s × 80mA = avg ~27mA
 *   40Ah battery, 8h school day = ~185 school days (conservative)
 *
 * State Machine:
 *   STARTUP (60s)  — warmup 45s + calibration 15s, WiFi ON, 1Hz POST
 *   SNIFF          — modem sleep between reads. Wake every 60s, burst-read,
 *                    heartbeat POST every 4th sniff. MSA311 ISR wakes on tamper.
 *   DEEP_SENSE     — spike detected: 1Hz POST for 30s (no sleep, WiFi stays on)
 *   COOLDOWN       — 20s ignore spikes, modem sleep. Then → SNIFF.
 *
 * WiFi Provisioning:
 *   NimBLE only. On first boot (no NVS creds), device advertises as MISTIO-XXXXXX
 *   and blocks until a phone app writes SSID/PASS/ORG to the BLE characteristics.
 *   Creds are saved to NVS and used on all future boots automatically.
 */

#include <WiFi.h>
#include <esp_wifi.h>
// #include <WiFiManager.h>  // removed — BLE provisioning replaces AP portal
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include <Adafruit_MSA301.h>
#include <SparkFun_BMV080_Arduino_Library.h>
#include <Adafruit_NeoPixel.h>
#include <esp_sleep.h>
#include <esp_task_wdt.h>
#include <Preferences.h>
#include <time.h>
#include <NimBLEDevice.h>
#include <esp_mac.h>
#include <esp_ota_ops.h>
#include <esp_https_ota.h>
#include <HTTPUpdate.h>

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const char* FIRMWARE_VERSION = "3.7.0";

// ─── Training mode ─────────────────────────────────────────────────────────
// Set to 1 for data collection: permanent 1Hz reads, no WiFi, no state machine.
// Reflash with 0 to return to normal operation.
#define TRAINING_MODE 0

const char* DEFAULT_SSID     = "";  // populated from NVS by loadDeviceIdentity()
const char* DEFAULT_PASSWORD = "";  // populated from NVS by loadDeviceIdentity()

const char* BACKEND_HOST = "vapegaurd-production.up.railway.app";
const bool  USE_HTTPS    = true;

String DEVICE_ID = "ESP32_C6_001";  // overwritten from NVS or MAC
const String LOCATION  = "School Bathroom";
String ORG_ID    = "irvington";     // overwritten from BLE provisioning

// AP_NAME removed — WiFiManager AP portal replaced by BLE provisioning

// ─── State machine timing ───────────────────────────────────────────────────
const unsigned long WARMUP_SEC          = 45;
const unsigned long CALIBRATION_SEC     = 15;
const unsigned long STARTUP_SEC         = WARMUP_SEC + CALIBRATION_SEC;
const unsigned long STARTUP_SAMPLE_MS   = 2000;

unsigned long sniffIntervalMs    = 60000;
unsigned long heartbeatInterval  = 1;
unsigned long deepSenseSec       = 30;
unsigned long deepSenseRateMs    = 1000;
unsigned long cooldownSec        = 20;

// ─── Local spike detection ──────────────────────────────────────────────────
float LOCAL_SPIKE_THRESHOLD = 3.0;   // BMV080 reports lower PM than PMS5003
float LOCAL_GAS_DROP_RATIO  = 0.85;
const float LOCAL_EWMA_ALPHA      = 0.1;
const float LOCAL_EWMA_ALPHA_CAL  = 0.5;
const float TAMPER_THRESHOLD      = 6.0;  // moderate shake triggers — still ignores bumps, doors, fans

// ─── Power bank / LED ───────────────────────────────────────────────────────
const unsigned long KEEPALIVE_INTERVAL = 30000;
const unsigned long KEEPALIVE_DURATION = 150;

// ─── Burst sampling config ──────────────────────────────────────────────────
const int BURST_TOTAL_READS = 5;
const int BURST_DISCARD     = 2;
const int BURST_DELAY_MS    = 100;

// ─── Pre-trigger ring buffer ────────────────────────────────────────────────
const int RING_BUFFER_SIZE = 4;

// ─── Misc ───────────────────────────────────────────────────────────────────
const unsigned long HTTP_TIMEOUT_MS    = 8000;
// const unsigned long WM_PORTAL_TIMEOUT  = 120;  // removed with WiFiManager
const unsigned long WDT_TIMEOUT_SEC    = 60;   // watchdog: reboot if loop hangs >60s
const unsigned long POST_DEAD_MS       = 300000; // reboot if no successful POST in 5 min
const uint32_t      HEAP_MIN_BYTES     = 30000;  // reboot if free heap drops below this
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.nist.gov";
const unsigned long SCHEDULE_FETCH_INTERVAL = 300000;
// const int RESET_COUNT_TRIGGER = 3;  // removed with WiFiManager triple-reset

// ─────────────────────────────────────────────────────────────────────────────
//  Hardware pins — Adafruit Feather ESP32-C6
// ─────────────────────────────────────────────────────────────────────────────
#define I2C_POWER_PIN  20
#define LED_PIN        15
#define NEOPIXEL_PIN    9
#define NEOPIXEL_COUNT  1
#define MSA311_INT_PIN  5  // MSA311 INT1 → GPIO5 (wakes ESP32 from light sleep)
#define SDA_PIN        19  // Feather ESP32-C6 Stemma QT SDA
#define SCL_PIN        18  // Feather ESP32-C6 Stemma QT SCL
#define BATT_PIN        1  // A1 — Feather ESP32-C6 battery voltage divider (2:1)

// ─────────────────────────────────────────────────────────────────────────────
//  State machine
// ─────────────────────────────────────────────────────────────────────────────
enum SensorState {
  STATE_STARTUP,
  STATE_SNIFF,
  STATE_DEEP_SENSE,
  STATE_COOLDOWN
};

SensorState currentState = STATE_STARTUP;
unsigned long stateEnteredAt = 0;

// ─────────────────────────────────────────────────────────────────────────────
//  Objects
// ─────────────────────────────────────────────────────────────────────────────
Adafruit_BME680 bme;
Adafruit_MSA311 msa;
SparkFunBMV080  bmv;
Preferences     prefs;
Adafruit_NeoPixel neopixel(NEOPIXEL_COUNT, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);
WiFiClientSecure  secClient;  // Reuse across POSTs to avoid heap fragmentation

// ─── Sensor state ───────────────────────────────────────────────────────────
bool bme680Available = false;
bool msa311Available = false;
bool bmv080Available = false;
bool wifiOn          = false;
bool timesynced      = false;
bool heavySensorsOn  = true;

// ─── Local baseline ─────────────────────────────────────────────────────────
float baselinePM25   = 0;
float baselinePM10   = 0;
float baselineGas    = 0;
bool  baselineReady  = false;
int   calibSamples   = 0;

// ─── Sniff counters ─────────────────────────────────────────────────────────
int sniffCount = 0;
unsigned long lastSniffTime    = 0;
unsigned long lastKeepAlive    = 0;

// ─── Tamper ─────────────────────────────────────────────────────────────────
float prevAccelMag = 0;
unsigned long lastTamperSent = 0;
int16_t prevRawX = 0, prevRawY = 0, prevRawZ = 0;
uint8_t frozenCount = 0;  // consecutive reads with identical raw values

// ─── Health / Recovery ─────────────────────────────────────────────────────
unsigned long lastSuccessfulPost = 0;  // millis() of last HTTP 200/201

// ─── Schedule ───────────────────────────────────────────────────────────────
int scheduleStartHour = 0, scheduleStartMin = 0;
int scheduleEndHour   = 23, scheduleEndMin  = 59;
bool scheduleEnabled  = false;
uint8_t activeDays    = 0x3E; // Mon-Fri
unsigned long lastScheduleFetch = 0;

// ─── NimBLE Provisioning ────────────────────────────────────────────────────
NimBLEServer         *bleServer = nullptr;
NimBLECharacteristic *bleSsidChar, *blePassChar, *bleOrgChar;
volatile bool bleProvisioned = false;
bool bleActive       = false;
String bleIncomingSSID, bleIncomingPASS, bleIncomingORG;

// ─── OTA ───────────────────────────────────────────────────────────────────
String OTA_CHECK_URL;
unsigned long lastOtaCheck = 0;
const unsigned long OTA_CHECK_INTERVAL = 3600000UL;  // 1 hours

// ─── Pre-trigger ring buffer ────────────────────────────────────────────────
struct SensorSnapshot {
  float pm25, pm10, pm1;
  float temp, humidity, pressure, gas;
  bool  bmvObstructed;
  unsigned long timestampMs;
  char  isoTimestamp[30];
  bool  valid;
};

SensorSnapshot ringBuffer[RING_BUFFER_SIZE];
int ringHead = 0;

// ─── URLs ───────────────────────────────────────────────────────────────────
String DATA_URL;
String TAMPER_URL;
String SCHEDULE_URL;

// ─── Last sensor readings ───────────────────────────────────────────────────
float lastPM25 = 0, lastPM10 = 0, lastPM1 = 0;
float lastTemp = 0, lastHumidity = 0, lastPressure = 0, lastGas = 0;
bool  lastBmvObstructed = false;
float lastBatteryVoltage = 0;

// ─── Forward declarations ───────────────────────────────────────────────────
// bool  connectWiFiManager(bool forcePortal);  // removed — BLE provisioning only
void  wifiOn_connect();
void  wifiOff_disconnect();
void  syncTime();
bool  isWithinSchedule();
void  fetchSchedule();
void  powerOnSensors();
void  initSensors();
void  readAllSensors();
void  burstReadBMV080();
bool  postSensorData();
bool  postBatchData();
void  checkAndSendTamper();
void  updateLocalBaseline(bool fastAlpha);
bool  isLocalSpike();
void  enterState(SensorState newState);
void  blinkLED(int times, int delayMs);
void  keepalivePulse();
String buildUrl(const char* path);
// bool  shouldForcePortal();  // removed with WiFiManager
// void  clearResetFlag();      // removed with WiFiManager
void  neoSet(uint8_t r, uint8_t g, uint8_t b);
void  neoOff();
void  neoFlash(uint8_t r, uint8_t g, uint8_t b, int durationMs);
void  pushToRingBuffer();
String getISOTimestamp();
void  sleepHeavySensors();
void  wakeHeavySensors();
float readBatteryVoltage();
void  idleSleep(unsigned long durationMs);
void  startBLEProvisioning();
void  stopBLEProvisioning();
void  checkBLEProvisioning();
void  checkForOTA();
void  loadDeviceIdentity();

// =============================================================================
//  TRIPLE-RESET DETECTION — removed (was for WiFiManager AP portal)
// =============================================================================
// bool shouldForcePortal() { ... }
// void clearResetFlag() { ... }

// =============================================================================
//  NEOPIXEL HELPERS
// =============================================================================
void neoSet(uint8_t r, uint8_t g, uint8_t b) {
  neopixel.setPixelColor(0, neopixel.Color(r, g, b));
  neopixel.show();
}

void neoOff() { neoSet(0, 0, 0); }

void neoFlash(uint8_t r, uint8_t g, uint8_t b, int durationMs) {
  neoSet(r, g, b);
  delay(durationMs);
  neoOff();
}

// =============================================================================
//  ISO TIMESTAMP
// =============================================================================
String getISOTimestamp() {
  if (timesynced) {
    struct tm tm;
    if (getLocalTime(&tm)) {
      char buf[30];
      snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d.000Z",
        tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday,
        tm.tm_hour, tm.tm_min, tm.tm_sec);
      return String(buf);
    }
  }
  return String(millis());
}

// =============================================================================
//  RING BUFFER
// =============================================================================
void pushToRingBuffer() {
  SensorSnapshot &s = ringBuffer[ringHead];
  s.pm25       = lastPM25;
  s.pm10       = lastPM10;
  s.pm1        = lastPM1;
  s.temp       = lastTemp;
  s.humidity   = lastHumidity;
  s.pressure   = lastPressure;
  s.gas        = lastGas;
  s.bmvObstructed = lastBmvObstructed;
  s.timestampMs   = millis();
  String ts = getISOTimestamp();
  ts.toCharArray(s.isoTimestamp, sizeof(s.isoTimestamp));
  s.valid = true;
  ringHead = (ringHead + 1) % RING_BUFFER_SIZE;
}

// =============================================================================
//  IDLE SLEEP — delay-based with modem sleep saving WiFi power
// =============================================================================
void idleSleep(unsigned long durationMs) {
  // CPU stays awake in delay() loop. WiFi modem sleep saves radio power.
  // Poll MSA311 over I2C every second for tamper detection.
  neoOff();
  unsigned long start = millis();
  unsigned long lastDbg = 0;
  Serial.printf("idleSleep: %lus\n", durationMs / 1000);
  while (millis() - start < durationMs) {
    // Poll tamper every second via I2C
    if (msa311Available) {
      checkAndSendTamper();
    }
    // Debug: log accel state every 10s
    unsigned long elapsed = millis() - start;
    if (elapsed - lastDbg >= 10000) {
      if (msa311Available) {
        Serial.printf("  accel: mag=%.2f frozen=%d\n", prevAccelMag, frozenCount);
      }
      lastDbg = elapsed;
    }
    keepalivePulse();
    esp_task_wdt_reset();  // feed watchdog during idle sleep
    delay(1000);
  }
}

// =============================================================================
//  SETUP
// =============================================================================
void setup() {
  esp_task_wdt_deinit();  // disable default WDT during setup (WiFi can take >30s)

  Serial.begin(115200);
  // Wait for USB-CDC to enumerate (essential after flash erase on ESP32-C6)
  unsigned long serialWait = millis();
  while (!Serial && (millis() - serialWait < 3000)) {
    delay(10);
  }
  delay(500);
  Serial.printf("\n=== Mistio Sensor v%s ===\n", FIRMWARE_VERSION);

  // Override NVS WiFi creds — change these when switching networks
  prefs.begin("mistio", false);
  prefs.putString("wifi_ssid", "sweethome");
  prefs.putString("wifi_pass", "rahul2008");
  prefs.end();

  // Load device ID from MAC, org/WiFi from NVS (if BLE-provisioned previously)
  loadDeviceIdentity();
  Serial.println("Device: " + DEVICE_ID);

  // AP_NAME removed — BLE advertises its own MAC-based name in startBLEProvisioning()

  DATA_URL     = buildUrl("/api/sensors/data");
  TAMPER_URL   = buildUrl("/api/sensors/tamper");
  SCHEDULE_URL = buildUrl(("/api/devices/" + DEVICE_ID + "/schedule").c_str());
  OTA_CHECK_URL = buildUrl("/api/firmware/latest");
  Serial.println("Backend: " + DATA_URL);

  neopixel.begin();
  neopixel.setBrightness(30);
  neoSet(255, 255, 0); // yellow = booting

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  pinMode(BATT_PIN, INPUT);
  analogReadResolution(12);

  // MSA311 INT pin as input (hardware interrupt for tamper wakeup)
  pinMode(MSA311_INT_PIN, INPUT);

  for (int i = 0; i < RING_BUFFER_SIZE; i++) {
    ringBuffer[i].valid = false;
  }

  powerOnSensors();
  initSensors();

#if TRAINING_MODE
  Serial.println("=== TRAINING MODE — no WiFi, continuous 1Hz reads ===");
  wifiOn = false;
  neoSet(0, 255, 0);
#else
  // BLE provisioning — always start advertising on boot.
  // If NVS creds exist (prior BLE provisioning), WiFi connects immediately and BLE shuts down.
  // If no NVS creds, device blocks here until a phone app writes SSID/PASS/ORG via BLE.
  startBLEProvisioning();

  // Connect WiFi — NVS-saved creds only (no AP portal)
  neoSet(0, 0, 255);
  if (strlen(DEFAULT_SSID) > 0) {
    // loadDeviceIdentity() populated DEFAULT_SSID/DEFAULT_PASSWORD from NVS
    Serial.printf("Connecting WiFi from NVS: %s\n", DEFAULT_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(DEFAULT_SSID, DEFAULT_PASSWORD);
    unsigned long wStart = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - wStart < 15000) {
      delay(250);
      Serial.print(".");
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("WiFi OK: " + WiFi.localIP().toString() + " (" + String(WiFi.RSSI()) + " dBm)");
    } else {
      Serial.println("WiFi failed with saved creds");
    }
  } else {
    // No saved creds — block until BLE app provisions the device
    Serial.println("[BLE] No WiFi creds — waiting for BLE provisioning...");
    neoSet(128, 0, 128); // purple = awaiting provisioning
    while (!bleProvisioned) {
      delay(100);
    }
    checkBLEProvisioning(); // saves creds to NVS, connects WiFi, syncs time
  }

  wifiOn = (WiFi.status() == WL_CONNECTED);

  // WiFi connected — shut down BLE to free heap for HTTPS
  if (wifiOn) {
    stopBLEProvisioning();
  }

  if (wifiOn) {
    neoSet(0, 255, 0);
    syncTime();
    fetchSchedule();
    // OTA check on boot — only if firmware endpoint is deployed
    checkForOTA();
    delay(500);
  } else {
    neoFlash(255, 0, 0, 1000);
  }

  // Init reusable TLS client (avoids heap fragmentation from repeated alloc/free)
  secClient.setInsecure();
  secClient.setTimeout(HTTP_TIMEOUT_MS / 1000);
#endif

  // Set I2C timeout so bus lockup can't hang forever (ms)
  Wire.setTimeout(100);

  enterState(STATE_STARTUP);
  lastSuccessfulPost = millis();  // grace period — don't reboot during startup

  // Re-enable watchdog now that setup is done
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = WDT_TIMEOUT_SEC * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);  // add current task (loopTask)

  Serial.printf("Setup complete — free heap: %u, WDT=%lus\n", ESP.getFreeHeap(), WDT_TIMEOUT_SEC);
}

// =============================================================================
//  MAIN LOOP — State machine with light sleep
// =============================================================================
void loop() {

  esp_task_wdt_reset();  // feed watchdog every loop iteration

#if TRAINING_MODE
  {
    static unsigned long lastTrainingRead = 0;
    static int trainingSampleCount = 0;
    unsigned long now = millis();

    if (now - lastTrainingRead >= 1000) {
      lastTrainingRead = now;
      readAllSensors();
      trainingSampleCount++;

      if (trainingSampleCount <= 45) {
        Serial.printf("WARMUP: %d/45\n", trainingSampleCount);
        neoFlash(255, 165, 0, 100);  // orange flash during warmup
      } else if (trainingSampleCount == 46) {
        Serial.println("READY: Sensor warmed up — start labeling events");
        neoSet(0, 255, 0);
      }
    }
    keepalivePulse();
    delay(50);
    return;
  }
#endif

  unsigned long now = millis();
  unsigned long elapsed = now - stateEnteredAt;

  // ── Health checks — reboot if device is stuck ──
  if (currentState != STATE_STARTUP) {
    // No successful POST in 5 minutes → something is fundamentally broken
    if (now - lastSuccessfulPost > POST_DEAD_MS) {
      Serial.printf("REBOOT: no POST in %lus, heap=%u\n",
        (now - lastSuccessfulPost) / 1000, ESP.getFreeHeap());
      delay(100);
      ESP.restart();
    }
    // Heap critically low → TLS can't allocate, reboot before hard crash
    if (ESP.getFreeHeap() < HEAP_MIN_BYTES) {
      Serial.printf("REBOOT: heap critical %u < %u\n", ESP.getFreeHeap(), HEAP_MIN_BYTES);
      delay(100);
      ESP.restart();
    }
  }

  keepalivePulse();

  // Schedule check
  if (wifiOn && (now - lastScheduleFetch > SCHEDULE_FETCH_INTERVAL)) {
    fetchSchedule();
  }

  // Daily OTA check
  if (wifiOn && (now - lastOtaCheck > OTA_CHECK_INTERVAL)) {
    checkForOTA();
  }

  // Outside school hours — deep sleep, but wake every 5min to re-fetch schedule
  if (scheduleEnabled && !isWithinSchedule()) {
    unsigned long sinceFetch = now - lastScheduleFetch;
    if (sinceFetch >= SCHEDULE_FETCH_INTERVAL) {
      // Reconnect WiFi briefly to check for schedule updates
      Serial.println("Outside hours — reconnecting WiFi to check schedule...");
      if (!wifiOn) wifiOn_connect();
      if (wifiOn) {
        fetchSchedule();
        wifiOff_disconnect();
      }
      // Re-check: maybe schedule was just updated to include now
      if (!scheduleEnabled || isWithinSchedule()) {
        Serial.println("Schedule updated — resuming normal operation");
        return; // fall through to main state machine
      }
    }
    Serial.println("Outside school hours — sleeping 60s");
    if (wifiOn) wifiOff_disconnect();
    sleepHeavySensors();
    neoOff();
    idleSleep(60000);
    keepalivePulse();
    return;
  }

  switch (currentState) {

    // ── STARTUP: 150s of continuous 1Hz sampling (no sleep, WiFi ON) ────
    case STATE_STARTUP: {
      if (elapsed % 2000 < 50) {
        uint32_t color = neopixel.ColorHSV((elapsed / 10) * 256);
        neopixel.setPixelColor(0, color);
        neopixel.show();
      }

      readAllSensors();

      bool inCalibration = (elapsed > WARMUP_SEC * 1000);
      if (inCalibration && bmv080Available) {
        updateLocalBaseline(true);
        calibSamples++;
      }

      if (!wifiOn) wifiOn_connect();
      if (wifiOn) postSensorData();

      if (elapsed >= STARTUP_SEC * 1000) {
        if (calibSamples > 0) {
          baselineReady = true;
          Serial.printf("Baseline frozen: PM2.5=%.1f PM10=%.1f Gas=%.1f (%d samples)\n",
            baselinePM25, baselinePM10, baselineGas, calibSamples);
        } else {
          Serial.println("WARNING: No BMV080 data during calibration — baseline not set");
        }

        // Send one final POST so dashboard immediately sees state change
        postSensorData();

        // Enable WiFi modem sleep — radio powers down between DTIM beacons
        // (~15-20mA vs 80mA active). WiFi stays associated so POSTs are instant.
        esp_wifi_set_ps(WIFI_PS_MIN_MODEM);
        Serial.println("WiFi modem sleep enabled (MIN_MODEM)");
        Serial.printf("WiFi: status=%d RSSI=%d\n", WiFi.status(), WiFi.RSSI());

        // Switch BMV080 to duty cycle mode now that calibration is done
        if (bmv080Available) {
          bmv.setDutyCyclingPeriod(60);
          bmv.setMode(SF_BMV080_MODE_DUTY_CYCLE);
          Serial.printf("BMV080 switched to duty cycle (period=%ds)\n", bmv.dutyCyclingPeriod());
        }

        sleepHeavySensors();
        neoOff();
        enterState(STATE_SNIFF);
      } else {
        delay(STARTUP_SAMPLE_MS);
      }
      break;
    }

    // ── SNIFF: light sleep between reads, wake on timer or tamper ───────
    case STATE_SNIFF: {
      // Time for a sniff read
      now = millis();
      if (now - lastSniffTime >= sniffIntervalMs || lastSniffTime == 0) {
        lastSniffTime = now;
        sniffCount++;

        // Wake BMV080 laser + BME680
        wakeHeavySensors();
        delay(3000); // additional warmup for reliable PM readings

        neoSet(0, 0, 40); // blue pulse

        burstReadBMV080();

        if (bme680Available && bme.performReading()) {
          lastTemp     = bme.temperature;
          lastHumidity = bme.humidity;
          lastPressure = bme.pressure / 100.0;
          lastGas      = bme.gas_resistance / 1000.0;
        }

        pushToRingBuffer();

        if (baselineReady && bmv080Available) {
          updateLocalBaseline(false);
        }

        neoOff();

        // Sleep BMV080 laser immediately after reading
        sleepHeavySensors();

        // Always print sensor values so serial_plot.py can graph them
        Serial.printf("Sniff #%d: PM2.5=%.1f (base=%.1f, d=%.1f) Gas=%.1f Batt=%.2fV Heap=%u\n",
          sniffCount, lastPM25, baselinePM25, lastPM25 - baselinePM25,
          lastGas, readBatteryVoltage(), ESP.getFreeHeap());
        Serial.printf("SENSOR: T=%.1f H=%.1f P=%.1f G=%.1f PM1=%.2f PM25=%.2f PM10=%.2f\n",
          lastTemp, lastHumidity, lastPressure, lastGas, lastPM1, lastPM25, lastPM10);

        // Check for spike
        if (baselineReady && isLocalSpike()) {
          Serial.println("!! LOCAL SPIKE — entering DEEP_SENSE !!");
          neoFlash(255, 0, 0, 200);
          wakeHeavySensors();
          if (WiFi.status() != WL_CONNECTED) wifiOn_connect();
          if (WiFi.status() == WL_CONNECTED) {
            postBatchData();
          }
          enterState(STATE_DEEP_SENSE);
          break;
        }

        // Heartbeat POST every Nth sniff (and always on first sniff after state change)
        if (sniffCount % heartbeatInterval == 0 || sniffCount == 1) {
          Serial.println("Heartbeat POST");
          neoFlash(0, 255, 0, 150);
          if (WiFi.status() != WL_CONNECTED) {
            Serial.println("WiFi dropped, reconnecting...");
            wifiOn_connect();
          }
          if (WiFi.status() == WL_CONNECTED) {
            postSensorData();
          } else {
            Serial.println("WiFi unavailable, skipping heartbeat");
          }
          // If server forced DEEP_SENSE, postSensorData changed state — skip sleep
          if (currentState != STATE_SNIFF) break;
        }
      }

      // ── Enter light sleep until next sniff (MSA311 INT can wake us) ──
      {
        unsigned long timeSinceSniff = millis() - lastSniffTime;
        unsigned long sleepTime = (timeSinceSniff < sniffIntervalMs)
          ? (sniffIntervalMs - timeSinceSniff)
          : 1000; // fallback 1s
        // Subtract a bit for keepalive timing
        if (sleepTime > KEEPALIVE_INTERVAL) sleepTime = KEEPALIVE_INTERVAL;
        idleSleep(sleepTime);
      }
      break;
    }

    // ── DEEP_SENSE: 1Hz POST for 30s (no sleep, sensors + WiFi ON) ─────
    case STATE_DEEP_SENSE: {
      neoSet(255, 0, 0);

      if (!heavySensorsOn) wakeHeavySensors();

      readAllSensors();

      if (WiFi.status() != WL_CONNECTED) wifiOn_connect();
      if (WiFi.status() == WL_CONNECTED) postSensorData();

      if (msa311Available) checkAndSendTamper();

      if (elapsed >= deepSenseSec * 1000) {
        Serial.println("Deep sense complete — entering COOLDOWN");
        if (WiFi.status() == WL_CONNECTED) {
          DynamicJsonDocument finalDoc(256);
          finalDoc["device_id"] = DEVICE_ID;
          finalDoc["org_id"]    = ORG_ID;
          finalDoc["duty_state"] = "deep_sense_complete";
          finalDoc["timestamp"]  = getISOTimestamp();
          String finalPayload;
          serializeJson(finalDoc, finalPayload);
          secClient.stop();
          HTTPClient fhttp;
          fhttp.begin(secClient, DATA_URL);
          fhttp.addHeader("Content-Type", "application/json");
          fhttp.setTimeout(HTTP_TIMEOUT_MS);
          fhttp.POST(finalPayload);
          fhttp.end();
        }
        sleepHeavySensors();
        neoOff();
        enterState(STATE_COOLDOWN);
      } else {
        // HTTP POST takes ~1s; only add small delay to hit ~1Hz total
        delay(100);
      }
      break;
    }

    // ── COOLDOWN: 20s, light sleep, tamper still active ─────────────────
    case STATE_COOLDOWN: {
      // Send one "cooldown" heartbeat at the start so dashboard clears detection status
      static bool cooldownHeartbeatSent = false;
      if (elapsed < 2000 && !cooldownHeartbeatSent) {
        cooldownHeartbeatSent = true;
        Serial.println("Cooldown heartbeat — clearing dashboard status");
        if (WiFi.status() == WL_CONNECTED) {
          postSensorData();
        }
      }
      if (elapsed >= cooldownSec * 1000) {
        Serial.println("Cooldown complete — back to SNIFF");
        cooldownHeartbeatSent = false;
        neoOff();
        enterState(STATE_SNIFF);
      } else {
        // Brief orange flash then sleep
        neoFlash(255, 80, 0, 50);
        unsigned long remaining = cooldownSec * 1000 - elapsed;
        unsigned long sleepTime = min(remaining, (unsigned long)5000);
        idleSleep(sleepTime);
      }
      break;
    }
  }
}

// =============================================================================
//  STATE TRANSITIONS
// =============================================================================
void enterState(SensorState newState) {
  const char* names[] = {"STARTUP", "SNIFF", "DEEP_SENSE", "COOLDOWN"};
  Serial.printf("State: %s -> %s\n", names[currentState], names[newState]);
  currentState = newState;
  stateEnteredAt = millis();

  if (newState == STATE_SNIFF) {
    sniffCount = 0;
    lastSniffTime = 0; // trigger immediate first read
  }
}

// =============================================================================
//  BMV080 DUTY CYCLING — reset() stops laser, init() restarts it
// =============================================================================
void sleepHeavySensors() {
  if (!heavySensorsOn) return;
  // Switch BMV080 back to duty cycle (low power, laser pulses periodically)
  if (bmv080Available) {
    bmv.setMode(SF_BMV080_MODE_DUTY_CYCLE);
    Serial.println("BMV080 -> duty cycle");
  }
  heavySensorsOn = false;
}

void wakeHeavySensors() {
  if (heavySensorsOn) return;
  // Switch BMV080 to continuous for fast 1Hz readings during active sensing
  if (bmv080Available) {
    bmv.setMode(SF_BMV080_MODE_CONTINUOUS);
    Serial.println("BMV080 -> continuous");
    delay(3000);  // BMV080 needs ~3s to stabilize after mode switch
  }
  heavySensorsOn = true;
}

// =============================================================================
//  BURST READ BMV080
// =============================================================================
void burstReadBMV080() {
  if (!bmv080Available) return;

  // Drain any stale FIFO data accumulated while sensor was in duty cycle
  int drained = 0;
  while (bmv.readSensor() && drained < 60) drained++;

  float pm25Buf[BURST_TOTAL_READS];
  float pm10Buf[BURST_TOTAL_READS];
  float pm1Buf[BURST_TOTAL_READS];
  int   validCount = 0;
  bool  obstructed = false;

  for (int i = 0; i < BURST_TOTAL_READS; i++) {
    delay(BURST_DELAY_MS);  // wait for fresh reading
    if (bmv.readSensor()) {
      pm25Buf[i] = bmv.PM25();
      pm10Buf[i] = bmv.PM10();
      pm1Buf[i]  = bmv.PM1();
      if (i >= BURST_DISCARD) validCount++;
      if (bmv.isObstructed()) obstructed = true;
    } else {
      pm25Buf[i] = -1;
      pm10Buf[i] = -1;
      pm1Buf[i]  = -1;
    }
  }

  if (validCount > 0) {
    float sumPM25 = 0, sumPM10 = 0, sumPM1 = 0;
    int count = 0;
    for (int i = BURST_DISCARD; i < BURST_TOTAL_READS; i++) {
      if (pm25Buf[i] >= 0) {
        sumPM25 += pm25Buf[i];
        sumPM10 += pm10Buf[i];
        sumPM1  += pm1Buf[i];
        count++;
      }
    }
    if (count > 0) {
      lastPM25 = sumPM25 / count;
      lastPM10 = sumPM10 / count;
      lastPM1  = sumPM1 / count;
    }
  }

  lastBmvObstructed = obstructed;
}

// =============================================================================
//  LOCAL BASELINE + SPIKE DETECTION
// =============================================================================
void updateLocalBaseline(bool fastAlpha) {
  // lastPM25 >= 0 is valid (clean air reads 0). Only skip if negative (impossible).
  if (lastPM25 < 0) return;

  float alpha = fastAlpha ? LOCAL_EWMA_ALPHA_CAL : LOCAL_EWMA_ALPHA;

  if (calibSamples == 0 && fastAlpha) {
    baselinePM25 = lastPM25;
    baselinePM10 = lastPM10;
    baselineGas  = lastGas;
  } else {
    baselinePM25 = alpha * lastPM25 + (1 - alpha) * baselinePM25;
    baselinePM10 = alpha * lastPM10 + (1 - alpha) * baselinePM10;
    if (lastGas > 0) {
      baselineGas = alpha * lastGas + (1 - alpha) * baselineGas;
    }
  }
}

bool isLocalSpike() {
  // Only skip if negative (impossible value — sensor error)
  if (lastPM25 < 0) return false;

  float deltaPM25 = lastPM25 - baselinePM25;
  if (deltaPM25 >= LOCAL_SPIKE_THRESHOLD) {
    Serial.printf("SPIKE: PM2.5 delta=%.1f (threshold=%.1f)\n", deltaPM25, LOCAL_SPIKE_THRESHOLD);
    return true;
  }

  // Gas drop only triggers if PM2.5 is also elevated above baseline
  if (baselineGas > 0 && lastGas > 0 && deltaPM25 > 1.0) {
    float gasRatio = lastGas / baselineGas;
    if (gasRatio <= LOCAL_GAS_DROP_RATIO) {
      Serial.printf("SPIKE: Gas drop ratio=%.2f + PM2.5 delta=%.1f\n", gasRatio, deltaPM25);
      return true;
    }
  }

  return false;
}

// =============================================================================
//  WiFi ON/OFF
// =============================================================================
void wifiOn_connect() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiOn = true;
    return;
  }

  Serial.println("WiFi connecting...");
  // Clean disconnect first — after light sleep the stack can be stale
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.begin(DEFAULT_SSID, DEFAULT_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    wifiOn = true;
    Serial.println("WiFi OK — " + WiFi.localIP().toString());
  } else {
    wifiOn = false;
    Serial.println("WiFi FAILED");
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
  }
}

void wifiOff_disconnect() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  wifiOn = false;
}

// =============================================================================
//  WiFiManager — removed, BLE provisioning replaces AP portal
// =============================================================================

// =============================================================================
//  SENSOR POWER + INIT
// =============================================================================
void powerOnSensors() {
  // Force a full power cycle on the I2C sensor rail
  // (sensors may be in a bad state after ESP32 resets without losing power)
  pinMode(I2C_POWER_PIN, OUTPUT);
  digitalWrite(I2C_POWER_PIN, LOW);
  delay(200);  // Ensure sensors fully discharge
  digitalWrite(I2C_POWER_PIN, HIGH);
  Serial.println("Stemma QT power cycled ON");
  delay(1500);  // Sensors need time to boot after power-on

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  delay(500);

  Serial.println("I2C scan:");
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  0x%02X\n", addr);
    }
    delay(2);
  }
}

void initSensors() {
  // Retry sensor init up to 3 times — after full flash erase, I2C bus
  // can be flaky on first attempt (PHY calibration, power sequencing).
  for (int attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      Serial.printf("Sensor init retry #%d...\n", attempt + 1);
      Wire.end();
      delay(500);
      Wire.begin(SDA_PIN, SCL_PIN);
      Wire.setClock(100000);
      delay(500);
    }

    // BME680
    if (!bme680Available) {
      if (bme.begin(0x77) || bme.begin(0x76)) {
        bme680Available = true;
        bme.setTemperatureOversampling(BME680_OS_8X);
        bme.setHumidityOversampling(BME680_OS_2X);
        bme.setPressureOversampling(BME680_OS_4X);
        bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
        bme.setGasHeater(320, 150);
        Serial.println("BME680 OK");
      } else if (attempt == 2) {
        Serial.println("BME680 not found after 3 attempts");
      }
    }

    // MSA311 — low data rate + hardware interrupt for tamper
    if (!msa311Available) {
      if (msa.begin()) {
        msa311Available = true;
        msa.setDataRate(MSA301_DATARATE_62_5_HZ);
        msa.setRange(MSA301_RANGE_4_G);
        Serial.println("MSA311 OK — 62.5Hz, I2C polling for tamper");

        sensors_event_t accel;
        msa.getEvent(&accel);
        prevAccelMag = sqrt(
          accel.acceleration.x * accel.acceleration.x +
          accel.acceleration.y * accel.acceleration.y +
          accel.acceleration.z * accel.acceleration.z
        );
      } else if (attempt == 2) {
        Serial.println("MSA311 not found after 3 attempts");
      }
    }

    // BMV080
    if (!bmv080Available) {
      if (bmv.begin(0x57, Wire)) {
        Serial.println("BMV080 connected");
        if (bmv.init()) {
          bmv080Available = true;
          // Start in continuous mode for STARTUP calibration (need frequent reads).
          // Switch to duty cycle after STARTUP completes.
          bmv.setMode(SF_BMV080_MODE_CONTINUOUS);
          Serial.println("BMV080 OK — continuous mode (will switch to duty cycle after STARTUP)");
        } else if (attempt == 2) {
          Serial.println("BMV080 init() failed after 3 attempts");
        }
      } else if (attempt == 2) {
        Serial.println("BMV080 not found at 0x57 after 3 attempts");
      }
    }

    // All sensors found — no need to retry
    if (bme680Available && msa311Available && bmv080Available) break;
  }

  Serial.printf("Sensors: BME680=%s MSA311=%s BMV080=%s\n",
    bme680Available ? "YES" : "NO",
    msa311Available ? "YES" : "NO",
    bmv080Available ? "YES" : "NO");
}

// =============================================================================
//  READ ALL SENSORS (STARTUP and DEEP_SENSE — no duty cycling)
// =============================================================================
void readAllSensors() {
  if (bme680Available) {
    if (bme.performReading()) {
      lastTemp     = bme.temperature;
      lastHumidity = bme.humidity;
      lastPressure = bme.pressure / 100.0;
      lastGas      = bme.gas_resistance / 1000.0;
    } else {
      Serial.println("BME680: performReading() failed");
    }
  }

  if (bmv080Available) {
    // Drain all buffered readings — serve_interrupt accumulates 1/sec in the FIFO.
    // If we poll slower than 1Hz (e.g. HTTP POST takes 1s), stale data piles up.
    int drainCount = 0;
    while (bmv.readSensor()) {
      lastPM1  = bmv.PM1();
      lastPM25 = bmv.PM25();
      lastPM10 = bmv.PM10();
      lastBmvObstructed = bmv.isObstructed();
      drainCount++;
      if (drainCount > 10) break;  // safety cap
    }
    if (drainCount == 0) {
      Serial.println("BMV080: no data available");
    }
  }

  Serial.printf("SENSOR: T=%.1f H=%.1f P=%.1f G=%.1f PM1=%.2f PM25=%.2f PM10=%.2f\n",
    lastTemp, lastHumidity, lastPressure, lastGas, lastPM1, lastPM25, lastPM10);
}

// =============================================================================
//  BATTERY VOLTAGE
// =============================================================================
float readBatteryVoltage() {
  int raw = analogRead(BATT_PIN);
  // ESP32-C6 12-bit ADC (0-4095), 3.3V ref, 2:1 voltage divider on Feather
  float voltage = (raw / 4095.0f) * 3.3f * 2.0f;
  return voltage;
}

// =============================================================================
//  POST SENSOR DATA
// =============================================================================
bool postSensorData() {
  DynamicJsonDocument doc(1024);
  doc["device_id"]       = DEVICE_ID;
  doc["location"]        = LOCATION;
  doc["org_id"]          = ORG_ID;
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["temperature"]     = lastTemp;
  doc["humidity"]        = lastHumidity;
  doc["pressure"]        = lastPressure;
  doc["gas_resistance"]  = lastGas;
  doc["pm1"]             = lastPM1;
  doc["pm25"]            = lastPM25;
  doc["pm10"]            = lastPM10;
  doc["wifi_rssi"]       = WiFi.RSSI();
  doc["sensor_type"]     = "multi_sensor";
  doc["bmv080_obstructed"] = lastBmvObstructed;
  lastBatteryVoltage     = readBatteryVoltage();
  doc["battery_voltage"] = lastBatteryVoltage;
  doc["free_heap"]       = ESP.getFreeHeap();

  const char* stateNames[] = {"startup", "sniff", "deep_sense", "cooldown"};
  doc["duty_state"] = stateNames[currentState];
  doc["timestamp"] = getISOTimestamp();

  doc["temp_humidity_ratio"]  = (lastHumidity > 0) ? lastTemp / lastHumidity : 0;
  doc["gas_temp_interaction"] = lastGas * lastTemp;
  doc["pm_ratio"]             = (lastPM10 > 0) ? lastPM25 / lastPM10 : 0;
  float aqi25 = (lastPM25 / 35.0) * 100.0;
  float aqi10 = (lastPM10 / 150.0) * 100.0;
  doc["air_quality_index"]    = max(aqi25, aqi10);

  doc["baseline_pm25"] = baselinePM25;
  doc["baseline_gas"]  = baselineGas;

  // Tell backend if this is a spike-triggered burst
  if (currentState == STATE_DEEP_SENSE) {
    doc["spike_triggered"] = true;
    doc["deep_sense_elapsed_sec"] = (float)(millis() - stateEnteredAt) / 1000.0;
  }

  String payload;
  serializeJson(doc, payload);

  Serial.printf("Heap before POST: %u\n", ESP.getFreeHeap());

  // Stop any stale connection on the reusable client
  secClient.stop();

  HTTPClient http;
  http.begin(secClient, DATA_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  int code = http.POST(payload);

  bool ok = (code == 200 || code == 201);
  bool forceDeepSense = false;
  if (ok) {
    lastSuccessfulPost = millis();
    String resp = http.getString();
    DynamicJsonDocument respDoc(512);
    if (!deserializeJson(respDoc, resp)) {
      if (respDoc.containsKey("prediction")) {
        String cls  = respDoc["prediction"]["predicted_class"].as<String>();
        float  conf = respDoc["prediction"]["confidence"];
        Serial.printf("  -> %s (%.1f%%)\n", cls.c_str(), conf);
      }
      if (respDoc["force_deep_sense"] | false) {
        forceDeepSense = true;
        Serial.println("!! SERVER REQUESTED DEEP_SENSE !!");
      }
    }
  } else {
    Serial.printf("POST error: %d heap=%u\n", code, ESP.getFreeHeap());
  }
  http.end();

  Serial.printf("Heap after POST: %u\n", ESP.getFreeHeap());

  if (forceDeepSense && currentState == STATE_SNIFF) {
    Serial.println("!! SERVER SPIKE — entering DEEP_SENSE !!");
    neoFlash(255, 165, 0, 200);
    wakeHeavySensors();
    postBatchData();
    enterState(STATE_DEEP_SENSE);
  }

  return ok;
}

// =============================================================================
//  POST BATCH DATA — cached ring buffer on spike
// =============================================================================
bool postBatchData() {
  int validEntries = 0;
  for (int i = 0; i < RING_BUFFER_SIZE; i++) {
    if (ringBuffer[i].valid) validEntries++;
  }
  if (validEntries == 0) return false;

  Serial.printf("Batch uploading %d cached readings...\n", validEntries);

  int idx = ringHead;
  int sent = 0;

  for (int i = 0; i < RING_BUFFER_SIZE; i++) {
    SensorSnapshot &s = ringBuffer[idx];
    if (s.valid) {
      DynamicJsonDocument doc(1024);
      doc["device_id"]       = DEVICE_ID;
      doc["location"]        = LOCATION;
      doc["org_id"]          = ORG_ID;
      doc["temperature"]     = s.temp;
      doc["humidity"]        = s.humidity;
      doc["pressure"]        = s.pressure;
      doc["gas_resistance"]  = s.gas;
      doc["pm1"]             = s.pm1;
      doc["pm25"]            = s.pm25;
      doc["pm10"]            = s.pm10;
      doc["wifi_rssi"]       = WiFi.RSSI();
      doc["sensor_type"]     = "multi_sensor";
      doc["bmv080_obstructed"] = s.bmvObstructed;
      doc["duty_state"]      = "batch_baseline";
      doc["timestamp"]       = String(s.isoTimestamp);
      doc["baseline_pm25"]   = baselinePM25;
      doc["baseline_gas"]    = baselineGas;

      doc["temp_humidity_ratio"]  = (s.humidity > 0) ? s.temp / s.humidity : 0;
      doc["gas_temp_interaction"] = s.gas * s.temp;
      doc["pm_ratio"]             = (s.pm10 > 0) ? s.pm25 / s.pm10 : 0;
      float aqi25 = (s.pm25 / 35.0) * 100.0;
      float aqi10 = (s.pm10 / 150.0) * 100.0;
      doc["air_quality_index"]    = max(aqi25, aqi10);

      String payload;
      serializeJson(doc, payload);

      secClient.stop();
      HTTPClient http;
      http.begin(secClient, DATA_URL);
      http.addHeader("Content-Type", "application/json");
      http.setTimeout(HTTP_TIMEOUT_MS);
      int code = http.POST(payload);
      http.end();

      if (code == 200 || code == 201) { sent++; lastSuccessfulPost = millis(); }
      s.valid = false;
    }
    idx = (idx + 1) % RING_BUFFER_SIZE;
  }

  Serial.printf("Batch upload: %d/%d sent\n", sent, validEntries);
  return sent > 0;
}

// =============================================================================
//  TAMPER DETECTION
// =============================================================================
void checkAndSendTamper() {
  if (!msa311Available) return;

  // Raw I2C read — bypasses Adafruit_MSA301 library which can return stale data
  // MSA311 accel data registers: 0x02-0x07 (X_LSB, X_MSB, Y_LSB, Y_MSB, Z_LSB, Z_MSB)
  Wire.beginTransmission(0x62);
  Wire.write(0x02);
  if (Wire.endTransmission(false) != 0) return;  // I2C error

  uint8_t buf[6] = {0};
  Wire.requestFrom((uint8_t)0x62, (uint8_t)6);
  for (int i = 0; i < 6 && Wire.available(); i++) buf[i] = Wire.read();

  int16_t rawX = (buf[1] << 8) | buf[0]; rawX >>= 4;  // MSA311 = 12-bit
  int16_t rawY = (buf[3] << 8) | buf[2]; rawY >>= 4;
  int16_t rawZ = (buf[5] << 8) | buf[4]; rawZ >>= 4;

  // Detect frozen sensor — if raw values identical for 10+ consecutive reads, re-init
  if (rawX == prevRawX && rawY == prevRawY && rawZ == prevRawZ) {
    frozenCount++;
    if (frozenCount >= 10) {
      Serial.println("MSA311 frozen — re-init");
      msa.begin();
      msa.setDataRate(MSA301_DATARATE_62_5_HZ);
      msa.setRange(MSA301_RANGE_4_G);
      frozenCount = 0;
      return;
    }
  } else {
    frozenCount = 0;
  }
  prevRawX = rawX; prevRawY = rawY; prevRawZ = rawZ;

  // Convert to m/s² (MSA311 at ±4g, 12-bit: range -2048..2047, so 1g = 512 LSB)
  const float scale = 9.81f / 512.0f;  // 4g range, 12-bit: 1g = 512 LSB
  float ax = rawX * scale;
  float ay = rawY * scale;
  float az = rawZ * scale;
  float mag = sqrt(ax * ax + ay * ay + az * az);

  // Detect tamper using magnitude deviation from gravity (~9.8 m/s²)
  float deviationFromGravity = abs(mag - 9.81);
  float delta = abs(mag - prevAccelMag);
  prevAccelMag = mag;

  bool tampered = (deviationFromGravity > TAMPER_THRESHOLD) || (delta > TAMPER_THRESHOLD);

  if (tampered) {
    if (millis() - lastTamperSent < 5000) return;
    lastTamperSent = millis();

    Serial.printf("TAMPER! mag=%.2f gDev=%.2f delta=%.2f raw(%d,%d,%d)\n",
      mag, deviationFromGravity, delta, rawX, rawY, rawZ);
    neoFlash(255, 0, 255, 300);

    if (WiFi.status() != WL_CONNECTED) wifiOn_connect();
    if (WiFi.status() != WL_CONNECTED) return;

    DynamicJsonDocument doc(256);
    doc["device_id"] = DEVICE_ID;
    doc["org_id"]    = ORG_ID;
    doc["accel_x"]   = ax;
    doc["accel_y"]   = ay;
    doc["accel_z"]   = az;

    String payload;
    serializeJson(doc, payload);

    secClient.stop();
    HTTPClient http;
    http.begin(secClient, TAMPER_URL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(HTTP_TIMEOUT_MS);
    int code = http.POST(payload);
    if (code == 200 || code == 201) lastSuccessfulPost = millis();
    Serial.printf("Tamper POST -> %d\n", code);
    http.end();
  }
}

// =============================================================================
//  NTP + SCHEDULE
// =============================================================================
void syncTime() {
  Serial.println("Syncing NTP...");
  configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);
  struct tm tm;
  int attempts = 0;
  while (!getLocalTime(&tm) && attempts < 10) {
    delay(500);
    attempts++;
  }
  if (attempts < 10) {
    timesynced = true;
    Serial.printf("Time: %04d-%02d-%02d %02d:%02d:%02d UTC\n",
      tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday,
      tm.tm_hour, tm.tm_min, tm.tm_sec);
  } else {
    Serial.println("NTP failed");
  }
}

void fetchSchedule() {
  secClient.stop();
  HTTPClient http;
  http.begin(secClient, SCHEDULE_URL);
  http.setTimeout(HTTP_TIMEOUT_MS);

  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    DynamicJsonDocument doc(1024);
    if (!deserializeJson(doc, body)) {
      scheduleEnabled   = doc["enabled"] | false;
      scheduleStartHour = doc["start_hour"] | 0;
      scheduleStartMin  = doc["start_minute"] | 0;
      scheduleEndHour   = doc["end_hour"] | 23;
      scheduleEndMin    = doc["end_minute"] | 59;

      if (doc.containsKey("active_days")) {
        JsonArray days = doc["active_days"].as<JsonArray>();
        activeDays = 0;
        for (JsonVariant d : days) {
          int day = d.as<int>();
          if (day >= 0 && day <= 6) activeDays |= (1 << day);
        }
      }

      if (doc.containsKey("sniff_interval_sec")) {
        unsigned long newInterval = doc["sniff_interval_sec"].as<unsigned long>();
        if (newInterval >= 10 && newInterval <= 300) {
          sniffIntervalMs = newInterval * 1000;
        }
      }
      if (doc.containsKey("deep_sense_sec")) {
        unsigned long newDeep = doc["deep_sense_sec"].as<unsigned long>();
        if (newDeep >= 15 && newDeep <= 120) deepSenseSec = newDeep;
      }
      if (doc.containsKey("heartbeat_interval")) {
        unsigned long newHb = doc["heartbeat_interval"].as<unsigned long>();
        if (newHb >= 1 && newHb <= 20) heartbeatInterval = newHb;
      }
      if (doc.containsKey("cooldown_sec")) {
        unsigned long newCd = doc["cooldown_sec"].as<unsigned long>();
        if (newCd >= 5 && newCd <= 120) cooldownSec = newCd;
      }
      if (doc.containsKey("spike_threshold")) {
        float newThresh = doc["spike_threshold"].as<float>();
        if (newThresh >= 1.0 && newThresh <= 50.0) LOCAL_SPIKE_THRESHOLD = newThresh;
      }
      if (doc.containsKey("gas_drop_ratio")) {
        float newRatio = doc["gas_drop_ratio"].as<float>();
        if (newRatio >= 0.5 && newRatio <= 0.99) LOCAL_GAS_DROP_RATIO = newRatio;
      }

      Serial.printf("Schedule: %s %02d:%02d-%02d:%02d days=0x%02X\n",
        scheduleEnabled ? "ON" : "OFF",
        scheduleStartHour, scheduleStartMin,
        scheduleEndHour, scheduleEndMin, activeDays);
      Serial.printf("Timings: sniff=%lus hb_every=%lu deep=%lus cool=%lus\n",
        sniffIntervalMs / 1000, heartbeatInterval, deepSenseSec, cooldownSec);
    }
  }
  http.end();
  lastScheduleFetch = millis();
}

bool isWithinSchedule() {
  if (!timesynced || !scheduleEnabled) return true;
  struct tm tm;
  if (!getLocalTime(&tm)) return true;

  if (!(activeDays & (1 << tm.tm_wday))) {
    return false;
  }

  int localHour = (tm.tm_hour - 7 + 24) % 24; // UTC -> PDT
  int nowMin    = localHour * 60 + tm.tm_min;
  int startMin  = scheduleStartHour * 60 + scheduleStartMin;
  int endMin    = scheduleEndHour * 60 + scheduleEndMin;

  return (nowMin >= startMin && nowMin <= endMin);
}

// =============================================================================
//  NimBLE PROVISIONING — Minimal config, safe deinit for ESP32-C6
// =============================================================================
class BLEProvisionCallback : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *pCharacteristic, NimBLEConnInfo &connInfo) override {
    std::string value = pCharacteristic->getValue();
    if (pCharacteristic == bleSsidChar) {
      bleIncomingSSID = String(value.c_str());
      Serial.println("[BLE] Received SSID: " + bleIncomingSSID);
    }
    if (pCharacteristic == blePassChar) {
      bleIncomingPASS = String(value.c_str());
      Serial.println("[BLE] Received PASS");
    }
    if (pCharacteristic == bleOrgChar) {
      bleIncomingORG = String(value.c_str());
      Serial.println("[BLE] Received ORG: " + bleIncomingORG);
    }
    if (bleIncomingSSID.length() > 0 && bleIncomingPASS.length() > 0 && bleIncomingORG.length() > 0) {
      bleProvisioned = true;
    }
  }
};

class MistioBLEServerCB : public NimBLEServerCallbacks {
  void onDisconnect(NimBLEServer *pServer, NimBLEConnInfo &connInfo, int reason) override {
    NimBLEDevice::startAdvertising();
    Serial.println("[BLE] Client disconnected, re-advertising");
  }
};

void startBLEProvisioning() {
  Serial.printf("[BLE] Heap before init: %u\n", ESP.getFreeHeap());

  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char bleName[24];
  snprintf(bleName, sizeof(bleName), "MISTIO-%02X%02X%02X%02X%02X%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

  NimBLEDevice::init(bleName);
  bleServer = NimBLEDevice::createServer();
  bleServer->setCallbacks(new MistioBLEServerCB());

  NimBLEService *svc = bleServer->createService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");

  bleSsidChar = svc->createCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E",
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  bleSsidChar->setCallbacks(new BLEProvisionCallback());

  blePassChar = svc->createCharacteristic("6E400003-B5A3-F393-E0A9-E50E24DCCA9E",
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  blePassChar->setCallbacks(new BLEProvisionCallback());

  bleOrgChar = svc->createCharacteristic("6E400004-B5A3-F393-E0A9-E50E24DCCA9E",
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  bleOrgChar->setCallbacks(new BLEProvisionCallback());

  svc->start();

  // Split across two 31-byte packets to avoid overflow:
  // Main adv: service UUID only (flags 3B + 128-bit UUID 18B = 21B — fits)
  // Scan response: device name only (20B — fits)
  // Both together = everything Chrome needs for namePrefix filter + optionalServices
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData advData;
  advData.addServiceUUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
  adv->setAdvertisementData(advData);

  NimBLEAdvertisementData scanData;
  scanData.setName(bleName);
  adv->setScanResponseData(scanData);
  adv->start();

  bleActive = true;
  Serial.printf("[BLE] Advertising as: %s (heap: %u)\n", bleName, ESP.getFreeHeap());
}

void stopBLEProvisioning() {
  if (!bleActive) return;

  Serial.printf("[BLE] Stopping... heap before: %u\n", ESP.getFreeHeap());

  // Stop advertising and disconnect any clients — do NOT call deinit(),
  // it causes a Store access fault crash on ESP32-C6.
  NimBLEDevice::getAdvertising()->stop();
  if (bleServer && bleServer->getConnectedCount() > 0) {
    bleServer->disconnect(bleServer->getPeerInfo(0).getConnHandle());
  }
  delay(100);  // let disconnect complete
  Serial.printf("[BLE] Stopped (no deinit) — heap after: %u\n", ESP.getFreeHeap());

  bleServer = nullptr;
  bleSsidChar = blePassChar = bleOrgChar = nullptr;
  bleActive = false;
}

void checkBLEProvisioning() {
  if (!bleProvisioned) return;

  Serial.println("[BLE] Provisioning complete — saving credentials");

  // Save to NVS
  prefs.begin("mistio", false);
  prefs.putString("wifi_ssid", bleIncomingSSID);
  prefs.putString("wifi_pass", bleIncomingPASS);
  prefs.putString("org_id", bleIncomingORG);
  prefs.end();

  // Update runtime variables
  ORG_ID = bleIncomingORG;

  stopBLEProvisioning();

  // Connect to the new WiFi
  Serial.println("[BLE] Connecting to provisioned WiFi: " + bleIncomingSSID);
  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin(bleIncomingSSID.c_str(), bleIncomingPASS.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[BLE] WiFi connected: " + WiFi.localIP().toString());
    wifiOn = true;
    neoSet(0, 255, 0);
    syncTime();
  } else {
    Serial.println("[BLE] WiFi failed — will retry next cycle");
    neoFlash(255, 0, 0, 1000);
  }

  // Reset provisioning state for next time
  bleProvisioned = false;
  bleIncomingSSID = "";
  bleIncomingPASS = "";
  bleIncomingORG = "";
}

// Load device identity from NVS (MAC-based ID + saved org)
void loadDeviceIdentity() {
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  DEVICE_ID = String(macStr);

  prefs.begin("mistio", true); // read-only
  String savedOrg = prefs.getString("org_id", "");
  String savedSsid = prefs.getString("wifi_ssid", "");
  String savedPass = prefs.getString("wifi_pass", "");
  prefs.end();

  if (savedOrg.length() > 0) {
    ORG_ID = savedOrg;
    Serial.println("Loaded org from NVS: " + ORG_ID);
  }

  // If NVS has WiFi creds from BLE provisioning, use those as defaults
  if (savedSsid.length() > 0) {
    DEFAULT_SSID = strdup(savedSsid.c_str());
    DEFAULT_PASSWORD = strdup(savedPass.c_str());
    Serial.println("Loaded WiFi creds from NVS: " + savedSsid);
  }
}

// =============================================================================
//  OTA FIRMWARE UPDATE
// =============================================================================
void checkForOTA() {
  if (!wifiOn) return;

  Serial.printf("[OTA] Checking for updates (current: %s)...\n", FIRMWARE_VERSION);
  lastOtaCheck = millis();

  {
    WiFiClientSecure checkClient;
    checkClient.setInsecure();
    HTTPClient http;

    String url = OTA_CHECK_URL + "?device_id=" + DEVICE_ID + "&current_version=" + FIRMWARE_VERSION;
    http.begin(checkClient, url);
    http.setTimeout(10000);

    int code = http.GET();
    if (code != 200) {
      Serial.printf("[OTA] Check returned %d — skipping\n", code);
      http.end();
      return;
    }

    String payload = http.getString();
    http.end();

    DynamicJsonDocument doc(512);
    if (deserializeJson(doc, payload)) {
      Serial.println("[OTA] Bad JSON response");
      return;
    }

    bool updateAvailable = doc["update_available"] | false;
    String newVersion = doc["version"] | "";
    String binUrl = doc["download_url"] | "";

    if (!updateAvailable || binUrl.length() == 0) {
      Serial.printf("[OTA] Up to date (latest: %s)\n", newVersion.c_str());
      return;
    }

    // Client-side semver guard: never downgrade
    int curMaj=0, curMin=0, curPat=0, newMaj=0, newMin=0, newPat=0;
    sscanf(FIRMWARE_VERSION, "%d.%d.%d", &curMaj, &curMin, &curPat);
    sscanf(newVersion.c_str(), "%d.%d.%d", &newMaj, &newMin, &newPat);
    long curVer = curMaj*10000L + curMin*100L + curPat;
    long newVer = newMaj*10000L + newMin*100L + newPat;
    if (newVer <= curVer) {
      Serial.printf("[OTA] Skipping downgrade: %s -> %s\n", FIRMWARE_VERSION, newVersion.c_str());
      return;
    }

    Serial.printf("[OTA] Update available: %s -> %s\n", FIRMWARE_VERSION, newVersion.c_str());
    Serial.printf("[OTA] Downloading: %s\n", binUrl.c_str());
    neoSet(255, 165, 0); // orange = updating

    // New secure client for the download (previous one may be stale)
    WiFiClientSecure dlClient;
    dlClient.setInsecure();
    httpUpdate.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
    t_httpUpdate_return ret = httpUpdate.update(dlClient, binUrl);

    switch (ret) {
      case HTTP_UPDATE_FAILED:
        Serial.printf("[OTA] FAILED: %s\n", httpUpdate.getLastErrorString().c_str());
        neoFlash(255, 0, 0, 2000);
        break;
      case HTTP_UPDATE_NO_UPDATES:
        Serial.println("[OTA] No update needed");
        break;
      case HTTP_UPDATE_OK:
        Serial.println("[OTA] Success — rebooting...");
        break;
    }
  }
}

// =============================================================================
//  UTILITIES
// =============================================================================
void keepalivePulse() {
  unsigned long now = millis();
  if (now - lastKeepAlive >= KEEPALIVE_INTERVAL) {
    digitalWrite(LED_PIN, HIGH);
    delay(KEEPALIVE_DURATION);
    digitalWrite(LED_PIN, LOW);
    lastKeepAlive = now;
  }
}

String buildUrl(const char* path) {
  return String(USE_HTTPS ? "https://" : "http://") + BACKEND_HOST + String(path);
}

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(delayMs);
    digitalWrite(LED_PIN, LOW);  delay(delayMs);
  }
}
