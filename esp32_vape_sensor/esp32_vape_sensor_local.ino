/*
 * ESP32-C6 Vape Detection Sensor — LOCAL DEMO BUILD
 *
 * Used for offline convention demos.  Points to a laptop running the backend
 * on a local WiFi network.  Uses plain HTTP (no TLS) so no certificates needed.
 *
 * Sensors supported:
 *   BME680  — temperature, humidity, pressure, gas resistance  (I2C)
 *   MSA311  — 3-axis accelerometer for tamper detection         (I2C)
 *   BMV080  — particulate matter sensor                         (I2C, best-effort)
 *   PMS5003 — laser particle sensor                             (UART, optional)
 *   MAX4466 — microphone                                        (ADC, optional)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  BEFORE FLASHING — update the three constants below:
 *    WIFI_SSID       WiFi network at the convention
 *    WIFI_PASSWORD   WiFi password
 *    BACKEND_HOST    Your laptop's IP on that network  (run `ipconfig` / `ifconfig`)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Libraries required (install via Arduino Library Manager):
 *   Adafruit BME680                  — BME680 sensor
 *   Adafruit Unified Sensor
 *   Adafruit MSA301                  — MSA311 accelerometer (MSA301 lib is fully compatible)
 *   SparkFun BMV080 Arduino Library  — BMV080 particulate matter sensor (I2C 0x57)
 *   ArduinoJson                      — JSON serialisation
 */

#include <WiFi.h>
#include <HTTPClient.h>          // plain HTTP — no SSL needed for local
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include <Adafruit_MSA301.h>
// #include <SparkFun_BMV080_Arduino_Library.h>  // requires Bosch SDK — disabled for demo

// ─────────────────────────────────────────────────────────────────────────────
//  ★  EDIT THESE THREE LINES BEFORE FLASHING  ★
// ─────────────────────────────────────────────────────────────────────────────
const char* WIFI_SSID     = "Rahul's Iphone 8 Plus";
const char* WIFI_PASSWORD = "rahul2008";
const char* BACKEND_HOST  = "172.20.10.9";   // laptop IP on hotspot
// ─────────────────────────────────────────────────────────────────────────────

// Derived URLs  (leave these alone)
String DATA_ENDPOINT;
String TAMPER_ENDPOINT;

// Pin definitions for ESP32-C6 DevKitC-1
#define I2C_SDA    6
#define I2C_SCL    7
#define PMS_RX     4
#define PMS_TX     5
#define MIC_PIN    0
#define LED_PIN    8

// Device identity
const String DEVICE_ID = "ESP32_C6_001";
const String LOCATION  = "Example Location";   // shown on dashboard
const String ORG_ID    = "admin";

// Timing
const unsigned long SENSOR_INTERVAL  = 5000;   // ms between sensor POST
const unsigned long TAMPER_COOLDOWN  = 3000;   // ms between tamper alerts
const unsigned long HTTP_TIMEOUT_MS  = 5000;

// ─── Sensor objects ────────────────────────────────────────────────────────────
Adafruit_BME680 bme;
Adafruit_MSA301 msa;
// SparkFunBMV080  bmv;  // disabled — Bosch SDK not present
HardwareSerial  pmsSerial(1);

// ─── State ────────────────────────────────────────────────────────────────────
bool bme680Available  = false;
bool msa311Available  = false;
bool bmv080Available  = false;   // set true if BMV080 found on I2C
bool wifiConnected    = false;

unsigned long lastSensorRead  = 0;
unsigned long lastTamperSent  = 0;

// MSA311 tamper detection — track previous acceleration magnitude
float prevAccelMag = 0;
const float TAMPER_THRESHOLD = 2.0;  // g — delta magnitude that counts as tamper

// PMS5003 frame struct
struct pms5003data {
  uint16_t framelen;
  uint16_t pm10_standard, pm25_standard, pm100_standard;
  uint16_t pm10_env, pm25_env, pm100_env;
  uint16_t particles_03um, particles_05um, particles_10um,
           particles_25um, particles_50um, particles_100um;
  uint16_t unused;
  uint16_t checksum;
};
struct pms5003data pmsData;

// ─── Forward declarations ──────────────────────────────────────────────────────
void connectToWiFi();
void readAndSendSensorData();
void checkAndSendTamper();
bool readPMSdata(Stream* s);
void blinkLED(int times, int delayMs);

