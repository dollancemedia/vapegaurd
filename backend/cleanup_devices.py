import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "vape-alert")

def cleanup_devices():
    print(f"Connecting to MongoDB at {MONGODB_URI}...")
    client = MongoClient(MONGODB_URI)
    db = client[DATABASE_NAME]
    
    # List all unique devices before cleanup
    print("Fetching current devices...")
    unique_devices = db.events.distinct("device_id")
    print(f"Current devices found in events: {unique_devices}")
    
    # Devices to remove
    stale_devices = ['debug_script_1']
    
    print(f"\nTargeting stale devices for removal: {stale_devices}")
    
    total_deleted_events = 0
    total_deleted_metadata = 0

    for device_id in stale_devices:
        # Delete events
        result_events = db.events.delete_many({"device_id": device_id})
        count_events = result_events.deleted_count
        if count_events > 0:
            print(f"✅ Deleted {count_events} events for stale device: {device_id}")
            total_deleted_events += count_events
        else:
            print(f"⚠️ No events found for device: {device_id}")
            
        # Delete metadata
        result_metadata = db.device_metadata.delete_many({"device_id": device_id})
        count_metadata = result_metadata.deleted_count
        if count_metadata > 0:
            print(f"✅ Deleted {count_metadata} metadata entries for stale device: {device_id}")
            total_deleted_metadata += count_metadata
        else:
            print(f"⚠️ No metadata found for device: {device_id}")
            
    print(f"\nTotal events deleted: {total_deleted_events}")
    print(f"Total metadata entries deleted: {total_deleted_metadata}")
    
    # Verify remaining devices
    remaining_devices = db.events.distinct("device_id")
    print(f"Remaining devices: {remaining_devices}")

if __name__ == "__main__":
    cleanup_devices()
