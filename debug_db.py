import os
from pymongo import MongoClient

uri = os.getenv("MONGODB_URI")
print(f"Connecting to: {uri.split('@')[-1]}")
try:
    client = MongoClient(uri)
    dbs = client.list_database_names()
    print("Databases found:", dbs)
    
    for db_name in dbs:
        if db_name in ['local', 'admin', 'config']: continue
        db = client[db_name]
        cols = db.list_collection_names()
        print(f"\nCollections in '{db_name}': {cols}")
        for col in cols:
            count = db[col].count_documents({})
            print(f"  - {col}: {count} docs")
            if count > 0:
                print("    Sample doc:", db[col].find_one())
except Exception as e:
    print(f"Error: {e}")