// =============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== ESP32-C6 LOCAL DEMO SENSOR ===");
  Serial.println("Device: " + DEVICE_ID);

  DATA_ENDPOINT   = String("http://") + BACKEND_HOST + ":8000/api/sensors/data";
  TAMPER_ENDPOINT = String("http://") + BACKEND_HOST + ":8000/api/sensors/tamper";

  Serial.println("Backend: " + DATA_ENDPOINT);

  pinMode(LED_PIN, OUTPUT);
  Wire.begin(I2C_SDA, I2C_SCL);

  // ── Scan I2C bus ────────────────────────────────────────────────────────────
  Serial.println("Scanning I2C...");
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  I2C device at 0x%02X\n", addr);
    }
    delay(1);
  }

  // ── BME680 ──────────────────────────────────────────────────────────────────
  if (bme.begin(0x77) || bme.begin(0x76)) {
    bme680Available = true;
    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
    bme.setGasHeater(320, 150);
    Serial.println("BME680 OK");
  } else {
    Serial.println("BME680 NOT FOUND — using fallback values");
  }

  // ── MSA311 (Adafruit_MSA301 lib covers MSA311 — same register map) ──────────
  if (msa.begin()) {
    msa311Available = true;
    msa.setDataRate(MSA301_DATARATE_500_HZ);
    msa.setRange(MSA301_RANGE_4_G);
    Serial.println("MSA311 OK");

    // Seed initial magnitude so first reading doesn't false-trigger
    sensors_event_t accel;
    msa.getEvent(&accel);
    prevAccelMag = sqrt(
      accel.acceleration.x * accel.acceleration.x +
      accel.acceleration.y * accel.acceleration.y +
      accel.acceleration.z * accel.acceleration.z
    );
  } else {
    Serial.println("MSA311 NOT FOUND — tamper detection disabled");
  }

  // BMV080 disabled — requires Bosch SDK not present on this machine
  bmv080Available = false;
  Serial.println("BMV080 disabled — using PMS5003 / zero fallback");

  // ── PMS5003 ─────────────────────────────────────────────────────────────────
  pmsSerial.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);
  Serial.println("PMS5003 UART ready");

  blinkLED(3, 200);
  Serial.println("Setup complete — connecting WiFi...");
  connectToWiFi();
}

// =============================================================================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    digitalWrite(LED_PIN, LOW);
    connectToWiFi();
  } else {
    wifiConnected = true;
    digitalWrite(LED_PIN, HIGH);
  }

  if (wifiConnected) {
    // Check MSA311 tamper on every loop tick for responsiveness
    if (msa311Available) checkAndSendTamper();

    // Send full sensor payload at the normal interval
    if (millis() - lastSensorRead >= SENSOR_INTERVAL) {
      readAndSendSensorData();
      lastSensorRead = millis();
    }
  }

  delay(50);
}

// =============================================================================
//  Tamper detection — POST to /api/sensors/tamper if device is moved sharply
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
    unsigned long now = millis();
    if (now - lastTamperSent < TAMPER_COOLDOWN) return;  // debounce
    lastTamperSent = now;

    Serial.printf("TAMPER detected! delta=%.2f  x=%.2f y=%.2f z=%.2f\n", delta, ax, ay, az);

    DynamicJsonDocument doc(256);
    doc["device_id"] = DEVICE_ID;
    doc["org_id"]    = ORG_ID;
    doc["accel_x"]   = ax;
    doc["accel_y"]   = ay;
    doc["accel_z"]   = az;

    String payload;
    serializeJson(doc, payload);

    HTTPClient http;
    http.begin(TAMPER_ENDPOINT);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(HTTP_TIMEOUT_MS);
    int code = http.POST(payload);
    Serial.printf("Tamper POST → %d\n", code);
    http.end();

    // Visual feedback
    blinkLED(5, 80);
  }
}

