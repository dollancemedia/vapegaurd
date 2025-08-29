/***************************************************************************
   This is a library for the BME680 gas, humidity, temperature & pressure sensor

   Designed specifically to work with the Adafruit BME680 Breakout
   ----> http://www.adafruit.com/products/3660

   These sensors use I2C or SPI to communicate, 2 or 4 pins are required
   to interface.

   Adafruit invests time and resources providing this open source code,
   please support Adafruit and open-source hardware by purchasing products
   from Adafruit!

   Written by Limor Fried & Kevin Townsend for Adafruit Industries.
   BSD license, all text above must be included in any redistribution
   
   CUSTOMIZED FOR ESP32-C6 DevKitC-1 PINOUT
   - I2C SDA: GPIO5
   - I2C SCL: GPIO6
   - BME680 Address: 0x76 (SDO connected to GND)
***************************************************************************/

#include <Wire.h>
#include <SPI.h>
#include <Adafruit_Sensor.h>
#include "Adafruit_BME680.h"

// ESP32-C6 I2C Pin Definitions (matching your pinout)
#define I2C_SDA 5           // BME680 SDI (I2C SDA)
#define I2C_SCL 6           // BME680 SCK (I2C SCL)

// BME680 I2C Address (0x76 when SDO connected to GND)
#define BME680_I2C_ADDR 0x76

#define SEALEVELPRESSURE_HPA (1013.25)

// Initialize BME680 with custom I2C pins
Adafruit_BME680 bme; // I2C

void setup() {
  Serial.begin(115200);
  while (!Serial);
  Serial.println(F("BME680 Custom Test for ESP32-C6"));
  Serial.println(F("Using I2C SDA=GPIO5, SCL=GPIO6"));

  // Initialize I2C with custom pins
  Wire.begin(I2C_SDA, I2C_SCL);
  
  // Initialize BME680 with specific I2C address
  if (!bme.begin(BME680_I2C_ADDR)) {
    Serial.println("Could not find a valid BME680 sensor, check wiring!");
    Serial.println("Expected connections:");
    Serial.println("BME680 VIN -> ESP32-C6 3V3");
    Serial.println("BME680 GND -> ESP32-C6 GND");
    Serial.println("BME680 SDI -> ESP32-C6 GPIO5 (SDA)");
    Serial.println("BME680 SCK -> ESP32-C6 GPIO6 (SCL)");
    Serial.println("BME680 CS  -> ESP32-C6 3V3 (for I2C mode)");
    Serial.println("BME680 SDO -> ESP32-C6 GND (sets I2C address to 0x76)");
    while (1);
  }

  Serial.println("BME680 sensor found and initialized!");

  // Set up oversampling and filter initialization
  bme.setTemperatureOversampling(BME680_OS_8X);
  bme.setHumidityOversampling(BME680_OS_2X);
  bme.setPressureOversampling(BME680_OS_4X);
  bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
  bme.setGasHeater(320, 150); // 320°C for 150 ms
  
  Serial.println("BME680 configuration complete!");
  Serial.println("Sensor readings will start in 3 seconds...");
  delay(3000);
}

void loop() {
  if (!bme.performReading()) {
    Serial.println("Failed to perform reading :(");
    return;
  }
  
  Serial.println("=== BME680 Sensor Readings ===");
  
  Serial.print("Temperature = ");
  Serial.print(bme.temperature);
  Serial.println(" °C");

  Serial.print("Pressure = ");
  Serial.print(bme.pressure / 100.0);
  Serial.println(" hPa");

  Serial.print("Humidity = ");
  Serial.print(bme.humidity);
  Serial.println(" %");

  Serial.print("Gas Resistance = ");
  Serial.print(bme.gas_resistance / 1000.0);
  Serial.println(" KOhms");

  Serial.print("Approx. Altitude = ");
  Serial.print(bme.readAltitude(SEALEVELPRESSURE_HPA));
  Serial.println(" m");

  // Additional air quality indication based on gas resistance
  float gasResistance = bme.gas_resistance / 1000.0;
  Serial.print("Air Quality: ");
  if (gasResistance > 50) {
    Serial.println("Good");
  } else if (gasResistance > 20) {
    Serial.println("Moderate");
  } else {
    Serial.println("Poor");
  }

  Serial.println("================================");
  Serial.println();
  
  delay(2000);
}