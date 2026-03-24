/*
 * ESP32-C6 Vape Detection Sensor — LOCAL DEMO BUILD
 *
 * Board: Adafruit Feather ESP32-C6 (with Stemma QT)
 *   I2C power pin: GPIO20 (must be HIGH to power Stemma QT sensors)
 *   Default I2C:   SDA=19, SCL=18
 *
 * Sensors:
 *   BME680  — temperature, humidity, pressure, gas resistance  (I2C 0x77/0x76)
 *   MSA311  — 3-axis accelerometer for tamper detection         (I2C 0x62)
 *   BMV080  — particulate matter sensor                         (I2C 0x57, disabled)
 *
 * Libraries required (Arduino Library Manager):
 *   Adafruit BME680, Adafruit Unified Sensor, Adafruit MSA301, ArduinoJson
 */

#include <WiFi.h>
#include <esp_wifi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include <Adafruit_MSA301.h>
#include <esp_task_wdt.h>

// ─────────────────────────────────────────────────────────────────────────────
//  ★  EDIT THESE THREE LINES BEFORE FLASHING  ★
// ─────────────────────────────────────────────────────────────────────────────
const char* WIFI_SSID     = "funnyguy";
const char* WIFI_PASSWORD = "rahul2008";
const char* BACKEND_HOST  = "172.20.10.10";
// ─────────────────────────────────────────────────────────────────────────────

// Derived URLs
String DATA_ENDPOINT;
String TAMPER_ENDPOINT;

// Stemma QT / I2C power — Adafruit Feather ESP32-C6 requires GPIO20 HIGH
#define I2C_POWER_PIN  20

// LED
#define LED_PIN  15   // Adafruit Feather ESP32-C6 built-in LED

// PMS5003 UART (optional)
#define PMS_RX  4
#define PMS_TX  5

// Microphone ADC (optional)
#define MIC_PIN  0

// Device identity
const String DEVICE_ID = "ESP32_C6_001";
const String LOCATION  = "Example Location";
const String ORG_ID    = "admin";

// Timing
const unsigned long SENSOR_INTERVAL  = 5000;
const unsigned long TAMPER_COOLDOWN  = 3000;
const unsigned long HTTP_TIMEOUT_MS  = 5000;

// Sensor objects
Adafruit_BME680 bme;
Adafruit_MSA311 msa;
HardwareSerial  pmsSerial(1);

// State
bool bme680Available = false;
bool msa311Available = false;
bool wifiConnected   = false;

unsigned long lastSensorRead = 0;
unsigned long lastTamperSent = 0;

// Tamper detection
float prevAccelMag = 0;
const float TAMPER_THRESHOLD = 2.0;  // g delta

// PMS5003 frame
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

// Forward declarations
void connectToWiFi();
void readAndSendSensorData();
void checkAndSendTamper();
bool readPMSdata(Stream* s);
void blinkLED(int times, int delayMs);

