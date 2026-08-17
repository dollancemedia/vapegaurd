/*
 * ESP32-C6 Vape Detection Sensor — LAB TRAINING / DATA-COLLECTION BUILD
 * Derived from esp32_vape_sensor_v3.ino (production, FW 3.8.1)
 *
 * ############################################################################
 * #  THIS IS NOT PRODUCTION FIRMWARE. DO NOT DEPLOY IT TO A FIELD SENSOR.    #
 * #  USB power is assumed. WiFi radio sleep is OFF. There is no duty         #
 * #  cycling, no light sleep, no schedule, no BLE provisioning, no OTA,      #
 * #  no Zigbee, and no backend POSTing. Battery life is minutes, not months. #
 * ############################################################################
 *
 * Board: Adafruit Feather ESP32-C6 (same as production — do not change the FQBN)
 *   arduino-cli compile --fqbn esp32:esp32:adafruit_feather_esp32c6:UploadSpeed=921600,\
 *   CDCOnBoot=cdc,CPUFreq=160,FlashFreq=80,FlashMode=qio,PartitionScheme=min_spiffs,\
 *   DebugLevel=none,EraseFlash=none,JTAGAdapter=default,ZigbeeMode=default <this folder>
 *
 * Sensors (identical hardware + identical init to production):
 *   BME680  — temperature, humidity, pressure, gas resistance  (I2C 0x77/0x76)
 *   MSA311  — 3-axis accelerometer                             (I2C 0x62)
 *   BMV080  — particulate matter                               (I2C 0x57)
 *   MAX17048 — battery fuel gauge                              (I2C 0x36)
 *
 * WHAT THIS BUILD DOES
 *   - Samples on a fixed 4 Hz grid (250 ms), non-blocking.
 *   - Writes an authoritative CSV stream to Serial (header row + one row per tick).
 *   - Best-effort mirrors every row to MQTT. Rows are ring-buffered, so a dropped
 *     broker connection does not lose samples — the backlog is replayed in order
 *     on reconnect.
 *   - Syncs NTP at boot and logs BOTH a raw monotonic millis() and an
 *     NTP-anchored epoch, so sessions can be joined without timestamp drift.
 *   - Runs a label state machine driven over MQTT (rig script) with a serial
 *     fallback, so puff start/end edges are machine-accurate instead of
 *     hand-timed after the fact.
 *
 * ── Deliberate deviations from production, and why ──────────────────────────
 * 1. This sketch lives in its own folder (esp32_vape_sensor_v3_training/)
 *    rather than beside esp32_vape_sensor_v3.ino. The Arduino build system
 *    concatenates EVERY .ino in a sketch folder into one translation unit, so
 *    two .ino files in the same folder means two setup()/loop() definitions and
 *    a guaranteed compile failure. Same parent directory, own sketch folder, is
 *    the only layout that actually builds. partitions.csv is copied alongside
 *    it so the flash layout matches production.
 * 2. BME680 is read with the library's asynchronous beginReading()/endReading()
 *    pair instead of performReading(). The oversampling, IIR and gas-heater
 *    config are byte-for-byte the production values, and the field math is
 *    identical — but performReading() blocks ~200 ms for the 320°C/150 ms gas
 *    heater, which cannot fit inside a 250 ms non-blocking tick. Rows carry a
 *    bme_new flag so you can tell a fresh BME sample from a carried-forward one.
 * 3. keepalivePulse() is dropped. It exists to stop a power bank from cutting
 *    out on low draw, and it delay()s 150 ms — unacceptable in a 4 Hz loop, and
 *    unnecessary on USB.
 * 4. BMV080 stays in CONTINUOUS mode for the whole session. It is never put
 *    into duty cycle. Its native output is ~1 Hz, so pm_new marks the ticks
 *    that carry a genuinely new particulate reading.
 *
 * Sensor power-on, sensor init, the BMV080/BME680 field math and the MSA311 raw
 * I2C read are lifted verbatim from esp32_vape_sensor_v3.ino so that the data
 * this build produces is directly comparable to what the field units emit.
 */

#include <WiFi.h>
#include <esp_wifi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include <Adafruit_MSA301.h>
#include <SparkFun_BMV080_Arduino_Library.h>
#include <Adafruit_NeoPixel.h>
#include <esp_task_wdt.h>
#include <esp_mac.h>
#include <esp_random.h>
#include <time.h>

// ═════════════════════════════════════════════════════════════════════════════
//  ▼▼▼  FILL THESE IN BEFORE FLASHING  ▼▼▼
// ═════════════════════════════════════════════════════════════════════════════
// Lab-only credentials. Hardcoded on purpose: this build has no BLE
// provisioning and no NVS credential load, so what is written here is what the
// board uses. Do not commit real credentials to a public branch.

const char* LAB_WIFI_SSID     = "PUT_YOUR_WIFI_SSID_HERE";
const char* LAB_WIFI_PASSWORD = "PUT_YOUR_WIFI_PASSWORD_HERE";

