/*
 * ESP32-C6 Vape Detection Sensor — School Deployment Build
 *
 * Board: Adafruit Feather ESP32-C6 (with Stemma QT)
 *   I2C power pin: GPIO20 (must be HIGH to power Stemma QT sensors)
 *   Default I2C:   SDA=19, SCL=18
 *
 * Sensors:
 *   BME680  — temperature, humidity, pressure, gas resistance  (I2C 0x77/0x76)
 *   MSA311  — 3-axis accelerometer for tamper detection         (I2C 0x62)
 *   BMV080  — particulate matter sensor                         (I2C 0x57)
 *
 * WiFi Provisioning (no BLE — Zigbee-safe):
 *   On first boot or when saved WiFi fails, opens a captive portal AP:
 *     SSID: "MistioSensor-001"  (no password)
 *   Connect with phone → pick WiFi network → enter password → saved to NVS.
 *   To force AP mode later: power cycle 3x within 10 seconds.
 *
 * Duty Cycle:
 *   Every 60 seconds: wake → power sensors → read → POST → sleep
 *   LED keepalive pulse every 30s during sleep to prevent power bank shutoff
 *
 * Server-side schedule:
 *   On each wake, checks GET /api/devices/{id}/schedule for active hours.
 *   If outside school hours, skips sensor read and goes back to sleep.
 *   Schedule is editable from the dashboard — no reflashing needed.
 *
 * Libraries required (Arduino Library Manager):
 *   Adafruit BME680, Adafruit Unified Sensor, Adafruit MSA301,
 *   SparkFun BMV080 Arduino Library, SparkFun Toolkit, ArduinoJson,
 *   WiFiManager (by tzapu)
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
#include <esp_sleep.h>
#include <esp_task_wdt.h>
#include <Preferences.h>
#include <time.h>

// ─────────────────────────────────────────────────────────────────────────────
//  ★  CONFIGURATION  ★
// ─────────────────────────────────────────────────────────────────────────────

// Default WiFi (pre-loaded into WiFiManager on first boot)
const char* DEFAULT_SSID     = "sweethome";
const char* DEFAULT_PASSWORD = "rahul2008";

// Production backend (Railway)
const char* BACKEND_HOST = "vapegaurd-production.up.railway.app";
const bool  USE_HTTPS    = true;

// Device identity
const String DEVICE_ID = "ESP32_C6_001";
const String LOCATION  = "School Bathroom";
const String ORG_ID    = "irvington";

// WiFiManager AP name (what you see on your phone when configuring)
const char* AP_NAME = "MistioSensor-001";

// Duty cycle timing
const unsigned long CYCLE_SECONDS       = 60;    // total cycle length
const unsigned long KEEPALIVE_INTERVAL  = 30000;  // ms — LED pulse interval during sleep
const unsigned long KEEPALIVE_DURATION  = 150;    // ms — LED on time per pulse
const unsigned long HTTP_TIMEOUT_MS     = 8000;
const unsigned long WM_PORTAL_TIMEOUT   = 120;    // seconds — AP portal auto-closes

// NTP servers
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.nist.gov";

// Triple-reset detection window
const unsigned long RESET_DETECT_WINDOW = 10000; // ms
const int           RESET_COUNT_TRIGGER = 3;

// ─────────────────────────────────────────────────────────────────────────────
//  TLS root certificate (ISRG Root X1 — covers Railway's Let's Encrypt certs)
// ─────────────────────────────────────────────────────────────────────────────
static const char ISRG_Root_X1[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";

// ─────────────────────────────────────────────────────────────────────────────
//  Hardware pins — Adafruit Feather ESP32-C6
// ─────────────────────────────────────────────────────────────────────────────
#define I2C_POWER_PIN  20   // Stemma QT 3.3V enable
#define LED_PIN        15   // built-in LED
#define MIC_PIN         0   // MAX4466 ADC (optional)

// ─────────────────────────────────────────────────────────────────────────────
//  Sensor objects
// ─────────────────────────────────────────────────────────────────────────────
Adafruit_BME680 bme;
Adafruit_MSA311 msa;
SparkFunBMV080  bmv;
Preferences     prefs;     // NVS for reset counter

// ─── State ──────────────────────────────────────────────────────────────────
bool bme680Available = false;
bool msa311Available = false;
bool bmv080Available = false;
bool timesynced      = false;

// Tamper detection
float prevAccelMag = 0;
const float TAMPER_THRESHOLD = 2.0; // g delta

// URLs (built in setup)
String DATA_URL;
String TAMPER_URL;
String SCHEDULE_URL;

// Cached schedule (default: always active)
int scheduleStartHour = 0, scheduleStartMin = 0;
int scheduleEndHour   = 23, scheduleEndMin  = 59;
bool scheduleEnabled  = false;
unsigned long lastScheduleFetch = 0;
const unsigned long SCHEDULE_FETCH_INTERVAL = 300000; // 5 min

// Forward declarations
bool connectWiFiManager(bool forcePortal);
void syncTime();
bool isWithinSchedule();
void fetchSchedule();
void powerOnSensors();
void powerOffSensors();
void initSensors();
void readAndSendSensorData();
void checkAndSendTamper();
void keepaliveSleep(unsigned long sleepMs);
void blinkLED(int times, int delayMs);
String buildUrl(const char* path);
bool shouldForcePortal();

// =============================================================================
//  Triple-reset detection — power cycle 3x in 10s to force WiFi config portal
// =============================================================================
bool shouldForcePortal() {
  prefs.begin("mistio", false);

  unsigned long lastReset = prefs.getULong("lastReset", 0);
  int resetCount          = prefs.getInt("resetCount", 0);
  unsigned long now       = millis(); // time since this boot (small number)

  // If last reset was recent (stored as epoch-ish via millis offset trick):
  // We use a simple approach: store a boot timestamp and count.
  // On each boot, if the stored timestamp is "recent" (within window), increment.
  // Since millis() resets on boot, we use a rolling NVS counter with a timeout flag.

  // Read the "pending" flag — set at end of setup, cleared after RESET_DETECT_WINDOW
  bool pending = prefs.getBool("rstPending", false);

  if (pending) {
    // Previous boot set the flag and we rebooted quickly
    resetCount = prefs.getInt("rstCount", 0) + 1;
  } else {
    resetCount = 1;
  }

  // Save current state
  prefs.putInt("rstCount", resetCount);
  prefs.putBool("rstPending", true);
  prefs.end();

  Serial.printf("Reset count: %d / %d\n", resetCount, RESET_COUNT_TRIGGER);

  if (resetCount >= RESET_COUNT_TRIGGER) {
    // Clear the counter
    prefs.begin("mistio", false);
    prefs.putInt("rstCount", 0);
    prefs.putBool("rstPending", false);
    prefs.end();
    Serial.println(">>> TRIPLE RESET DETECTED — forcing WiFi portal <<<");
    return true;
  }

  return false;
}

void clearResetFlag() {
  // Called after the reset detection window passes — clears the "pending" flag
  // so that a later single reboot doesn't count toward the triple.
  prefs.begin("mistio", false);
  prefs.putBool("rstPending", false);
  prefs.putInt("rstCount", 0);
  prefs.end();
}

// =============================================================================
void setup() {
  esp_task_wdt_deinit();
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== ESP32-C6 School Deployment Sensor ===");
  Serial.println("Device: " + DEVICE_ID);
  Serial.println("Cycle: " + String(CYCLE_SECONDS) + "s");

  // Build URLs
  DATA_URL     = buildUrl("/api/sensors/data");
  TAMPER_URL   = buildUrl("/api/sensors/tamper");
  SCHEDULE_URL = buildUrl(("/api/devices/" + DEVICE_ID + "/schedule").c_str());
  Serial.println("Backend: " + DATA_URL);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Check for triple-reset → force WiFi config portal
  bool forcePortal = shouldForcePortal();

  // Power on I2C sensors
  powerOnSensors();

  // Connect WiFi (via WiFiManager — captive portal if needed)
  connectWiFiManager(forcePortal);

  if (WiFi.status() == WL_CONNECTED) {
    syncTime();
    fetchSchedule();
  }

  // Initialize all sensors
  initSensors();

  // Clear the reset detection flag after the detection window
  // (if we got this far without another reboot, it wasn't a triple-reset)
  clearResetFlag();

  blinkLED(3, 200);
  Serial.println("Setup complete.");
}

// =============================================================================
void loop() {
  unsigned long cycleStart = millis();

  // ── 1. Reconnect WiFi if needed ──────────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFiManager(false);
  }

  bool online = (WiFi.status() == WL_CONNECTED);

  // ── 2. Re-fetch schedule periodically ────────────────────────────────────
  if (online && (millis() - lastScheduleFetch > SCHEDULE_FETCH_INTERVAL)) {
    fetchSchedule();
  }

  // ── 3. Check schedule — skip sensors if outside school hours ─────────────
  if (scheduleEnabled && !isWithinSchedule()) {
    Serial.println("Outside school hours — sleeping.");
    if (online) {
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
    }
    keepaliveSleep(CYCLE_SECONDS * 1000);
    return;
  }

  // ── 4. Power on sensors and re-init (they need re-init after power cycle)
  if (!bme680Available && !msa311Available && !bmv080Available) {
    powerOnSensors();
    initSensors();
  }

  // ── 5. Let BMV080 warm up — poll for data readiness ──────────────────────
  if (bmv080Available) {
    Serial.println("Waiting for BMV080 data...");
    unsigned long bmvStart = millis();
    bool gotData = false;
    while (millis() - bmvStart < 8000) {
      if (bmv.readSensor()) {
        gotData = true;
        break;
      }
      delay(200);
    }
    if (!gotData) Serial.println("BMV080 no data this cycle (normal on first few cycles)");
  }

  // ── 6. Check tamper ─────────────────────────────────────────────────────
  if (msa311Available && online) {
    checkAndSendTamper();
  }

  // ── 7. Read sensors and POST ────────────────────────────────────────────
  if (online) {
    readAndSendSensorData();
  } else {
    Serial.println("No WiFi — skipping POST");
  }

  // ── 8. Power down sensors and sleep ─────────────────────────────────────
  powerOffSensors();
  bme680Available = false;
  msa311Available = false;
  bmv080Available = false;

  // Turn off WiFi for sleep
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);

  // Sleep for remainder of cycle
  unsigned long elapsed = millis() - cycleStart;
  unsigned long sleepTime = (CYCLE_SECONDS * 1000 > elapsed) ? (CYCLE_SECONDS * 1000 - elapsed) : 1000;
  Serial.printf("Cycle took %lums — sleeping %lums\n", elapsed, sleepTime);
  keepaliveSleep(sleepTime);
}

// =============================================================================
//  WiFi via WiFiManager — captive portal provisioning
// =============================================================================
bool connectWiFiManager(bool forcePortal) {
  WiFiManager wm;

  // Non-blocking: if portal times out, continue without WiFi
  wm.setConfigPortalTimeout(WM_PORTAL_TIMEOUT);
  wm.setConnectTimeout(15);

  // Dark theme for the portal
  wm.setDarkMode(true);

  // Show signal strength and scan for networks
  wm.setShowInfoUpdate(false);    // hide firmware update link
  wm.setShowInfoErase(false);     // hide erase button (prevent accidental wipe)

  // Pre-load default WiFi creds (only used on very first boot when NVS is empty)
  // After that, WiFiManager uses whatever was saved via the portal.
  // This means it "just works" at home without any configuration needed.
  wm.setSTAStaticIPConfig(IPAddress(0,0,0,0), IPAddress(0,0,0,0), IPAddress(0,0,0,0)); // DHCP

  if (forcePortal) {
    // Triple-reset detected — open config portal regardless of saved creds
    Serial.println("Opening WiFi config portal (forced)...");
    Serial.println("Connect to AP: " + String(AP_NAME));
    blinkLED(10, 100); // rapid blink to indicate portal mode

    // startConfigPortal blocks until user configures or timeout
    bool configured = wm.startConfigPortal(AP_NAME);
    if (configured) {
      Serial.println("WiFi configured via portal!");
    } else {
      Serial.println("Portal timed out — no WiFi configured");
    }
  } else {
    // Normal boot — try saved creds, fallback to portal if they fail
    Serial.println("Connecting WiFi (saved creds)...");
    bool connected = wm.autoConnect(AP_NAME);
    if (connected) {
      Serial.println("WiFi OK — " + WiFi.localIP().toString() + " (" + String(WiFi.RSSI()) + " dBm)");
    } else {
      Serial.println("WiFi FAILED — will retry next cycle");
    }
  }

  return (WiFi.status() == WL_CONNECTED);
}

// =============================================================================
//  Power management — Stemma QT enable/disable
// =============================================================================
void powerOnSensors() {
  pinMode(I2C_POWER_PIN, OUTPUT);
  digitalWrite(I2C_POWER_PIN, HIGH);
  Serial.println("Stemma QT power ON");
  delay(500);

  Wire.begin();
  Wire.setClock(100000);
  delay(250);

  // I2C scan
  Serial.println("I2C scan:");
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  0x%02X\n", addr);
    }
    delay(2);
  }
}

void powerOffSensors() {
  Wire.end();
  digitalWrite(I2C_POWER_PIN, LOW);
  Serial.println("Stemma QT power OFF");
}

// =============================================================================
//  Sensor initialization
// =============================================================================
void initSensors() {
  // ── BME680 ───────────────────────────────────────────────────────────────
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

  // ── MSA311 ───────────────────────────────────────────────────────────────
  if (msa.begin()) {
    msa311Available = true;
    msa.setDataRate(MSA301_DATARATE_500_HZ);
    msa.setRange(MSA301_RANGE_4_G);
    Serial.println("MSA311 OK");

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

  // ── BMV080 ───────────────────────────────────────────────────────────────
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
//  Keepalive sleep — periodic LED pulse prevents USB power bank auto-shutoff
// =============================================================================
void keepaliveSleep(unsigned long sleepMs) {
  Serial.printf("Keepalive sleep %lums (pulse every %lums)\n", sleepMs, KEEPALIVE_INTERVAL);
  Serial.flush();

  unsigned long start = millis();
  unsigned long lastPulse = start;

  while (millis() - start < sleepMs) {
    if (millis() - lastPulse >= KEEPALIVE_INTERVAL) {
      digitalWrite(LED_PIN, HIGH);
      delay(KEEPALIVE_DURATION);
      digitalWrite(LED_PIN, LOW);
      lastPulse = millis();
    }
    delay(100);
  }
}

// =============================================================================
//  NTP time sync
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
    Serial.println("NTP sync failed — schedule check disabled this boot");
  }
}

// =============================================================================
//  Server-side schedule
// =============================================================================
void fetchSchedule() {
  Serial.println("Fetching schedule...");
  HTTPClient http;

  if (USE_HTTPS) {
    WiFiClientSecure client;
    client.setCACert(ISRG_Root_X1);
    http.begin(client, SCHEDULE_URL);
  } else {
    http.begin(SCHEDULE_URL);
  }
  http.setTimeout(HTTP_TIMEOUT_MS);

  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    DynamicJsonDocument doc(512);
    if (!deserializeJson(doc, body)) {
      scheduleEnabled   = doc["enabled"] | false;
      scheduleStartHour = doc["start_hour"] | 0;
      scheduleStartMin  = doc["start_minute"] | 0;
      scheduleEndHour   = doc["end_hour"] | 23;
      scheduleEndMin    = doc["end_minute"] | 59;
      Serial.printf("Schedule: %s %02d:%02d - %02d:%02d\n",
        scheduleEnabled ? "ON" : "OFF",
        scheduleStartHour, scheduleStartMin,
        scheduleEndHour, scheduleEndMin);
    }
  } else {
    Serial.printf("Schedule fetch failed (%d) — using cached/default\n", code);
  }
  http.end();
  lastScheduleFetch = millis();
}

bool isWithinSchedule() {
  if (!timesynced) return true;
  if (!scheduleEnabled) return true;

  struct tm tm;
  if (!getLocalTime(&tm)) return true;

  // Convert UTC to Pacific Time (PDT = UTC-7)
  int localHour = (tm.tm_hour - 7 + 24) % 24;
  int localMin  = tm.tm_min;

  int nowMinutes   = localHour * 60 + localMin;
  int startMinutes = scheduleStartHour * 60 + scheduleStartMin;
  int endMinutes   = scheduleEndHour * 60 + scheduleEndMin;

  return (nowMinutes >= startMinutes && nowMinutes <= endMinutes);
}

// =============================================================================
//  Tamper detection
// =============================================================================
void checkAndSendTamper() {
  sensors_event_t accel;
  msa.getEvent(&accel);

  float ax = accel.acceleration.x;
  float ay = accel.acceleration.y;
  float az = accel.acceleration.z;
  float mag = sqrt(ax * ax + ay * ay + az * az);
  float delta = abs(mag - prevAccelMag);
  prevAccelMag = mag;

  if (delta > TAMPER_THRESHOLD) {
    Serial.printf("TAMPER! delta=%.2f\n", delta);

    DynamicJsonDocument doc(256);
    doc["device_id"] = DEVICE_ID;
    doc["org_id"]    = ORG_ID;
    doc["accel_x"]   = ax;
    doc["accel_y"]   = ay;
    doc["accel_z"]   = az;

    String payload;
    serializeJson(doc, payload);

    HTTPClient http;
    if (USE_HTTPS) {
      WiFiClientSecure client;
      client.setCACert(ISRG_Root_X1);
      http.begin(client, TAMPER_URL);
    } else {
      http.begin(TAMPER_URL);
    }
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(HTTP_TIMEOUT_MS);
    int code = http.POST(payload);
    Serial.printf("Tamper POST -> %d\n", code);
    http.end();

    blinkLED(5, 80);
  }
}

// =============================================================================
//  Sensor read + POST
// =============================================================================
void readAndSendSensorData() {
  Serial.println("\n--- Reading sensors ---");

  // ── BME680 ───────────────────────────────────────────────────────────────
  float temperature = 0, humidity = 0, pressure = 0, gasResistance = 0;
  if (bme680Available && bme.performReading()) {
    temperature   = bme.temperature;
    humidity      = bme.humidity;
    pressure      = bme.pressure / 100.0;
    gasResistance = bme.gas_resistance / 1000.0;
  }

  // ── BMV080 PM readings ──────────────────────────────────────────────────
  float pm1 = 0, pm25 = 0, pm10 = 0;
  if (bmv080Available) {
    pm1  = bmv.PM1();
    pm25 = bmv.PM25();
    pm10 = bmv.PM10();
    Serial.printf("BMV080: PM1=%.1f PM2.5=%.1f PM10=%.1f%s\n",
      pm1, pm25, pm10, bmv.isObstructed() ? " [OBSTRUCTED]" : "");
  }

  // ── Microphone (optional) ───────────────────────────────────────────────
  float soundLevel = 0;
  bool micConnected = false;
  int readings[10];
  int consistent = 0;
  for (int i = 0; i < 10; i++) { readings[i] = analogRead(MIC_PIN); delay(1); }
  for (int i = 1; i < 10; i++) { if (abs(readings[i] - readings[i-1]) < 50) consistent++; }
  micConnected = (consistent >= 7);
  if (micConnected) {
    int total = 0;
    for (int i = 0; i < 5; i++) { total += analogRead(MIC_PIN); delay(1); }
    int raw = total / 5;
    if (raw < 100) raw = 0;
    soundLevel = (raw / 4095.0) * 100.0;
  }

  // ── Build JSON ──────────────────────────────────────────────────────────
  DynamicJsonDocument doc(1024);
  doc["device_id"]       = DEVICE_ID;
  doc["location"]        = LOCATION;
  doc["org_id"]          = ORG_ID;
  doc["temperature"]     = temperature;
  doc["humidity"]        = humidity;
  doc["pressure"]        = pressure;
  doc["gas_resistance"]  = gasResistance;
  doc["pm1"]             = pm1;
  doc["pm25"]            = pm25;
  doc["pm10"]            = pm10;
  doc["sound_level"]     = soundLevel;
  doc["mic_available"]   = micConnected;
  doc["wifi_rssi"]       = WiFi.RSSI();
  doc["sensor_type"]     = "multi_sensor";
  doc["bmv080_obstructed"] = bmv080Available ? bmv.isObstructed() : false;

  // Derived features for ML model
  doc["temp_humidity_ratio"]  = (humidity > 0) ? temperature / humidity : 0;
  doc["gas_temp_interaction"] = gasResistance * temperature;
  doc["pm_ratio"]             = (pm10 > 0) ? pm25 / pm10 : 0;
  float aqi25 = (pm25 / 35.0) * 100.0;
  float aqi10 = (pm10 / 150.0) * 100.0;
  doc["air_quality_index"]    = max(aqi25, aqi10);

  String payload;
  serializeJson(doc, payload);
  Serial.println("Payload: " + payload);

  // ── POST ────────────────────────────────────────────────────────────────
  HTTPClient http;
  if (USE_HTTPS) {
    WiFiClientSecure client;
    client.setCACert(ISRG_Root_X1);
    http.begin(client, DATA_URL);
  } else {
    http.begin(DATA_URL);
  }
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(HTTP_TIMEOUT_MS);
  int code = http.POST(payload);

  if (code == 200 || code == 201) {
    Serial.println("OK (" + String(code) + ")");
    String resp = http.getString();
    DynamicJsonDocument respDoc(512);
    if (!deserializeJson(respDoc, resp) && respDoc.containsKey("prediction")) {
      String cls  = respDoc["prediction"]["predicted_class"].as<String>();
      float  conf = respDoc["prediction"]["confidence"];
      Serial.printf("  Prediction: %s (%.1f%%)\n", cls.c_str(), conf);
    }
  } else {
    Serial.println("HTTP error: " + String(code));
  }
  http.end();
}

// =============================================================================
//  Utilities
// =============================================================================
String buildUrl(const char* path) {
  return String(USE_HTTPS ? "https://" : "http://") + BACKEND_HOST + String(path);
}

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(delayMs);
    digitalWrite(LED_PIN, LOW);  delay(delayMs);
  }
}
