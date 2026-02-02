/*
 * ESP32-C6 Vape Detection Sensor
 * WiFi-enabled sensor that sends data to FastAPI backend
 * Supports multiple sensor types: MQ-2 (smoke), temperature, humidity, air quality
 * Using NimBLE for lightweight Bluetooth provisioning
 */

#include <WiFi.h>
#include <esp_http_client.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include <Preferences.h>
#include <NimBLEDevice.h>
#include <esp_mac.h>

Preferences prefs;

// WiFi Configuration
const String setup_pass = "use_mistio";
String ssid = "";     // Replace with your WiFi network name
String password = ""; // Replace with your WiFi password

// NimBLE Configuration
NimBLEServer *bleServer = nullptr;
NimBLECharacteristic *ssidChar;
NimBLECharacteristic *passChar;
NimBLECharacteristic *orgChar;

bool bleProvisioned = false;
String incomingSSID = "";
String incomingPASS = "";
String incomingORG = "";

// API Configuration
// Local FastAPI backend on your PC (LAN testing)
const char *apiEndpoint = "https://vapegaurd-production.up.railway.app/api/sensors/data";
static const char ISRG_Root_X1[] = 
"-----BEGIN CERTIFICATE-----\n"
"MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n"
"TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh\n"
"cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4\n"
"WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu\n"
"ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY\n"
"MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc\n"
"h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+\n"
"0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U\n"
"A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW\n"
"T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH\n"
"B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC\n"
"B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv\n"
"KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn\n"
"OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn\n"
"jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw\n"
"qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI\n"
"rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV\n"
"HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq\n"
"hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL\n"
"ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ\n"
"3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK\n"
"NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5\n"
"ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur\n"
"TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC\n"
"jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc\n"
"oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq\n"
"4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA\n"
"mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d\n"
"emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=\n"
"-----END CERTIFICATE-----\n";
// Vercel endpoint (requires auth): "https://vapegaurd-x6wi-4iihr8nqn-rahuls-projects-d9f10f54.vercel.app/api/sensors/data"

// Pin Definitions for ESP32-C6 DevKitC-1
#define PMS_RX 4            // PMS5003 RX (connect to PMS TX) - Hardware UART
#define PMS_TX 5            // PMS5003 TX (connect to PMS RX) - Hardware UART
#define MIC_PIN 0           // MAX4466 microphone (GPIO0 - ADC capable)
#define LED_PIN 8           // Status LED
#define RESET_BUTTON_PIN 9 // Reset button

// I2C pins for BME680
#define I2C_SDA 6 // BME680 SDI (I2C SDA)
#define I2C_SCL 7 // BME680 SCK (I2C SCL)

// Sensor Configuration
Adafruit_BME680 bme;         // I2C
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
const String DEVICE_ID = "ESP32_C6_001";               // Unique device identifier
const String LOCATION = "School Bathroom - 2nd Floor"; // Device location

// Timing Configuration
const unsigned long SENSOR_INTERVAL = 5000;          // Read sensors every 5 seconds
const unsigned long WIFI_TIMEOUT = 10000;            // WiFi connection timeout
const unsigned long HTTP_TIMEOUT = 5000;             // HTTP request timeout
const unsigned long CONFIG_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const char *ntp1 = "pool.ntp.org";
const char *ntp2 = "time.nist.gov";

// Global Variables
unsigned long lastSensorRead = 0;
bool wifiConnected = false;
bool bme680Available = false;
int consecutiveFailures = 0;
const int MAX_FAILURES = 5;
String deviceMac = "";
String cleanMac = "";
String org = "";
bool wifiConfigured = false;
unsigned long configStartTime;

// HTTP response buffer
String httpResponseBuffer = "";

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
      if (millis() - start > 3000)
        return true; // 3 second hold
    }
  }
  return false;
}

void factoryReset() {
  Serial.println("[RESET] Factory reset: clearing WiFi + org");

  // Clear NVS entries
  prefs.begin("wifi", false);
  prefs.clear(); // wipes all keys in "wifi" namespace
  prefs.end();

  // Clear RAM copies
  ssid = "";
  password = "";
  org = "";
  incomingSSID = "";
  incomingPASS = "";
  incomingORG = "";
  wifiConfigured = false;
  bleProvisioned = false;

  delay(200);
  ESP.restart();
}

void loadCredentials() {
  prefs.begin("wifi", true); // read-only
  ssid = prefs.getString("ssid", "");
  password = prefs.getString("pass", "");
  org = prefs.getString("org", "");
  prefs.end();

  wifiConfigured = (ssid.length() > 0 && password.length() > 0);
  Serial.println("[WiFi] Loaded from NVS:");
  Serial.println("  SSID: " + ssid);
}

void saveCredentials(const String &newSsid, const String &newPass) {
  prefs.begin("wifi", false); // read-write
  prefs.putString("ssid", newSsid);
  prefs.putString("pass", newPass);
  prefs.end();

  ssid = newSsid;
  password = newPass;
  wifiConfigured = true;

  Serial.println("[WiFi] Saved to NVS:");
  Serial.println("  SSID: " + ssid);
}

