/*
 * ESP32-C6 Vape Detection Sensor - Device 002
 * WiFi-enabled sensor that sends data to FastAPI backend
 * Supports multiple sensor types: pms5003, bme680
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>

// WiFi Configuration
const char* ssid = "sweethome";  // Replace with your WiFi network name
const char* password = "rahul2008";  // Replace with your WiFi password

// API Configuration
// Local FastAPI backend on your PC (LAN testing)
const char* apiEndpoint = "http://10.0.0.43:8000/api/sensors/data";
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

// Pin Definitions for ESP32 Feather V2 (Huzzah32)
// MOVED TO SAFE GPIOs to avoid PSRAM conflict on 16/17
#define PMS_RX 33          // Connect to PMS5003 TX
#define PMS_TX 27          // Connect to PMS5003 RX
#define MIC_PIN 34         // A2 is GPIO 34 on Feather V2
#define LED_PIN 13         // Built-in LED is GPIO 13 on Feather V2

// I2C pins for BME680
#define I2C_SDA 23          // SDA is GPIO 23 on Feather V2
#define I2C_SCL 22          // SCL is GPIO 22 on Feather V2

// Sensor Configuration
Adafruit_BME680 bme; // I2C
HardwareSerial pmsSerial(2); // Use Hardware UART2 (UART1 often reserved or problematic on some variants)

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
const String DEVICE_ID = "ESP32_C6_002";  // Unique device identifier (Detector 2)
const String LOCATION = "Building A, Floor 1";  // Device location

// Timing Configuration
const unsigned long SENSOR_INTERVAL = 5000;  // Read sensors every 5 seconds
const unsigned long WIFI_TIMEOUT = 10000;    // WiFi connection timeout
const unsigned long HTTP_TIMEOUT = 15000;     // HTTP request timeout

// Global Variables
unsigned long lastSensorRead = 0;
bool wifiConnected = false;
bool bme680Available = false;
int consecutiveFailures = 0;
const int MAX_FAILURES = 5;

// Function declarations
void blinkLED(int times, int delayMs);
boolean readPMSdata(Stream *serial);
String getTimestamp();
float calculateAQI(float pm25, float pm10);
void triggerVapeAlert();

void setup() {
  Serial.begin(115200);
  delay(2000); // Wait for Serial Monitor to catch up
  
  // IMMEDIATE STARTUP CHECK
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
  digitalWrite(LED_PIN, HIGH);
  Serial.println("\n\n=== ESP32 BOOT SUCCESSFUL ===");
  Serial.println("Using Configuration: Feather V2 (Generic Mode)");

  // Removed while (!Serial) to avoid blocking on ESP32-C6 native USB; can cause watchdog resets if the host isn't attached
  Serial.println("[Init] Serial started at 115200");
  
  Serial.println("\n=== ESP32 Vape Detection Sensor (Feather V2) ===");
  Serial.println("Device ID: " + DEVICE_ID);
  Serial.println("Location: " + LOCATION);
  
  // Initialize pins
  pinMode(LED_PIN, OUTPUT);
  
  // DISABLED I2C for now since BME680 is not connected
  // This prevents watchdog resets due to hanging I2C bus scan
  /*
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
  */
  
  Serial.println("I2C/BME680 disabled (Hardware missing). Continuing...");
  bme680Available = false;
  
  // Initialize PMS5003 on Hardware UART1
  // On Feather V2, RX is GPIO 33, TX is GPIO 27
  // Note: RX pin connects to PMS TX, TX pin connects to PMS RX
  Serial.println("Attempting to start PMS Serial...");
  delay(100); // Allow print to flush
  
  // Initialize Serial2 with safe pins
  pmsSerial.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);
  Serial.println("PMS5003 initialized on Hardware UART2 (RX=33, TX=27)");
  
  // Initial sensor calibration
  Serial.println("Calibrating sensors...");
  // Feed watchdog during long delay
  for(int i=0; i<20; i++) {
    delay(100); 
  }
  
  // Status indication
   blinkLED(3, 200);  // 3 quick blinks to indicate ready
  Serial.println("System ready!");
  
  // Defer WiFi connection until after setup completes to avoid early resets
  Serial.println("Starting WiFi connection...");
  // Add yield to ensure WiFi stack can initialize
  yield();
  connectToWiFi();
}

