/*
 * Simple ESP32-C6 Test Sketch
 * Basic functionality test with serial output and LED blink
 */

#define LED_PIN 8  // Built-in LED on ESP32-C6 DevKitC-1

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  delay(1000);
  
  // Print startup message
  Serial.println("\n=== ESP32-C6 Test Sketch ===");
  Serial.println("Starting basic functionality test...");
  
  // Initialize LED pin
  pinMode(LED_PIN, OUTPUT);
  
  Serial.println("Setup complete!");
}

void loop() {
  // Print a message every 2 seconds
  Serial.println("ESP32-C6 is running! Uptime: " + String(millis()) + "ms");
  
  // Blink LED
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(1500);
}