class ProvisionCallback : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *pCharacteristic) {
    Serial.println("[BLE] onWrite fired");
    std::string value = pCharacteristic->getValue();

    if (pCharacteristic == ssidChar) {
      incomingSSID = String(value.c_str());
      Serial.println("[BLE] Received SSID: " + incomingSSID);
    }

    if (pCharacteristic == passChar) {
      incomingPASS = String(value.c_str());
      Serial.println("[BLE] Received PASS");
    }

    if (pCharacteristic == orgChar) {
      incomingORG = String(value.c_str());
      Serial.println("[BLE] Received ORG: " + incomingORG);
    }

    // If all 3 are received → mark provisioning complete
    if (incomingSSID.length() > 0 && incomingPASS.length() > 0 && incomingORG.length() > 0) {
      bleProvisioned = true;
    } else {
      bleProvisioned = false;
    }
  }
};

class ServerCallbacks : public NimBLEServerCallbacks {
  void onDisconnect(NimBLEServer *pServer) {
    NimBLEDevice::startAdvertising();
    Serial.println("[BLE] Client disconnected, advertising restarted");
  }
};

void startConfigMode() {
  Serial.println("[BLE] Starting BLE provisioning...");

  cleanMac = deviceMac;
  cleanMac.replace(":", "");
  String bleName = "MISTIO-" + cleanMac;
  
  NimBLEDevice::init(bleName.c_str());
  
  bleServer = NimBLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  NimBLEService *service = bleServer->createService("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
  ProvisionCallback provCallback; // new ProvisionCallback());//

  ssidChar = service->createCharacteristic(
    "6E400002-B5A3-F393-E0A9-E50E24DCCA9E",
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  ssidChar->setCallbacks(new ProvisionCallback());//&provCallback);

  passChar = service->createCharacteristic(
    "6E400003-B5A3-F393-E0A9-E50E24DCCA9E",
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  passChar->setCallbacks(new ProvisionCallback());//&provCallback);

  orgChar = service->createCharacteristic(
    "6E400004-B5A3-F393-E0A9-E50E24DCCA9E",
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  orgChar->setCallbacks(new ProvisionCallback());//&provCallback);

  service->start();

  NimBLEAdvertising *pAdvertising = NimBLEDevice::getAdvertising();

  NimBLEAdvertisementData advData;
  advData.setName(bleName.c_str());
  advData.addServiceUUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
  
  NimBLEAdvertisementData scanData;
  scanData.setName(bleName.c_str());  // optional but recommended

  pAdvertising->setAdvertisementData(advData);
  pAdvertising->setScanResponseData(scanData);
  pAdvertising->start();

  Serial.println("[BLE] Advertising as: " + bleName);
}

void setup() {
  Serial.begin(115200);
  // Removed while (!Serial) to avoid blocking on ESP32-C6 native USB; can cause watchdog resets if the host isn't attached
  Serial.println("[Init] Serial started at 115200");

  incomingSSID = "";
  incomingPASS = "";
  incomingORG = "";
  bleProvisioned = false;

  // Get MAC
  uint8_t baseMac[6];
  esp_read_mac(baseMac, ESP_MAC_WIFI_STA);
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
         baseMac[0], baseMac[1], baseMac[2],
         baseMac[3], baseMac[4], baseMac[5]);
  deviceMac = String(macStr);
  cleanMac = deviceMac;
  cleanMac.replace(":", "");
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
    factoryReset();
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
      while (!getLocalTime(&tm)) {
        delay(200);
      }
    } else {
      Serial.println("[WiFi] Failed. Will retry in loop().");
    }
  } else {
    Serial.println("[WiFi] No credentials stored. Entering config mode.");
    startConfigMode();
  }
}

void loop() {
  if (!wifiConfigured) {
    if (ssidChar->getValue().length() > 0 && passChar->getValue().length() > 0 && orgChar->getValue().length() > 0) {
      incomingSSID = ssidChar->getValue().c_str();
      incomingPASS = passChar->getValue().c_str();
      incomingORG  = orgChar->getValue().c_str();

      bleProvisioned = true;
    }
    if (bleProvisioned) {
      Serial.println("[BLE] Provisioning complete. Saving credentials...");
      saveCredentials(incomingSSID, incomingPASS);

      prefs.begin("wifi", false);
      prefs.putString("org", incomingORG);
      prefs.end();

      NimBLEDevice::deinit(true);

      delay(500);
      ESP.restart();
    }
    delay(100);
    return;
  }

  // Reset button --> config mode
  if (isResetHeld()) {
    Serial.println("[RESET] Button held. Entering config mode.");
    factoryReset();
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
    pressure = bme.pressure / 100.0;             // Convert to hPa
    gasResistance = bme.gas_resistance / 1000.0; // Convert to KOhms
  }

  // Read PMS5003
  float pm1 = -999, pm25 = -999, pm10 = -999;
  if (readPMSdata(&pmsSerial)) {
    pm1 = data.pm10_env;
    pm25 = data.pm25_env;
    pm10 = data.pm100_env;
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
  Serial.println("PM1.0: " + String(pm1) + " μg/m³");
  Serial.println("PM2.5: " + String(pm25) + " μg/m³");
  Serial.println("PM10: " + String(pm10) + " μg/m³");
  Serial.println("Sound Level: " + String(soundLevel) + "%");

  // Create JSON payload
  DynamicJsonDocument doc(1024);
  doc["device_id"] = cleanMac;
  doc["org_id"] = org;
  doc["location"] = LOCATION;
  // doc["timestamp"] = getTimestamp();

  // Ensure valid numeric values for all sensor readings
  doc["humidity"] = humidity;
  doc["gas_resistance"] = gasResistance;
  doc["temperature"] = temperature;
  doc["pressure"] = pressure;
  doc["pm1"] = pm1;
  doc["pm25"] = pm25;
  doc["pm10"] = pm10;
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

// Event handler for HTTP client
esp_err_t http_event_handler(esp_http_client_event_t *evt) {
  switch(evt->event_id) {
    case HTTP_EVENT_ON_DATA:
      // Append received data to buffer
      if (evt->data_len > 0) {
        char* data = (char*)evt->data;
        for (int i = 0; i < evt->data_len; i++) {
          httpResponseBuffer += data[i];
        }
      }
      break;
    case HTTP_EVENT_ERROR:
      Serial.println("HTTP_EVENT_ERROR");
      break;
    default:
      break;
  }
  return ESP_OK;
}

void sendDataToAPI(String jsonData) {
  if (!wifiConnected) {
    Serial.println("Cannot send data - no WiFi connection");
    return;
  }

  // Clear response buffer
  httpResponseBuffer = "";

  // Configure HTTP client
  esp_http_client_config_t config = {};
  config.url = apiEndpoint;
  config.event_handler = http_event_handler;
  config.cert_pem = ISRG_Root_X1;
  config.timeout_ms = HTTP_TIMEOUT;
  config.method = HTTP_METHOD_POST;

  esp_http_client_handle_t client = esp_http_client_init(&config);
  
  if (client == NULL) {
    Serial.println("Failed to initialize HTTP client");
    return;
  }

  // Set headers
  esp_http_client_set_header(client, "Content-Type", "application/json");
  
  // Set POST data
  esp_http_client_set_post_field(client, jsonData.c_str(), jsonData.length());

  Serial.println("Sending data to: " + String(apiEndpoint));
  Serial.println("Payload: " + jsonData);

  // Perform HTTP request
  esp_err_t err = esp_http_client_perform(client);

  if (err == ESP_OK) {
    int httpResponseCode = esp_http_client_get_status_code(client);
    Serial.println("HTTP Response Code: " + String(httpResponseCode));
    Serial.println("Response: " + httpResponseBuffer);

    // Accept both 200 and 201 as success codes
    if (httpResponseCode == 200 || httpResponseCode == 201) {
      Serial.println("✓ Data sent successfully!");
      consecutiveFailures = 0;

      // Parse response to check for vape detection
      DynamicJsonDocument responseDoc(1024);
      DeserializationError error = deserializeJson(responseDoc, httpResponseBuffer);

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
    } else {
      Serial.println("✗ Unexpected HTTP response code");
      consecutiveFailures++;
    }
  } else {
    Serial.print("✗ HTTP request failed: ");
    Serial.println(esp_err_to_name(err));
    
    if (err == ESP_ERR_TIMEOUT) {
      // Handle timeout error specifically
      Serial.println("✗ HTTP request timed out");
      Serial.println("The server is taking too long to respond. Check your network or server status.");
      delay(3000); // Wait 3 seconds before retrying
    }
    consecutiveFailures++;
  }

  // Cleanup
  esp_http_client_cleanup(client);

  // Handle consecutive failures
  if (consecutiveFailures >= MAX_FAILURES) {
    Serial.println("Too many consecutive failures. Restarting WiFi...");
    WiFi.disconnect();
    delay(2000);
    consecutiveFailures = 0;
    connectToWiFi();
  }
}

float calculateAQI(float pm25, float pm10) {
  // Simplified AQI calculation based on PM2.5 and PM10
  float aqi25 = (pm25 / 35.0) * 100;  // EPA standard for PM2.5
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
  for (uint8_t i = 0; i < 30; i++) {
    sum += buffer[i];
  }

  // Convert to 16-bit values
  uint16_t buffer_u16[15];
  for (uint8_t i = 0; i < 15; i++) {
    buffer_u16[i] = buffer[2 + i * 2 + 1];
    buffer_u16[i] += (buffer[2 + i * 2] << 8);
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
  blinkLED(10, 50); // Very fast blinking
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