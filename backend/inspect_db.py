import os
from pymongo import MongoClient
import json
from datetime import datetime

# User provided URI
URI = "mongodb+srv://admin:PSYCHgoonbait67@vape-alert.xntahp3.mongodb.net/?appName=vape-alert"
DB_NAME = "vape-alert"
COLL_NAME = "events"

def default(o):
    if isinstance(o, (datetime)):
        return o.isoformat()
    return str(o)

try:
    client = MongoClient(URI)
    db = client[DB_NAME]
    coll = db[COLL_NAME]
    
    count = coll.count_documents({})
    print(f"Total documents: {count}")
    
    doc = coll.find_one()
    print("Sample Document:")
    print(json.dumps(doc, indent=2, default=default))
    
    # Check for 'verified' field
    verified_count = coll.count_documents({"verified": True})
    print(f"Verified (bool true): {verified_count}")
    
    verified_str_count = coll.count_documents({"verified": "true"})
    print(f"Verified (string 'true'): {verified_str_count}")

except Exception as e:
    print(f"Error: {e}")
