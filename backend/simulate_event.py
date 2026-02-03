import requests
import time
import random
import json
import sys
import uuid
from datetime import datetime, timezone

# Configuration
# DEFAULT_URL = "http://localhost:8000"
DEFAULT_URL = "https://vapegaurd-production.up.railway.app" # Default to production for user convenience? Or local?
# Let's default to local if running locally, but user might be testing prod.
# I'll default to local and tell them how to switch.
DEFAULT_URL = "http://localhost:8000"

DEVICE_ID = "test_simulator_01"
ORG_ID = "test_school"

def get_timestamp():
    return datetime.now(timezone.utc).isoformat()

def send_sample(url, pm25, pm1, pm10):
    payload = {
        "device_id": DEVICE_ID,
        "org_id": ORG_ID,
        "timestamp": get_timestamp(),
        "pm25": pm25,
        "pm1": pm1,
        "pm10": pm10,
        "humidity": 45.0 + random.uniform(-1, 1),
        "temperature": 22.0 + random.uniform(-0.5, 0.5),
        "gas_resistance": 10000 + random.uniform(-500, 500)
    }
    
    endpoint = f"{url}/api/sensors/data"
    try:
        response = requests.post(endpoint, json=payload)
        print(f"[{payload['timestamp']}] PM2.5: {pm25:.1f} | Status: {response.status_code} | Response: {response.json()}")
        return response.json()
    except Exception as e:
        print(f"Error sending data: {e}")
        return None

def run_simulation(base_url):
    print(f"Starting Vape Event Simulation on {base_url}...")
    print(f"Device ID: {DEVICE_ID}")
    
    # 1. Baseline (Idle) - 5 seconds
    print("\n--- Phase 1: Baseline (5s) ---")
    for _ in range(5):
        send_sample(base_url, pm25=2.0, pm1=1.0, pm10=2.0)
        time.sleep(1)

    # 2. Trigger (Sudden Spike)
    print("\n--- Phase 2: TRIGGER (Spike to 25.0) ---")
    # Jump from ~2 to ~25 (Delta 23 > 10.0 threshold)
    send_sample(base_url, pm25=25.0, pm1=12.0, pm10=26.0)
    time.sleep(1)

    # 3. Sustained (Confirming) - 25 seconds
    # The system needs ~20s of data to form a window
    print("\n--- Phase 3: Sustained Vape (25s) ---")
    for i in range(25):
        # Vape smoke fluctuates
        pm25 = 25.0 + random.uniform(-5, 10) # 20-35
        pm1 = pm25 * 0.6 # Rough ratio
        pm10 = pm25 * 1.1
        
        resp = send_sample(base_url, pm25, pm1, pm10)
        
        # Check if we got an event back
        if resp and resp.get("event_id"):
            print(f">>> EVENT DETECTED! ID: {resp['event_id']} State: {resp.get('state')}")
        
        time.sleep(1)

    print("\n--- Simulation Complete ---")
    print("Check your dashboard or database for the event.")

if __name__ == "__main__":
    target_url = DEFAULT_URL
    if len(sys.argv) > 1:
        target_url = sys.argv[1]
    
    run_simulation(target_url)
