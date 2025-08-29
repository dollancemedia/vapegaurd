/*
 * ESP32-C6 Simple Debug Test
 * Minimal code to test basic functionality
 */

// Pin Definitions
#define LED_PIN 8           // Status LED

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  delay(2000);  // Give time for serial to initialize
  
  Serial.println("\n=== ESP32-C6 Simple Debug Test ===");
  Serial.println("Starting basic functionality test...");
  
  // Initialize LED pin
  pinMode(LED_PIN, OUTPUT);
  
  Serial.println("LED pin initialized");
  Serial.println("Setup complete - entering main loop");
}

void loop() {
  static unsigned long lastPrint = 0;
  static int counter = 0;
  
  // Print debug message every 2 seconds
  if (millis() - lastPrint >= 2000) {
    counter++;
    Serial.println("Loop iteration: " + String(counter) + " - Time: " + String(millis()) + "ms");
    
    // Blink LED
    digitalWrite(LED_PIN, HIGH);
    delay(100);
    digitalWrite(LED_PIN, LOW);
    
    lastPrint = millis();
  }
  
  delay(100);  // Small delay
}