// =============================================================================
//  Main sensor read + POST
// =============================================================================
void readAndSendSensorData() {
  Serial.println("\n--- Reading sensors ---");

  // ── BME680 ──────────────────────────────────────────────────────────────────
  float temperature = 0, humidity = 0, pressure = 0, gasResistance = 0;
  if (bme680Available && bme.performReading()) {
    temperature   = bme.temperature;
    humidity      = bme.humidity;
    pressure      = bme.pressure / 100.0;
    gasResistance = bme.gas_resistance / 1000.0;
  }

  // ── PM readings: BMV080 → PMS5003 → zero ────────────────────────────────────
  float pm1 = 0, pm25 = 0, pm10 = 0;
  if (readPMSdata(&pmsSerial)) {
    pm1  = pmsData.pm10_env;
    pm25 = pmsData.pm25_env;
    pm10 = pmsData.pm100_env;
  }

  // ── Microphone ───────────────────────────────────────────────────────────────
  float soundLevel = 0;
  int readings[10];
  int consistent = 0;
  for (int i = 0; i < 10; i++) { readings[i] = analogRead(MIC_PIN); delay(1); }
  for (int i = 1; i < 10; i++) { if (abs(readings[i] - readings[i-1]) < 50) consistent++; }
  bool micConnected = (consistent >= 7);
  if (micConnected) {
    int total = 0;
    for (int i = 0; i < 5; i++) { total += analogRead(MIC_PIN); delay(1); }
    int raw = total / 5;
    if (raw < 100) raw = 0;
    soundLevel = (raw / 4095.0) * 100.0;
  }

  // ── Build JSON ───────────────────────────────────────────────────────────────
  DynamicJsonDocument doc(1024);
  doc["device_id"]    = DEVICE_ID;
  doc["location"]     = LOCATION;
  doc["org_id"]       = ORG_ID;
  doc["temperature"]  = temperature;
  doc["humidity"]     = humidity;
  doc["pressure"]     = pressure;
  doc["gas_resistance"] = gasResistance;
  doc["pm1"]          = pm1;
  doc["pm25"]         = pm25;
  doc["pm10"]         = pm10;
  doc["sound_level"]  = soundLevel;
  doc["mic_available"] = micConnected;
  doc["wifi_rssi"]    = WiFi.RSSI();
  doc["sensor_type"]  = "multi_sensor";

  // Derived features for ML model
  doc["temp_humidity_ratio"] = (humidity > 0) ? temperature / humidity : 0;
  doc["gas_temp_interaction"] = gasResistance * temperature;
  doc["pm_ratio"]   = (pm10 > 0) ? pm25 / pm10 : 0;
  float aqi25 = (pm25 / 35.0) * 100.0;
  float aqi10 = (pm10 / 150.0) * 100.0;
  doc["air_quality_index"] = max(aqi25, aqi10);

  String payload;
  serializeJson(doc, payload);
  Serial.println("Payload: " + payload);

  // ── POST ─────────────────────────────────────────────────────────────────────
  HTTPClient http;
  http.begin(DATA_ENDPOINT);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(HTTP_TIMEOUT_MS);
  int code = http.POST(payload);

  if (code == 200 || code == 201) {
    Serial.println("✓ Data sent (" + String(code) + ")");
    String resp = http.getString();

    // Echo prediction back to serial
    DynamicJsonDocument respDoc(512);
    if (!deserializeJson(respDoc, resp) && respDoc.containsKey("prediction")) {
      String cls  = respDoc["prediction"]["predicted_class"].as<String>();
      float  conf = respDoc["prediction"]["confidence"];
      Serial.printf("  Prediction: %s (%.1f%%)\n", cls.c_str(), conf);
    }
  } else {
    Serial.println("✗ HTTP error: " + String(code));
  }
  http.end();
}

// =============================================================================
//  WiFi / utilities
// =============================================================================
void connectToWiFi() {
  Serial.println("Connecting to: " + String(WIFI_SSID));
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  delay(2000);
  WiFi.mode(WIFI_STA);
  delay(500);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("WiFi OK — IP: " + WiFi.localIP().toString());
    WiFi.setAutoReconnect(true);
  } else {
    wifiConnected = false;
    Serial.println("WiFi FAILED — will retry in loop");
  }
}

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(delayMs);
    digitalWrite(LED_PIN, LOW);  delay(delayMs);
  }
}

boolean readPMSdata(Stream* s) {
  while (s->available() > 32) s->read();   // flush stale data

  unsigned long timeout = millis() + 2000;
  while (!s->available() && millis() < timeout) delay(10);
  if (!s->available()) return false;

  while (s->available()) {
    if (s->read() == 0x42) {
      if (s->available() && s->read() == 0x4d) break;
    }
    if (millis() > timeout) return false;
  }

  timeout = millis() + 1000;
  while (s->available() < 30 && millis() < timeout) delay(10);
  if (s->available() < 30) return false;

  uint8_t buffer[32];
  buffer[0] = 0x42; buffer[1] = 0x4d;
  s->readBytes(&buffer[2], 30);

  uint16_t sum = 0;
  for (uint8_t i = 0; i < 30; i++) sum += buffer[i];

  uint16_t buf16[15];
  for (uint8_t i = 0; i < 15; i++) {
    buf16[i] = buffer[2 + i * 2 + 1];
    buf16[i] += (buffer[2 + i * 2] << 8);
  }
  memcpy((void*)&pmsData, (void*)buf16, 30);

  if (sum != pmsData.checksum) {
    Serial.println("PMS checksum fail");
    return false;
  }
  return true;
}
