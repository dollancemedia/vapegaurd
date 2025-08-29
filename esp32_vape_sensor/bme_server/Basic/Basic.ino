#include "PMS.h"

// Comment out PMS for now to test basic serial communication
// PMS pms(Serial2);
// PMS::DATA data;

// Test counter for debugging
int testCounter = 0;
bool loopbackTest = true; // Set to false to test PMS5003 directly

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("=== ESP32-C6 SIMPLE LOOPBACK TEST ===");
  Serial.println("Using GPIO16 (TX) and GPIO17 (RX) - U0TXD/U0RXD pins");
  Serial.println("Connect jumper wire: GPIO16 <-> GPIO17");
  Serial.println();
  
  // Initialize Serial2 with GPIO16 (TX) and GPIO17 (RX)
  Serial2.begin(9600, SERIAL_8N1, 17, 16);
  Serial.println("Serial2 initialized: RX=GPIO17, TX=GPIO16");
  Serial.println("Ready for loopback test...");
  Serial.println();
}

void loop()
{
  testCounter++;
  
  if (loopbackTest) {
    Serial.println("=== LOOPBACK TEST ===");
    Serial.println("Sending test bytes: 0xAA, 0xBB, 0xCC");
    
    // Clear any existing data
    while (Serial2.available()) {
      Serial2.read();
    }
    
    // Send test data
    Serial2.write(0xAA);
    Serial2.write(0xBB);
    Serial2.write(0xCC);
    
    delay(100); // Wait for data transmission
    
    Serial.print("Test #");
    Serial.print(testCounter);
    Serial.print(": Bytes available: ");
    Serial.println(Serial2.available());
    
    if (Serial2.available() > 0) {
      Serial.print("SUCCESS! Received: ");
      while (Serial2.available()) {
        byte b = Serial2.read();
        Serial.print("0x");
        Serial.print(b, HEX);
        Serial.print(" ");
      }
      Serial.println();
      Serial.println("GPIO16/17 working! Now connect PMS5003:");
      Serial.println("PMS5003 TX -> GPIO17, PMS5003 RX -> GPIO16");
    } else {
      Serial.println("FAILED: No loopback data received");
      Serial.println("Check: Jumper wire GPIO16 <-> GPIO17");
      Serial.println("Check: Board selection (ESP32C6 Dev Module)");
    }
    
    delay(3000);
  } else {
    // Original PMS5003 test (commented out for now)
    Serial.println("=== PMS5003 TEST ===");
    Serial.println("PMS5003 test disabled - enable after loopback test passes");
    delay(3000);
  }
  
  Serial.println("=========================");
  Serial.println();
}