/*
 * ESP32 Feather V2 (Huzzah32) — Vape Detection Sensor v3
 *
 * Hardware:
 *   - BME680      (I2C 0x76/0x77) — Temperature, humidity, pressure, gas resistance
 *   - BMV080      (I2C 0x57)      — PM1.0, PM2.5, PM10  (replaces PMS5003)
 *   - MSA311      (I2C 0x62)      — Accelerometer for tamper detection
 *   - MAX4466     (ADC GPIO 34)   — Microphone
 *   - LED         (GPIO 13)       — Status indicator
 *   - Reset btn   (GPIO 38)       — Factory reset (3 s hold)
 *
 * Power strategy (light-sleep + wake-on-spike):
 *   1. Idle: BME680 reads temp+humidity+gas (short 100ms heater pulse) every
 *      5 s via light-sleep timer wake.  BMV080 is powered down.  MSA311 stays
 *      in low-power mode with motion interrupt wired to GPIO for ext0 wake.
 *   2. On humidity spike (>1.5 %RH delta) or gas-resistance drop (>8 %),
 *      enter ASSESSMENT mode: power on BMV080, enable BME680 gas heater,
 *      read all sensors, send full payload to backend.
 *   3. WiFi connects only when there is data to send (spike or 1-min heartbeat).
 *   4. MSA311 motion interrupt immediately wakes + sends tamper alert.
 *
 * WiFi provisioning:
 *   Serial command:  WIFI:SSID,PASSWORD,ORG_ID
 *   Factory reset:   hold GPIO 38 for 3 seconds
 *   NVS-compatible with v2 firmware (same "wifi" namespace)
 *
 * Endpoints:
 *   POST /api/sensors/data   — regular sensor payload (same schema as v1/v2)
 *   POST /api/sensors/tamper — tamper alert  { device_id, timestamp, accel_x/y/z }
 */

#include <WiFi.h>
#include <esp_http_client.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include <Adafruit_MSA301.h>           // works for MSA311 via Adafruit_MSA311 subclass
#include <SparkFun_BMV080_Arduino_Library.h>
#include <Preferences.h>
#include <esp_mac.h>
#include <esp_sleep.h>

// ─── Pin definitions (Huzzah32 Feather V2) ──────────────────────────────────
#define I2C_SDA        22
#define I2C_SCL        20
#define MIC_PIN        34        // A2 — ADC1 (works with WiFi)
#define LED_PIN        13
#define RESET_BUTTON_PIN 38
#define MSA311_INT_PIN 15        // MSA311 INT1 → RTC-capable GPIO for wake

// ─── Timing ─────────────────────────────────────────────────────────────────
#define SNIFF_INTERVAL_US    (5ULL  * 1000000ULL)   // 5 s  light-sleep
#define HEARTBEAT_INTERVAL   60000UL                // 1 min heartbeat
#define ASSESSMENT_DURATION  30000UL                // 30 s  full-sensing window
#define ASSESSMENT_READ_INTERVAL 5000UL             // 5 s between reads in assessment

// ─── Spike thresholds (BME680 quick-sniff) ──────────────────────────────────
#define HUMIDITY_DELTA_TRIGGER       1.5f   // %RH absolute rise
#define GAS_DROP_PERCENT_TRIGGER     0.08f  // 8 % relative drop
#define GAS_DROP_ABS_TRIGGER         5.0f   // kOhm absolute drop
#define HUMIDITY_DELTA_COMPOUND      0.8f   // compound: humidity
#define GAS_DROP_COMPOUND            3.0f   // compound: gas (kOhm)
#define BASELINE_DRIFT_ALPHA         0.02f  // slow EWMA

// ─── RTC-persisted state (survives light sleep, lost on deep sleep/reset) ───
RTC_DATA_ATTR float baseline_humidity      = 0.0f;
RTC_DATA_ATTR float baseline_gas           = 0.0f;
RTC_DATA_ATTR bool  baseline_valid         = false;
RTC_DATA_ATTR unsigned long lastHeartbeat  = 0;
RTC_DATA_ATTR int   warmupCycles           = 0;   // gas sensor needs ~6 cycles to stabilize
RTC_DATA_ATTR unsigned long lastTamperTime = 0;    // tamper cooldown
RTC_DATA_ATTR float baseAccelX = 0, baseAccelY = 0, baseAccelZ = 0;  // baseline orientation
#define TAMPER_COOLDOWN_MS  30000                   // 30s between tamper alerts
#define TAMPER_DELTA_THRESHOLD 0.4f                 // 0.4g change in any axis = tamper
#define WARMUP_CYCLES_REQUIRED 6                   // ~30s at 5s intervals

