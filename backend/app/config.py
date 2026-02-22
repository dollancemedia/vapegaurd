from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    MONGODB_URI: str
    DATABASE_NAME: str = "vape-alert"
    REDIS_URL: Optional[str] = None
    
    # Physics Thresholds
    D_PM25_SUS: float = 10.0      # Sudden jump in PM2.5
    SLOPE_SUS: float = 2.0        # Slope of PM2.5 rise
    
    # Time Windows (in seconds)
    BASELINE_WINDOW_SEC: int = 10
    CONFIRM_WINDOW_SEC: int = 20
    COOLDOWN_SEC: int = 20
    
    # EWMA Alpha (Smoothing factor for Phase 1 baseline)
    # Higher = follows data faster, Lower = more stable baseline
    EWMA_ALPHA: float = 0.1
    EWMA_ALPHA_CALIBRATION: float = 0.5 # Faster adaptation during startup

    # Slow baseline drift during IDLE to track multi-hour environmental changes
    # (e.g. humidity/PM shifts across the day in a bathroom)
    BASELINE_DRIFT_ALPHA: float = 0.005   # very slow nudge per sample
    BASELINE_QUIET_SEC: int = 180         # only drift after 3 min of no triggers

    # Uncertainty Thresholds
    MIN_TOP_PROB: float = 0.40  # Lowered from 0.60
    MIN_MARGIN: float = 0.00    # Lowered from 0.15

    # Startup handling
    WARMUP_DURATION_SEC: int = 90
    CALIBRATION_DURATION_SEC: int = 60
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