// IP address of the laptop running Mosquitto (e.g. "192.168.1.42").
// A hostname works too if your network resolves it; an IP is more reliable.
const char* LAB_MQTT_HOST     = "PUT_YOUR_LAPTOP_IP_HERE";
const uint16_t LAB_MQTT_PORT  = 1883;

// Leave both as "" for an open broker (the default Mosquitto lab config below).
const char* LAB_MQTT_USER     = "";
const char* LAB_MQTT_PASS     = "";

// ═════════════════════════════════════════════════════════════════════════════
//  ▲▲▲  END OF THINGS YOU MUST EDIT  ▲▲▲
// ═════════════════════════════════════════════════════════════════════════════

const char* FIRMWARE_VERSION = "3.8.1-training.1";

// ─── Sampling ───────────────────────────────────────────────────────────────
const uint32_t SAMPLE_PERIOD_MS = 250;   // 4 Hz fixed-rate grid

// ─── MQTT ───────────────────────────────────────────────────────────────────
// Ring buffer of samples awaiting publish. 600 slots @ 4 Hz = 150 s of backlog,
// i.e. the broker can be down for two and a half minutes with zero MQTT loss.
// Serial CSV is unaffected either way — it is the authoritative record.
#define RING_SLOTS                600
#define MQTT_MAX_PUBLISH_PER_LOOP 25     // drains backlog ~25x realtime
#define MQTT_BUFFER_BYTES         1024
const uint32_t MQTT_BACKOFF_MIN_MS = 2000;
const uint32_t MQTT_BACKOFF_MAX_MS = 30000;

// ─── NTP (same servers as production) ───────────────────────────────────────
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.nist.gov";

// ─── Watchdog ───────────────────────────────────────────────────────────────
const unsigned long WDT_TIMEOUT_SEC = 60;

// ═════════════════════════════════════════════════════════════════════════════
//  Hardware pins — Adafruit Feather ESP32-C6  (verbatim from production)
// ═════════════════════════════════════════════════════════════════════════════
#define I2C_POWER_PIN  20
#define LED_PIN        15
#define NEOPIXEL_PIN    9
#define NEOPIXEL_COUNT  1
#define MSA311_INT_PIN  5
#define SDA_PIN        19
#define SCL_PIN        18
#define MAX17048_ADDR      0x36
#define MAX17048_REG_VCELL 0x02
#define MAX17048_REG_VER   0x08

// ═════════════════════════════════════════════════════════════════════════════
//  Objects  (verbatim from production)
// ═════════════════════════════════════════════════════════════════════════════
Adafruit_BME680 bme;
Adafruit_MSA311 msa;
SparkFunBMV080  bmv;
Adafruit_NeoPixel neopixel(NEOPIXEL_COUNT, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);

WiFiClient   netClient;
PubSubClient mqtt(netClient);

// ─── Sensor availability (verbatim) ─────────────────────────────────────────
bool bme680Available = false;
bool msa311Available = false;
bool bmv080Available = false;
bool fuelGaugeAvailable = false;

// ─── MSA311 tamper-read state (verbatim — reused by the raw accel read) ─────
float prevAccelMag = 0;
int16_t prevRawX = 0, prevRawY = 0, prevRawZ = 0;
uint8_t frozenCount = 0;

// ─── Latest sensor readings (verbatim naming) ───────────────────────────────
float lastPM25 = 0, lastPM10 = 0, lastPM1 = 0;
float lastTemp = 0, lastHumidity = 0, lastPressure = 0, lastGas = 0;
bool  lastBmvObstructed = false;
float lastAx = 0, lastAy = 0, lastAz = 0, lastAmag = 0;
float lastBatteryVoltage = 0;

// Freshness flags — cleared every time a row is emitted, set when the
// corresponding sensor actually produced new data during that tick.
bool pmNew  = false;
bool bmeNew = false;

// ─── Identity ───────────────────────────────────────────────────────────────
String DEVICE_ID = "";   // MAC, exactly as production's loadDeviceIdentity()
String BOOT_ID   = "";   // MAC + per-boot nonce — unique per power cycle

// ─── Time ───────────────────────────────────────────────────────────────────
// millis() is the monotonic clock and is NEVER adjusted. NTP is captured once
// as an anchor pair (epoch, millis) and every epoch stamp is derived from the
// monotonic clock plus that offset, so no row ever jumps backwards.
bool     timesynced    = false;
uint64_t epochMsAtSync = 0;
uint32_t millisAtSync  = 0;

// ─── Label state machine ────────────────────────────────────────────────────
char     currentLabel[24] = "idle";
uint32_t currentRunId     = 0;
uint32_t labelStartedMs   = 0;

// ─── Sample ring buffer ─────────────────────────────────────────────────────
struct Sample {
  uint32_t seq;
  uint32_t ms;
  uint64_t epochMs;
  float    pm1, pm25, pm10;
  float    temp, humidity, pressure, gas;
  float    ax, ay, az, amag;
  float    battV;
  uint32_t labelMs;
  uint32_t runId;
  uint32_t heap;
  int16_t  rssi;
  char     label[24];
  uint8_t  pmNew, bmeNew, obstructed, mqttUp;
};

