/*
 * ESP32-C6 Vape Detection Sensor
 * WiFi-enabled sensor that sends data to FastAPI backend
 * Supports multiple sensor types: MQ-2 (smoke), temperature, humidity, air quality
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include <WebServer.h>
#include <Preferences.h>
#include "esp_task_wdt.h"

Preferences prefs;
WebServer server(80);

// WiFi Configuration
const String setup_pass = "use_mistio";
String ssid = "";  // Replace with your WiFi network name
String password = "";  // Replace with your WiFi password

// API Configuration
// Local FastAPI backend on your PC (LAN testing)
const char* apiEndpoint = "https://vapegaurd-production.up.railway.app/api/sensors/data";
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
// Vercel endpoint (requires auth): "https://vapegaurd-x6wi-4iihr8nqn-rahuls-projects-d9f10f54.vercel.app/api/sensors/data"

// Error code definitions for better debugging
#define HTTP_ERROR_CONNECTION_REFUSED -1
#define HTTP_ERROR_SEND_HEADER_FAILED -2
#define HTTP_ERROR_SEND_PAYLOAD_FAILED -3
#define HTTP_ERROR_NOT_CONNECTED -4
#define HTTP_ERROR_CONNECTION_LOST -5
#define HTTP_ERROR_NO_STREAM -6
#define HTTP_ERROR_NO_HTTP_SERVER -7
#define HTTP_ERROR_TOO_LESS_RAM -8
#define HTTP_ERROR_ENCODING -9
#define HTTP_ERROR_STREAM_WRITE -10
#define HTTP_ERROR_READ_TIMEOUT -11

// Pin Definitions for ESP32-C6 DevKitC-1
#define PMS_RX 4          // PMS5003 RX (connect to PMS TX) - Hardware UART
#define PMS_TX 5         // PMS5003 TX (connect to PMS RX) - Hardware UART
#define MIC_PIN 0           // MAX4466 microphone (GPIO0 - ADC capable)
#define LED_PIN 8           // Status LED
#define RESET_BUTTON_PIN 67 // Reset button 

// I2C pins for BME680
#define I2C_SDA 6           // BME680 SDI (I2C SDA)
#define I2C_SCL 7           // BME680 SCK (I2C SCL)

// Sensor Configuration
Adafruit_BME680 bme; // I2C
HardwareSerial pmsSerial(1); // Use Hardware UART1

// PMS5003 data structure
struct pms5003data {
  uint16_t framelen;
  uint16_t pm10_standard, pm25_standard, pm100_standard;
  uint16_t pm10_env, pm25_env, pm100_env;
  uint16_t particles_03um, particles_05um, particles_10um, particles_25um, particles_50um, particles_100um;
  uint16_t unused;
  uint16_t checksum;
};

struct pms5003data data;

// Device Configuration
const String DEVICE_ID = "ESP32_C6_001";  // Unique device identifier
const String LOCATION = "School Bathroom - 2nd Floor";  // Device location

// Timing Configuration
const unsigned long SENSOR_INTERVAL = 5000;  // Read sensors every 5 seconds
const unsigned long WIFI_TIMEOUT = 10000;    // WiFi connection timeout
const unsigned long HTTP_TIMEOUT = 20000;    // HTTP request timeout (20s for Railway cold start)
const unsigned long CONFIG_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const char* ntp1 = "pool.ntp.org";
const char* ntp2 = "time.nist.gov";

// Global Variables
unsigned long lastSensorRead = 0;
bool wifiConnected = false;
bool bme680Available = false;
int consecutiveFailures = 0;
const int MAX_FAILURES = 5;
String deviceMac = "";
bool wifiConfigured = false;
unsigned long configStartTime;

// Function declarations
void blinkLED(int times, int delayMs);
boolean readPMSdata(Stream *serial);
String getTimestamp();
float calculateAQI(float pm25, float pm10);
void triggerVapeAlert();

bool isResetHeld() {
  if (digitalRead(RESET_BUTTON_PIN) == LOW) {
    unsigned long start = millis();
    while (digitalRead(RESET_BUTTON_PIN) == LOW) {
        if (millis() - start > 3000) return true; // 3 second hold
    }
  }
  return false;
}

void loadCredentials() {
  prefs.begin("wifi", true);  // read-only
  ssid = prefs.getString("ssid", "");
  password = prefs.getString("pass", "");
  prefs.end();

  wifiConfigured = (ssid.length() > 0 && password.length() > 0);
  Serial.println("[WiFi] Loaded from NVS:");
  Serial.println("  SSID: " + ssid);
}

void saveCredentials(const String &newSsid, const String &newPass) {
  prefs.begin("wifi", false);  // read-write
  prefs.putString("ssid", newSsid);
  prefs.putString("pass", newPass);
  prefs.end();

  ssid = newSsid;
  password = newPass;
  wifiConfigured = true;

  Serial.println("[WiFi] Saved to NVS:");
  Serial.println("  SSID: " + ssid);
}

void setup() {
  // Reconfigure watchdog to 30s — Arduino pre-initializes it at 5s; Railway cold-start SSL can take 10-25s
  esp_task_wdt_config_t wdt_config = { .timeout_ms = 30000, .idle_core_mask = 0, .trigger_panic = true };
  esp_task_wdt_reconfigure(&wdt_config);

  Serial.begin(115200);
  // Removed while (!Serial) to avoid blocking on ESP32-C6 native USB; can cause watchdog resets if the host isn't attached
  Serial.println("[Init] Serial started at 115200");
  // Get MAC
  deviceMac = WiFi.macAddress();
  Serial.println("Device MAC: " + deviceMac);
  // Load stored WiFi credentials
  loadCredentials();
  delay(1000);
  
  Serial.println("\n=== ESP32-C6 Vape Detection Sensor ===");
  Serial.println("Device ID: " + deviceMac);
  Serial.println("Location: " + LOCATION);
  
  // Initialize pins
  pinMode(LED_PIN, OUTPUT);
  pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);
  
  // Initialize I2C for BME680
  Wire.begin(I2C_SDA, I2C_SCL);
  
  // Scan for I2C devices
  Serial.println("Scanning for I2C devices...");
  byte error, address;
  int nDevices = 0;
  for(address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("I2C device found at address 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
      nDevices++;
    }
    delay(1); // avoid long tight loop triggering WDT
  }
  if (nDevices == 0) {
    Serial.println("No I2C devices found");
  } else {
    Serial.println("I2C scan complete");
  }
  
  // Initialize BME680 - try both common I2C addresses
  Serial.println("Attempting BME680 initialization...");
  if (bme.begin(0x77)) {
    Serial.println("BME680 sensor found at address 0x77!");
    bme680Available = true;
  } else if (bme.begin(0x76)) {
    Serial.println("BME680 sensor found at address 0x76!");
    bme680Available = true;
  } else {
    Serial.println("Could not find a valid BME680 sensor!");
    Serial.println("Check wiring: SDA->GPIO6, SCL->GPIO7");
    Serial.println("Common BME680 I2C addresses: 0x76, 0x77");
    Serial.println("Continuing without BME680...");
    bme680Available = false;
  }
  
  if (bme680Available) {
    Serial.println("BME680 sensor initialized successfully!");
    // Set up BME680 oversampling and filter initialization
    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
    bme.setGasHeater(320, 150); // 320*C for 150 ms
  }
  
  // Initialize PMS5003 on Hardware UART1 (GPIO16=TX, GPIO17=RX)
  pmsSerial.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);
  Serial.println("PMS5003 initialized on Hardware UART1");
  
  // Initial sensor calibration
  Serial.println("Calibrating sensors...");
  delay(2000);
  
  // Status indication
  blinkLED(3, 200);  // 3 quick blinks to indicate ready
  Serial.println("System ready!");

  // Reset button --> config mode
  if (isResetHeld()) {
    Serial.println("[RESET] Button held. Entering config mode.");
    startConfigMode();
    return;
  }
  
  // Defer WiFi connection until after setup completes to avoid early resets
  if (wifiConfigured) {
    Serial.println("[WiFi] Credentials found. Trying to connect...");
    connectToWiFi();

    if (wifiConnected) {
      Serial.println("[WiFi] Connected. Setting up NTP...");
      configTime(0, 0, ntp1, ntp2);
      struct tm tm;
      while (!getLocalTime(&tm)) { delay(200); }
    } else {
      Serial.println("[WiFi] Failed. Will retry in loop().");
    }
  } else {
    Serial.println("[WiFi] No credentials stored. Entering config mode.");
    startConfigMode();
  }
}

void loop() {
  // If we're in AP/config mode, just serve HTTP
  if (WiFi.getMode() == WIFI_MODE_AP) {
    server.handleClient();
    if (millis() - configStartTime > CONFIG_TIMEOUT) {  // 10 minutes
      Serial.println("[Config] Timeout reached. Rebooting...");
      ESP.restart();
    }
    return;
  }

  // Reset button --> config mode
  if (isResetHeld()) {
    Serial.println("[RESET] Button held. Entering config mode.");
    startConfigMode();
    return;
  }

  // Normal mode (station)
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    digitalWrite(LED_PIN, LOW);
    Serial.println("WiFi disconnected. Attempting reconnection...");
    connectToWiFi();
  } else {
    wifiConnected = true;
    digitalWrite(LED_PIN, HIGH);
  }
  
  // Read and send sensor data at specified interval
  if (millis() - lastSensorRead >= SENSOR_INTERVAL) {
    if (wifiConnected) {
      readAndSendSensorData();
    } else {
      Serial.println("Skipping sensor read - no WiFi connection");
    }
    lastSensorRead = millis();
  }
  
  delay(100);  // Small delay to prevent watchdog issues
}

void connectToWiFi() {
  if (!wifiConfigured) {
    Serial.println("[WiFi] No stored credentials. Skipping connect.");
    return;
  }
  Serial.println("Connecting to WiFi: " + ssid);
  
  // Simple WiFi reset approach to avoid event queue issues
  WiFi.disconnect(true);     // Disconnect and clear stored credentials
  WiFi.mode(WIFI_OFF);       // Turn off WiFi completely
  delay(3000);               // Extended wait for complete reset
  
  // Restart WiFi in station mode
  WiFi.mode(WIFI_STA);
  delay(1000);
  
  // Set WiFi to use WPA2 only to avoid CCMP replay issues
  WiFi.setAutoReconnect(false);
  
  // Begin connection
  WiFi.begin(ssid.c_str(), password.c_str());
  
  unsigned long startTime = millis();
  int attempts = 0;
  const int maxAttempts = 3;
  
  while (WiFi.status() != WL_CONNECTED && attempts < maxAttempts) {
    unsigned long attemptStart = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - attemptStart) < 10000) {
      esp_task_wdt_reset();
      delay(500);
      Serial.print(".");
    }
    
    if (WiFi.status() != WL_CONNECTED) {
      attempts++;
      Serial.println("\nAttempt " + String(attempts) + " failed. Retrying...");
      WiFi.disconnect();
      delay(2000);
      WiFi.begin(ssid.c_str(), password.c_str());
    }
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\nWiFi connected successfully!");
    Serial.println("IP address: " + WiFi.localIP().toString());
    Serial.println("Signal strength: " + String(WiFi.RSSI()) + " dBm");
    WiFi.setAutoReconnect(true);
  } else {
    wifiConnected = false;
    Serial.println("\nWiFi connection failed after " + String(maxAttempts) + " attempts!");
    Serial.println("Check WiFi credentials and router settings.");
  }
}

void startConfigMode() {
  configStartTime = millis();
  Serial.println("[Config] Entering CONFIG MODE");

  // Create AP name from MAC (e.g., SENSOR-AB12CD)
  String apName = "SENSOR-" + deviceMac.substring(9); // last 3 bytes
  Serial.println("[Config] Starting AP: " + apName);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(apName.c_str(), setup_pass);  // simple setup password

  IPAddress IP = WiFi.softAPIP();
  Serial.print("[Config] AP IP address: ");
  Serial.println(IP);

  // Root page: show form
  server.on("/", HTTP_GET, []() {
    String html = "<html><body>"
                  "<h2>Sensor WiFi Setup</h2>"
                  "<p>Device Mac Address: " + deviceMac + "</p>"
                  "<form action='/save' method='POST'>"
                  "WiFi SSID: <input name='ssid'><br><br>"
                  "WiFi Password: <input type='password' name='pass'><br><br>"
                  "<input type='submit' value='Save & Reboot'>"
                  "</form>"
                  "</body></html>";
    server.send(200, "text/html", html);
  });

  // Save handler
  server.on("/save", HTTP_POST, []() {
    String newSsid = server.arg("ssid");
    String newPass = server.arg("pass");

    if (newSsid.length() == 0 || newPass.length() == 0) {
      server.send(400, "text/plain", "SSID and password required");
      return;
    }

    saveCredentials(newSsid, newPass);

    server.send(200, "text/html",
                "<h3>Credentials saved. Rebooting...</h3>"
                "<p>You can close this page.</p>");

    delay(1000);
    ESP.restart();
  });

  server.begin();
  Serial.println("[Config] Web server started");
}

void readAndSendSensorData() {
  Serial.println("\n--- Reading Sensors ---");
  
  // Read BME680
  float temperature, humidity, pressure, gasResistance;
  if (!bme680Available) {
    Serial.println("BME680 not available - using default values");
    temperature = -999;
    humidity = -999;
    pressure = -999;
    gasResistance = -999;
  } else if (!bme.performReading()) {
    Serial.println("Failed to perform BME680 reading");
    temperature = -999;
    humidity = -999;
    pressure = -999;
    gasResistance = -999;
  } else {
    temperature = bme.temperature;
    humidity = bme.humidity;
    pressure = bme.pressure / 100.0; // Convert to hPa
    gasResistance = bme.gas_resistance / 1000.0; // Convert to KOhms
  }
  
  // Read PMS5003
  float pm25 = -999, pm10 = -999;
  if (readPMSdata(&pmsSerial)) {
    pm25 = data.pm25_env;
    pm10 = data.pm10_env;
  }
  
  // Check if microphone is connected and handle sound level
float soundLevel = 0.0; // Default to zero if no microphone

// Check if microphone is connected by testing for floating pin
// A truly disconnected pin will show highly variable readings
int readings[10];
bool isConnected = false;
int consistentReadings = 0;

// Take 10 quick readings
for (int i = 0; i < 10; i++) {
  readings[i] = analogRead(MIC_PIN);
  delay(1);
}

// Check if readings are stable (indicating a connected device)
// A floating pin will have highly variable readings
for (int i = 1; i < 10; i++) {
  if (abs(readings[i] - readings[i-1]) < 50) {
    consistentReadings++;
  }
}

// If we have mostly consistent readings, consider the mic connected
isConnected = (consistentReadings >= 7);

if (isConnected) {
  // Process microphone readings only if connected
  int micTotal = 0;
  for (int i = 0; i < 5; i++) {
    micTotal += analogRead(MIC_PIN);
    delay(1);
  }
  int micRaw = micTotal / 5;
  
  // Apply threshold to filter out low-level noise
  if (micRaw < 100) {
    micRaw = 0;
  }
  
  soundLevel = (micRaw / 4095.0) * 100.0; // Convert to percentage
}

// Debug output
Serial.print("Microphone connected: ");
Serial.println(isConnected ? "YES" : "NO");
  
  // Print sensor readings
  Serial.println("Gas Resistance: " + String(gasResistance) + " KOhms");
  Serial.println("Temperature: " + String(temperature) + "°C");
  Serial.println("Humidity: " + String(humidity) + "%");
  Serial.println("Pressure: " + String(pressure) + " hPa");
  Serial.println("PM2.5: " + String(pm25) + " μg/m³");
  Serial.println("PM10: " + String(pm10) + " μg/m³");
  Serial.println("Sound Level: " + String(soundLevel) + "%");
  
  // Create JSON payload
  DynamicJsonDocument doc(1024);
  doc["device_id"] = deviceMac;
  doc["location"] = LOCATION;
  // doc["timestamp"] = getTimestamp();
  
  // Ensure valid numeric values for all sensor readings
  doc["gas_resistance"] = (gasResistance > -999) ? gasResistance : 0;
  doc["temperature"] = (temperature > -999) ? temperature : 0;
  doc["humidity"] = (humidity > -999) ? humidity : 0;
  doc["pressure"] = (pressure > -999) ? pressure : 0;
  doc["pm25"] = (pm25 > -999) ? pm25 : 0;
  doc["pm10"] = (pm10 > -999) ? pm10 : 0;
  doc["sound_level"] = soundLevel;
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["sensor_type"] = "multi_sensor";
  doc["mic_available"] = isConnected;
  
  // Add derived features for ML model - ensure valid calculations
  float tempHumidityRatio = 0;
  if (humidity > 0 && humidity > -999 && temperature > -999) {
    tempHumidityRatio = temperature / humidity;
  }
  doc["temp_humidity_ratio"] = tempHumidityRatio;
  
  float gasTemp = 0;
  if (gasResistance > -999 && temperature > -999) {
    gasTemp = gasResistance * temperature;
  }
  doc["gas_temp_interaction"] = gasTemp;
  
  float pmRatio = 0;
  if (pm10 > 0 && pm10 > -999 && pm25 > -999) {
    pmRatio = pm25 / pm10;
  }
  doc["pm_ratio"] = pmRatio;
  
  // Only calculate AQI if we have valid PM values
  float aqi = 0;
  if (pm25 > -999 && pm10 > -999) {
    aqi = calculateAQI(pm25, pm10);
  }
  doc["air_quality_index"] = aqi;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("JSON Payload: " + jsonString);
  
  // Send data to API
  sendDataToAPI(jsonString);
}

void sendDataToAPI(String jsonData) {
  if (!wifiConnected) {
    Serial.println("Cannot send data - no WiFi connection");
    return;
  }
  
  HTTPClient http;
  WiFiClientSecure client;
  client.setInsecure(); // Use insecure connection to avoid cert chain issues with Let's Encrypt ECDSA certs
  http.begin(client, apiEndpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(HTTP_TIMEOUT);
  
  Serial.println("Sending data to: " + String(apiEndpoint));
  Serial.println("Payload: " + jsonData);

  esp_task_wdt_reset(); // Reset WDT before potentially long SSL handshake
  int httpResponseCode = http.POST(jsonData);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("HTTP Response Code: " + String(httpResponseCode));
    Serial.println("Response: " + response);
    
    // Accept both 200 and 201 as success codes
    if (httpResponseCode == 200 || httpResponseCode == 201) {
      Serial.println("✓ Data sent successfully!");
      consecutiveFailures = 0;
      
      // Parse response to check for vape detection
      DynamicJsonDocument responseDoc(1024);
      DeserializationError error = deserializeJson(responseDoc, response);
      
      if (!error && responseDoc.containsKey("prediction")) {
        String predictedClass = responseDoc["prediction"]["predicted_class"];
        float confidence = responseDoc["prediction"]["confidence"];
        
        Serial.println("Prediction: " + predictedClass + " (" + String(confidence) + "% confidence)");
        
        // Local alert disabled per request; keeping alert off
        // if (predictedClass == "vape" && confidence > 70) {
        //   // triggerVapeAlert();
        // }
      }
    } else if (httpResponseCode == 500) {
      // Handle 500 error specifically
      Serial.println("✗ Server error 500 - The server encountered an internal error");
      Serial.println("Retrying with delay...");
      delay(5000); // Wait 5 seconds before retrying
      consecutiveFailures++;
    }
  } else if (httpResponseCode == HTTP_ERROR_READ_TIMEOUT) {
    // Handle timeout error specifically
    Serial.println("✗ HTTP request timed out (Error -11)");
    Serial.println("The server is taking too long to respond. Check your network or server status.");
    Serial.println("Increasing timeout and retrying...");
    http.setTimeout(HTTP_TIMEOUT * 2); // Double the timeout for the next attempt
    delay(3000); // Wait 3 seconds before retrying
    consecutiveFailures++;
  } else {
    Serial.println("✗ HTTP request failed: " + String(httpResponseCode));
    consecutiveFailures++;
  }
  
  http.end();
  
  // Handle consecutive failures
  if (consecutiveFailures >= MAX_FAILURES) {
    Serial.println("Too many consecutive failures. Restarting WiFi...");
    WiFi.disconnect();
    delay(1000);
    connectToWiFi();
    consecutiveFailures = 0;
  }
}

// Local alert function removed as requested

float calculateAQI(float pm25, float pm10) {
  // Simplified AQI calculation based on PM2.5 and PM10
  float aqi25 = (pm25 / 35.0) * 100; // EPA standard for PM2.5
  float aqi10 = (pm10 / 150.0) * 100; // EPA standard for PM10
  return max(aqi25, aqi10);
}

boolean readPMSdata(Stream *s) {
  // Clear any stale data in buffer first
  while (s->available() > 32) {
    s->read();
  }
  
  // Wait for data with timeout
  unsigned long timeout = millis() + 2000; // 2 second timeout
  while (!s->available() && millis() < timeout) {
    delay(10);
  }
  
  if (!s->available()) {
    return false;
  }
  
  // Find the start bytes 0x42 0x4d
  while (s->available()) {
    if (s->read() == 0x42) {
      if (s->available() && s->read() == 0x4d) {
        break; // Found start sequence
      }
    }
    // Timeout check
    if (millis() > timeout) {
      return false;
    }
  }

  // Wait for full frame (30 more bytes after start)
  timeout = millis() + 1000;
  while (s->available() < 30 && millis() < timeout) {
    delay(10);
  }
  
  if (s->available() < 30) {
    return false;
  }
    
  uint8_t buffer[32];
  buffer[0] = 0x42;
  buffer[1] = 0x4d;
  
  // Read remaining 30 bytes
  s->readBytes(&buffer[2], 30);
  
  uint16_t sum = 0;
  // Calculate checksum (first 30 bytes)
  for (uint8_t i=0; i<30; i++) {
    sum += buffer[i];
  }
  
  // Convert to 16-bit values
  uint16_t buffer_u16[15];
  for (uint8_t i=0; i<15; i++) {
    buffer_u16[i] = buffer[2 + i*2 + 1];
    buffer_u16[i] += (buffer[2 + i*2] << 8);
  }

  // Copy to data struct
  memcpy((void *)&data, (void *)buffer_u16, 30);

  // Verify checksum
  if (sum != data.checksum) {
    Serial.print("Checksum failure: calculated=");
    Serial.print(sum);
    Serial.print(", received=");
    Serial.println(data.checksum);
    return false;
  }
  
  return true;
}

void triggerVapeAlert() {
  Serial.println("🚨 VAPE DETECTION ALERT! 🚨");
  
  // Visual alert - rapid blinking
  for (int i = 0; i < 10; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(100);
    digitalWrite(LED_PIN, LOW);
    delay(100);
  }
  
  // Additional visual alert for vape detection
  blinkLED(10, 50);  // Very fast blinking
}

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(LED_PIN, LOW);
    delay(delayMs);
  }
}

// Buzzer function removed - no buzzer component available

String getTimestamp() {
  // Simple timestamp - in production, you might want to use NTP
  return String(millis());
}

// Function to update WiFi credentials via Serial
void updateWiFiCredentials() {
  if (Serial.available()) {
    String command = Serial.readString();
    command.trim();
    
    if (command.startsWith("WIFI:")) {
      // Format: WIFI:SSID,PASSWORD
      int commaIndex = command.indexOf(',');
      if (commaIndex > 0) {
        String newSSID = command.substring(5, commaIndex);
        String newPassword = command.substring(commaIndex + 1);
        
        Serial.println("Updating WiFi credentials...");
        Serial.println("New SSID: " + newSSID);
        
        WiFi.disconnect();
        delay(1000);
        WiFi.begin(newSSID.c_str(), newPassword.c_str());
      }
    }
  }
}