// ─── Objects ────────────────────────────────────────────────────────────────
Preferences prefs;
Adafruit_BME680 bme;
Adafruit_MSA311 msa;
SparkFunBMV080  bmv;

// ─── WiFi (serial provisioning, NVS-compatible with v2) ─────────────────────
String ssid = "sweethome";
String password = "rahul2008";
String org = "";
bool wifiConfigured = false;
bool wifiConnected = false;
String deviceMac = "";
String cleanMac = "";

// ─── API ────────────────────────────────────────────────────────────────────
const char *apiEndpoint      = "https://vapegaurd-production.up.railway.app/api/sensors/data";
const char *tamperEndpoint   = "https://vapegaurd-production.up.railway.app/api/sensors/tamper";
// Starfield Root CA G2 — used by Railway (via Certainly intermediate)
static const char Starfield_Root_G2[] =
"-----BEGIN CERTIFICATE-----\n"
"MIID3TCCAsWgAwIBAgIBADANBgkqhkiG9w0BAQsFADCBjzELMAkGA1UEBhMCVVMx\n"
"EDAOBgNVBAgTB0FyaXpvbmExEzARBgNVBAcTClNjb3R0c2RhbGUxJTAjBgNVBAoT\n"
"HFN0YXJmaWVsZCBUZWNobm9sb2dpZXMsIEluYy4xMjAwBgNVBAMTKVN0YXJmaWVs\n"
"ZCBSb290IENlcnRpZmljYXRlIEF1dGhvcml0eSAtIEcyMB4XDTA5MDkwMTAwMDAw\n"
"MFoXDTM3MTIzMTIzNTk1OVowgY8xCzAJBgNVBAYTAlVTMRAwDgYDVQQIEwdBcml6\n"
"b25hMRMwEQYDVQQHEwpTY290dHNkYWxlMSUwIwYDVQQKExxTdGFyZmllbGQgVGVj\n"
"aG5vbG9naWVzLCBJbmMuMTIwMAYDVQQDEylTdGFyZmllbGQgUm9vdCBDZXJ0aWZp\n"
"Y2F0ZSBBdXRob3JpdHkgLSBHMjCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoC\n"
"ggEBAL3twQP89o/8ArFvW59I2Z154qK3A2FWGMNHttfKPTUuiUP3oWmb3ooa/RMg\n"
"nLRJdzIpVv257IzdIvpy3Cdhl+72WoTsbhm5iSzchFvVdPtrX8WJpRBSiUZV9Lh1\n"
"HOZ/5FSuS/hVclcCGfgXcVnrHigHdMWdSL5stPSksPNkN3mSwOxGXn/hbVNMYq/N\n"
"Hwtjuzqd+/x5AJhhdM8mgkBj87JyahkNmcrUDnXMN/uLicFZ8WJ/X7NfZTD4p7dN\n"
"dloedl40wOiWVpmKs/B/pM293DIxfJHP4F8R+GuqSVzRmZTRouNjWwl2tVZi4Ut0\n"
"HZbUJtQIBFnQmA4O5t78w+wfkPECAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAO\n"
"BgNVHQ8BAf8EBAMCAQYwHQYDVR0OBBYEFHwMMh+n2TB/xH1oo2Kooc6rB1snMA0G\n"
"CSqGSIb3DQEBCwUAA4IBAQARWfolTwNvlJk7mh+ChTnUdgWUXuEok21iXQnCoKjU\n"
"sHU48TRqneSfioYmUeYs0cYtbpUgSpIB7LiKZ3sx4mcujJUDJi5DnUox9g61DLu3\n"
"4jd/IroAow57UvtruzvE03lRTs2Q9GcHGcg8RnoNAX3FWOdt5oUwF5okxBDgBPfg\n"
"8n/Uqgr/Qh037ZTlZFkSIHc40zI+OIF1lnP6aI+xy84fxez6nH7PfrHxBy22/L/K\n"
"pL/QlwVKvOoYKAKQvVR4CSFx09F9HdkWsKlhPdAKACL8x3vLCWRFCztAgfd9fDL1\n"
"mMpYjn0q7pBZc2T5NnReJaH1ZgUufzkVqSr7UIuOhWn0\n"
"-----END CERTIFICATE-----\n";

