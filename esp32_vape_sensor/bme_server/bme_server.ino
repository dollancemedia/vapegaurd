#include "PMS.h"

// Use UART0 on pins RXD0=GPIO24, TXD0=GPIO25
HardwareSerial PMSSerial(0);
PMS pms(PMSSerial);
PMS::DATA data;

void setup() {
  Serial.begin(115200);  // USB debug console
  delay(300);

  // PMS UART runs at 9600 baud, 8N1
  PMSSerial.begin(9600, SERIAL_8N1, 24, 25);

  Serial.println("PMS5003 connected on RXD0=GPIO24, TXD0=GPIO25 @9600");
  Serial.println("Expect ~1 reading per second in streaming mode...");
}

void loop() {
  if (pms.read(data)) {
    Serial.print("PM1.0: ");
    Serial.print(data.PM_AE_UG_1_0);
    Serial.print("  PM2.5: ");
    Serial.print(data.PM_AE_UG_2_5);
    Serial.print("  PM10: ");
    Serial.println(data.PM_AE_UG_10_0);
  }
}