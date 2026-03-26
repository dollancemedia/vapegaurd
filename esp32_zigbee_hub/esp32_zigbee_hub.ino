/*
 * Mistio Zigbee Hub — ESP32-C6-DevKitC-1
 *
 * Zigbee Coordinator + WiFi Gateway
 * Receives sensor reports from Zigbee End Devices (vape sensors)
 * and forwards them to the backend via HTTPS POST.
 *
 * Board: ESP32-C6 Dev Module
 *   Tools -> Zigbee mode: Zigbee ZCZR (coordinator/router)
 *   Tools -> Partition Scheme: Zigbee ZCZR 4MB with spiffs
 *   Tools -> USB CDC On Boot: Enabled
 *
 * Receives:
 *   - Temperature + Humidity via ZigbeeThermostat (EP 10)
 *   - PM2.5 via zbAttributeRead on cluster 0x042A (EP 10)
 *
 * NeoPixel (GPIO8 on DevKitC-1):
 *   Green = healthy, Yellow = no sensors, Red = WiFi down, Blue = Zigbee forming
 */

#ifndef ZIGBEE_MODE_ZCZR
#error "Zigbee coordinator mode is not selected in Tools->Zigbee mode"
#endif

#include "Zigbee.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
// ArduinoJson removed — building JSON manually to save flash
// WiFi credentials hardcoded (hub is wall-powered, no portal needed)
#include "time.h"
#include "esp_sntp.h"
#include <map>
#include "esp_coexist.h"
#include "esp_wifi.h"

// ─── Configuration ──────────────────────────────────────────────────────────
const char* BACKEND_HOST = "vapegaurd-production.up.railway.app";
const bool  USE_HTTPS    = true;
const String HUB_DEVICE_ID = "ZIGBEE_HUB_001";
const String HUB_ORG_ID    = "irvington";
const char* AP_NAME = "MistioHub-001";

// NTP
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.nist.gov";

// ─── Zigbee Config — matches sensor endpoints ──────────────────────────────
#define EP_TEMP_HUM   10  // temperature + humidity (real)
#define EP_PM_GAS     11  // PM2.5 (as temp) + gas_resistance kOhm (as humidity)

// ─── Hardware (DevKitC-1) ───────────────────────────────────────────────────
#define RGB_LED_PIN 8

// TLS cert removed — using setInsecure() for faster handshake

// ─── Per-sensor data accumulator ────────────────────────────────────────────
struct SensorReading {
  float temperature = 0;
  float humidity = 0;
  float pm25 = 0;
  float gas_resistance = 0;  // in kOhm
  unsigned long lastUpdateMs = 0;
  uint16_t shortAddr = 0;
  String deviceId;
  uint8_t fieldsReceived = 0;  // bitmask: bit0=tempHum, bit1=pm, bit2=gas, bit3=pm1
};

// Map from short_addr to sensor reading
std::map<uint16_t, SensorReading> sensorReadings;

// ─── State ──────────────────────────────────────────────────────────────────
bool wifiConnected = false;
bool zigbeeFormed = false;
bool timeSynced = false;
unsigned long lastHubHeartbeat = 0;
String DATA_URL;

// ─── Zigbee Thermostats — one per sensor endpoint ──────────────────────────
ZigbeeThermostat zbRecvTempHum = ZigbeeThermostat(EP_TEMP_HUM);
ZigbeeThermostat zbRecvPMGas   = ZigbeeThermostat(EP_PM_GAS);

// ─── Forward declarations ───────────────────────────────────────────────────
void onTempHumTemp(float val, uint8_t src_ep, esp_zb_zcl_addr_t src_addr);
void onTempHumHum(float val, uint8_t src_ep, esp_zb_zcl_addr_t src_addr);
void onPMGasTemp(float val, uint8_t src_ep, esp_zb_zcl_addr_t src_addr);
void onPMGasHum(float val, uint8_t src_ep, esp_zb_zcl_addr_t src_addr);
String getISOTimestamp();
bool postSensorReading(SensorReading& r);
String shortAddrToDeviceId(uint16_t addr);
void connectWiFi();
void timeavailable(struct timeval *t);
void setRGBLed(uint8_t r, uint8_t g, uint8_t b);

