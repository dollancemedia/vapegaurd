from fastapi import FastAPI
from app.routers.events import router as events_router

app = FastAPI(title="Vape/Fire Detection API")
app.include_router(events_router, prefix="/api/events", tags=["events"])