// ─── Sensor state ───────────────────────────────────────────────────────────
bool bme680Available = false;
bool msa311Available = false;
bool bmv080Available = false;
int consecutiveFailures = 0;
const int MAX_FAILURES = 5;
String httpResponseBuffer = "";

const char *ntp1 = "pool.ntp.org";
const char *ntp2 = "time.nist.gov";

// ─── Operating modes ────────────────────────────────────────────────────────
enum DeviceMode {
  MODE_CONFIG,       // Serial provisioning
  MODE_IDLE,         // light-sleep, periodic BME680 sniff
  MODE_ASSESSMENT,   // full sensing (BMV080 + BME680 full + mic)
  MODE_TAMPER        // tamper alert send
};
DeviceMode currentMode = MODE_IDLE;
unsigned long assessmentStart = 0;

// ─── Forward declarations ───────────────────────────────────────────────────
void blinkLED(int times, int delayMs);
float calculateAQI(float pm25, float pm10);
bool  shouldWakeBMV080(float humidity, float gasResistance);
void  connectToWiFi();
void  disconnectWiFi();
void  sendSensorData();
void  sendTamperAlert(float ax, float ay, float az);
void  sendHTTP(const char *url, const String &json);
void  enterLightSleep();
void  startAssessment();
void  endAssessment();
void  factoryReset();
void  loadCredentials();
void  saveCredentials(const String &s, const String &p, const String &o);
float readMicrophone();
void  checkSerialConfig();

// ═══════════════════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== Mistio Vape Sensor v3 (Feather V2) ===");

  // ── MAC address ───────────────────────────────────────────────────────
  uint8_t baseMac[6];
  esp_read_mac(baseMac, ESP_MAC_WIFI_STA);
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           baseMac[0], baseMac[1], baseMac[2],
           baseMac[3], baseMac[4], baseMac[5]);
  deviceMac = String(macStr);
  cleanMac  = deviceMac;
  cleanMac.replace(":", "");
  Serial.println("Device MAC: " + deviceMac);

  // ── Pins ──────────────────────────────────────────────────────────────
  pinMode(LED_PIN, OUTPUT);
  pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);
  pinMode(MSA311_INT_PIN, INPUT_PULLUP);

  // ── Check wake reason ─────────────────────────────────────────────────
  esp_sleep_wakeup_cause_t wakeReason = esp_sleep_get_wakeup_cause();
  if (wakeReason == ESP_SLEEP_WAKEUP_EXT0) {
    Serial.println("[Wake] MSA311 motion interrupt -> TAMPER");
    currentMode = MODE_TAMPER;
  } else if (wakeReason == ESP_SLEEP_WAKEUP_TIMER) {
    Serial.println("[Wake] Timer -> sniff cycle");
    currentMode = MODE_IDLE;
  } else {
    Serial.println("[Wake] Cold boot / reset");
    currentMode = MODE_IDLE;
    baseline_valid = false;
    lastHeartbeat = 0;
    warmupCycles = 0;
  }

  // ── Load WiFi credentials ────────────────────────────────────────────
  loadCredentials();

  // ── I2C bus ───────────────────────────────────────────────────────────
  Wire.begin(I2C_SDA, I2C_SCL);

  // ── I2C scan ──────────────────────────────────────────────────────────
  Serial.println("I2C scan:");
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  0x%02X found\n", addr);
    }
    delay(1);
  }

  // ── BME680 init (low-power sniff: short gas heater for VOC baseline) ─
  if (bme.begin(0x77) || bme.begin(0x76)) {
    bme680Available = true;
    Serial.println("[BME680] OK");
    bme.setTemperatureOversampling(BME680_OS_2X);
    bme.setHumidityOversampling(BME680_OS_1X);
    bme.setPressureOversampling(BME680_OS_NONE);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
    // Short gas heater pulse: 320°C for 100ms — enough for VOC trend
    // detection while keeping power low (~13mA for 100ms every 5s ≈ 0.26mA avg)
    bme.setGasHeater(320, 100);
  } else {
    Serial.println("[BME680] NOT FOUND");
  }

  // ── MSA311 init (polling mode — no hardware interrupt) ────────────────
  if (msa.begin(MSA311_I2CADDR_DEFAULT, &Wire)) {
    msa311Available = true;
    Serial.println("[MSA311] OK at 0x62");
    msa.setPowerMode(MSA301_LOWPOWERMODE);
    msa.setDataRate(MSA301_DATARATE_15_63_HZ);
    msa.setRange(MSA301_RANGE_2_G);
    // Disable all hardware interrupts — we poll during each sniff cycle
    msa.enableInterrupts(false, false, false, false, false, false, false, false);
    // Read baseline orientation
    msa.read();
    baseAccelX = msa.x_g;
    baseAccelY = msa.y_g;
    baseAccelZ = msa.z_g;
    Serial.printf("[MSA311] Baseline: X=%.2f Y=%.2f Z=%.2f g\n", baseAccelX, baseAccelY, baseAccelZ);
  } else {
    Serial.println("[MSA311] NOT FOUND at 0x62");
  }

  // BMV080 is NOT initialized here — only powered up during ASSESSMENT mode
  bmv080Available = false;

  // ── Factory reset check ───────────────────────────────────────────────
  if (isResetHeld()) {
    factoryReset();
    return;
  }

  // ── WiFi provisioning ─────────────────────────────────────────────────
  if (!wifiConfigured) {
    currentMode = MODE_CONFIG;
    Serial.println("\n[CONFIG] No WiFi credentials stored.");
    Serial.println("[CONFIG] Send via Serial:  WIFI:SSID,PASSWORD,ORG_ID");
    Serial.println("[CONFIG] Waiting for credentials...");
    blinkLED(5, 100);
    return;
  }

  blinkLED(3, 200);
  Serial.println("System ready.");
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════════════════════