// ─── RGB LED helpers (DevKitC-1 uses rgbLedWrite) ───────────────────────────
void setRGBLed(uint8_t r, uint8_t g, uint8_t b) {
#ifdef RGB_BUILTIN
  rgbLedWrite(RGB_BUILTIN, r, g, b);
#endif
}

// ─── Callbacks — one pair per endpoint ───────────────────────────────────────
// Helper to get/init a SensorReading by Zigbee short address
SensorReading& getReading(uint16_t addr) {
  SensorReading& r = sensorReadings[addr];
  r.shortAddr = addr;
  r.lastUpdateMs = millis();
  if (r.deviceId.isEmpty()) r.deviceId = shortAddrToDeviceId(addr);
  return r;
}

// EP 10: real temperature + humidity
void onTempHumTemp(float val, uint8_t src_ep, esp_zb_zcl_addr_t src_addr) {
  SensorReading& r = getReading(src_addr.u.short_addr);
  r.temperature = val;
  r.fieldsReceived |= 0x01;
  Serial.printf("[ZB] 0x%04X temp=%.2f\n", src_addr.u.short_addr, val);
}
void onTempHumHum(float val, uint8_t src_ep, esp_zb_zcl_addr_t src_addr) {
  SensorReading& r = getReading(src_addr.u.short_addr);
  r.humidity = val;
  r.fieldsReceived |= 0x01;
}

// EP 11: PM2.5 (as temp) + gas_resistance kOhm (as humidity)
void onPMGasTemp(float val, uint8_t src_ep, esp_zb_zcl_addr_t src_addr) {
  SensorReading& r = getReading(src_addr.u.short_addr);
  r.pm25 = val;
  r.fieldsReceived |= 0x02;
  Serial.printf("[ZB] 0x%04X pm25=%.2f\n", src_addr.u.short_addr, val);
}
void onPMGasHum(float val, uint8_t src_ep, esp_zb_zcl_addr_t src_addr) {
  SensorReading& r = getReading(src_addr.u.short_addr);
  r.gas_resistance = val;  // kOhm
  r.fieldsReceived |= 0x02;
  Serial.printf("[ZB] 0x%04X gas=%.2fk\n", src_addr.u.short_addr, val);
}

// ─── Utility ────────────────────────────────────────────────────────────────
String shortAddrToDeviceId(uint16_t addr) {
  char buf[20];
  snprintf(buf, sizeof(buf), "ZB_SENSOR_%04X", addr);
  return String(buf);
}

