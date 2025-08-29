/*********
  Rui Santos & Sara Santos - Random Nerd Tutorials
  Complete project details at https://RandomNerdTutorials.com/esp32-bme680-sensor-arduino/
  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files.
  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*********/

#include <Wire.h>
#include <SPI.h>
#include <Adafruit_Sensor.h>
#include "Adafruit_BME680.h"
#include <WiFi.h>
#include "ESPAsyncWebServer.h"
#include "PMS.h"

// Replace with your network credentials
const char* ssid = "sweethome";
const char* password = "rahul2008";

// I2C pin definitions for ESP32-C6
#define I2C_SDA 6
#define I2C_SCL 7

// PMS5003 pin definitions (using Serial)
// Serial uses GPIO1 (TX) and GPIO3 (RX) by default

//Uncomment if using SPI
/*#define BME_SCK 18
#define BME_MISO 19
#define BME_MOSI 23
#define BME_CS 5*/

Adafruit_BME680 bme; // I2C
//Adafruit_BME680 bme(BME_CS); // hardware SPI
//Adafruit_BME680 bme(BME_CS, BME_MOSI, BME_MISO, BME_SCK);

// PMS5003 sensor setup using Serial
PMS pms(Serial);

// Sensor status flags
bool bme680_available = false;
bool pms5003_available = false;

float temperature;
float humidity;
float pressure;
float gasResistance;
float pm1_0;
float pm2_5;
float pm10_0;

AsyncWebServer server(80);
AsyncEventSource events("/events");

unsigned long lastTime = 0;  
unsigned long timerDelay = 30000;  // send readings timer

void getBME680Readings(){
  if (!bme680_available) {
    temperature = 0.0;
    humidity = 0.0;
    pressure = 0.0;
    gasResistance = 0.0;
    return;
  }
  
  // Tell BME680 to begin measurement.
  unsigned long endTime = bme.beginReading();
  if (endTime == 0) {
    Serial1.println(F("Failed to begin reading :("));
    return;
  }
  if (!bme.endReading()) {
    Serial1.println(F("Failed to complete reading :("));
    return;
  }
  temperature = bme.temperature;
  pressure = bme.pressure / 100.0;
  humidity = bme.humidity;
  gasResistance = bme.gas_resistance / 1000.0;
}

void getPMS5003Readings(){
  if (!pms5003_available) {
    pm1_0 = 0.0;
    pm2_5 = 0.0;
    pm10_0 = 0.0;
    return;
  }
  
  PMS::DATA data;
  if (pms.read(data)) {
    pm1_0 = data.PM_AE_UG_1_0;
    pm2_5 = data.PM_AE_UG_2_5;
    pm10_0 = data.PM_AE_UG_10_0;
    pms5003_available = true; // Mark as working if we get data
    Serial1.println("PMS5003 data read successfully!");
  } else {
    Serial1.println("Failed to read PMS5003 data");
    pm1_0 = 0.0;
    pm2_5 = 0.0;
    pm10_0 = 0.0;
  }
}

String processor(const String& var){
  getBME680Readings();
  getPMS5003Readings();
  //Serial.println(var);
  if(var == "TEMPERATURE"){
    return String(temperature);
  }
  else if(var == "HUMIDITY"){
    return String(humidity);
  }
  else if(var == "PRESSURE"){
    return String(pressure);
  }
  else if(var == "GAS"){
    return String(gasResistance);
  }
  else if(var == "PM25"){
    return String(pm2_5);
  }
  else if(var == "PM10"){
    return String(pm10_0);
  }
  return String();
}

