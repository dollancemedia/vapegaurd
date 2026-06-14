// Minimal WiFi test for ESP32-C6-DevKitC-1
#include <WiFi.h>

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n=== WiFi Test ===");

  // Try to connect
  WiFi.mode(WIFI_STA);
  WiFi.begin("sweethome", "rahul2008");

  Serial.println("Connecting to sweethome...");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.printf(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("SUCCESS! IP: " + WiFi.localIP().toString());
    Serial.println("RSSI: " + String(WiFi.RSSI()) + " dBm");
    // Green LED
    rgbLedWrite(RGB_BUILTIN, 0, 255, 0);
  } else {
    Serial.printf("FAILED! Status: %d\n", WiFi.status());
    // Scan networks
    Serial.println("Scanning nearby networks...");
    int n = WiFi.scanNetworks();
    for (int i = 0; i < n; i++) {
      Serial.printf("  %s (RSSI: %d, Ch: %d)\n",
        WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i));
    }
    // Red LED
    rgbLedWrite(RGB_BUILTIN, 255, 0, 0);
  }
}

void loop() {
  delay(1000);
}
