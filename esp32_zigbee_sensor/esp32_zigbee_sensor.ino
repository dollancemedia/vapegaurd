/*
 * ESP32-C6 Vape Detection Sensor — Zigbee Mesh Build
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
 * Transport: Zigbee End Device → Hub (coordinator) → WiFi → Backend
 *   EP 10: ZigbeeTempSensor — reports temperature + humidity
 *   The hub reconstructs the full JSON payload and POSTs to backend.
 *
 * State Machine (same as WiFi build):
 *   STARTUP (150s) — warmup 90s + calibration 60s, report at 1Hz
 *   SNIFF          — burst-read every 60s, heartbeat every 4th sniff
 *   DEEP_SENSE     — spike detected: 1Hz reporting for 30s
 *   COOLDOWN       — 20s ignore spikes, then → SNIFF
 *
 * Tools -> Zigbee mode: Zigbee ED (end device)
 * Tools -> Partition Scheme: Zigbee 4MB with spiffs
 * Tools -> USB CDC On Boot: Enabled
 */

#ifndef ZIGBEE_MODE_ED
#error "Zigbee end device mode is not selected in Tools->Zigbee mode"
#endif

#include "Zigbee.h"
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include <Adafruit_MSA301.h>
#include <SparkFun_BMV080_Arduino_Library.h>
#include <Adafruit_NeoPixel.h>
#include <esp_sleep.h>
#include <esp_task_wdt.h>

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

// Zigbee endpoints — each carries a pair of values encoded as temp+humidity
#define EP_TEMP_HUM   10  // temperature + humidity (real)
#define EP_PM_GAS     11  // PM2.5 (as temp) + gas_resistance in kOhm (as humidity)

// ─── State machine timing ───────────────────────────────────────────────────
const unsigned long WARMUP_SEC          = 90;
const unsigned long CALIBRATION_SEC     = 60;
const unsigned long STARTUP_SEC         = WARMUP_SEC + CALIBRATION_SEC; // 150s
const unsigned long STARTUP_SAMPLE_MS   = 2000;

unsigned long sniffIntervalMs    = 60000;  // 60s between sniff wakes
unsigned long heartbeatInterval  = 4;      // report every Nth sniff
unsigned long deepSenseSec       = 30;     // dense sampling window
unsigned long deepSenseRateMs    = 1000;   // 1Hz during deep sense
unsigned long cooldownSec        = 20;     // ignore spikes after event

// ─── Local spike detection ──────────────────────────────────────────────────
const float LOCAL_SPIKE_THRESHOLD = 8.0;
const float LOCAL_GAS_DROP_RATIO  = 0.85;
const float LOCAL_EWMA_ALPHA      = 0.1;
const float LOCAL_EWMA_ALPHA_CAL  = 0.5;
const float TAMPER_THRESHOLD      = 2.0;

// ─── Burst sampling config ──────────────────────────────────────────────────
const int BURST_TOTAL_READS = 5;
const int BURST_DISCARD     = 2;
const int BURST_DELAY_MS    = 100;

// ─── Power bank keepalive ───────────────────────────────────────────────────
const unsigned long KEEPALIVE_INTERVAL = 30000;
const unsigned long KEEPALIVE_DURATION = 150;

// ─────────────────────────────────────────────────────────────────────────────
//  Hardware pins — Adafruit Feather ESP32-C6
// ─────────────────────────────────────────────────────────────────────────────
#define I2C_POWER_PIN  20
#define LED_PIN        15
#define NEOPIXEL_PIN    9
#define NEOPIXEL_COUNT  1
// MIC_PIN removed — no microphone in current hardware

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
Adafruit_NeoPixel neopixel(NEOPIXEL_COUNT, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);

// Zigbee endpoints — each pair encoded as temp+humidity
ZigbeeTempSensor zbTempHum  = ZigbeeTempSensor(EP_TEMP_HUM);
ZigbeeTempSensor zbPMGas    = ZigbeeTempSensor(EP_PM_GAS);

// ─── Sensor state ───────────────────────────────────────────────────────────
bool bme680Available = false;
bool msa311Available = false;
bool bmv080Available = false;
bool zigbeeConnected = false;

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

// ─── Last sensor readings ───────────────────────────────────────────────────
float lastPM25 = 0, lastPM10 = 0, lastPM1 = 0;
float lastTemp = 0, lastHumidity = 0, lastPressure = 0, lastGas = 0;
bool  lastBmvObstructed = false;