void loop() {
  // Always check for serial config commands
  checkSerialConfig();

  // ── CONFIG MODE (waiting for serial) ──────────────────────────────────
  if (currentMode == MODE_CONFIG) {
    digitalWrite(LED_PIN, (millis() / 500) % 2);  // slow blink
    delay(100);
    return;
  }

  // ── Factory reset button ──────────────────────────────────────────────
  if (isResetHeld()) {
    factoryReset();
    return;
  }

  // ── ASSESSMENT MODE (full sensing) ────────────────────────────────────
  if (currentMode == MODE_ASSESSMENT) {
    handleAssessment();
    return;
  }

  // ── IDLE MODE: quick BME680 sniff ─────────────────────────────────────
  handleSniff();
}

// ═══════════════════════════════════════════════════════════════════════════
//  SERIAL PROVISIONING
// ═══════════════════════════════════════════════════════════════════════════

void checkSerialConfig() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();

  if (cmd.startsWith("WIFI:")) {
    // Format: WIFI:SSID,PASSWORD,ORG_ID
    String data = cmd.substring(5);
    int c1 = data.indexOf(',');
    int c2 = data.indexOf(',', c1 + 1);

    if (c1 > 0 && c2 > c1) {
      String newSSID = data.substring(0, c1);
      String newPass = data.substring(c1 + 1, c2);
      String newOrg  = data.substring(c2 + 1);

      Serial.println("[CONFIG] Saving credentials...");
      Serial.println("  SSID: " + newSSID);
      Serial.println("  Org:  " + newOrg);

      saveCredentials(newSSID, newPass, newOrg);
      Serial.println("[CONFIG] Saved. Restarting...");
      delay(500);
      ESP.restart();
    } else if (c1 > 0) {
      // Two-field format: WIFI:SSID,PASSWORD  (no org)
      String newSSID = data.substring(0, c1);
      String newPass = data.substring(c1 + 1);
      saveCredentials(newSSID, newPass, org);
      Serial.println("[CONFIG] Saved (no org change). Restarting...");
      delay(500);
      ESP.restart();
    } else {
      Serial.println("[CONFIG] Invalid format. Use: WIFI:SSID,PASSWORD,ORG_ID");
    }
  } else if (cmd == "STATUS") {
    Serial.println("MAC: " + deviceMac);
    Serial.println("SSID: " + ssid);
    Serial.println("Org: " + org);
    Serial.println("WiFi: " + String(wifiConnected ? "connected" : "disconnected"));
    Serial.println("BME680: " + String(bme680Available ? "yes" : "no"));
    Serial.println("MSA311: " + String(msa311Available ? "yes" : "no"));
    Serial.println("BMV080: " + String(bmv080Available ? "yes" : "no"));
    Serial.printf("Baseline: H=%.1f Gas=%.1f valid=%d\n",
                  baseline_humidity, baseline_gas, baseline_valid);
  } else if (cmd == "TEST") {
    Serial.println("[TEST] Forcing assessment mode...");
    startAssessment();
  } else if (cmd == "RESET") {
    factoryReset();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MODE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

void handleSniff() {
  Serial.println("\n--- Sniff cycle ---");

  // ── Poll MSA311 for tamper (compare to baseline orientation) ──
  if (msa311Available) {
    msa.read();
    float dx = fabs(msa.x_g - baseAccelX);
    float dy = fabs(msa.y_g - baseAccelY);
    float dz = fabs(msa.z_g - baseAccelZ);
    float maxDelta = max(dx, max(dy, dz));
    Serial.printf("[Accel] X=%.2f Y=%.2f Z=%.2f  d=%.2f\n", msa.x_g, msa.y_g, msa.z_g, maxDelta);
    if (maxDelta > TAMPER_DELTA_THRESHOLD) {
      Serial.printf("[Tamper] Motion! dX=%.2f dY=%.2f dZ=%.2f (max=%.2f)\n", dx, dy, dz, maxDelta);
      handleTamper();
      // Update baseline to new orientation after tamper
      baseAccelX = msa.x_g;
      baseAccelY = msa.y_g;
      baseAccelZ = msa.z_g;
    }
  }

  if (!bme680Available) {
    Serial.println("[Sniff] No BME680 - cannot sniff, going to heartbeat path");
  } else {
    if (bme.performReading()) {
      float humidity = bme.humidity;
      float gasRes   = bme.gas_resistance / 1000.0f;

      Serial.printf("[Sniff] H=%.1f%%  Gas=%.1f kOhm\n", humidity, gasRes);

      // Warmup: gas sensor needs ~30s to stabilize after boot
      if (warmupCycles < WARMUP_CYCLES_REQUIRED) {
        warmupCycles++;
        // Still update baseline during warmup (use fast alpha to converge)
        baseline_humidity = humidity;
        baseline_gas      = gasRes;
        baseline_valid    = true;
        Serial.printf("[Warmup] %d/%d — building baseline\n", warmupCycles, WARMUP_CYCLES_REQUIRED);
      } else if (shouldWakeBMV080(humidity, gasRes)) {
        Serial.println("[Sniff] *** SPIKE DETECTED -> ASSESSMENT ***");
        startAssessment();
        return;
      }
    } else {
      Serial.println("[Sniff] BME680 read failed");
    }
  }

  unsigned long now = millis();
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL || lastHeartbeat == 0) {
    Serial.println("[Heartbeat] Sending status update");
    sendHeartbeat();
    lastHeartbeat = now;
  }

  enterLightSleep();
}