Sample   ring[RING_SLOTS];
uint16_t ringHead = 0;     // next write slot
uint16_t ringTail = 0;     // next slot to publish
uint16_t ringCount = 0;    // unpublished samples currently held
uint32_t droppedSamples = 0;  // overwritten before they could be published

// ─── Counters / scheduling ──────────────────────────────────────────────────
uint32_t sampleSeq       = 0;
uint32_t lastSampleAt    = 0;
uint32_t bmeReadyAt      = 0;
bool     bmeReadingPending = false;
uint32_t nextMqttAttempt = 0;
uint32_t mqttBackoffMs   = MQTT_BACKOFF_MIN_MS;
uint32_t mqttPublishOk   = 0;
uint32_t mqttPublishFail = 0;

// ─── Topics ─────────────────────────────────────────────────────────────────
String TOPIC_LABEL_DEV;
String TOPIC_LABEL_ALL;
String TOPIC_SAMPLE;
String TOPIC_EVENT;
String TOPIC_STATUS;

// ─── Forward declarations ───────────────────────────────────────────────────
void  powerOnSensors();
void  initSensors();
void  initFuelGauge();
float readBatteryVoltage();
void  pollBMV080();
void  pollBME680();
void  pollMSA311();
void  syncTime();
uint64_t epochNowMs();
void  isoFromEpochMs(uint64_t epochMs, char* out, size_t n);
void  emitSample();
void  formatRow(const Sample& s, char* out, size_t n);
void  pushRing(const Sample& s);
void  drainRing();
void  mqttEnsureConnected();
void  mqttCallback(char* topic, byte* payload, unsigned int len);
void  handleSerialCommands();
bool  handleCommand(const char* cmd, const char* source);
void  setLabel(const char* label, uint32_t runId, const char* source);
void  endLabel(const char* source);
void  emitEvent(const char* kind, const char* detail, const char* source);
void  printCsvHeader();
void  printStatus();
void  neoSet(uint8_t r, uint8_t g, uint8_t b);
void  updateStatusLed();

// =============================================================================
//  NEOPIXEL — non-blocking only (production's neoFlash() delay()s; unusable here)
// =============================================================================
void neoSet(uint8_t r, uint8_t g, uint8_t b) {
  neopixel.setPixelColor(0, neopixel.Color(r, g, b));
  neopixel.show();
}

// green  = idle, MQTT up          red    = label active
// amber  = idle, MQTT down        purple = label active, MQTT down
void updateStatusLed() {
  static uint8_t lastKey = 0xFF;
  bool labeled = (strcmp(currentLabel, "idle") != 0);
  bool up      = mqtt.connected();
  uint8_t key  = (labeled ? 2 : 0) | (up ? 1 : 0);
  if (key == lastKey) return;
  lastKey = key;
  if (labeled && up)        neoSet(60, 0, 0);
  else if (labeled && !up)  neoSet(50, 0, 50);
  else if (!labeled && up)  neoSet(0, 40, 0);
  else                      neoSet(60, 35, 0);
}

// =============================================================================
//  SENSOR POWER + INIT  —  verbatim from esp32_vape_sensor_v3.ino
// =============================================================================
void powerOnSensors() {
  // Force a full power cycle on the I2C sensor rail
  // (sensors may be in a bad state after ESP32 resets without losing power)
  pinMode(I2C_POWER_PIN, OUTPUT);
  digitalWrite(I2C_POWER_PIN, LOW);
  delay(200);  // Ensure sensors fully discharge
  digitalWrite(I2C_POWER_PIN, HIGH);
  Serial.println("# Stemma QT power cycled ON");
  delay(1500);  // Sensors need time to boot after power-on

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  delay(500);

  Serial.println("# I2C scan:");
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("#   0x%02X\n", addr);
    }
    delay(2);
  }
}