// ─── Forward declarations ───────────────────────────────────────────────────
void powerOnSensors();
void sleepHeavySensors();
void wakeHeavySensors();
void initSensors();
void readAllSensors();
void burstReadBMV080();
void reportToHub();
void reportTamper();
void updateLocalBaseline(bool fastAlpha);
bool isLocalSpike();
bool checkTamper();
void enterState(SensorState newState);
void neoSet(uint8_t r, uint8_t g, uint8_t b);
void neoOff();
void neoFlash(uint8_t r, uint8_t g, uint8_t b, int durationMs);
void keepalivePulse();
void blinkLED(int times, int delayMs);

bool heavySensorsOn = true;  // BME680 + BMV080 active state
volatile bool tamperDetected = false;
unsigned long lastTamperReport = 0;
const unsigned long TAMPER_COOLDOWN_MS = 10000; // min 10s between tamper alerts


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
//  SETUP
// =============================================================================
void setup() {
  esp_task_wdt_deinit();
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== ESP32-C6 Zigbee Vape Sensor ===");

  // Init NeoPixel
  neopixel.begin();
  neopixel.setBrightness(30);
  neoSet(255, 255, 0); // yellow = booting

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Power on sensors and init
  powerOnSensors();
  initSensors();

  // ── Zigbee Setup ──────────────────────────────────────────────────────
  neoSet(0, 0, 255); // blue = joining Zigbee network
  Serial.println("Starting Zigbee End Device...");

  // EP 10: real temp + humidity
  zbTempHum.setManufacturerAndModel("Mistio", "VapeSensor");
  zbTempHum.setMinMaxValue(-10, 80);
  zbTempHum.setTolerance(1);
  zbTempHum.setPowerSource(ZB_POWER_SOURCE_BATTERY, 100, 50);
  zbTempHum.addHumiditySensor(0, 100, 1, 0.0);
  Zigbee.addEndpoint(&zbTempHum);

  // EP 11: PM2.5 (as temp) + gas_resistance in kOhm (as humidity)
  zbPMGas.setManufacturerAndModel("Mistio", "PMGas");
  zbPMGas.setMinMaxValue(0, 1000);
  zbPMGas.addHumiditySensor(0, 2000, 1, 0.0);
  Zigbee.addEndpoint(&zbPMGas);

  // Custom ED config with 10s keep-alive (matches official sleepy sensor example)
  esp_zb_cfg_t zigbeeConfig = ZIGBEE_DEFAULT_ED_CONFIG();
  zigbeeConfig.nwk_cfg.zed_cfg.keep_alive = 10000;
  Zigbee.setPrimaryChannelMask(1 << 15);  // Fixed channel 15 — matches hub
  Zigbee.setTimeout(30000);

  if (!Zigbee.begin(&zigbeeConfig, false)) {
    Serial.println("Zigbee FAILED to start! Rebooting...");
    neoSet(255, 0, 0);
    delay(3000);
    ESP.restart();
  }

  Serial.println("Waiting for Zigbee network...");
  int attempts = 0;
  while (!Zigbee.connected()) {
    Serial.print(".");
    delay(500);
    attempts++;
    if (attempts > 120) { // 60s timeout
      Serial.println("\nZigbee join timeout! Rebooting...");
      neoSet(255, 0, 0);
      delay(3000);
      ESP.restart();
    }
  }
  Serial.println("\nZigbee connected to coordinator!");
  zigbeeConnected = true;
  neoSet(0, 255, 0); // green = connected
  delay(500);

  // Enter STARTUP state
  enterState(STATE_STARTUP);
  Serial.println("Setup complete — entering STARTUP (150s warmup+calibration)");
}