// =============================================================================
void setup() {
  esp_task_wdt_deinit();
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== ESP32-C6 LOCAL DEMO SENSOR ===");
  Serial.println("Device: " + DEVICE_ID);

  DATA_ENDPOINT   = String("http://") + BACKEND_HOST + ":8000/api/sensors/data";
  TAMPER_ENDPOINT = String("http://") + BACKEND_HOST + ":8000/api/sensors/tamper";
  Serial.println("Backend: " + DATA_ENDPOINT);

  pinMode(LED_PIN, OUTPUT);

  // ── POWER ON Stemma QT sensors ───────────────────────────────────────────
  // GPIO20 controls 3.3V to the Stemma QT connector on Adafruit Feather C6.
  // Without this, sensors get NO power and I2C scan finds nothing.
  pinMode(I2C_POWER_PIN, OUTPUT);
  digitalWrite(I2C_POWER_PIN, HIGH);
  Serial.println("Stemma QT power ON (GPIO20 HIGH)");
  delay(500);  // give sensors time to boot up after power-on

  // ── I2C init ─────────────────────────────────────────────────────────────
  // Use board defaults: SDA=19, SCL=18 on Adafruit Feather ESP32-C6
  Wire.begin();
  Wire.setClock(100000);
  delay(250);

  // Scan I2C bus
  Serial.println("Scanning I2C bus...");
  int found = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  Found device at 0x%02X\n", addr);
      found++;
    }
    delay(2);
  }
  Serial.printf("  -> %d device(s) found\n", found);

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

    // Seed so first reading doesn't false-trigger
    sensors_event_t accel;
    msa.getEvent(&accel);
    prevAccelMag = sqrt(
      accel.acceleration.x * accel.acceleration.x +
      accel.acceleration.y * accel.acceleration.y +
      accel.acceleration.z * accel.acceleration.z
    );
  } else {
    Serial.println("MSA311 not found — tamper detection disabled");
  }

  // ── PMS5003 ──────────────────────────────────────────────────────────────
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
    if (msa311Available) checkAndSendTamper();

    if (millis() - lastSensorRead >= SENSOR_INTERVAL) {
      readAndSendSensorData();
      lastSensorRead = millis();
    }
  }

  delay(50);
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
    unsigned long now = millis();
    if (now - lastTamperSent < TAMPER_COOLDOWN) return;
    lastTamperSent = now;

    Serial.printf("TAMPER! delta=%.2f  x=%.2f y=%.2f z=%.2f\n", delta, ax, ay, az);

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

  float temperature = 0, humidity = 0, pressure = 0, gasResistance = 0;
  if (bme680Available && bme.performReading()) {
    temperature   = bme.temperature;
    humidity      = bme.humidity;
    pressure      = bme.pressure / 100.0;
    gasResistance = bme.gas_resistance / 1000.0;
  }

  float pm1 = 0, pm25 = 0, pm10 = 0;
  if (readPMSdata(&pmsSerial)) {
    pm1  = pmsData.pm10_env;
    pm25 = pmsData.pm25_env;
    pm10 = pmsData.pm100_env;
  }

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

  doc["temp_humidity_ratio"] = (humidity > 0) ? temperature / humidity : 0;
  doc["gas_temp_interaction"] = gasResistance * temperature;
  doc["pm_ratio"]   = (pm10 > 0) ? pm25 / pm10 : 0;
  float aqi25 = (pm25 / 35.0) * 100.0;
  float aqi10 = (pm10 / 150.0) * 100.0;
  doc["air_quality_index"] = max(aqi25, aqi10);

  String payload;
  serializeJson(doc, payload);
  Serial.println("Payload: " + payload);

  HTTPClient http;
  http.begin(DATA_ENDPOINT);
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
//  WiFi
// =============================================================================
void connectToWiFi() {
  Serial.println("Connecting to: " + String(WIFI_SSID));
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  delay(1000);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  delay(500);

  esp_wifi_set_protocol(WIFI_IF_STA, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N);

  Serial.println("Scanning...");
  int n = WiFi.scanNetworks();
  bool found = false;
  for (int i = 0; i < n; i++) {
    Serial.printf("  [%d] %s (%d dBm)\n", i, WiFi.SSID(i).c_str(), WiFi.RSSI(i));
    if (WiFi.SSID(i) == String(WIFI_SSID)) found = true;
  }
  WiFi.scanDelete();

  if (!found) {
    Serial.println("Network '" + String(WIFI_SSID) + "' not found!");
    wifiConnected = false;
    return;
  }

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 5) {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
      delay(500);
      Serial.print(".");
    }
    if (WiFi.status() != WL_CONNECTED) {
      attempts++;
      Serial.printf("\n  Attempt %d/5 failed. ", attempts);
      if (attempts < 5) {
        Serial.println("Retrying...");
        WiFi.disconnect(true);
        delay(3000);
      }
    }
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("WiFi OK — IP: " + WiFi.localIP().toString());
    WiFi.setAutoReconnect(true);
  } else {
    wifiConnected = false;
    Serial.println("WiFi FAILED");
  }
}

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(delayMs);
    digitalWrite(LED_PIN, LOW);  delay(delayMs);
  }
}

boolean readPMSdata(Stream* s) {
  while (s->available() > 32) s->read();

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
