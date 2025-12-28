from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
import os

# Guard against missing or invalid env vars to prevent import-time crashes
MONGODB_URI = getattr(settings, "MONGODB_URI", None) or os.getenv("MONGODB_URI")
DATABASE_NAME = getattr(settings, "DATABASE_NAME", "vape-alert")

client = AsyncIOMotorClient(MONGODB_URI) if MONGODB_URI else AsyncIOMotorClient()
db = client[DATABASE_NAME]
