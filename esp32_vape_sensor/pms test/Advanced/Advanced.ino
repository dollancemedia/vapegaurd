// Raw PMS5003 sniffer on GPIO5 (RX) / GPIO4 (TX)
HardwareSerial& PMSSerial = Serial1;

void setup() {
  Serial.begin(115200);
  delay(200);
  PMSSerial.begin(9600, SERIAL_8N1, /*RX=*/5, /*TX=*/4);
  Serial.println("Listening for PMS5003 frames... (look for 42 4D)");
}

void loop() {
  while (PMSSerial.available()) {
    uint8_t b = PMSSerial.read();
    Serial.printf("%02X ", b);
  }
}