void initSensors() {
  // Retry sensor init up to 3 times — after full flash erase, I2C bus
  // can be flaky on first attempt (PHY calibration, power sequencing).
  for (int attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      Serial.printf("# Sensor init retry #%d...\n", attempt + 1);
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
        Serial.println("# BME680 OK");
      } else if (attempt == 2) {
        Serial.println("# BME680 not found after 3 attempts");
      }
    }

    // MSA311 — low data rate + hardware interrupt for tamper
    if (!msa311Available) {
      if (msa.begin()) {
        msa311Available = true;
        msa.setDataRate(MSA301_DATARATE_62_5_HZ);
        msa.setRange(MSA301_RANGE_4_G);
        Serial.println("# MSA311 OK — 62.5Hz, I2C polling");

        sensors_event_t accel;
        msa.getEvent(&accel);
        prevAccelMag = sqrt(
          accel.acceleration.x * accel.acceleration.x +
          accel.acceleration.y * accel.acceleration.y +
          accel.acceleration.z * accel.acceleration.z
        );
      } else if (attempt == 2) {
        Serial.println("# MSA311 not found after 3 attempts");
      }
    }

    // BMV080
    if (!bmv080Available) {
      if (bmv.begin(0x57, Wire)) {
        Serial.println("# BMV080 connected");
        if (bmv.init()) {
          bmv080Available = true;
          // Training build: CONTINUOUS for the entire session. Never switched
          // to duty cycle — we want every particulate sample the sensor makes.
          bmv.setMode(SF_BMV080_MODE_CONTINUOUS);
          Serial.println("# BMV080 OK — continuous mode (stays continuous)");
        } else if (attempt == 2) {
          Serial.println("# BMV080 init() failed after 3 attempts");
        }
      } else if (attempt == 2) {
        Serial.println("# BMV080 not found at 0x57 after 3 attempts");
      }
    }

    // All sensors found — no need to retry
    if (bme680Available && msa311Available && bmv080Available) break;
  }

  initFuelGauge();

  Serial.printf("# Sensors: BME680=%s MSA311=%s BMV080=%s FUELGAUGE=%s\n",
    bme680Available ? "YES" : "NO",
    msa311Available ? "YES" : "NO",
    bmv080Available ? "YES" : "NO",
    fuelGaugeAvailable ? "YES" : "NO");
}

// =============================================================================
//  BATTERY — MAX17048 fuel gauge (verbatim from production)
// =============================================================================
static bool max17048ReadReg16(uint8_t reg, uint16_t* out) {
  Wire.beginTransmission(MAX17048_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((uint8_t)MAX17048_ADDR, (uint8_t)2) != 2) return false;
  uint8_t hi = Wire.read();
  uint8_t lo = Wire.read();
  *out = ((uint16_t)hi << 8) | (uint16_t)lo;
  return true;
}

void initFuelGauge() {
  uint16_t ver = 0;
  if (!max17048ReadReg16(MAX17048_REG_VER, &ver)) {
    fuelGaugeAvailable = false;
    Serial.println("# MAX17048 not responding at 0x36 — battery reporting disabled");
    return;
  }
  fuelGaugeAvailable = ((ver & 0xFFF0) == 0x0010);
  if (fuelGaugeAvailable) {
    Serial.printf("# MAX17048 fuel gauge OK (version 0x%04X)\n", ver);
  } else {
    Serial.printf("# Device at 0x36 is not a MAX17048 (version 0x%04X)\n", ver);
  }
}

float readBatteryVoltage() {
  if (!fuelGaugeAvailable) return 0.0f;
  uint16_t raw = 0;
  if (!max17048ReadReg16(MAX17048_REG_VCELL, &raw)) return 0.0f;
  // MAX17048 VCELL LSB = 78.125 uV
  return raw * 0.000078125f;
}

// =============================================================================
//  SENSOR POLLING — all non-blocking, called every loop iteration
// =============================================================================

// BMV080 field math is verbatim from production readAllSensors(); only the
// surrounding drain loop is restructured to never block.
void pollBMV080() {
  if (!bmv080Available) return;
  int drainCount = 0;
  while (bmv.readSensor()) {
    lastPM1  = bmv.PM1();
    lastPM25 = bmv.PM25();
    lastPM10 = bmv.PM10();
    lastBmvObstructed = bmv.isObstructed();
    pmNew = true;
    drainCount++;
    if (drainCount > 10) break;  // safety cap
  }
}

// BME680 asynchronous read. Field math is verbatim from production
// readAllSensors(); performReading() is replaced by beginReading()/endReading()
// because the 320°C/150ms gas heater makes the blocking call ~200ms, which does
// not fit inside a 250ms tick.
void pollBME680() {
  if (!bme680Available) return;

  if (!bmeReadingPending) {
    uint32_t readyAt = bme.beginReading();
    if (readyAt != 0) {
      bmeReadyAt = readyAt;
      bmeReadingPending = true;
    }
    return;
  }

  if ((int32_t)(millis() - bmeReadyAt) < 0) return;  // not ready yet

  if (bme.endReading()) {
    lastTemp     = bme.temperature;
    lastHumidity = bme.humidity;
    lastPressure = bme.pressure / 100.0;
    lastGas      = bme.gas_resistance / 1000.0;
    bmeNew = true;
  }
  bmeReadingPending = false;
}

