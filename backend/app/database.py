import logging
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
import os

logger = logging.getLogger(__name__)

# Guard against missing or invalid env vars to prevent import-time crashes
MONGODB_URI = getattr(settings, "MONGODB_URI", None) or os.getenv("MONGODB_URI")
DATABASE_NAME = getattr(settings, "DATABASE_NAME", "vape-alert")

client = AsyncIOMotorClient(MONGODB_URI) if MONGODB_URI else AsyncIOMotorClient()
db = client[DATABASE_NAME]


async def create_indexes() -> None:
    """
    Create MongoDB indexes for frequently queried fields.
    Safe to call on every startup – MongoDB is idempotent for existing indexes.
    """
    try:
        # events collection
        await db.events.create_index([("timestamp", -1)])
        await db.events.create_index([("device_id", 1), ("timestamp", -1)])
        await db.events.create_index([("school", 1), ("timestamp", -1)])
        await db.events.create_index([("top_class", 1)])

        # samples collection
        await db.samples.create_index([("timestamp", -1)])
        await db.samples.create_index([("device_id", 1), ("timestamp", -1)])

        # devices collection – device_id must be unique
        await db.devices.create_index([("device_id", 1)], unique=True)
        await db.devices.create_index([("last_seen", -1)])

        logger.info("MongoDB indexes created/verified")
    except Exception as exc:
        logger.error(f"Failed to create MongoDB indexes: {exc}")
