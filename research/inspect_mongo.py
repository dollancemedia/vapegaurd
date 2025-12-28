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

def inspect_db():
    try:
        client = MongoClient(MONGO_URI)
        db = client["vape-alert"]
        
        print(f"Connected to database: {db.name}")
        print("-" * 30)
        
        collections = db.list_collection_names()
        print(f"Collections found: {collections}")
        print("-" * 30)
        
        for col_name in collections:
            print(f"\nCollection: {col_name}")
            collection = db[col_name]
            
            # Get a sample document
            doc = collection.find_one()
            if doc:
                print("Fields (keys) in sample document:")
                for key in doc.keys():
                    print(f"  - {key}")
                
                # Check total count
                count = collection.count_documents({})
                print(f"Total Documents: {count}")
            else:
                print("  (Empty collection)")
            print("-" * 20)
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    inspect_db()
