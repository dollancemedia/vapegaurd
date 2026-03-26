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
 * Optimizations over v2:
 *   - BMV080 duty cycling: reset() stops laser between sniffs (~5mA saved)
 *   - MSA311 hardware INT wakeup instead of polling
 *   - ESP32-C6 light sleep between sniffs (~0.3mA vs 15mA)
 *   - WiFi ON only during POST, fully OFF between
 *   - Removed microphone (no hardware)
 *   - MSA311 at 62.5Hz instead of 500Hz
 *
 * Power budget (60s sniff cycle):
 *   Sleep 53s × 0.4mA + Active 7s × 70mA = avg 8.5mA
 *   40Ah battery, 8h school day = 588 school days (3+ years)
 *
 * State Machine:
 *   STARTUP (150s) — warmup 90s + calibration 60s, WiFi ON, 1Hz POST
 *   SNIFF          — light sleep between reads. Wake every 60s, burst-read,
 *                    heartbeat POST every 4th sniff. MSA311 INT wakes on tamper.
 *   DEEP_SENSE     — spike detected: 1Hz POST for 30s (no sleep, WiFi stays on)
 *   COOLDOWN       — 20s ignore spikes, light sleep. Then → SNIFF.
 *
 * WiFi Provisioning:
 *   WiFiManager captive portal. Power cycle 3x in 10s to force portal.
 *   AP name: "MistioSensor-001"
 */

#include <WiFi.h>
#include <esp_wifi.h>
#include <WiFiManager.h>
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

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const char* DEFAULT_SSID     = "sweethome";
const char* DEFAULT_PASSWORD = "rahul2008";

const char* BACKEND_HOST = "vapegaurd-production.up.railway.app";
const bool  USE_HTTPS    = true;

const String DEVICE_ID = "ESP32_C6_001";
const String LOCATION  = "School Bathroom";
const String ORG_ID    = "irvington";

// AP name built from last 4 of MAC in setup() — unique per device
char AP_NAME[24] = "MistioSensor";

// ─── State machine timing ───────────────────────────────────────────────────
const unsigned long WARMUP_SEC          = 90;
const unsigned long CALIBRATION_SEC     = 60;
const unsigned long STARTUP_SEC         = WARMUP_SEC + CALIBRATION_SEC;
const unsigned long STARTUP_SAMPLE_MS   = 2000;

unsigned long sniffIntervalMs    = 60000;
unsigned long heartbeatInterval  = 4;
unsigned long deepSenseSec       = 30;
unsigned long deepSenseRateMs    = 1000;
unsigned long cooldownSec        = 20;

// ─── Local spike detection ──────────────────────────────────────────────────
const float LOCAL_SPIKE_THRESHOLD = 8.0;
const float LOCAL_GAS_DROP_RATIO  = 0.85;
const float LOCAL_EWMA_ALPHA      = 0.1;
const float LOCAL_EWMA_ALPHA_CAL  = 0.5;
const float TAMPER_THRESHOLD      = 2.0;

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
const unsigned long WM_PORTAL_TIMEOUT  = 120;
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.nist.gov";
const unsigned long SCHEDULE_FETCH_INTERVAL = 300000;
const int RESET_COUNT_TRIGGER = 3;

// ─────────────────────────────────────────────────────────────────────────────
//  Hardware pins — Adafruit Feather ESP32-C6
// ─────────────────────────────────────────────────────────────────────────────
#define I2C_POWER_PIN  20
#define LED_PIN        15
#define NEOPIXEL_PIN    9
#define NEOPIXEL_COUNT  1
#define MSA311_INT_PIN  5  // MSA311 INT1 → GPIO5 (wakes ESP32 from light sleep)

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

// ─── Schedule ───────────────────────────────────────────────────────────────
int scheduleStartHour = 0, scheduleStartMin = 0;
int scheduleEndHour   = 23, scheduleEndMin  = 59;
bool scheduleEnabled  = false;
uint8_t activeDays    = 0x3E; // Mon-Fri
unsigned long lastScheduleFetch = 0;

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

