from fastapi import FastAPI
from app.database import db
from app.inference import load_model
from pymongo.errors import PyMongoError
from datetime import datetime
from starlette.middleware.cors import CORSMiddleware
from app.routers.events import router as events_router
from app.routers.devices import router as devices_router
from app.routers.sensors import router as sensors_router
from app.dashboard import router as dashboard_router
from app.ws import router as ws_router
from app.routers.admin import router as admin_router

app = FastAPI(
    title="Vape/Fire Detection API",
    description="Real-time vape and fire detection system with ML predictions",
    version="1.0.0"
)

# CORS middleware with explicit origins for development and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://10.0.0.43:3000",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://10.0.0.43:3002",
        "https://mistio.app",
        "https://dashboard.mistio.app",
        "https://vapegaurd-x6wi.vercel.app",
        "https://vapegaurd-x6wi-4iihr8nqn-rahuls-projects-d9f10f54.vercel.app",
        "https://vapegaurd-production.up.railway.app"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"]
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
            "dashboard": "/dashboard",
            "docs": "/docs"
        }
    }

@app.get("/health")
async def health_check():
    """Lightweight health endpoint that never throws.
    Reports app reachability, DB connectivity, and model status.
    """
    db_connected = False
    model_status = "unknown"

    # Check DB connectivity (best-effort)
    try:
        # Attempt a trivial operation
        await db.command("ping")
        db_connected = True
    except Exception:
        db_connected = False

    # Check model availability
    try:
        model = load_model()
        model_status = "loaded" if model != "fallback" else "fallback"
        model_error = get_model_error() if model == "fallback" else None
    except Exception as e:
        model_status = "error"
        model_error = str(e)

    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "db_connected": db_connected,
        "model_status": model_status,
        "model_error": model_error
    }

app.include_router(events_router, prefix="/api/events", tags=["events"])
app.include_router(devices_router, prefix="/api/devices", tags=["devices"])
app.include_router(sensors_router, prefix="/api/sensors", tags=["sensors"])
# Add sensor-data endpoint at root level for legacy dashboard compatibility
app.include_router(sensors_router, prefix="/api", tags=["legacy"])
app.include_router(dashboard_router, tags=["dashboard"])
app.include_router(admin_router, prefix="/api")
# Include WebSocket router at root level to match frontend connection URL
app.include_router(ws_router)