void loop() {
  // Feed the watchdog
  yield();
  
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
  WiFi.begin(ssid, password);
  
  unsigned long startTime = millis();
  int attempts = 0;
  const int maxAttempts = 3;
  
  while (WiFi.status() != WL_CONNECTED && attempts < maxAttempts) {
    unsigned long attemptStart = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - attemptStart) < 10000) {
      delay(500);
      Serial.print(".");
    }
    
    if (WiFi.status() != WL_CONNECTED) {
      attempts++;
      Serial.println("\nAttempt " + String(attempts) + " failed. Retrying...");
      WiFi.disconnect();
      delay(2000);
      WiFi.begin(ssid, password);
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

void readAndSendSensorData() {
  Serial.println("\n--- Reading Sensors ---");
  
  // Read BME680
  float temperature, humidity, pressure, gasResistance;
  if (!bme680Available) {
    Serial.println("BME680 not available - using default values");
    temperature = 0;
    humidity = 0;
    pressure = 0;
    gasResistance = 0;
    gasResistance = 0;
  } else if (!bme.performReading()) {
    Serial.println("Failed to perform BME680 reading");
    temperature = 0;
    humidity = 0;
    pressure = 0;
    gasResistance = 0;
  } else {
    temperature = bme.temperature;
    humidity = bme.humidity;
    pressure = bme.pressure / 100.0; // Convert to hPa
    gasResistance = bme.gas_resistance / 1000.0; // Convert to KOhms
  }
  
  // Read PMS5003
  float pm25 = 0, pm10 = 0;
  if (readPMSdata(&pmsSerial)) {
    pm25 = data.pm25_env;
    pm10 = data.pm10_env;
    Serial.print("PM2.5: "); Serial.println(pm25);
  } else {
    Serial.println("PMS5003 read failed");
    // Debugging UART connection
    int avail = pmsSerial.available();
    Serial.print("Serial1 Available: "); Serial.println(avail);
    if (avail > 0) {
       int byteRead = pmsSerial.read();
       Serial.print("Read byte: 0x"); Serial.println(byteRead, HEX);
       // If we read 0xFF or -1 continuously, it's a wiring or baud issue
    }
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
     unsigned long startMillis = millis();
    unsigned int peakToPeak = 0;
    unsigned int signalMax = 0;
    unsigned int signalMin = 4095;
    
    // Sample for 50ms
    while (millis() - startMillis < 50) {
      int sample = analogRead(MIC_PIN);
      if (sample < 4096) {
        if (sample > signalMax) signalMax = sample;
        if (sample < signalMin) signalMin = sample;
      }
    }
    peakToPeak = signalMax - signalMin;
    soundLevel = (peakToPeak * 3.3) / 4095 * 100; // Convert to percentage/arbitrary unit
  } else {
    // If mic not connected, keep sound level at 0
    soundLevel = 0;
  }
  
  Serial.print("Sound Level: "); Serial.println(soundLevel);
  
  // Create JSON payload
  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["humidity"] = humidity;
  doc["temperature"] = temperature;
  doc["pm25"] = pm25;
  doc["pm10"] = pm10;
  doc["particle_size"] = 0; // Placeholder
  doc["volume_spike"] = (soundLevel > 80); // Simple threshold
  doc["confidence"] = 85; // Mock confidence for now
  doc["timestamp"] = getTimestamp(); // Add timestamp if needed by backend
  
  String payload;
  serializeJson(doc, payload);
  
  Serial.println("Sending payload: " + payload);
  
  // Send to API
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(apiEndpoint);
    http.addHeader("Content-Type", "application/json");
    
    int httpResponseCode = http.POST(payload);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("HTTP Response code: " + String(httpResponseCode));
      Serial.println("Response: " + response);
      consecutiveFailures = 0;
    } else {
      Serial.print("Error on sending POST: ");
      Serial.println(httpResponseCode);
      consecutiveFailures++;
    }
    
    http.end();
  } else {
    Serial.println("WiFi Disconnected");
  }
}

boolean readPMSdata(Stream *s) {
  if (!s->available()) {
    return false;
  }
  
  // Skip characters until we find the start byte 0x42
  while (s->available() > 0 && s->peek() != 0x42) {
    s->read(); // Discard byte
  }
  
  // If we drained the buffer and found nothing, or not enough data yet
  if (s->available() < 32) {
    return false;
  }
  
  uint8_t buffer[32];
  uint16_t sum = 0;
  s->readBytes(buffer, 32);
  
  // Double check start bytes (redundant but safe)
  if (buffer[0] != 0x42 || buffer[1] != 0x4d) {
    return false;
  }
  
  // Calculate checksum
  for (uint8_t i = 0; i < 30; i++) {
    sum += buffer[i];
  }
  
  uint16_t buffer_u16[15];
  for (uint8_t i = 0; i < 15; i++) {
    buffer_u16[i] = buffer[2 + i * 2] << 8 | buffer[2 + i * 2 + 1];
  }
  
  data.framelen = buffer_u16[0];
  data.pm10_standard = buffer_u16[1];
  data.pm25_standard = buffer_u16[2];
  data.pm100_standard = buffer_u16[3];
  data.pm10_env = buffer_u16[4];
  data.pm25_env = buffer_u16[5];
  data.pm100_env = buffer_u16[6];
  data.particles_03um = buffer_u16[7];
  data.particles_05um = buffer_u16[8];
  data.particles_10um = buffer_u16[9];
  data.particles_25um = buffer_u16[10];
  data.particles_50um = buffer_u16[11];
  data.particles_100um = buffer_u16[12];
  data.unused = buffer_u16[13];
  data.checksum = buffer_u16[14];
  
  if (sum != data.checksum) {
    return false;
  }
  
  return true;
}

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(LED_PIN, LOW);
    delay(delayMs);
  }
}

String getTimestamp() {
  // Returns simple uptime string for now
  // For real timestamp, you'd need NTP time sync
  return String(millis());
}
