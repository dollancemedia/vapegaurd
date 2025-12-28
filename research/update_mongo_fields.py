import os
from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne
import sys

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../backend/.env'))

MONGO_URI = os.getenv("MONGODB_URI")
if not MONGO_URI:
    print("Error: MONGODB_URI not found in environment variables.")
    sys.exit(1)

def update_collection(db, collection_name):
    print(f"\nProcessing collection: {collection_name}")
    collection = db[collection_name]
    
    # Sort by timestamp to ensure deterministic ordering of event IDs
    # Assuming timestamp is present and sortable
    cursor = collection.find().sort("timestamp", 1)
    
    updates = []
    event_counter = 1
    doc_count = 0
    
    for doc in cursor:
        doc_count += 1
        # Check existing fields (handling potential different types, though usually boolean)
        vape_start = doc.get('vape_start')
        normal_start = doc.get('normal_start')
        
        # Determine event_type and event_start
        e_type = "none"
        e_start = False
        
        # Explicit check for truthiness
        if vape_start:
            e_type = "vape"
            e_start = True
        elif normal_start:
            e_type = "normal"
            e_start = True
            
        e_id = None
        if e_start:
            e_id = f"evt_{event_counter}"
            event_counter += 1
            
        # Prepare update operation
        set_fields = {
            "event_type": e_type,
            "event_start": e_start
        }
        
        update_op = {}
        
        if e_id:
            set_fields["event_id"] = e_id
            update_op["$set"] = set_fields
        else:
            update_op["$set"] = set_fields
            # If not a start event, ensure event_id is removed if it existed
            update_op["$unset"] = {"event_id": ""}
            
        updates.append(UpdateOne({"_id": doc["_id"]}, update_op))
        
        # Batch updates in chunks of 1000 to avoid memory issues with large collections
        if len(updates) >= 1000:
            result = collection.bulk_write(updates)
            print(f"  Processed batch: {result.modified_count} modified")
            updates = []

    # Process remaining updates
    if updates:
        result = collection.bulk_write(updates)
        print(f"  Processed final batch: {result.modified_count} modified")
        
    print(f"Finished {collection_name}. Total docs scanned: {doc_count}. Total events identified: {event_counter - 1}")

def main():
    try:
        client = MongoClient(MONGO_URI)
        db_name = os.getenv("DATABASE_NAME", "vape-alert")
        db = client[db_name]
        print(f"Connected to database: {db.name}")
        
        collections_to_update = ["research-events", "research-ais"]
        
        for col in collections_to_update:
            if col in db.list_collection_names():
                update_collection(db, col)
            else:
                print(f"Warning: Collection '{col}' not found in database.")
                
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