// Raw MSA311 read — verbatim from production checkAndSendTamper(), minus the
// tamper POST (there is no backend in this build). The frozen-sensor re-init
// is kept: a dead accelerometer mid-session would silently poison the data.
void pollMSA311() {
  if (!msa311Available) return;

  Wire.beginTransmission(0x62);
  Wire.write(0x02);
  if (Wire.endTransmission(false) != 0) return;  // I2C error

  uint8_t buf[6] = {0};
  Wire.requestFrom((uint8_t)0x62, (uint8_t)6);
  for (int i = 0; i < 6 && Wire.available(); i++) buf[i] = Wire.read();

  int16_t rawX = (buf[1] << 8) | buf[0]; rawX >>= 4;  // MSA311 = 12-bit
  int16_t rawY = (buf[3] << 8) | buf[2]; rawY >>= 4;
  int16_t rawZ = (buf[5] << 8) | buf[4]; rawZ >>= 4;

  if (rawX == prevRawX && rawY == prevRawY && rawZ == prevRawZ) {
    frozenCount++;
    if (frozenCount >= 10) {
      Serial.println("# MSA311 frozen — re-init");
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
  const float scale = 9.81f / 512.0f;
  lastAx = rawX * scale;
  lastAy = rawY * scale;
  lastAz = rawZ * scale;
  lastAmag = sqrt(lastAx * lastAx + lastAy * lastAy + lastAz * lastAz);
  prevAccelMag = lastAmag;
}

// =============================================================================
//  TIME — NTP anchor + monotonic derivation
// =============================================================================
void syncTime() {
  Serial.println("# Syncing NTP...");
  configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);
  struct tm tm;
  int attempts = 0;
  while (!getLocalTime(&tm) && attempts < 20) {
    delay(500);
    attempts++;
  }
  if (attempts < 20) {
    // Anchor: capture epoch and millis as close together as possible.
    struct timeval tv;
    gettimeofday(&tv, nullptr);
    millisAtSync  = millis();
    epochMsAtSync = (uint64_t)tv.tv_sec * 1000ULL + (uint64_t)(tv.tv_usec / 1000);
    timesynced = true;
    Serial.printf("# NTP OK: %04d-%02d-%02d %02d:%02d:%02d UTC (anchor ms=%lu)\n",
      tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday,
      tm.tm_hour, tm.tm_min, tm.tm_sec, (unsigned long)millisAtSync);
  } else {
    Serial.println("# NTP FAILED — epoch_ms will be 0. millis() is still valid;");
    Serial.println("#   join sessions on boot_id+ms, or send RESYNC once WiFi is up.");
  }
}

// Derived from the monotonic clock, so it can never step backwards mid-session
// even if the system clock is later adjusted. Returns 0 when NTP never synced.
uint64_t epochNowMs() {
  if (!timesynced) return 0;
  return epochMsAtSync + (uint64_t)(millis() - millisAtSync);
}

void isoFromEpochMs(uint64_t epochMs, char* out, size_t n) {
  if (epochMs == 0) { if (n > 0) out[0] = '\0'; return; }
  time_t secs = (time_t)(epochMs / 1000ULL);
  uint16_t ms = (uint16_t)(epochMs % 1000ULL);
  struct tm tmv;
  gmtime_r(&secs, &tmv);
  snprintf(out, n, "%04d-%02d-%02dT%02d:%02d:%02d.%03uZ",
    tmv.tm_year + 1900, tmv.tm_mon + 1, tmv.tm_mday,
    tmv.tm_hour, tmv.tm_min, tmv.tm_sec, (unsigned)ms);
}

// =============================================================================
//  CSV
// =============================================================================
void printCsvHeader() {
  Serial.println("# ---- MISTIO LAB CAPTURE ----");
  Serial.printf("# firmware=%s\n", FIRMWARE_VERSION);
  Serial.printf("# device_id=%s\n", DEVICE_ID.c_str());
  Serial.printf("# boot_id=%s\n", BOOT_ID.c_str());
  Serial.printf("# sample_hz=%.2f\n", 1000.0 / (float)SAMPLE_PERIOD_MS);
  Serial.printf("# ntp_synced=%d\n", timesynced ? 1 : 0);
  Serial.println("# lines beginning with '#' are metadata/events, not data rows");
  Serial.println("seq,ms,epoch_ms,iso_utc,boot_id,device_id,label,run_id,label_ms,"
                 "pm1,pm25,pm10,pm_new,obstructed,"
                 "temp,humidity,pressure,gas,bme_new,"
                 "accel_x,accel_y,accel_z,accel_mag,batt_v,rssi,heap,mqtt");
}

void formatRow(const Sample& s, char* out, size_t n) {
  char iso[32];
  isoFromEpochMs(s.epochMs, iso, sizeof(iso));
  snprintf(out, n,
    "%lu,%lu,%llu,%s,%s,%s,%s,%lu,%lu,"
    "%.2f,%.2f,%.2f,%u,%u,"
    "%.2f,%.2f,%.2f,%.2f,%u,"
    "%.3f,%.3f,%.3f,%.3f,%.3f,%d,%lu,%u",
    (unsigned long)s.seq, (unsigned long)s.ms, (unsigned long long)s.epochMs,
    iso, BOOT_ID.c_str(), DEVICE_ID.c_str(), s.label,
    (unsigned long)s.runId, (unsigned long)s.labelMs,
    s.pm1, s.pm25, s.pm10, (unsigned)s.pmNew, (unsigned)s.obstructed,
    s.temp, s.humidity, s.pressure, s.gas, (unsigned)s.bmeNew,
    s.ax, s.ay, s.az, s.amag, s.battV, (int)s.rssi,
    (unsigned long)s.heap, (unsigned)s.mqttUp);
}

// =============================================================================
//  RING BUFFER — publish queue with replay-on-reconnect
// =============================================================================
void pushRing(const Sample& s) {
  ring[ringHead] = s;
  ringHead = (ringHead + 1) % RING_SLOTS;
  if (ringCount == RING_SLOTS) {
    // Full: the oldest unpublished sample is being overwritten. Serial already
    // has it, so this is an MQTT-completeness loss only — counted and reported.
    ringTail = (ringTail + 1) % RING_SLOTS;
    droppedSamples++;
  } else {
    ringCount++;
  }
}

void drainRing() {
  if (!mqtt.connected()) return;
  char row[320];
  int budget = MQTT_MAX_PUBLISH_PER_LOOP;
  while (ringCount > 0 && budget-- > 0) {
    formatRow(ring[ringTail], row, sizeof(row));
    if (!mqtt.publish(TOPIC_SAMPLE.c_str(), row)) {
      mqttPublishFail++;
      return;  // leave it queued; retry next loop / next connection
    }
    mqttPublishOk++;
    ringTail = (ringTail + 1) % RING_SLOTS;
    ringCount--;
  }
}

// =============================================================================
//  SAMPLE EMIT — the 4 Hz tick
// =============================================================================
void emitSample() {
  Sample s;
  s.seq        = ++sampleSeq;
  s.ms         = millis();
  s.epochMs    = epochNowMs();
  s.pm1        = lastPM1;
  s.pm25       = lastPM25;
  s.pm10       = lastPM10;
  s.temp       = lastTemp;
  s.humidity   = lastHumidity;
  s.pressure   = lastPressure;
  s.gas        = lastGas;
  s.ax         = lastAx;
  s.ay         = lastAy;
  s.az         = lastAz;
  s.amag       = lastAmag;
  s.battV      = lastBatteryVoltage;
  s.labelMs    = (labelStartedMs == 0) ? 0 : (millis() - labelStartedMs);
  s.runId      = currentRunId;
  s.heap       = ESP.getFreeHeap();
  s.rssi       = (WiFi.status() == WL_CONNECTED) ? (int16_t)WiFi.RSSI() : (int16_t)0;
  s.pmNew      = pmNew ? 1 : 0;
  s.bmeNew     = bmeNew ? 1 : 0;
  s.obstructed = lastBmvObstructed ? 1 : 0;
  s.mqttUp     = mqtt.connected() ? 1 : 0;
  strncpy(s.label, currentLabel, sizeof(s.label) - 1);
  s.label[sizeof(s.label) - 1] = '\0';

  // Serial is authoritative — written unconditionally, before anything that
  // could fail or stall.
  char row[320];
  formatRow(s, row, sizeof(row));
  Serial.println(row);

  pushRing(s);

  pmNew = false;
  bmeNew = false;
}

// =============================================================================
//  LABEL STATE MACHINE
// =============================================================================
void emitEvent(const char* kind, const char* detail, const char* source) {
  char iso[32];
  uint64_t e = epochNowMs();
  isoFromEpochMs(e, iso, sizeof(iso));
  char line[240];
  snprintf(line, sizeof(line),
    "# EVENT,%lu,%llu,%s,%s,%s,run=%lu,src=%s",
    (unsigned long)millis(), (unsigned long long)e, iso,
    kind, detail, (unsigned long)currentRunId, source);
  Serial.println(line);
  if (mqtt.connected()) {
    mqtt.publish(TOPIC_EVENT.c_str(), line);
  }
}

void setLabel(const char* label, uint32_t runId, const char* source) {
  strncpy(currentLabel, label, sizeof(currentLabel) - 1);
  currentLabel[sizeof(currentLabel) - 1] = '\0';
  currentRunId   = runId;
  labelStartedMs = millis();
  emitEvent("label_start", currentLabel, source);
  updateStatusLed();
}

void endLabel(const char* source) {
  emitEvent("label_end", currentLabel, source);
  strncpy(currentLabel, "idle", sizeof(currentLabel));
  labelStartedMs = 0;
  updateStatusLed();
}

void printStatus() {
  Serial.printf("# STATUS fw=%s device=%s boot=%s label=%s run=%lu "
                "wifi=%d rssi=%d mqtt=%d queued=%u dropped=%lu "
                "pub_ok=%lu pub_fail=%lu ntp=%d seq=%lu heap=%u\n",
    FIRMWARE_VERSION, DEVICE_ID.c_str(), BOOT_ID.c_str(),
    currentLabel, (unsigned long)currentRunId,
    WiFi.status() == WL_CONNECTED ? 1 : 0,
    WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0,
    mqtt.connected() ? 1 : 0, (unsigned)ringCount,
    (unsigned long)droppedSamples,
    (unsigned long)mqttPublishOk, (unsigned long)mqttPublishFail,
    timesynced ? 1 : 0, (unsigned long)sampleSeq, ESP.getFreeHeap());
}

// Canonical command grammar, shared by MQTT payloads and serial input:
//   start <label> [run_id]   begin a labeled segment (alias: label)
//   end                      close the current segment, return to idle
//   note <text>              write a marker line into the stream
//   status                   print a status line
//   resync                   re-anchor NTP (only if the boot sync failed)
// Returns true if the command was recognised.
bool handleCommand(const char* cmd, const char* source) {
  char buf[80];
  strncpy(buf, cmd, sizeof(buf) - 1);
  buf[sizeof(buf) - 1] = '\0';

  // trim leading space
  char* p = buf;
  while (*p == ' ' || *p == '\t') p++;
  if (*p == '\0') return false;

  char* verb = strtok(p, " \t");
  if (!verb) return false;

  if (strcasecmp(verb, "end") == 0 || strcasecmp(verb, "stop") == 0) {
    endLabel(source);
    return true;
  }
  if (strcasecmp(verb, "status") == 0) {
    printStatus();
    return true;
  }
  if (strcasecmp(verb, "resync") == 0) {
    if (WiFi.status() == WL_CONNECTED) {
      timesynced = false;
      syncTime();
      emitEvent("ntp_resync", timesynced ? "ok" : "failed", source);
    } else {
      Serial.println("# ERR: resync needs WiFi");
    }
    return true;
  }
  if (strcasecmp(verb, "note") == 0) {
    char* rest = strtok(nullptr, "");
    emitEvent("note", rest ? rest : "", source);
    return true;
  }
  if (strcasecmp(verb, "start") == 0 || strcasecmp(verb, "label") == 0) {
    char* lbl = strtok(nullptr, " \t");
    if (!lbl) { Serial.println("# ERR: start needs a label"); return true; }
    if (strcasecmp(lbl, "end") == 0) { endLabel(source); return true; }
    char* runTok = strtok(nullptr, " \t");
    uint32_t run = runTok ? (uint32_t)strtoul(runTok, nullptr, 10) : currentRunId;
    setLabel(lbl, run, source);
    return true;
  }

  // Bare "<label> [run]" — what the rig script publishes for brevity.
  {
    char* runTok = strtok(nullptr, " \t");
    uint32_t run = runTok ? (uint32_t)strtoul(runTok, nullptr, 10) : currentRunId;
    setLabel(verb, run, source);
    return true;
  }
}

// Serial fallback, per the lab protocol:
//   L <label> <run>   →  start <label> <run>
//   L end             →  end
// Bare STATUS / NOTE / RESYNC also work without the L prefix.
void handleSerialCommands() {
  static char buf[96];
  static uint8_t len = 0;

  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      buf[len] = '\0';
      if (len > 0) {
        if ((buf[0] == 'L' || buf[0] == 'l') && (buf[1] == ' ' || buf[1] == '\t')) {
          handleCommand(buf + 2, "serial");
        } else if (!handleCommand(buf, "serial")) {
          Serial.printf("# ERR: unknown command '%s'\n", buf);
        }
      }
      len = 0;
      continue;
    }
    if (len < sizeof(buf) - 1) {
      buf[len++] = c;
    } else {
      len = 0;  // overlong line, discard rather than truncate into a command
    }
  }
}

