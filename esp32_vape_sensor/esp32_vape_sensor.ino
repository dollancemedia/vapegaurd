/*
 * ESP32-C6 Vape Detection Sensor
 * WiFi-enabled sensor that sends data to FastAPI backend
 * Supports multiple sensor types: MQ-2 (smoke), temperature, humidity, air quality
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include <SoftwareSerial.h>

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// API Configuration
const char* apiEndpoint = "https://your-vercel-app.vercel.app/api/sensors/data";
// For local testing: "http://localhost:8000/api/sensors/data"

// Pin Definitions
#define BME_SCK 13
#define BME_MISO 12
#define BME_MOSI 11
#define BME_CS 10
#define PMS_RX 4            // PMS5003 RX pin
#define PMS_TX 5            // PMS5003 TX pin
#define MIC_PIN A0          // MAX4466 microphone (analog)
#define LED_PIN 8           // Status LED
#define BUZZER_PIN 9        // Alert buzzer

// Sensor Configuration
Adafruit_BME680 bme; // I2C
SoftwareSerial pmsSerial(PMS_RX, PMS_TX);

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
const unsigned long HTTP_TIMEOUT = 5000;     // HTTP request timeout

// Global Variables
unsigned long lastSensorRead = 0;
bool wifiConnected = false;
int consecutiveFailures = 0;
const int MAX_FAILURES = 5;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n=== ESP32-C6 Vape Detection Sensor ===");
  Serial.println("Device ID: " + DEVICE_ID);
  Serial.println("Location: " + LOCATION);
  
  // Initialize pins
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  // Initialize BME680
  if (!bme.begin()) {
    Serial.println("Could not find a valid BME680 sensor, check wiring!");
    while (1);
  }
  
  // Set up BME680 oversampling and filter initialization
  bme.setTemperatureOversampling(BME680_OS_8X);
  bme.setHumidityOversampling(BME680_OS_2X);
  bme.setPressureOversampling(BME680_OS_4X);
  bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
  bme.setGasHeater(320, 150); // 320*C for 150 ms
  
  // Initialize PMS5003
  pmsSerial.begin(9600);
  
  // Initialize WiFi
  connectToWiFi();
  
  // Initial sensor calibration
  Serial.println("Calibrating sensors...");
  delay(2000);
  
  // Status indication
  blinkLED(3, 200);  // 3 quick blinks to indicate ready
  Serial.println("System ready!");
}

void loop() {
  // Check WiFi connection
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
  Serial.println("Connecting to WiFi: " + String(ssid));
  
  WiFi.begin(ssid, password);
  
  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < WIFI_TIMEOUT) {
    delay(500);
    Serial.print(".");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\nWiFi connected successfully!");
    Serial.println("IP address: " + WiFi.localIP().toString());
    Serial.println("Signal strength: " + String(WiFi.RSSI()) + " dBm");
  } else {
    wifiConnected = false;
    Serial.println("\nWiFi connection failed!");
  }
}

void readAndSendSensorData() {
  Serial.println("\n--- Reading Sensors ---");
  
  // Read BME680
  float temperature, humidity, pressure, gasResistance;
  if (!bme.performReading()) {
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
  
  // Read MAX4466 microphone
  int micRaw = analogRead(MIC_PIN);
  float soundLevel = (micRaw / 4095.0) * 100.0; // Convert to percentage
  
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
  doc["device_id"] = DEVICE_ID;
  doc["location"] = LOCATION;
  doc["timestamp"] = getTimestamp();
  doc["gas_resistance"] = gasResistance;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["pressure"] = pressure;
  doc["pm25"] = pm25;
  doc["pm10"] = pm10;
  doc["sound_level"] = soundLevel;
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["sensor_type"] = "multi_sensor";
  
  // Add derived features for ML model
  doc["temp_humidity_ratio"] = (humidity > 0) ? temperature / humidity : 0;
  doc["gas_temp_interaction"] = gasResistance * temperature;
  doc["pm_ratio"] = (pm10 > 0) ? pm25 / pm10 : 0;
  doc["air_quality_index"] = calculateAQI(pm25, pm10);
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("JSON Payload: " + jsonString);
  
  // Send data to API
  sendDataToAPI(jsonString);
  
  // Check for alert conditions
  checkAlertConditions(gasResistance, temperature, pm25);
}

void sendDataToAPI(String jsonData) {
  if (!wifiConnected) {
    Serial.println("Cannot send data - no WiFi connection");
    return;
  }
  
  HTTPClient http;
  http.begin(apiEndpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(HTTP_TIMEOUT);
  
  Serial.println("Sending data to: " + String(apiEndpoint));
  
  int httpResponseCode = http.POST(jsonData);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("HTTP Response Code: " + String(httpResponseCode));
    Serial.println("Response: " + response);
    
    if (httpResponseCode == 201) {
      Serial.println("✓ Data sent successfully!");
      consecutiveFailures = 0;
      
      // Parse response to check for vape detection
      DynamicJsonDocument responseDoc(1024);
      deserializeJson(responseDoc, response);
      
      if (responseDoc.containsKey("prediction")) {
        String predictedClass = responseDoc["prediction"]["predicted_class"];
        float confidence = responseDoc["prediction"]["confidence"];
        
        Serial.println("Prediction: " + predictedClass + " (" + String(confidence) + "% confidence)");
        
        // Trigger alert if vape detected with high confidence
        if (predictedClass == "vape" && confidence > 70) {
          triggerVapeAlert();
        }
      }
    } else {
      Serial.println("✗ Server error: " + String(httpResponseCode));
      consecutiveFailures++;
    }
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

void checkAlertConditions(float gasResistance, float temperature, float pm25) {
  // Local alert conditions (independent of ML model)
  bool gasAlert = gasResistance < 50.0;  // Low gas resistance indicates VOCs
  bool tempAlert = temperature > 35;     // High temperature alert
  bool pmAlert = pm25 > 35.0;           // High PM2.5 alert
  
  if (gasAlert || tempAlert || pmAlert) {
    Serial.println("⚠️ LOCAL ALERT TRIGGERED!");
    if (gasAlert) Serial.println("  - High VOC level detected!");
    if (tempAlert) Serial.println("  - High temperature detected!");
    if (pmAlert) Serial.println("  - High particulate matter detected!");
    
    // Visual and audio alert
    blinkLED(5, 100);  // Fast blinking
    soundBuzzer(3, 200);  // 3 beeps
  }
}

float calculateAQI(float pm25, float pm10) {
  // Simplified AQI calculation based on PM2.5 and PM10
  float aqi25 = (pm25 / 35.0) * 100; // EPA standard for PM2.5
  float aqi10 = (pm10 / 150.0) * 100; // EPA standard for PM10
  return max(aqi25, aqi10);
}

boolean readPMSdata(Stream *s) {
  if (!s->available()) {
    return false;
  }
  
  // Read a byte at a time until we get to the special '0x42' start-byte
  if (s->peek() != 0x42) {
    s->read();
    return false;
  }

  // Now read all 32 bytes
  if (s->available() < 32) {
    return false;
  }
    
  uint8_t buffer[32];    
  uint16_t sum = 0;
  s->readBytes(buffer, 32);

  // get checksum ready
  for (uint8_t i=0; i<30; i++) {
    sum += buffer[i];
  }
  
  // The data comes in endian'd, this solves it so it works on all platforms
  uint16_t buffer_u16[15];
  for (uint8_t i=0; i<15; i++) {
    buffer_u16[i] = buffer[2 + i*2 + 1];
    buffer_u16[i] += (buffer[2 + i*2] << 8);
  }

  // put it into a nice struct :)
  memcpy((void *)&data, (void *)buffer_u16, 30);

  if (sum != data.checksum) {
    Serial.println("Checksum failure");
    return false;
  }
  // success!
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
  
  // Audio alert - urgent beeping pattern
  for (int i = 0; i < 5; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(200);
    digitalWrite(BUZZER_PIN, LOW);
    delay(100);
  }
}

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(LED_PIN, LOW);
    delay(delayMs);
  }
}

void soundBuzzer(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(delayMs);
    digitalWrite(BUZZER_PIN, LOW);
    delay(delayMs);
  }
}

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