const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE HTML><html>
<head>
  <title>BME680 + PMS5003 Web Server</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.7.2/css/all.css" integrity="sha384-fnmOCqbTlWIlj8LyTjo7mOUStjsKC4pOpQbqyi7RrhN7udi9RwhKkMHpvLbHG9Sr" crossorigin="anonymous">
  <link rel="icon" href="data:,">
  <style>
    html {font-family: Arial; display: inline-block; text-align: center;}
    p {  font-size: 1.2rem;}
    body {  margin: 0;}
    .topnav { overflow: hidden; background-color: #4B1D3F; color: white; font-size: 1.7rem; }
    .content { padding: 20px; }
    .card { background-color: white; box-shadow: 2px 2px 12px 1px rgba(140,140,140,.5); }
    .cards { max-width: 700px; margin: 0 auto; display: grid; grid-gap: 2rem; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
    .reading { font-size: 2.8rem; }
    .card.temperature { color: #0e7c7b; }
    .card.humidity { color: #17bebb; }
    .card.pressure { color: #3fca6b; }
    .card.gas { color: #d62246; }
    .card.pm25 { color: #ff6b35; }
    .card.pm10 { color: #8b5a3c; }
  </style>
</head>
<body>
  <div class="topnav">
    <h3>BME680 + PMS5003 WEB SERVER</h3>
  </div>
  <div class="content">
    <div class="cards">
      <div class="card temperature">
        <h4><i class="fas fa-thermometer-half"></i> TEMPERATURE</h4><p><span class="reading"><span id="temp">%TEMPERATURE%</span> &deg;C</span></p>
      </div>
      <div class="card humidity">
        <h4><i class="fas fa-tint"></i> HUMIDITY</h4><p><span class="reading"><span id="hum">%HUMIDITY%</span> &percnt;</span></p>
      </div>
      <div class="card pressure">
        <h4><i class="fas fa-angle-double-down"></i> PRESSURE</h4><p><span class="reading"><span id="pres">%PRESSURE%</span> hPa</span></p>
      </div>
      <div class="card gas">
        <h4><i class="fas fa-wind"></i> GAS</h4><p><span class="reading"><span id="gas">%GAS%</span> K&ohm;</span></p>
      </div>
      <div class="card pm25">
        <h4><i class="fas fa-smog"></i> PM2.5</h4><p><span class="reading"><span id="pm25">%PM25%</span> μg/m³</span></p>
      </div>
      <div class="card pm10">
        <h4><i class="fas fa-cloud"></i> PM10</h4><p><span class="reading"><span id="pm10">%PM10%</span> μg/m³</span></p>
      </div>
    </div>
  </div>
<script>
if (!!window.EventSource) {
 var source = new EventSource('/events');
 
 source.addEventListener('open', function(e) {
  console.log("Events Connected");
 }, false);
 source.addEventListener('error', function(e) {
  if (e.target.readyState != EventSource.OPEN) {
    console.log("Events Disconnected");
  }
 }, false);
 
 source.addEventListener('message', function(e) {
  console.log("message", e.data);
 }, false);
 
 source.addEventListener('temperature', function(e) {
  console.log("temperature", e.data);
  document.getElementById("temp").innerHTML = e.data;
 }, false);
 
 source.addEventListener('humidity', function(e) {
  console.log("humidity", e.data);
  document.getElementById("hum").innerHTML = e.data;
 }, false);
 
 source.addEventListener('pressure', function(e) {
  console.log("pressure", e.data);
  document.getElementById("pres").innerHTML = e.data;
 }, false);
 
 source.addEventListener('gas', function(e) {
  console.log("gas", e.data);
  document.getElementById("gas").innerHTML = e.data;
 }, false);
 
 source.addEventListener('pm25', function(e) {
  console.log("pm25", e.data);
  document.getElementById("pm25").innerHTML = e.data;
 }, false);
 
 source.addEventListener('pm10', function(e) {
  console.log("pm10", e.data);
  document.getElementById("pm10").innerHTML = e.data;
 }, false);
}
</script>
</body>
</html>)rawliteral";

void setup() {
  // Initialize PMS5003 sensor using Serial
  Serial.begin(9600);   // GPIO1, GPIO3 (TX/RX pin on ESP32)
  Serial1.begin(9600);  // GPIO2 (D4 pin) for debug output
  delay(1000); // Give time for serial to initialize

  // Initialize I2C with custom pins for ESP32-C6
  Wire.begin(I2C_SDA, I2C_SCL);
  
  Serial1.println("Initializing PMS5003 sensor...");
  // Don't use passive mode - use active mode like your working code
  delay(2000); // Give sensor time to initialize
  
  // Test PMS5003 reading
  PMS::DATA testData;
  if (pms.read(testData)) {
    pms5003_available = true;
    Serial1.println("PMS5003 sensor initialized successfully!");
  } else {
    pms5003_available = false;
    Serial1.println("PMS5003 sensor not responding, server will continue without it...");
  }

  // Set the device as a Station and Soft Access Point simultaneously
  WiFi.mode(WIFI_AP_STA);
  
  // Set device as a Wi-Fi Station
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial1.println("Setting as a Wi-Fi Station..");
  }
  Serial1.print("Station IP Address: ");
  Serial1.println(WiFi.localIP());
  Serial1.println();

  // Init BME680 sensor
  if (!bme.begin()) {
    bme680_available = false;
    Serial1.println(F("Could not find a valid BME680 sensor, check wiring!"));
    Serial1.println(F("Server will continue without BME680..."));
  } else {
    bme680_available = true;
    Serial1.println(F("BME680 sensor initialized successfully!"));
    // Set up oversampling and filter initialization
    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
    bme.setGasHeater(320, 150); // 320*C for 150 ms
  }

  // Handle Web Server
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(200, "text/html", index_html, processor);
  });

  // Handle Web Server Events
  events.onConnect([](AsyncEventSourceClient *client){
    if(client->lastId()){
      Serial1.printf("Client reconnected! Last message ID that it got is: %u\n", client->lastId());
    }
    // send event with message "hello!", id current millis
    // and set reconnect delay to 1 second
    client->send("hello!", NULL, millis(), 10000);
  });
  server.addHandler(&events);
  server.begin();
}

void loop() {
  if ((millis() - lastTime) > timerDelay) {
    getBME680Readings();
    getPMS5003Readings();
    
    Serial1.println("=== SENSOR READINGS ===");
    Serial1.printf("BME680 Status: %s\n", bme680_available ? "WORKING" : "NOT DETECTED");
    Serial1.printf("PMS5003 Status: %s\n", pms5003_available ? "WORKING" : "NOT DETECTED");
    Serial1.println();
    
    Serial1.printf("Temperature = %.2f ºC \n", temperature);
    Serial1.printf("Humidity = %.2f % \n", humidity);
    Serial1.printf("Pressure = %.2f hPa \n", pressure);
    Serial1.printf("Gas Resistance = %.2f KOhm \n", gasResistance);
    Serial1.printf("PM2.5 = %.2f μg/m³ \n", pm2_5);
    Serial1.printf("PM10 = %.2f μg/m³ \n", pm10_0);
    Serial1.println("========================");
    Serial1.println();

    // Send Events to the Web Server with the Sensor Readings
    events.send("ping",NULL,millis());
    events.send(String(temperature).c_str(),"temperature",millis());
    events.send(String(humidity).c_str(),"humidity",millis());
    events.send(String(pressure).c_str(),"pressure",millis());
    events.send(String(gasResistance).c_str(),"gas",millis());
    events.send(String(pm2_5).c_str(),"pm25",millis());
    events.send(String(pm10_0).c_str(),"pm10",millis());
    
    lastTime = millis();
  }
}