// =============================================================================
//  MQTT
// =============================================================================
void mqttCallback(char* topic, byte* payload, unsigned int len) {
  char msg[96];
  unsigned int n = (len < sizeof(msg) - 1) ? len : sizeof(msg) - 1;
  memcpy(msg, payload, n);
  msg[n] = '\0';
  handleCommand(msg, "mqtt");
}

void mqttEnsureConnected() {
  if (mqtt.connected()) return;
  if (WiFi.status() != WL_CONNECTED) return;
  if ((int32_t)(millis() - nextMqttAttempt) < 0) return;

  String clientId = "mistio-lab-" + DEVICE_ID;
  bool ok;
  // Last will: if the board drops off, the rig script sees it immediately.
  if (strlen(LAB_MQTT_USER) > 0) {
    ok = mqtt.connect(clientId.c_str(), LAB_MQTT_USER, LAB_MQTT_PASS,
                      TOPIC_STATUS.c_str(), 0, true, "offline");
  } else {
    ok = mqtt.connect(clientId.c_str(), nullptr, nullptr,
                      TOPIC_STATUS.c_str(), 0, true, "offline");
  }

  if (ok) {
    mqttBackoffMs = MQTT_BACKOFF_MIN_MS;
    mqtt.publish(TOPIC_STATUS.c_str(), "online", true);
    mqtt.subscribe(TOPIC_LABEL_DEV.c_str());
    mqtt.subscribe(TOPIC_LABEL_ALL.c_str());
    Serial.printf("# MQTT connected to %s:%u — subscribed %s , %s (backlog=%u)\n",
      LAB_MQTT_HOST, LAB_MQTT_PORT,
      TOPIC_LABEL_DEV.c_str(), TOPIC_LABEL_ALL.c_str(), (unsigned)ringCount);
  } else {
    Serial.printf("# MQTT connect failed (state=%d), retry in %lums, backlog=%u\n",
      mqtt.state(), (unsigned long)mqttBackoffMs, (unsigned)ringCount);
    nextMqttAttempt = millis() + mqttBackoffMs;
    mqttBackoffMs = (mqttBackoffMs * 2 > MQTT_BACKOFF_MAX_MS)
                    ? MQTT_BACKOFF_MAX_MS : mqttBackoffMs * 2;
  }
}

