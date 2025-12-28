/*
  Blink Test for ESP32 Feather V2
  
  1. If the LED blinks -> Hardware is good.
  2. If Serial Monitor shows "LED ON/OFF" -> Chip is working (even if LED is broken).
  3. If "invalid header" persists -> It is 100% a Settings/Driver issue.
*/

// On Adafruit Feather V2, the red LED is on GPIO 13.
// We explicitly define it to be safe.
#define TEST_LED 13 

void setup() {
  // Start Serial for debugging
  Serial.begin(115200);
  delay(1000);
  Serial.println("=== BOOT SUCCESSFUL ===");
  Serial.println("Blink Test Starting...");

  pinMode(TEST_LED, OUTPUT);
}

void loop() {
  Serial.println("LED ON");
  digitalWrite(TEST_LED, HIGH);
  delay(1000);
  
  Serial.println("LED OFF");
  digitalWrite(TEST_LED, LOW);
  delay(1000);
}
