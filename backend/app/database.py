import os
from app.config import settings

MONGODB_URI = getattr(settings, "MONGODB_URI", None) or os.getenv("MONGODB_URI")
DATABASE_NAME = getattr(settings, "DATABASE_NAME", "vape-alert")

# Use in-memory mock if URI points to localhost and mongod isn't running,
# or if mongomock-motor is explicitly requested via LOCAL_DEMO=1
_use_mock = os.getenv("LOCAL_DEMO", "0") == "1"

if _use_mock:
    from mongomock_motor import AsyncMongoMockClient
    client = AsyncMongoMockClient()
    print("[DB] Using in-memory mock MongoDB (LOCAL_DEMO=1)")
else:
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(MONGODB_URI) if MONGODB_URI else AsyncIOMotorClient()

db = client[DATABASE_NAME]