// =============================================================================
//  SETUP
// =============================================================================
void setup() {
  esp_task_wdt_deinit();

  Serial.begin(115200);
  unsigned long serialWait = millis();
  while (!Serial && (millis() - serialWait < 3000)) {
    delay(10);
  }
  delay(500);
  Serial.printf("\n# === Mistio LAB TRAINING build v%s ===\n", FIRMWARE_VERSION);

  // Identity — DEVICE_ID is the MAC, exactly as production derives it.
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  DEVICE_ID = String(macStr);

  // boot_id = MAC + per-boot nonce. The MAC half joins every session from this
  // physical board; the nonce half keeps two sessions from the same board
  // distinguishable when their millis() ranges overlap.
  char bootStr[28];
  snprintf(bootStr, sizeof(bootStr), "%s-%08lX", macStr, (unsigned long)esp_random());
  BOOT_ID = String(bootStr);

  TOPIC_LABEL_DEV = "mistio/lab/" + DEVICE_ID + "/label";
  TOPIC_LABEL_ALL = "mistio/lab/all/label";
  TOPIC_SAMPLE    = "mistio/lab/" + DEVICE_ID + "/sample";
  TOPIC_EVENT     = "mistio/lab/" + DEVICE_ID + "/event";
  TOPIC_STATUS    = "mistio/lab/" + DEVICE_ID + "/status";

  neopixel.begin();
  neopixel.setBrightness(30);
  neoSet(255, 255, 0);  // yellow = booting

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  pinMode(MSA311_INT_PIN, INPUT);

  powerOnSensors();
  initSensors();
  Wire.setTimeout(100);

  // ── WiFi: always on, radio sleep disabled ─────────────────────────────────
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);            // no modem sleep — USB powered, latency matters
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(LAB_WIFI_SSID, LAB_WIFI_PASSWORD);
  Serial.printf("# Connecting WiFi to '%s'", LAB_WIFI_SSID);
  unsigned long wStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wStart < 20000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    esp_wifi_set_ps(WIFI_PS_NONE);  // belt and braces — no power save at all
    Serial.println("# WiFi OK: " + WiFi.localIP().toString() +
                   " (" + String(WiFi.RSSI()) + " dBm)");
    syncTime();
  } else {
    Serial.println("# WiFi FAILED — running serial-only. Sampling continues.");
    Serial.println("#   Check LAB_WIFI_SSID / LAB_WIFI_PASSWORD at the top of this file.");
  }

  // ── MQTT ──────────────────────────────────────────────────────────────────
  mqtt.setServer(LAB_MQTT_HOST, LAB_MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(MQTT_BUFFER_BYTES);
  mqtt.setSocketTimeout(2);   // keep a dead broker from stalling the 4 Hz loop
  mqtt.setKeepAlive(15);
  nextMqttAttempt = 0;
  mqttEnsureConnected();

  printCsvHeader();
  emitEvent("boot", FIRMWARE_VERSION, "system");

  lastBatteryVoltage = readBatteryVoltage();
  lastSampleAt = millis();
  updateStatusLed();

  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = (uint32_t)(WDT_TIMEOUT_SEC * 1000),
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);

  Serial.printf("# Setup complete — free heap: %u\n", ESP.getFreeHeap());
  Serial.println("# Ready. Let the BME680 gas heater settle ~3 min before the first run.");
}

// =============================================================================
//  LOOP — fixed 4 Hz grid, nothing blocking
// =============================================================================
void loop() {
  esp_task_wdt_reset();

  handleSerialCommands();
  mqttEnsureConnected();
  mqtt.loop();

  pollBMV080();
  pollBME680();
  pollMSA311();

  uint32_t now = millis();
  if ((int32_t)(now - lastSampleAt) >= (int32_t)SAMPLE_PERIOD_MS) {
    // Advance on the grid rather than to `now`, so jitter does not accumulate
    // into drift. If we ever fall a full period behind, resynchronise.
    lastSampleAt += SAMPLE_PERIOD_MS;
    if ((int32_t)(now - lastSampleAt) > (int32_t)SAMPLE_PERIOD_MS) {
      lastSampleAt = now;
    }

    // Battery is slow-moving; reading it every tick wastes I2C bandwidth.
    if (sampleSeq % 20 == 0) lastBatteryVoltage = readBatteryVoltage();

    emitSample();
  }

  drainRing();
  updateStatusLed();
}
