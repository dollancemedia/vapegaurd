from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from app.routers.events import router as events_router
from app.routers.devices import router as devices_router
from app.routers.sensors import router as sensors_router

app = FastAPI(
    title="Vape/Fire Detection API",
    description="Real-time vape and fire detection system with ML predictions",
    version="1.0.0"
)

# CORS middleware to allow requests from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your Vercel domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Vape/Fire Detection API",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "events": "/api/events",
            "devices": "/api/devices",
            "sensors": "/api/sensors",
            "docs": "/docs"
        }
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": "2024-01-01T00:00:00Z"}

app.include_router(events_router, prefix="/api/events", tags=["events"])
app.include_router(devices_router, prefix="/api/devices", tags=["devices"])
app.include_router(sensors_router, prefix="/api/sensors", tags=["sensors"])
