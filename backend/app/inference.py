import joblib
from pathlib import Path

MODEL_PATH = Path(__file__).parent.parent / "models" / "xgb_model.joblib"
model = joblib.load(MODEL_PATH)

def predict(features: dict) -> dict:
    arr = [[
        features["humidity"],
        features["pm25"],
        features["particle_size"],
        features["volume_spike"],
    ]]
    proba = model.predict_proba(arr)[0, 1]
    return {
        "predicted_type": "vape" if proba > 0.5 else "normal",
        "confidence": float(proba),
    }