// ─── Forward declarations ───────────────────────────────────────────────────
bool  connectWiFiManager(bool forcePortal);
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
bool  shouldForcePortal();
void  clearResetFlag();
void  neoSet(uint8_t r, uint8_t g, uint8_t b);
void  neoOff();
void  neoFlash(uint8_t r, uint8_t g, uint8_t b, int durationMs);
void  pushToRingBuffer();
String getISOTimestamp();
void  sleepHeavySensors();
void  wakeHeavySensors();
void  enterLightSleep(unsigned long durationMs);

// =============================================================================
//  TRIPLE-RESET DETECTION
// =============================================================================
bool shouldForcePortal() {
  prefs.begin("mistio", false);
  bool pending = prefs.getBool("rstPending", false);
  int resetCount;
  if (pending) {
    resetCount = prefs.getInt("rstCount", 0) + 1;
  } else {
    resetCount = 1;
  }
  prefs.putInt("rstCount", resetCount);
  prefs.putBool("rstPending", true);
  prefs.end();

  Serial.printf("Reset count: %d / %d\n", resetCount, RESET_COUNT_TRIGGER);

  if (resetCount >= RESET_COUNT_TRIGGER) {
    prefs.begin("mistio", false);
    prefs.putInt("rstCount", 0);
    prefs.putBool("rstPending", false);
    prefs.end();
    Serial.println(">>> TRIPLE RESET — forcing WiFi portal <<<");
    return true;
  }
  return false;
}

void clearResetFlag() {
  prefs.begin("mistio", false);
  prefs.putBool("rstPending", false);
  prefs.putInt("rstCount", 0);
  prefs.end();
}

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
//  LIGHT SLEEP — ESP32-C6 CPU off, RAM retained, GPIO + timer wakeup
// =============================================================================
void enterLightSleep(unsigned long durationMs) {
  // Arm timer wakeup
  esp_sleep_enable_timer_wakeup((uint64_t)durationMs * 1000ULL); // microseconds

  // Arm MSA311 INT pin as GPIO wakeup (active HIGH on motion)
  if (msa311Available) {
    esp_sleep_enable_gpio_wakeup();
    gpio_wakeup_enable((gpio_num_t)MSA311_INT_PIN, GPIO_INTR_HIGH_LEVEL);
  }

  // Turn off NeoPixel before sleep
  neoOff();

  // Enter light sleep — CPU stops, wakes on timer or GPIO
  esp_light_sleep_start();

  // We wake up here. Check why.
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  if (cause == ESP_SLEEP_WAKEUP_GPIO) {
    Serial.println("Woke: MSA311 tamper interrupt");
  }
  // Timer wakeup is the normal case — no log needed
}

// =============================================================================
//  SETUP
// =============================================================================
void setup() {
  esp_task_wdt_deinit();
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== ESP32-C6 Optimized WiFi Sensor v3 ===");
  Serial.println("Device: " + DEVICE_ID);

  // Build unique AP name from MAC address (last 4 hex chars)
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  snprintf(AP_NAME, sizeof(AP_NAME), "Mistio-%02X%02X", mac[4], mac[5]);
  Serial.printf("AP Name: %s\n", AP_NAME);

  DATA_URL     = buildUrl("/api/sensors/data");
  TAMPER_URL   = buildUrl("/api/sensors/tamper");
  SCHEDULE_URL = buildUrl(("/api/devices/" + DEVICE_ID + "/schedule").c_str());
  Serial.println("Backend: " + DATA_URL);

  neopixel.begin();
  neopixel.setBrightness(30);
  neoSet(255, 255, 0); // yellow = booting

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // MSA311 INT pin as input (hardware interrupt for tamper wakeup)
  pinMode(MSA311_INT_PIN, INPUT);

  for (int i = 0; i < RING_BUFFER_SIZE; i++) {
    ringBuffer[i].valid = false;
  }

  bool forcePortal = shouldForcePortal();

  powerOnSensors();
  initSensors();

  // Connect WiFi
  neoSet(0, 0, 255);
  connectWiFiManager(forcePortal);
  wifiOn = (WiFi.status() == WL_CONNECTED);

  if (wifiOn) {
    neoSet(0, 255, 0);
    syncTime();
    fetchSchedule();
    delay(500);
  } else {
    neoFlash(255, 0, 0, 1000);
  }

  clearResetFlag();

  enterState(STATE_STARTUP);
  Serial.println("Setup complete — entering STARTUP (150s warmup+calibration)");
}