String getISOTimestamp() {
  if (timeSynced) {
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

String buildUrl(const char* path) {
  return String(USE_HTTPS ? "https://" : "http://") + BACKEND_HOST + String(path);
}

void timeavailable(struct timeval *t) {
  timeSynced = true;
  Serial.println("NTP time synced!");
}

// =============================================================================
//  SETUP
// =============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Mistio Zigbee Hub ===");
  Serial.println("Hub ID: " + HUB_DEVICE_ID);

  DATA_URL = buildUrl("/api/sensors/data");

  // RGB LED: blue = starting
  setRGBLed(0, 0, 30);

  // ── Enable WiFi + 802.15.4 (Zigbee) radio coexistence ──────────
  esp_coex_wifi_i154_enable();

  // ── WiFi FIRST (establish before Zigbee takes the radio) ──────────
  connectWiFi();

  // ── NTP ───────────────────────────────────────────────────────────────
  if (wifiConnected) {
    sntp_set_time_sync_notification_cb(timeavailable);
    configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);
    Serial.println("NTP sync started");
  }

  // ── Zigbee Coordinator ────────────────────────────────────────────────
  Serial.println("Starting Zigbee Coordinator...");

  // EP 10: temp + humidity
  zbRecvTempHum.setManufacturerAndModel("Mistio", "VapeHub");
  zbRecvTempHum.allowMultipleBinding(true);
  zbRecvTempHum.onTempReceiveWithSource(onTempHumTemp);
  zbRecvTempHum.onHumidityReceiveWithSource(onTempHumHum);
  Zigbee.addEndpoint(&zbRecvTempHum);

  // EP 11: PM2.5 + gas_resistance
  zbRecvPMGas.setManufacturerAndModel("Mistio", "VapeHub");
  zbRecvPMGas.allowMultipleBinding(true);
  zbRecvPMGas.onTempReceiveWithSource(onPMGasTemp);
  zbRecvPMGas.onHumidityReceiveWithSource(onPMGasHum);
  Zigbee.addEndpoint(&zbRecvPMGas);
  Zigbee.setRebootOpenNetwork(255);  // keep network open as long as possible on boot
  Zigbee.setPrimaryChannelMask(1 << 15);  // Fixed channel 15 — avoids WiFi interference

  if (!Zigbee.begin(ZIGBEE_COORDINATOR)) {
    Serial.println("Zigbee FAILED to start! Rebooting...");
    setRGBLed(255, 0, 0);
    delay(3000);
    ESP.restart();
  }

  zigbeeFormed = true;
  Serial.println("Zigbee Coordinator started — network always open");

  if (wifiConnected) {
    setRGBLed(0, 255, 0); // green = WiFi + Zigbee OK
  } else {
    setRGBLed(255, 255, 0); // yellow = Zigbee OK but no WiFi
  }
  Serial.println("Hub ready. Waiting for sensors to join...");
}

// =============================================================================
//  MAIN LOOP
// =============================================================================
void loop() {
  unsigned long now = millis();

  // ── Check WiFi (auto-reconnect) ─────────────────────────────────────
  static unsigned long lastReconnect = 0;
  static bool reconnecting = false;
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiConnected) {
      Serial.println("WiFi lost!");
      wifiConnected = false;
      reconnecting = false;
      setRGBLed(255, 0, 0);
    }
    // Only start a new connection attempt if not already connecting
    if (!reconnecting && (now - lastReconnect > 15000)) {
      lastReconnect = now;
      reconnecting = true;
      Serial.println("WiFi reconnecting...");
      esp_coex_preference_set(ESP_COEX_PREFER_WIFI);
      WiFi.disconnect(true);
      delay(100);
      WiFi.mode(WIFI_STA);
      esp_wifi_set_ps(WIFI_PS_NONE);
      WiFi.begin("sweethome", "rahul2008");
    }
    // Check if reconnect attempt timed out (10s)
    if (reconnecting && (now - lastReconnect > 10000)) {
      reconnecting = false;
    }
  } else {
    if (!wifiConnected || reconnecting) {
      wifiConnected = true;
      reconnecting = false;
      esp_coex_preference_set(ESP_COEX_PREFER_BALANCE);
      Serial.println("WiFi OK: " + WiFi.localIP().toString());
      setRGBLed(0, 255, 0);
    }
  }

  // ── Process accumulated sensor readings ───────────────────────────────
  for (auto& [addr, reading] : sensorReadings) {
    if (reading.fieldsReceived == 0) continue;

    // Wait 500ms after last update for all endpoints to arrive
    bool timeout = (now - reading.lastUpdateMs) > 500;

    if (timeout) {
      if (wifiConnected) {
        postSensorReading(reading);
      }
      reading.fieldsReceived = 0;
    }
  }

  // ── Hub heartbeat every 60s ───────────────────────────────────────────
  if (now - lastHubHeartbeat > 60000) {
    lastHubHeartbeat = now;
    Serial.printf("Hub heartbeat: %d sensors, WiFi=%s\n",
      sensorReadings.size(), wifiConnected ? "OK" : "DOWN");

    // Re-open Zigbee network so sensors can always join/rejoin
    Zigbee.openNetwork(255);

    // NeoPixel status
    if (!wifiConnected) {
      setRGBLed(255, 0, 0); // red = WiFi down
    } else if (sensorReadings.empty()) {
      setRGBLed(255, 255, 0); // yellow = no sensors
    } else {
      setRGBLed(0, 255, 0); // green = healthy
    }
  }

  delay(50); // small delay to avoid busy-waiting
}

