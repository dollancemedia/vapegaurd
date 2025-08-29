# ESP32-C6 Vape Detection Hardware Wiring Guide

This guide provides detailed wiring instructions for building the vape detection hardware using the ESP32-C6 DevKitC-1.

## Components Required

### Main Components
- **ESP32-C6 DevKitC-1** - Main microcontroller
- **BME680** - Temperature, humidity, pressure, and gas sensor
- **PMS5003** - Particulate matter sensor (PM2.5, PM10)
- **MAX4466** - Electret microphone amplifier
- **LED** - Status indicator

### Additional Components
- Breadboard or PCB
- Jumper wires
- 220Ω resistor (for LED)
- 3.3V power supply (if needed)
- Capacitors for power filtering (optional)

## ESP32-C6 DevKitC-1 Pinout Reference

Based on the official Espressif pinout:
- **GPIO0-GPIO23** - General purpose I/O
- **GPIO6, GPIO7** - Default I2C (SDA, SCL)
- **GPIO4, GPIO5** - UART pins (used for PMS5003)
- **ADC pins** - GPIO0-GPIO6 can be used as analog inputs

## Detailed Wiring Connections

### 1. BME680 Sensor (I2C Connection)

The BME680 is connected via I2C for temperature, humidity, pressure, and gas resistance measurements.

```
BME680 Pin    →    ESP32-C6 Pin    →    Description
─────────────────────────────────────────────────────
VIN           →    3V3              →    3.3V Power
GND           →    GND              →    Ground
SDI           →    GPIO5            →    I2C SDA
SCK           →    GPIO6            →    I2C SCL
CS            →    3V3              →    Chip Select (High for I2C)
SDO           →    GND              →    I2C Address Select (0x76)
```

### 2. PMS5003 Particulate Matter Sensor (8-Wire Connection)

The PMS5003 uses Hardware UART communication. Here's the complete 8-pin wiring:

```
PMS5003 Pin   →    ESP32-C6 Pin    →    Description
─────────────────────────────────────────────────────
Pin 1 (VCC)   →    5V              →    Power Supply (5V preferred)
Pin 2 (GND)   →    GND             →    Ground
Pin 3 (SET)   →    3V3             →    Set Pin (High = Active)
Pin 4 (RX)    →    GPIO16 (TX)     →    PMS RX ← ESP TX (Hardware UART)
Pin 5 (TX)    →    GPIO17 (RX)     →    PMS TX → ESP RX (Hardware UART)
Pin 6 (RESET) →    3V3             →    Reset Pin (High = Normal)
Pin 7 (NC)    →    Not Connected   →    No Connection
Pin 8 (NC)    →    Not Connected   →    No Connection
```

**Important Notes for PMS5003:**
- The PMS5003 prefers 5V power but can work with 3.3V
- SET pin should be connected to 3.3V to keep sensor active
- RESET pin should be connected to 3.3V for normal operation
- Pins 7 and 8 are not connected (NC)

### 3. MAX4466 Microphone Amplifier

```
MAX4466 Pin   →    ESP32-C6 Pin    →    Description
─────────────────────────────────────────────────────
VCC           →    3V3             →    3.3V Power
GND           →    GND             →    Ground
OUT           →    GPIO0 (ADC)     →    Analog Output
```

### 4. Status LED

```
LED Connection →    ESP32-C6 Pin    →    Description
─────────────────────────────────────────────────────
Anode (+)     →    GPIO8           →    LED Control Pin
Cathode (-)   →    GND (via 220Ω)  →    Ground through resistor
```



## Complete Wiring Summary