// =============================================================================
//  MAIN LOOP — State machine with light sleep
// =============================================================================
void loop() {
  unsigned long now = millis();
  unsigned long elapsed = now - stateEnteredAt;

  keepalivePulse();

  // Schedule check
  if (wifiOn && (now - lastScheduleFetch > SCHEDULE_FETCH_INTERVAL)) {
    fetchSchedule();
  }

  // Outside school hours — deep sleep with periodic keepalive
  if (scheduleEnabled && !isWithinSchedule()) {
    Serial.println("Outside school hours — sleeping 60s");
    if (wifiOn) wifiOff_disconnect();
    sleepHeavySensors();
    neoOff();
    enterLightSleep(60000);
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

        wifiOff_disconnect();
        sleepHeavySensors(); // BMV080 laser OFF
        neoOff();
        enterState(STATE_SNIFF);
      } else {
        delay(STARTUP_SAMPLE_MS);
      }
      break;
    }

    // ── SNIFF: light sleep between reads, wake on timer or tamper ───────
    case STATE_SNIFF: {
      // Check if we woke from MSA311 tamper interrupt
      esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
      if (cause == ESP_SLEEP_WAKEUP_GPIO) {
        // Tamper wakeup — send alert
        Serial.println("TAMPER wakeup in SNIFF!");
        checkAndSendTamper();
        // Go back to sleep for remaining time
        unsigned long timeSinceSniff = millis() - lastSniffTime;
        if (timeSinceSniff < sniffIntervalMs) {
          enterLightSleep(sniffIntervalMs - timeSinceSniff);
          return;
        }
      }

      // Time for a sniff read
      now = millis();
      if (now - lastSniffTime >= sniffIntervalMs || lastSniffTime == 0) {
        lastSniffTime = now;
        sniffCount++;

        // Wake BMV080 laser + BME680
        wakeHeavySensors();
        delay(2000); // BMV080 laser warmup after init()

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

        // Check for spike
        if (baselineReady && isLocalSpike()) {
          Serial.println("!! LOCAL SPIKE — entering DEEP_SENSE !!");
          neoFlash(255, 0, 0, 200);
          wakeHeavySensors(); // keep sensors on for 1Hz reads
          wifiOn_connect();
          if (wifiOn) {
            postBatchData(); // send cached baseline
          }
          enterState(STATE_DEEP_SENSE);
          break;
        }

        // Heartbeat POST every Nth sniff
        if (sniffCount % heartbeatInterval == 0) {
          Serial.println("Heartbeat POST");
          neoFlash(0, 255, 0, 150);
          wifiOn_connect();
          if (wifiOn) {
            postSensorData();
            wifiOff_disconnect();
          }
        } else {
          Serial.printf("Sniff #%d: PM2.5=%.1f (base=%.1f, d=%.1f) Gas=%.1f (base=%.1f)\n",
            sniffCount, lastPM25, baselinePM25, lastPM25 - baselinePM25,
            lastGas, baselineGas);
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
        enterLightSleep(sleepTime);
      }
      break;
    }

    // ── DEEP_SENSE: 1Hz POST for 30s (no sleep, sensors + WiFi ON) ─────
    case STATE_DEEP_SENSE: {
      neoSet(255, 0, 0);

      if (!heavySensorsOn) wakeHeavySensors();

      readAllSensors();

      if (!wifiOn) wifiOn_connect();
      if (wifiOn) postSensorData();

      if (msa311Available) checkAndSendTamper();

      if (elapsed >= deepSenseSec * 1000) {
        Serial.println("Deep sense complete — entering COOLDOWN");
        // Send final reading with deep_sense_complete flag
        if (wifiOn) {
          DynamicJsonDocument finalDoc(256);
          finalDoc["device_id"] = DEVICE_ID;
          finalDoc["org_id"]    = ORG_ID;
          finalDoc["duty_state"] = "deep_sense_complete";
          finalDoc["timestamp"]  = getISOTimestamp();
          String finalPayload;
          serializeJson(finalDoc, finalPayload);
          WiFiClientSecure sc;
          sc.setInsecure();
          HTTPClient fhttp;
          fhttp.begin(sc, DATA_URL);
          fhttp.addHeader("Content-Type", "application/json");
          fhttp.setTimeout(HTTP_TIMEOUT_MS);
          fhttp.POST(finalPayload);
          fhttp.end();
        }
        wifiOff_disconnect();
        sleepHeavySensors();
        neoOff();
        enterState(STATE_COOLDOWN);
      } else {
        delay(deepSenseRateMs);
      }
      break;
    }

    // ── COOLDOWN: 20s, light sleep, tamper still active ─────────────────
    case STATE_COOLDOWN: {
      // Check for tamper wakeup
      if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_GPIO) {
        checkAndSendTamper();
      }

      if (elapsed >= cooldownSec * 1000) {
        Serial.println("Cooldown complete — back to SNIFF");
        neoOff();
        enterState(STATE_SNIFF);
      } else {
        // Brief orange flash then sleep
        neoFlash(255, 80, 0, 50);
        unsigned long remaining = cooldownSec * 1000 - elapsed;
        unsigned long sleepTime = min(remaining, (unsigned long)5000);
        enterLightSleep(sleepTime);
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

  if (bmv080Available) {
    if (bmv.reset()) {
      Serial.println("BMV080 laser OFF (reset to standby)");
    } else {
      Serial.println("BMV080 reset failed");
    }
  }

  heavySensorsOn = false;
}

void wakeHeavySensors() {
  if (heavySensorsOn) return;

  if (bmv080Available) {
    if (bmv.init()) {
      bmv.setMode(SF_BMV080_MODE_CONTINUOUS);
      Serial.println("BMV080 laser ON");
    } else {
      Serial.println("BMV080 re-init failed, trying begin+init...");
      if (bmv.begin(0x57, Wire) && bmv.init()) {
        bmv.setMode(SF_BMV080_MODE_CONTINUOUS);
        Serial.println("BMV080 recovered");
      } else {
        Serial.println("BMV080 FAILED to recover");
        bmv080Available = false;
      }
    }
  }

  heavySensorsOn = true;
}

// =============================================================================
//  BURST READ BMV080
// =============================================================================
void burstReadBMV080() {
  if (!bmv080Available) return;

  float pm25Buf[BURST_TOTAL_READS];
  float pm10Buf[BURST_TOTAL_READS];
  float pm1Buf[BURST_TOTAL_READS];
  int   validCount = 0;
  bool  obstructed = false;

  for (int i = 0; i < BURST_TOTAL_READS; i++) {
    if (bmv.readSensor()) {
      pm25Buf[i] = bmv.PM25();
      pm10Buf[i] = bmv.PM10();
      pm1Buf[i]  = bmv.PM1();
      if (bmv.isObstructed()) obstructed = true;
      if (i >= BURST_DISCARD) validCount++;
    } else {
      pm25Buf[i] = -1;
      pm10Buf[i] = -1;
      pm1Buf[i]  = -1;
    }
    delay(BURST_DELAY_MS);
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
  float deltaPM25 = lastPM25 - baselinePM25;
  if (deltaPM25 >= LOCAL_SPIKE_THRESHOLD) {
    Serial.printf("SPIKE: PM2.5 delta=%.1f (threshold=%.1f)\n", deltaPM25, LOCAL_SPIKE_THRESHOLD);
    return true;
  }

  if (baselineGas > 0 && lastGas > 0) {
    float gasRatio = lastGas / baselineGas;
    if (gasRatio <= LOCAL_GAS_DROP_RATIO) {
      Serial.printf("SPIKE: Gas drop ratio=%.2f (threshold=%.2f)\n", gasRatio, LOCAL_GAS_DROP_RATIO);
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
  WiFi.mode(WIFI_STA);
  WiFi.begin();

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
  }
}

void wifiOff_disconnect() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  wifiOn = false;
}

// =============================================================================
//  WiFiManager
// =============================================================================
bool connectWiFiManager(bool forcePortal) {
  // Try hardcoded defaults first (fastest path, no portal needed)
  if (!forcePortal && strlen(DEFAULT_SSID) > 0) {
    Serial.printf("Trying default WiFi: %s\n", DEFAULT_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(DEFAULT_SSID, DEFAULT_PASSWORD);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
      delay(250);
      Serial.print(".");
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("WiFi OK (defaults) — " + WiFi.localIP().toString() + " (" + String(WiFi.RSSI()) + " dBm)");
      return true;
    }
    Serial.println("Default creds failed, trying WiFiManager...");
    WiFi.disconnect(true);
  }

  WiFiManager wm;
  wm.setConfigPortalTimeout(WM_PORTAL_TIMEOUT);
  wm.setConnectTimeout(15);
  wm.setDarkMode(true);
  wm.setShowInfoUpdate(false);
  wm.setShowInfoErase(false);

  if (forcePortal) {
    Serial.println("Opening WiFi portal (forced)...");
    blinkLED(10, 100);
    wm.startConfigPortal(AP_NAME);
  } else {
    Serial.println("Connecting WiFi (saved creds)...");
    wm.autoConnect(AP_NAME);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi OK — " + WiFi.localIP().toString() + " (" + String(WiFi.RSSI()) + " dBm)");
    return true;
  }
  Serial.println("WiFi not configured");
  return false;
}

// =============================================================================
//  SENSOR POWER + INIT
// =============================================================================
void powerOnSensors() {
  pinMode(I2C_POWER_PIN, OUTPUT);
  digitalWrite(I2C_POWER_PIN, HIGH);
  Serial.println("Stemma QT power ON");
  delay(500);

  Wire.begin();
  Wire.setClock(100000);
  delay(250);

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
  // BME680
  if (bme.begin(0x77) || bme.begin(0x76)) {
    bme680Available = true;
    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
    bme.setGasHeater(320, 150);
    Serial.println("BME680 OK");
  } else {
    Serial.println("BME680 not found");
  }

  // MSA311 — low data rate + hardware interrupt for tamper
  if (msa.begin()) {
    msa311Available = true;
    msa.setDataRate(MSA301_DATARATE_62_5_HZ); // low rate saves power (~15uA)
    msa.setRange(MSA301_RANGE_4_G);
    // Enable active motion interrupt on all axes
    msa.enableInterrupts(false, false, true, true, true);
    Serial.println("MSA311 OK — 62.5Hz, motion INT enabled");

    sensors_event_t accel;
    msa.getEvent(&accel);
    prevAccelMag = sqrt(
      accel.acceleration.x * accel.acceleration.x +
      accel.acceleration.y * accel.acceleration.y +
      accel.acceleration.z * accel.acceleration.z
    );
  } else {
    Serial.println("MSA311 not found");
  }

  // BMV080
  if (bmv.begin(0x57, Wire)) {
    Serial.println("BMV080 connected");
    if (bmv.init()) {
      bmv080Available = true;
      bmv.setMode(SF_BMV080_MODE_CONTINUOUS);
      Serial.println("BMV080 OK — continuous mode");
    } else {
      Serial.println("BMV080 init() failed");
    }
  } else {
    Serial.println("BMV080 not found at 0x57");
  }
}

// =============================================================================
//  READ ALL SENSORS (STARTUP and DEEP_SENSE — no duty cycling)
// =============================================================================
void readAllSensors() {
  if (bme680Available && bme.performReading()) {
    lastTemp     = bme.temperature;
    lastHumidity = bme.humidity;
    lastPressure = bme.pressure / 100.0;
    lastGas      = bme.gas_resistance / 1000.0;
  }

  if (bmv080Available && bmv.readSensor()) {
    lastPM1  = bmv.PM1();
    lastPM25 = bmv.PM25();
    lastPM10 = bmv.PM10();
    lastBmvObstructed = bmv.isObstructed();
  }
}

// =============================================================================
//  POST SENSOR DATA
// =============================================================================
bool postSensorData() {
  DynamicJsonDocument doc(1024);
  doc["device_id"]       = DEVICE_ID;
  doc["location"]        = LOCATION;
  doc["org_id"]          = ORG_ID;
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

  WiFiClientSecure secClient;
  secClient.setInsecure(); // skip cert verify for speed
  HTTPClient http;
  http.begin(secClient, DATA_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(HTTP_TIMEOUT_MS);
  int code = http.POST(payload);

  bool ok = (code == 200 || code == 201);
  String resp = http.getString();
  if (ok) {
    DynamicJsonDocument respDoc(512);
    if (!deserializeJson(respDoc, resp) && respDoc.containsKey("prediction")) {
      String cls  = respDoc["prediction"]["predicted_class"].as<String>();
      float  conf = respDoc["prediction"]["confidence"];
      Serial.printf("  -> %s (%.1f%%)\n", cls.c_str(), conf);
    }
  } else {
    Serial.printf("POST error: %d — %s\n", code, resp.c_str());
  }
  http.end();
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

      WiFiClientSecure secClient;
      secClient.setInsecure();
      HTTPClient http;
      http.begin(secClient, DATA_URL);
      http.addHeader("Content-Type", "application/json");
      http.setTimeout(HTTP_TIMEOUT_MS);
      int code = http.POST(payload);
      http.end();

      if (code == 200 || code == 201) sent++;
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

  sensors_event_t accel;
  msa.getEvent(&accel);

  float ax = accel.acceleration.x;
  float ay = accel.acceleration.y;
  float az = accel.acceleration.z;
  float mag = sqrt(ax * ax + ay * ay + az * az);
  float delta = abs(mag - prevAccelMag);
  prevAccelMag = mag;

  if (delta > TAMPER_THRESHOLD) {
    if (millis() - lastTamperSent < 5000) return;
    lastTamperSent = millis();

    Serial.printf("TAMPER! delta=%.2f\n", delta);
    neoFlash(255, 0, 255, 300);

    if (!wifiOn) wifiOn_connect();
    if (!wifiOn) return;

    DynamicJsonDocument doc(256);
    doc["device_id"] = DEVICE_ID;
    doc["org_id"]    = ORG_ID;
    doc["accel_x"]   = ax;
    doc["accel_y"]   = ay;
    doc["accel_z"]   = az;

    String payload;
    serializeJson(doc, payload);

    WiFiClientSecure secClient;
    secClient.setInsecure();
    HTTPClient http;
    http.begin(secClient, TAMPER_URL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(HTTP_TIMEOUT_MS);
    int code = http.POST(payload);
    Serial.printf("Tamper POST -> %d\n", code);
    http.end();

    // Disconnect WiFi after tamper POST (we're in sleep mode)
    wifiOff_disconnect();
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
  WiFiClientSecure secClient;
  secClient.setInsecure();
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