void handleAssessment() {
  unsigned long elapsed = millis() - assessmentStart;
  if (elapsed >= ASSESSMENT_DURATION) {
    Serial.println("[Assessment] Window complete -> back to idle");
    endAssessment();
    // Reset baseline + warmup so sniff recalibrates to post-sleep gas levels
    baseline_valid = false;
    warmupCycles = 0;
    currentMode = MODE_IDLE;
    enterLightSleep();
    return;
  }

  sendSensorData();
  delay(ASSESSMENT_READ_INTERVAL);
}

void handleTamper() {
  Serial.println("[Tamper] Sending alert...");

  float ax = msa.x_g;
  float ay = msa.y_g;
  float az = msa.z_g;
  Serial.printf("[Tamper] Accel: X=%.2f Y=%.2f Z=%.2f g\n", ax, ay, az);

  connectToWiFi();
  if (wifiConnected) {
    sendTamperAlert(ax, ay, az);
    disconnectWiFi();
  }

  blinkLED(5, 100);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SPIKE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

bool shouldWakeBMV080(float humidity, float gasResistance) {
  if (!baseline_valid) {
    baseline_humidity = humidity;
    baseline_gas      = gasResistance;
    baseline_valid    = true;
    return false;
  }

  float dHum = humidity - baseline_humidity;
  float dGas = baseline_gas - gasResistance;
  float dGasPct = (baseline_gas > 0.1f) ? (dGas / baseline_gas) : 0.0f;

  Serial.printf("[Spike] dH=%.2f  dGas=%.2f kOhm (%.1f%%)\n",
                dHum, dGas, dGasPct * 100.0f);

  if (dHum >= HUMIDITY_DELTA_TRIGGER)       return true;
  if (dGas >= GAS_DROP_ABS_TRIGGER)         return true;
  if (dGasPct >= GAS_DROP_PERCENT_TRIGGER)  return true;

  if (dHum >= HUMIDITY_DELTA_COMPOUND && dGas >= GAS_DROP_COMPOUND) {
    return true;
  }

  baseline_humidity = baseline_humidity * (1.0f - BASELINE_DRIFT_ALPHA) +
                      humidity * BASELINE_DRIFT_ALPHA;
  baseline_gas      = baseline_gas * (1.0f - BASELINE_DRIFT_ALPHA) +
                      gasResistance * BASELINE_DRIFT_ALPHA;

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ASSESSMENT MODE (full sensing)
// ═══════════════════════════════════════════════════════════════════════════

void startAssessment() {
  currentMode     = MODE_ASSESSMENT;
  assessmentStart = millis();

  if (bme680Available) {
    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setGasHeater(320, 150);
  }

  Serial.println("[BMV080] Initializing...");
  if (bmv.begin(SF_BMV080_DEFAULT_ADDRESS, Wire)) {
    if (bmv.init()) {
      bmv.setMode(SF_BMV080_MODE_CONTINUOUS);
      bmv080Available = true;
      Serial.println("[BMV080] Ready (continuous mode)");
    } else {
      Serial.println("[BMV080] init() failed");
      bmv080Available = false;
    }
  } else {
    Serial.println("[BMV080] begin() failed - not connected?");
    bmv080Available = false;
  }

  connectToWiFi();
  if (wifiConnected) {
    configTime(0, 0, ntp1, ntp2);
  }
}

void endAssessment() {
  if (bmv080Available) {
    bmv.close();
    bmv080Available = false;
    Serial.println("[BMV080] Closed");
  }

  if (bme680Available) {
    bme.setTemperatureOversampling(BME680_OS_2X);
    bme.setHumidityOversampling(BME680_OS_1X);
    bme.setPressureOversampling(BME680_OS_NONE);
    // Back to short heater for sniff-mode gas baseline tracking
    bme.setGasHeater(320, 100);
  }

  disconnectWiFi();
}

// ═══════════════════════════════════════════════════════════════════════════
//  SENSOR READING & DATA SENDING
// ═══════════════════════════════════════════════════════════════════════════

void sendSensorData() {
  Serial.println("\n--- Full Sensor Read ---");

  float temperature = -999, humidity = -999, pressure = -999, gasResistance = -999;
  if (bme680Available && bme.performReading()) {
    temperature   = bme.temperature;
    humidity      = bme.humidity;
    pressure      = bme.pressure / 100.0f;
    gasResistance = bme.gas_resistance / 1000.0f;
  }

  float pm1 = -999, pm25 = -999, pm10 = -999;
  bool pmValid = false;
  if (bmv080Available && bmv.readSensor()) {
    pm1  = bmv.PM1();
    pm25 = bmv.PM25();
    pm10 = bmv.PM10();
    pmValid = (pm1 >= 0 && pm25 >= 0 && pm10 >= 0);
  }

  float soundLevel = readMicrophone();
  bool micAvailable = (soundLevel >= 0);
  if (!micAvailable) soundLevel = 0.0f;

  if (pmValid) {
    Serial.printf("T=%.1f H=%.1f P=%.1f Gas=%.1f PM1=%.1f PM2.5=%.1f PM10=%.1f Snd=%.1f\n",
                  temperature, humidity, pressure, gasResistance, pm1, pm25, pm10, soundLevel);
  } else {
    Serial.printf("T=%.1f H=%.1f P=%.1f Gas=%.1f PM=waiting Snd=%.1f\n",
                  temperature, humidity, pressure, gasResistance, soundLevel);
  }

  DynamicJsonDocument doc(1024);
  doc["device_id"]    = cleanMac;
  doc["org_id"]       = org;
  doc["location"]     = "Building A, Floor 1";

  doc["temperature"]    = (temperature > -999)   ? temperature   : 0.0f;
  doc["humidity"]       = (humidity > -999)       ? humidity      : 0.0f;
  doc["pressure"]       = (pressure > -999)       ? pressure      : 0.0f;
  doc["gas_resistance"] = (gasResistance > -999)  ? gasResistance : 0.0f;
  doc["pm1"]            = pmValid ? pm1  : 0.0f;
  doc["pm25"]           = pmValid ? pm25 : 0.0f;
  doc["pm10"]           = pmValid ? pm10 : 0.0f;
  doc["sound_level"]    = soundLevel;
  doc["wifi_rssi"]      = WiFi.RSSI();
  doc["sensor_type"]    = "multi_sensor";
  doc["mic_available"]  = micAvailable;

  float safeHum  = (humidity > 0 && humidity > -999)       ? humidity      : 1.0f;
  float safeTemp = (temperature > -999)                    ? temperature   : 0.0f;
  float safeGas  = (gasResistance > -999)                  ? gasResistance : 0.0f;
  float safePm25 = pmValid ? pm25 : 0.0f;
  float safePm10 = (pmValid && pm10 > 0) ? pm10 : 1.0f;

  doc["temp_humidity_ratio"]  = safeTemp / safeHum;
  doc["gas_temp_interaction"] = safeGas * safeTemp;
  doc["pm_ratio"]             = safePm25 / safePm10;
  doc["air_quality_index"]    = calculateAQI(safePm25, pmValid ? pm10 : 0.0f);

  String jsonString;
  serializeJson(doc, jsonString);

  if (!wifiConnected) connectToWiFi();
  if (wifiConnected) {
    sendHTTP(apiEndpoint, jsonString);
  }
}

void sendHeartbeat() {
  DynamicJsonDocument doc(512);
  doc["device_id"]    = cleanMac;
  doc["org_id"]       = org;
  doc["location"]     = "Building A, Floor 1";
  doc["sensor_type"]  = "heartbeat";
  doc["wifi_rssi"]    = 0;

  if (bme680Available && bme.performReading()) {
    doc["temperature"]    = bme.temperature;
    doc["humidity"]       = bme.humidity;
    doc["gas_resistance"] = bme.gas_resistance / 1000.0f;
    doc["pressure"]       = bme.pressure / 100.0f;
  } else {
    doc["temperature"]    = 0.0f;
    doc["humidity"]       = 0.0f;
    doc["gas_resistance"] = 0.0f;
    doc["pressure"]       = 0.0f;
  }
  doc["pm1"]  = 0.0f;
  doc["pm25"] = 0.0f;
  doc["pm10"] = 0.0f;
  doc["sound_level"]         = 0.0f;
  doc["mic_available"]       = false;
  doc["temp_humidity_ratio"]  = 0.0f;
  doc["gas_temp_interaction"] = 0.0f;
  doc["pm_ratio"]             = 0.0f;
  doc["air_quality_index"]    = 0.0f;

  String jsonString;
  serializeJson(doc, jsonString);

  connectToWiFi();
  if (wifiConnected) {
    doc["wifi_rssi"] = WiFi.RSSI();
    jsonString = "";
    serializeJson(doc, jsonString);
    sendHTTP(apiEndpoint, jsonString);
    disconnectWiFi();
  }
}

void sendTamperAlert(float ax, float ay, float az) {
  DynamicJsonDocument doc(256);
  doc["device_id"]  = cleanMac;
  doc["org_id"]     = org;
  doc["accel_x"]    = ax;
  doc["accel_y"]    = ay;
  doc["accel_z"]    = az;

  String jsonString;
  serializeJson(doc, jsonString);

  sendHTTP(tamperEndpoint, jsonString);
}

// ═══════════════════════════════════════════════════════════════════════════
//  POWER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

void enterLightSleep() {
  Serial.println("[Sleep] Entering light sleep...");
  Serial.flush();

  esp_sleep_enable_timer_wakeup(SNIFF_INTERVAL_US);

  esp_light_sleep_start();

  // ── Woke up ───────────────────────────────────────────────────────────
  // Re-init I2C bus after light sleep (peripherals may lose state)
  Wire.begin(I2C_SDA, I2C_SCL);

  Serial.println("[Wake] Timer -> sniff");
  currentMode = MODE_IDLE;
}

// ═══════════════════════════════════════════════════════════════════════════
//  NETWORKING
// ═══════════════════════════════════════════════════════════════════════════

void connectToWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    return;
  }
  if (!wifiConfigured) return;

  Serial.println("[WiFi] Connecting to " + ssid);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  WiFi.begin(ssid.c_str(), password.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < 10000) {
    delay(250);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.printf("\n[WiFi] Connected. IP=%s RSSI=%d\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    WiFi.setAutoReconnect(true);

    // Sync NTP so TLS certificate validation works
    configTime(0, 0, ntp1, ntp2);
    // Wait briefly for time sync (needed for TLS cert verify)
    int ntpRetries = 0;
    time_t now = time(nullptr);
    while (now < 1700000000 && ntpRetries < 20) {
      delay(250);
      now = time(nullptr);
      ntpRetries++;
    }
    if (now > 1700000000) {
      Serial.printf("[NTP] Time synced: %ld\n", (long)now);
    } else {
      Serial.println("[NTP] Sync timeout - TLS may fail");
    }
  } else {
    wifiConnected = false;
    Serial.println("\n[WiFi] Failed to connect");
  }
}

void disconnectWiFi() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  wifiConnected = false;
  Serial.println("[WiFi] Disconnected (power save)");
}