// =============================================================================
//  WiFi Connection
// =============================================================================
void connectWiFi() {
  Serial.println("Connecting WiFi...");

  // Prioritize WiFi on the shared 2.4GHz radio during connection
  esp_coex_preference_set(ESP_COEX_PREFER_WIFI);

  WiFi.mode(WIFI_STA);
  // Disable WiFi power save — keeps radio active, prevents Zigbee from starving WiFi
  esp_wifi_set_ps(WIFI_PS_NONE);
  WiFi.begin("sweethome", "rahul2008");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 80) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.printf("WiFi OK: %s (RSSI: %d)\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    setRGBLed(0, 128, 0);
    // Switch to balanced coexistence now that WiFi is established
    esp_coex_preference_set(ESP_COEX_PREFER_BALANCE);
  } else {
    Serial.printf("WiFi FAILED (status=%d) — will retry in loop\n", WiFi.status());
    setRGBLed(255, 0, 0);
  }
}

// =============================================================================
//  POST sensor reading to backend
// =============================================================================
bool postSensorReading(SensorReading& r) {
  String ts = getISOTimestamp();
  float gasRaw = r.gas_resistance * 1000.0;  // backend expects Ohms, sensor sends kOhm
  float thr = (r.humidity > 0) ? r.temperature / r.humidity : 0;
  float gasTemp = gasRaw * r.temperature;
  float aqi25 = (r.pm25 / 35.0) * 100.0;

  String payload = "{";
  payload += "\"device_id\":\"" + r.deviceId + "\",";
  payload += "\"org_id\":\"" + HUB_ORG_ID + "\",";
  payload += "\"location\":\"Zigbee Sensor\",";
  payload += "\"temperature\":" + String(r.temperature, 2) + ",";
  payload += "\"humidity\":" + String(r.humidity, 2) + ",";
  payload += "\"pm25\":" + String(r.pm25, 2) + ",";
  payload += "\"pm10\":0,\"pm1\":0,";
  payload += "\"gas_resistance\":" + String(gasRaw, 2) + ",";
  payload += "\"pressure\":0,\"sound_level\":0,";
  payload += "\"sensor_type\":\"zigbee_mesh\",";
  payload += "\"timestamp\":\"" + ts + "\",";
  payload += "\"hub_id\":\"" + HUB_DEVICE_ID + "\",";
  payload += "\"duty_state\":\"deep_sense\",";
  payload += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
  payload += "\"temp_humidity_ratio\":" + String(thr, 4) + ",";
  payload += "\"gas_temp_interaction\":" + String(gasTemp, 2) + ",";
  payload += "\"pm_ratio\":0,";
  payload += "\"air_quality_index\":" + String(aqi25, 2);
  payload += "}";

  Serial.printf("[POST] %s: T=%.1f H=%.1f PM25=%.1f Gas=%.0f\n",
    r.deviceId.c_str(), r.temperature, r.humidity, r.pm25, gasRaw);

  WiFiClientSecure secClient;
  secClient.setInsecure();  // Skip cert verification (faster TLS handshake)

  HTTPClient http;
  http.begin(secClient, DATA_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(15000);
  int code = http.POST(payload);

  bool ok = (code == 200 || code == 201);
  if (ok) {
    Serial.printf("[POST] %s -> %d OK\n", r.deviceId.c_str(), code);
    // Brief cyan flash on successful POST
    setRGBLed(0, 255, 255);
    delay(50);
    setRGBLed(0, 255, 0);
  } else {
    String resp = http.getString();
    Serial.printf("[POST] %s -> %d: %s\n", r.deviceId.c_str(), code, resp.substring(0, 200).c_str());
    // Brief magenta flash on POST failure
    setRGBLed(255, 0, 255);
    delay(200);
    setRGBLed(0, 255, 0);
  }
  http.end();
  return ok;
}
