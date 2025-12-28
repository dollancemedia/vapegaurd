import os
from dotenv import load_dotenv
from pymongo import MongoClient
import sys

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../backend/.env'))

MONGO_URI = os.getenv("MONGODB_URI")
if not MONGO_URI:
    print("Error: MONGODB_URI not found in environment variables.")
    sys.exit(1)

def remove_fields(db, collection_name):
    print(f"\nProcessing collection: {collection_name}")
    collection = db[collection_name]
    
    # Unset the fields
    result = collection.update_many(
        {}, 
        {"$unset": {"vape_start": "", "normal_start": ""}}
    )
    
    print(f"  Modified {result.modified_count} documents (fields removed).")

def main():
    try:
        client = MongoClient(MONGO_URI)
        db_name = os.getenv("DATABASE_NAME", "vape-alert")
        db = client[db_name]
        print(f"Connected to database: {db.name}")
        
        collections_to_update = ["research-events", "research-ais"]
        
        for col in collections_to_update:
            if col in db.list_collection_names():
                remove_fields(db, col)
            else:
                print(f"Warning: Collection '{col}' not found in database.")
                
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