esp_err_t http_event_handler(esp_http_client_event_t *evt) {
  if (evt->event_id == HTTP_EVENT_ON_DATA && evt->data_len > 0) {
    char *d = (char *)evt->data;
    for (int i = 0; i < evt->data_len; i++) {
      httpResponseBuffer += d[i];
    }
  }
  return ESP_OK;
}

void sendHTTP(const char *url, const String &json) {
  httpResponseBuffer = "";

  esp_http_client_config_t config = {};
  config.url           = url;
  config.event_handler = http_event_handler;
  config.cert_pem      = Starfield_Root_G2;
  config.timeout_ms    = 8000;
  config.method        = HTTP_METHOD_POST;

  esp_http_client_handle_t client = esp_http_client_init(&config);
  if (!client) {
    Serial.println("[HTTP] Init failed");
    return;
  }

  esp_http_client_set_header(client, "Content-Type", "application/json");
  esp_http_client_set_post_field(client, json.c_str(), json.length());

  Serial.printf("[HTTP] POST %s (%d bytes)\n", url, json.length());

  esp_err_t err = esp_http_client_perform(client);
  if (err == ESP_OK) {
    int code = esp_http_client_get_status_code(client);
    Serial.printf("[HTTP] %d | %s\n", code, httpResponseBuffer.c_str());
    if (code == 200 || code == 201) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
    }
  } else {
    Serial.printf("[HTTP] Error: %s\n", esp_err_to_name(err));
    consecutiveFailures++;
  }

  esp_http_client_cleanup(client);

  if (consecutiveFailures >= MAX_FAILURES) {
    Serial.println("[HTTP] Too many failures -> WiFi reset");
    disconnectWiFi();
    consecutiveFailures = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MICROPHONE
// ═══════════════════════════════════════════════════════════════════════════

float readMicrophone() {
  int readings[10];
  int consistent = 0;

  for (int i = 0; i < 10; i++) {
    readings[i] = analogRead(MIC_PIN);
    delay(1);
  }
  for (int i = 1; i < 10; i++) {
    if (abs(readings[i] - readings[i - 1]) < 50) consistent++;
  }

  if (consistent < 7) return -1.0f;

  int total = 0;
  for (int i = 0; i < 5; i++) {
    total += analogRead(MIC_PIN);
    delay(1);
  }
  int avg = total / 5;
  if (avg < 100) avg = 0;
  return (avg / 4095.0f) * 100.0f;
}

// ═══════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

float calculateAQI(float pm25, float pm10) {
  float aqi25 = (pm25 / 35.0f) * 100.0f;
  float aqi10 = (pm10 / 150.0f) * 100.0f;
  return max(aqi25, aqi10);
}

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(LED_PIN, LOW);
    delay(delayMs);
  }
}

