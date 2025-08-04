from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from app.routers.events import router as events_router

app = FastAPI(title="Vape/Fire Detection API")

# CORS middleware to allow requests from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],            # or ["http://localhost:3000"] /  Vercel domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events_router, prefix="/api/events", tags=["events"])
