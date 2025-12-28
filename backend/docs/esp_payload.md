# ESP Sensor Ingestion

Use HTTP POST to send sensor readings to the FastAPI backend. Two equivalent endpoints are available:

- `http://<server>:8000/api/sensors/data`
- `http://<server>:8000/api/data` (legacy prefix)

On Vercel, the URL is typically:

- `https://<your-vercel-app>.vercel.app/api/sensors/data`

Required headers:

- `Content-Type: application/json`
- Optional: `Accept: application/json`

Payload fields (all numeric values may be strings; server coerces them):

```
{
  "device_id": "esp-1",
  "humidity": 48,
  "pm25": 12,
  "pm10": 20,
  "gas_resistance": 85,
  "sound_level": 35,
  "temperature": 24,
  "timestamp": "2025-01-01T12:00:00Z" // optional
}
```

Example Arduino (ESP32) snippet:

```cpp
#include <WiFi.h>
#include <HTTPClient.h>

void postReading() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin("http://192.168.1.100:8000/api/sensors/data"); // replace with your server IP
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"device_id\":\"esp-1\",";
  payload += "\"humidity\":48,";
  payload += "\"pm25\":12,";
  payload += "\"pm10\":20,";
  payload += "\"gas_resistance\":85,";
  payload += "\"sound_level\":35,";
  payload += "\"temperature\":24";
  payload += "}";

  int code = http.POST(payload);
  String resp = http.getString();
  Serial.printf("POST /api/sensors/data -> %d\n%s\n", code, resp.c_str());
  http.end();
}
```

Notes:

- Use your machine IP address instead of `localhost` for ESP devices.
- If you must use HTTPS (e.g., Vercel), use `WiFiClientSecure` and set certificates as needed.
- The backend broadcasts live updates on `/ws/events`; React dashboards will display new readings immediately.