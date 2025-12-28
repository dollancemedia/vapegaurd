/*
  Simple BME680 + PMS5003 Sensor Reader for ESP32-C6
  Reads data from both sensors and displays on Serial Monitor
*/

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>

// BME680 sensor (I2C)
Adafruit_BME680 bme;

// PMS5003 data structure (custom)
struct pms5003data {
  uint16_t framelen;
  uint16_t pm10_standard, pm25_standard, pm100_standard;
  uint16_t pm10_env, pm25_env, pm100_env;
  uint16_t particles_03um, particles_05um, particles_10um, particles_25um, particles_50um, particles_100um;
  uint16_t unused;
  uint16_t checksum;
};

struct pms5003data data;

void setup() {
  // Initialize Serial for output
  Serial.begin(115200);
  while (!Serial) delay(10);
  
  Serial.println("BME680 + PMS5003 Sensor Test");
  
  // Initialize I2C for BME680
  Wire.begin(6, 7); // SDA=GPIO6, SCL=GPIO7
  
  // Initialize BME680
  if (!bme.begin()) {
    Serial.println("Could not find BME680 sensor!");
  } else {
    Serial.println("BME680 sensor found!");
    // Set up oversampling and filter
    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
    bme.setGasHeater(320, 150); // 320°C for 150 ms
  }
  
  // Initialize PMS5003 on Serial1
  Serial1.begin(9600, SERIAL_8N1, 4, 5); // RX=GPIO4, TX=GPIO5
  Serial.println("PMS5003 initialized");
  
  Serial.println("Setup complete!");
  Serial.println();
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

void loop() {
  Serial.println("=== Sensor Readings ===");
  
  // Read BME680
  if (bme.performReading()) {
    Serial.print("Temperature: ");
    Serial.print(bme.temperature);
    Serial.println(" °C");
    
    Serial.print("Humidity: ");
    Serial.print(bme.humidity);
    Serial.println(" %");
    
    Serial.print("Pressure: ");
    Serial.print(bme.pressure / 100.0);
    Serial.println(" hPa");
    
    Serial.print("Gas Resistance: ");
    Serial.print(bme.gas_resistance / 1000.0);
    Serial.println(" KOhms");
  } else {
    Serial.println("BME680 reading failed!");
  }
  
  // Read PMS5003
  if (readPMSdata(&Serial1)) {
    Serial.print("PM 1.0: ");
    Serial.print(data.pm10_standard);
    Serial.println(" ug/m3");
    
    Serial.print("PM 2.5: ");
    Serial.print(data.pm25_standard);
    Serial.println(" ug/m3");
    
    Serial.print("PM 10.0: ");
    Serial.print(data.pm100_standard);
    Serial.println(" ug/m3");
  } else {
    Serial.println("PMS5003 reading failed!");
  }
  
  Serial.println();
  delay(5000); // Wait 5 seconds
}