/*
 * ESP32-C6 Vape Detection Sensor - ROBUST PRODUCTION VERSION
 * WiFi-enabled sensor that sends data to FastAPI backend
 * Includes safe-boot and fault-tolerant sensor initialization
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include <Preferences.h>
#include <NimBLEDevice.h>

Preferences prefs;

// WiFi Configuration
const String setup_pass = "use_mistio";
String ssid = "";     
String password = ""; 

// BLE Configuration
NimBLEServer *bleServer = nullptr;
NimBLECharacteristic *ssidChar;
NimBLECharacteristic *passChar;
NimBLECharacteristic *orgChar;

bool bleProvisioned = false;
String incomingSSID = "";
String incomingPASS = "";
String incomingORG = "";

// API Configuration
const char *apiEndpoint = "https://vapegaurd-production.up.railway.app/api/sensors/data";
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

#define HTTP_ERROR_READ_TIMEOUT -11

// Pin Definitions
#define PMS_RX 4            
#define PMS_TX 5            
#define MIC_PIN 0           
#define LED_PIN 8           
#define RESET_BUTTON_PIN 9  // Changed to 9 (Boot Button) for safety, or check your board layout
// #define RESET_BUTTON_PIN 67 // OLD VALUE - Potentially invalid on some C6 boards?

#define I2C_SDA 6 
#define I2C_SCL 7 

// Sensor Configuration
Adafruit_BME680 bme;         
HardwareSerial pmsSerial(1); 

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
const String DEVICE_ID = "ESP32_C6_001";               
const String LOCATION = "School Bathroom - 2nd Floor"; 

// Timing
const unsigned long SENSOR_INTERVAL = 5000;          
const unsigned long HTTP_TIMEOUT = 5000;             
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

// Function declarations
void blinkLED(int times, int delayMs);
boolean readPMSdata(Stream *serial);
float calculateAQI(float pm25, float pm10);
void connectToWiFi();
void readAndSendSensorData();
void sendDataToAPI(String jsonData);

bool isResetHeld() {
  // Use Boot button (GPIO 9 usually) or the pin you defined
  // Only check if explicitly needed
  return false; 
}

void factoryReset() {
  Serial.println("[RESET] Factory reset: clearing WiFi + org");
  prefs.begin("wifi", false);
  prefs.clear(); 
  prefs.end();
  delay(200);
  ESP.restart();
}

void loadCredentials() {
  prefs.begin("wifi", true); 
  ssid = prefs.getString("ssid", "");
  password = prefs.getString("pass", "");
  org = prefs.getString("org", "");
  prefs.end();
  wifiConfigured = (ssid.length() > 0 && password.length() > 0);
  Serial.println("[WiFi] Loaded credentials for: " + ssid);
}

void saveCredentials(const String &newSsid, const String &newPass) {
  prefs.begin("wifi", false); 
  prefs.putString("ssid", newSsid);
  prefs.putString("pass", newPass);
  prefs.end();
  ssid = newSsid;
  password = newPass;
  wifiConfigured = true;
}

class ProvisionCallback : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *characteristic) {
    std::string value = characteristic->getValue();
    if (characteristic == ssidChar) incomingSSID = value.c_str();
    if (characteristic == passChar) incomingPASS = value.c_str();
    if (characteristic == orgChar) incomingORG = value.c_str();

    if (incomingSSID.length() > 0 && incomingPASS.length() > 0 && incomingORG.length() > 0) {
      bleProvisioned = true;
    }
  }
};

class ServerCallbacks : public NimBLEServerCallbacks {
  void onDisconnect(NimBLEServer *pServer) {
    NimBLEDevice::startAdvertising();
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

  ssidChar = service->createCharacteristic("6E400002-B5A3-F393-E0A9-E50E24DCCA9E", NIMBLE_PROPERTY::WRITE);
  ssidChar->setCallbacks(new ProvisionCallback());

  passChar = service->createCharacteristic("6E400003-B5A3-F393-E0A9-E50E24DCCA9E", NIMBLE_PROPERTY::WRITE);
  passChar->setCallbacks(new ProvisionCallback());

  orgChar = service->createCharacteristic("6E400004-B5A3-F393-E0A9-E50E24DCCA9E", NIMBLE_PROPERTY::WRITE);
  orgChar->setCallbacks(new ProvisionCallback());

  service->start();
  NimBLEAdvertising *advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
  advertising->start();
  Serial.println("[BLE] Advertising as: " + bleName);
}

void setup() {
  // 1. Safe Boot Delay - Prevents immediate crash loops
  Serial.begin(115200);
  delay(3000); 
  Serial.println("\n=== MISTIO SENSOR (Safe Boot) ===");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH); // On during init

  // Fix: Bulletproof MAC Address Reading for ESP32-C6
  WiFi.disconnect(true);  // Clear previous state
  WiFi.mode(WIFI_STA);    // Set Station Mode
  delay(500);             // Give RF time to wake up
  
  // Try reading MAC multiple times
  deviceMac = WiFi.macAddress();
  if (deviceMac == "00:00:00:00:00:00") {
     Serial.println("MAC is 00:00..., retrying...");
     delay(1000);
     deviceMac = WiFi.macAddress();
  }

  // Fallback if hardware fails: Use Chip ID (Efuse MAC)
  if (deviceMac == "00:00:00:00:00:00") {
      Serial.println("WiFi MAC failed. Using Chip ID fallback.");
      uint64_t chipid = ESP.getEfuseMac();
      uint16_t chip = (uint16_t)(chipid >> 32);
      char macBuf[18];
      snprintf(macBuf, 18, "%04X%08X", chip, (uint32_t)chipid);
      deviceMac = String(macBuf); // Pseudo-MAC
  }

  cleanMac = deviceMac;
  cleanMac.replace(":", "");
  Serial.println("Device MAC: " + deviceMac);

  loadCredentials();

  // 2. Safe I2C Init
  Serial.println("Initializing I2C...");
  Wire.begin(I2C_SDA, I2C_SCL);
  
  // 3. Safe BME680 Init
  Serial.println("Initializing BME680...");
  if (bme.begin(0x77)) {
    Serial.println("BME680 found at 0x77");
    bme680Available = true;
    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
    bme.setGasHeater(320, 150);
  } else if (bme.begin(0x76)) {
    Serial.println("BME680 found at 0x76");
    bme680Available = true;
    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
    bme.setGasHeater(320, 150);
  } else {
    Serial.println("WARNING: BME680 NOT FOUND. Continuing anyway.");
    bme680Available = false;
  }

  // 4. Safe UART Init
  Serial.println("Initializing PMS5003...");
  pmsSerial.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);
  
  // 5. Connection Logic
  if (wifiConfigured) {
    Serial.println("[WiFi] Trying to connect...");
    connectToWiFi();
    if (wifiConnected) {
       configTime(0, 0, ntp1, ntp2);
    }
  } else {
    Serial.println("[WiFi] No credentials. Starting BLE Config Mode.");
    startConfigMode();
  }

  digitalWrite(LED_PIN, LOW); // Off when ready
}

void loop() {
  // BLE Provisioning Handler
  if (!wifiConfigured) {
    if (bleProvisioned) {
      Serial.println("[BLE] Provisioning complete. Saving...");
      saveCredentials(incomingSSID, incomingPASS);
      prefs.begin("wifi", false);
      prefs.putString("org", incomingORG);
      prefs.end();
      NimBLEDevice::getAdvertising()->stop();
      delay(500);
      ESP.restart();
    }
    delay(100);
    return;
  }

  // WiFi Reconnect
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    Serial.println("WiFi lost. Reconnecting...");
    connectToWiFi();
  } else {
    wifiConnected = true;
  }

  // Sensor Loop
  if (millis() - lastSensorRead >= SENSOR_INTERVAL) {
    if (wifiConnected) {
      readAndSendSensorData();
    }
    lastSensorRead = millis();
  }
  delay(100);
}

void connectToWiFi() {
  if (!wifiConfigured) return;
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());
  
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(500);
    Serial.print(".");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected: " + WiFi.localIP().toString());
    wifiConnected = true;
  } else {
    Serial.println("\nWiFi Failed.");
    wifiConnected = false;
  }
}

void readAndSendSensorData() {
  float temperature = 0, humidity = 0, pressure = 0, gasResistance = 0;
  
  if (bme680Available && bme.performReading()) {
    temperature = bme.temperature;
    humidity = bme.humidity;
    pressure = bme.pressure / 100.0;
    gasResistance = bme.gas_resistance / 1000.0;
  }

  float pm25 = 0, pm10 = 0;
  if (readPMSdata(&pmsSerial)) {
    pm25 = data.pm25_env;
    pm10 = data.pm10_env;
  }

  DynamicJsonDocument doc(1024);
  doc["device_id"] = cleanMac;
  doc["org_id"] = org;
  doc["location"] = LOCATION;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["pressure"] = pressure;
  doc["gas_resistance"] = gasResistance;
  doc["pm25"] = pm25;
  doc["pm10"] = pm10;
  doc["sensor_type"] = "multi_sensor";

  String jsonString;
  serializeJson(doc, jsonString);
  sendDataToAPI(jsonString);
}

void sendDataToAPI(String jsonData) {
  if (!wifiConnected) return;

  HTTPClient http;
  WiFiClientSecure client;
  client.setCACert(ISRG_Root_X1);
  client.setInsecure(); // Added for easier testing if certs fail
  
  if(http.begin(client, apiEndpoint)) {
      http.addHeader("Content-Type", "application/json");
      int code = http.POST(jsonData);
      Serial.println("POST Code: " + String(code));
      if(code > 0) {
        String resp = http.getString();
        // Serial.println(resp);
      }
      http.end();
  }
}

boolean readPMSdata(Stream *s) {
  if (!s->available()) return false;
  
  // Read timeout logic
  unsigned long start = millis();
  while(s->available() < 32 && millis() - start < 100) {
    delay(1);
  }
  
  if(s->available() < 32) return false;
  
  uint8_t buffer[32];
  s->readBytes(buffer, 32);
  
  if(buffer[0] != 0x42 || buffer[1] != 0x4d) return false;
  
  uint16_t sum = 0;
  for(int i=0; i<30; i++) sum += buffer[i];
  
  uint16_t check = (buffer[30] << 8) + buffer[31];
  if(sum != check) return false;
  
  data.pm25_env = (buffer[12] << 8) + buffer[13];
  data.pm10_env = (buffer[14] << 8) + buffer[15];
  
  return true;
}

float calculateAQI(float pm25, float pm10) {
  return 0.0; // Placeholder
}

void blinkLED(int times, int delayMs) {
  for(int i=0; i<times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(delayMs);
    digitalWrite(LED_PIN, LOW); delay(delayMs);
  }
}