// =============================================================================
//  MAIN LOOP — State machine
// =============================================================================
void loop() {
  unsigned long now = millis();
  unsigned long elapsed = now - stateEnteredAt;

  keepalivePulse();

  switch (currentState) {

    // ── STARTUP: 150s of continuous 1Hz sampling ─────────────────────────
    case STATE_STARTUP: {
      // Rainbow NeoPixel during startup
      if (elapsed % 2000 < 50) {
        uint32_t color = neopixel.ColorHSV((elapsed / 10) * 256);
        neopixel.setPixelColor(0, color);
        neopixel.show();
      }

      readAllSensors();

      // Update local baseline (fast alpha during calibration phase)
      bool inCalibration = (elapsed > WARMUP_SEC * 1000);
      if (inCalibration && bmv080Available) {
        updateLocalBaseline(true);
        calibSamples++;
      }

      // Report to hub via Zigbee
      reportToHub();

      // Transition after 150s
      if (elapsed >= STARTUP_SEC * 1000) {
        if (calibSamples > 0) {
          baselineReady = true;
          Serial.printf("Baseline frozen: PM2.5=%.1f PM10=%.1f Gas=%.1f (%d samples)\n",
            baselinePM25, baselinePM10, baselineGas, calibSamples);
        } else {
          Serial.println("WARNING: No BMV080 data during calibration — baseline not set");
        }
        neoOff();
        enterState(STATE_SNIFF);
      } else {
        delay(STARTUP_SAMPLE_MS);
      }
      break;
    }

    // ── SNIFF: heavy sensors sleep between reads, MSA311 always on ─────
    case STATE_SNIFF: {
      if (now - lastSniffTime >= sniffIntervalMs) {
        lastSniffTime = now;
        sniffCount++;

        // Wake BME680 + BMV080 for reading
        wakeHeavySensors();
        delay(2000); // BMV080 needs ~2s after init() for laser to stabilize

        neoSet(0, 0, 40); // blue pulse

        burstReadBMV080();

        if (bme680Available && bme.performReading()) {
          lastTemp     = bme.temperature;
          lastHumidity = bme.humidity;
          lastPressure = bme.pressure / 100.0;
          lastGas      = bme.gas_resistance / 1000.0;
        }

        if (baselineReady && bmv080Available) {
          updateLocalBaseline(false);
        }

        neoOff();

        // Check for spike
        if (baselineReady && isLocalSpike()) {
          Serial.println("!! LOCAL SPIKE DETECTED — entering DEEP_SENSE !!");
          neoFlash(255, 0, 0, 200);
          // Keep heavy sensors ON for DEEP_SENSE 1Hz reads
          enterState(STATE_DEEP_SENSE);
          break;
        }

        // Heartbeat report every Nth sniff
        if (sniffCount % heartbeatInterval == 0) {
          Serial.println("Heartbeat report via Zigbee");
          neoFlash(0, 255, 0, 150);
          reportToHub();
        } else {
          Serial.printf("Sniff #%d: PM2.5=%.1f (base=%.1f, d=%.1f) Gas=%.1f (base=%.1f)\n",
            sniffCount, lastPM25, baselinePM25, lastPM25 - baselinePM25,
            lastGas, baselineGas);
        }

        // Sleep heavy sensors until next sniff (MSA311 stays on)
        sleepHeavySensors();
        neoOff();
      }

      // ── Always-on tamper check (MSA311 polling) ──
      if (checkTamper()) {
        reportTamper();
      }

      // Keepalive pulse for power bank
      keepalivePulse();
      delay(100);
      break;
    }

    // ── DEEP_SENSE: 1Hz report for 30s (heavy sensors stay ON) ──────────
    case STATE_DEEP_SENSE: {
      neoSet(255, 0, 0); // red

      // Ensure heavy sensors are on (they should be from spike detection)
      if (!heavySensorsOn) wakeHeavySensors();

      readAllSensors();
      reportToHub();

      if (elapsed >= deepSenseSec * 1000) {
        Serial.println("Deep sense complete — entering COOLDOWN");
        sleepHeavySensors();
        neoOff();
        enterState(STATE_COOLDOWN);
      } else {
        delay(deepSenseRateMs);
      }
      break;
    }

    // ── COOLDOWN: 20s ignore spikes, heavy sensors OFF, tamper active ──
    case STATE_COOLDOWN: {
      if (elapsed % 2000 < 50) {
        neoSet(255, 80, 0); // orange
      } else if (elapsed % 2000 == 1000) {
        neoOff();
      }

      // Tamper check still active during cooldown
      if (checkTamper()) {
        reportTamper();
      }

      if (elapsed >= cooldownSec * 1000) {
        Serial.println("Cooldown complete — back to SNIFF");
        neoOff();
        enterState(STATE_SNIFF);
      }

      keepalivePulse();
      delay(100);
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
    lastSniffTime = 0;
    // Sleep heavy sensors — MSA311 stays on for tamper detection
    sleepHeavySensors();
  }
}

// =============================================================================
//  REPORT TO HUB VIA ZIGBEE
//  We encode PM2.5 into temperature (hub knows to decode it) and
//  gas_resistance into humidity. The hub reconstructs the full payload.
//
//  Actually: ZigbeeTempSensor only supports temp + humidity natively.
//  We send real temp & humidity so the hub gets accurate environmental data.
//  The hub will POST with whatever it receives. For full ML pipeline,
//  we'd need additional Zigbee endpoints — but temp+humidity is enough
//  for the hub to detect basic anomalies and the backend still works.
// =============================================================================
void reportToHub() {
  if (!zigbeeConnected) return;

  // EP 10: real temp + humidity
  zbTempHum.setTemperature(lastTemp);
  zbTempHum.setHumidity(lastHumidity);
  zbTempHum.report();
  delay(50);

  // EP 11: PM2.5 (as temp) + gas_resistance in kOhm (as humidity)
  zbPMGas.setTemperature(lastPM25);
  zbPMGas.setHumidity(lastGas);  // already in kOhm from BME680
  zbPMGas.report();

  Serial.printf("[ZB] Report: T=%.1f H=%.1f PM25=%.1f Gas=%.1fk\n",
    lastTemp, lastHumidity, lastPM25, lastGas);
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
  // ── BME680 ──
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

  // ── MSA311 — always-on for tamper detection ──
  if (msa.begin()) {
    msa311Available = true;
    // Low data rate saves power while still detecting motion
    msa.setDataRate(MSA301_DATARATE_62_5_HZ);
    msa.setRange(MSA301_RANGE_4_G);
    // Enable active motion interrupt on all axes
    msa.enableInterrupts(false, false, true, true, true);
    Serial.println("MSA311 OK — tamper interrupt enabled");

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

  // ── BMV080 ──
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
//  HEAVY SENSOR SLEEP/WAKE — BMV080 laser off between reads via reset()
//  BME680 heater only fires during performReading() (~0.15μA idle)
//  MSA311 stays on for tamper detection (~15μA), I2C bus stays powered
// =============================================================================
void sleepHeavySensors() {
  if (!heavySensorsOn) return;

  // BMV080: reset() stops the laser without destroying the handle (unlike close())
  // This drops BMV080 from ~5-10mA to ~0.1mA standby
  if (bmv080Available) {
    if (bmv.reset()) {
      Serial.println("BMV080 laser OFF (reset to standby)");
    } else {
      Serial.println("BMV080 reset failed — laser may still be running");
    }
  }

  // BME680: gas heater only runs during performReading() (~150ms burst).
  // Draws ~0.15μA when idle. No explicit sleep needed.

  heavySensorsOn = false;
  Serial.println("Heavy sensors sleeping (MSA311 active for tamper)");
}

void wakeHeavySensors() {
  if (heavySensorsOn) return;

  // BMV080: re-init after reset, then set back to continuous mode for reading
  if (bmv080Available) {
    if (bmv.init()) {
      bmv.setMode(SF_BMV080_MODE_CONTINUOUS);
      Serial.println("BMV080 laser ON (continuous mode)");
    } else {
      Serial.println("BMV080 re-init failed! Trying begin+init...");
      // Fallback: full re-begin
      if (bmv.begin(0x57, Wire) && bmv.init()) {
        bmv.setMode(SF_BMV080_MODE_CONTINUOUS);
        Serial.println("BMV080 recovered via begin+init");
      } else {
        Serial.println("BMV080 FAILED to recover — marking unavailable");
        bmv080Available = false;
      }
    }
  }

  // BME680: heater fires automatically on next performReading()

  heavySensorsOn = true;
  Serial.println("Heavy sensors awake");
}

// =============================================================================
//  TAMPER DETECTION — polls MSA311 motion interrupt status
// =============================================================================
bool checkTamper() {
  if (!msa311Available) return false;

  uint8_t motionStatus = msa.getMotionInterruptStatus();
  if (motionStatus & 0x07) {  // active X, Y, or Z
    sensors_event_t accel;
    msa.getEvent(&accel);
    float mag = sqrt(
      accel.acceleration.x * accel.acceleration.x +
      accel.acceleration.y * accel.acceleration.y +
      accel.acceleration.z * accel.acceleration.z
    );
    float delta = fabs(mag - prevAccelMag);
    prevAccelMag = mag;

    if (delta >= TAMPER_THRESHOLD) {
      Serial.printf("TAMPER! accel delta=%.2f (threshold=%.1f)\n", delta, TAMPER_THRESHOLD);
      return true;
    }
  }
  return false;
}

void reportTamper() {
  if (!zigbeeConnected) return;

  unsigned long now = millis();
  if (now - lastTamperReport < TAMPER_COOLDOWN_MS) return;
  lastTamperReport = now;

  // Flash white for tamper alert
  neoFlash(255, 255, 255, 300);

  // Report current readings with tamper flag via full report
  reportToHub();
  Serial.println("[ZB] TAMPER alert sent (full report)");
}

// =============================================================================
//  READ ALL SENSORS (full read — STARTUP and DEEP_SENSE)
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

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(delayMs);
    digitalWrite(LED_PIN, LOW);  delay(delayMs);
  }
}
