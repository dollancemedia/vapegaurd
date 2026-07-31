from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    MONGODB_URI: str
    DATABASE_NAME: str = "vape-alert"
    REDIS_URL: Optional[str] = None
    
    # Physics Thresholds
    D_PM25_SUS: float = 3.0       # BMV080 reports lower PM than PMS5003
    SLOPE_SUS: float = 0.5        # BMV080 lower magnitude slopes
    
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

    # Degenerate-window guard.
    # The current models were trained on ~10 vape events against 2 clean-air
    # windows, so they answer "vape" to almost any input — an all-zero vector
    # scores vape 0.58, and flat clean air scores 0.85. Until they are retrained
    # on balanced data, windows carrying no real rise are answered directly
    # instead of being handed to a model that cannot say "normal".
    # Phase 1 only opens an event when d_pm25 >= D_PM25_SUS (10.0), so a genuine
    # detection arrives here well above this floor; 2.0 is deliberately lenient.
    MIN_D_PM25_PEAK: float = 2.0

    # Startup handling
    WARMUP_DURATION_SEC: int = 90
    CALIBRATION_DURATION_SEC: int = 60
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
