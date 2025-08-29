# ESP32-C6 Vape Detection Hardware Setup Checklist

## 📋 Pre-Build Checklist

### Components Verification
- [ ] ESP32-C6 DevKitC-1 board
- [ ] BME680 sensor module (I2C version)
- [ ] PMS5003 particulate matter sensor with 8-pin connector
- [ ] MAX4466 electret microphone amplifier
- [ ] LED (any color) + 220Ω resistor
- [ ] Breadboard or PCB
- [ ] Jumper wires (male-to-male, male-to-female)
- [ ] USB-C cable for ESP32-C6
- [ ] Computer with Arduino IDE

### Software Preparation
- [ ] Arduino IDE installed
- [ ] ESP32 board package installed in Arduino IDE
- [ ] Required libraries installed:
  - [ ] WiFi library (built-in)
  - [ ] HTTPClient library (built-in)
  - [ ] ArduinoJson library
  - [ ] Adafruit BME680 library
  - [ ] Adafruit Unified Sensor library
  - [ ] SoftwareSerial library (built-in)

## 🔧 Build Steps

### Step 1: Power Setup
- [ ] Connect 3.3V rail on breadboard
- [ ] Connect GND rail on breadboard
- [ ] Test power rails with multimeter

### Step 2: ESP32-C6 Placement
- [ ] Place ESP32-C6 DevKitC-1 on breadboard
- [ ] Connect 3.3V and GND to power rails
- [ ] Test ESP32 power-on (LED should light up)

### Step 3: BME680 Connection (I2C)
- [ ] Connect BME680 VIN to 3.3V rail
- [ ] Connect BME680 GND to GND rail
- [ ] Connect BME680 SDI to GPIO5 (I2C SDA)
- [ ] Connect BME680 SCK to GPIO6 (I2C SCL)
- [ ] Connect BME680 CS to 3.3V (enables I2C mode)
- [ ] Connect BME680 SDO to GND (sets I2C address to 0x76)
- [ ] Verify connections with continuity tester

### Step 4: PMS5003 Connection (Hardware UART)
- [ ] Connect PMS5003 Pin 1 (VCC) to 5V rail
- [ ] Connect PMS5003 Pin 2 (GND) to GND rail
- [ ] Connect PMS5003 Pin 3 (SET) to 3.3V
- [ ] Connect PMS5003 Pin 4 (RX) to GPIO16 (ESP32 Hardware UART TX)
- [ ] Connect PMS5003 Pin 5 (TX) to GPIO17 (ESP32 Hardware UART RX)
- [ ] Connect PMS5003 Pin 6 (RESET) to 3.3V
- [ ] Leave Pins 7 and 8 (NC) unconnected
- [ ] Verify all 6 active connections

### Step 5: MAX4466 Microphone
- [ ] Connect MAX4466 VCC to 3.3V rail
- [ ] Connect MAX4466 GND to GND rail
- [ ] Connect MAX4466 OUT to GPIO0 (ADC capable pin)
- [ ] Test microphone with multimeter (should show varying voltage)

### Step 6: LED Indicator
- [ ] Connect LED anode to GPIO8 through 220Ω resistor
- [ ] Connect LED cathode to GND rail
- [ ] Test LED by briefly connecting anode to 3.3V



## 💻 Software Setup

### Step 8: Arduino IDE Configuration
- [ ] Open Arduino IDE
- [ ] Select Board: "ESP32C6 Dev Module"
- [ ] Select correct COM port
- [ ] Set upload speed to 115200

### Step 9: Code Upload
- [ ] Open `esp32_vape_sensor.ino`
- [ ] Update WiFi credentials:
  ```cpp
  const char* ssid = "Your_WiFi_Name";
  const char* password = "Your_WiFi_Password";
  ```
- [ ] Verify code compiles without errors
- [ ] Upload code to ESP32-C6
- [ ] Open Serial Monitor (115200 baud)

## 🧪 Testing Phase

### Step 10: Basic Functionality Test
- [ ] Power on ESP32-C6
- [ ] Check Serial Monitor for startup messages
- [ ] Verify WiFi connection success
- [ ] Confirm all sensors initialize properly:
  - [ ] BME680 sensor found
  - [ ] PMS5003 data reception
  - [ ] Microphone readings

### Step 11: Sensor Data Validation
- [ ] BME680 readings appear reasonable:
  - [ ] Temperature: 15-35°C (room temp range)
  - [ ] Humidity: 30-70% (typical indoor range)
  - [ ] Gas resistance: >50 KOhms (clean air)
- [ ] PMS5003 readings:
  - [ ] PM2.5: <15 μg/m³ (clean air)
  - [ ] PM10: <25 μg/m³ (clean air)
- [ ] Microphone responds to sound

### Step 12: Network Communication Test
- [ ] Verify JSON payload format in Serial Monitor
- [ ] Check API endpoint connectivity
- [ ] Confirm data appears in MongoDB (check web dashboard)
- [ ] Test alert functionality (LED blinks, buzzer sounds)

### Step 13: Alert System Test
- [ ] Test local alerts by covering BME680 (should trigger gas alert)
- [ ] Test LED blinking patterns
- [ ] Verify ML prediction responses from backend

## 🔍 Troubleshooting Guide

### Common Issues & Solutions

**WiFi Connection Fails:**
- [ ] Double-check SSID and password
- [ ] Verify WiFi signal strength
- [ ] Try different WiFi network
- [ ] Check for special characters in credentials

**BME680 Not Found:**
- [ ] Verify I2C wiring (SDA=GPIO6, SCL=GPIO7)
- [ ] Check power connections (3.3V, GND)
- [ ] Try different BME680 module
- [ ] Add I2C pull-up resistors (4.7kΩ)

**PMS5003 No Data:**
- [ ] Verify UART wiring (RX/TX crossed correctly)
- [ ] Check power supply (5V preferred over 3.3V)
- [ ] Ensure SET and RESET pins are high (3.3V)
- [ ] Wait 30 seconds for sensor warm-up

**API Connection Errors:**
- [ ] Verify internet connectivity
- [ ] Check API endpoint URL
- [ ] Test with local backend first
- [ ] Monitor network traffic

**No Sensor Readings:**
- [ ] Check all power connections
- [ ] Verify pin assignments match code
- [ ] Test each sensor individually
- [ ] Check for loose connections

## 📊 Expected Output

When working correctly, you should see Serial Monitor output like:

```
=== ESP32-C6 Vape Detection Sensor ===
Device ID: ESP32_C6_001
Location: School Bathroom - 2nd Floor
WiFi connected successfully!
IP address: 192.168.1.100

--- Reading Sensors ---
Gas Resistance: 85.2 KOhms
Temperature: 23.5°C
Humidity: 45.2%
Pressure: 1013.2 hPa
PM2.5: 8.5 μg/m³
PM10: 12.3 μg/m³
Sound Level: 15.2%
✓ Data sent successfully!
Prediction: normal (95.2% confidence)
```

## 🚀 Next Steps After Successful Prototype

1. **Calibration**: Fine-tune sensor thresholds for your environment
2. **Enclosure**: Design weatherproof housing
3. **Power Optimization**: Implement sleep modes for battery operation
4. **Zigbee Planning**: Prepare for mesh network implementation
5. **Multiple Units**: Build additional sensor nodes
6. **Field Testing**: Deploy in target environment

## 📞 Support

If you encounter issues:
1. Check this troubleshooting guide
2. Review wiring diagram carefully
3. Test components individually
4. Check Serial Monitor for error messages
5. Verify all connections with multimeter

Good luck with your vape detection system build! 🎯