bool isResetHeld() {
  if (digitalRead(RESET_BUTTON_PIN) == LOW) {
    unsigned long start = millis();
    while (digitalRead(RESET_BUTTON_PIN) == LOW) {
      if (millis() - start > 3000) return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CREDENTIALS (NVS — same namespace as v2 for compatibility)
// ═══════════════════════════════════════════════════════════════════════════

void loadCredentials() {
  // Load org from NVS (set during BLE provisioning in v2)
  prefs.begin("wifi", true);
  String nvsOrg = prefs.getString("org", "");
  prefs.end();

  // If org was provisioned via BLE (v2), use it
  if (nvsOrg.length() > 0 && org.length() == 0) {
    org = nvsOrg;
  }

  // WiFi creds are hardcoded at the top of the file — no NVS override
  wifiConfigured = (ssid.length() > 0 && password.length() > 0);
  Serial.println("[Config] SSID: " + ssid + " | Org: " + org);
}

void saveCredentials(const String &s, const String &p, const String &o) {
  prefs.begin("wifi", false);
  prefs.putString("ssid", s);
  prefs.putString("pass", p);
  prefs.putString("org", o);
  prefs.end();
  ssid = s;
  password = p;
  org = o;
  wifiConfigured = true;
}

void factoryReset() {
  Serial.println("[RESET] Factory reset...");
  prefs.begin("wifi", false);
  prefs.clear();
  prefs.end();
  baseline_valid = false;
  delay(200);
  ESP.restart();
}