| Component | ESP32-C6 Pin | Function | Notes |
|-----------|--------------|----------|---------|
| BME680 VIN | 3V3 | Power | 3.3V |
| BME680 GND | GND | Ground | |
| BME680 SDI | GPIO5 | I2C SDA | |
| BME680 SCK | GPIO6 | I2C SCL | |
| BME680 CS | 3V3 | Chip Select | High for I2C |
| BME680 SDO | GND | I2C Address | 0x76 |
| PMS5003 VCC | 5V/3V3 | Power | 5V preferred |
| PMS5003 GND | GND | Ground | |
| PMS5003 SET | 3V3 | Set Active | Keep high |
| PMS5003 RX | GPIO16 | Hardware UART TX | ESP TX → PMS RX |
| PMS5003 TX | GPIO17 | Hardware UART RX | PMS TX → ESP RX |
| PMS5003 RESET | 3V3 | Reset | Keep high |
| MAX4466 VCC | 3V3 | Power | 3.3V |
| MAX4466 GND | GND | Ground | |
| MAX4466 OUT | GPIO0 | ADC Input | Analog signal |
| LED Anode | GPIO8 | Digital Out | Via 220Ω resistor |
| LED Cathode | GND | Ground | |

## Power Considerations

1. **ESP32-C6**: Powered via USB or external 3.3V
2. **BME680**: 3.3V (low power)
3. **PMS5003**: 5V preferred (can work with 3.3V but may be less accurate)
4. **MAX4466**: 3.3V
5. **LED**: 3.3V with current limiting resistor

## Assembly Steps

### Step 1: Prepare the Breadboard
1. Place ESP32-C6 DevKitC-1 on breadboard
2. Connect power rails (3.3V and GND)

### Step 2: Connect BME680 (I2C)
1. Connect VIN to 3.3V rail
2. Connect GND to ground rail
3. Connect SDI to GPIO5 (I2C SDA)
4. Connect SCK to GPIO6 (I2C SCL)
5. Connect CS to 3.3V (enables I2C mode)
6. Connect SDO to GND (sets I2C address to 0x76)

### Step 3: Connect PMS5003 (UART)
1. Connect Pin 1 (VCC) to 5V or 3.3V
2. Connect Pin 2 (GND) to ground
3. Connect Pin 3 (SET) to 3.3V
4. Connect Pin 4 (RX) to GPIO16
5. Connect Pin 5 (TX) to GPIO17
6. Connect Pin 6 (RESET) to 3.3V
7. Leave Pins 7 and 8 unconnected

### Step 4: Connect MAX4466
1. Connect VCC to 3.3V
2. Connect GND to ground
3. Connect OUT to GPIO0

### Step 5: Connect LED
1. Connect LED anode to GPIO8 (with 220Ω resistor)
2. Connect LED cathode to ground

## Code Configuration

The provided Arduino code is already configured for these pin assignments:

```cpp
// Pin Definitions (already in code)
#define PMS_RX 17           // PMS5003 RX pin (Hardware UART)
#define PMS_TX 16           // PMS5003 TX pin (Hardware UART)
#define MIC_PIN A0          // MAX4466 microphone (GPIO0)
#define LED_PIN 8           // Status LED
// BME680 uses I2C pins (SDA=GPIO5, SCL=GPIO6)
```

## Testing Procedure

1. **Power Test**: Verify all components receive proper voltage
2. **I2C Test**: Check BME680 communication
3. **UART Test**: Verify PMS5003 data reception
4. **ADC Test**: Test microphone readings
5. **Output Test**: Test LED functionality
6. **WiFi Test**: Verify network connectivity
7. **API Test**: Test data transmission to backend

## Troubleshooting

### Common Issues:
1. **BME680 not found**: Check I2C wiring (SDA=GPIO5, SCL=GPIO6) and pull-up resistors
2. **PMS5003 no data**: Verify UART pins and power supply
3. **WiFi connection fails**: Check credentials and signal strength
4. **API errors**: Verify endpoint URL and network connectivity

### Debug Commands:
- Use Serial Monitor at 115200 baud
- Check sensor initialization messages
- Monitor WiFi connection status
- Verify JSON payload format

## Next Steps

1. **Single Prototype**: Build and test one complete unit
2. **Zigbee Integration**: Plan for mesh network implementation
3. **Enclosure Design**: Create weatherproof housing
4. **Power Optimization**: Implement sleep modes for battery operation
5. **Calibration**: Fine-tune sensor thresholds for your environment

This wiring guide provides everything needed to build your first vape detection prototype. Start with the single WiFi-connected unit to validate the system before implementing the Zigbee mesh network architecture.