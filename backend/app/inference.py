import joblib
import pandas as pd
from pathlib import Path
from sklearn.pipeline import Pipeline

MODEL_PATH = Path(__file__).parent.parent / "models" / "xgb_model.joblib"
model: Pipeline = joblib.load(MODEL_PATH)

def predict(features: dict) -> dict:
    df = pd.DataFrame([{
        "humidity":      features["humidity"],
        "pm25":          features["pm25"],
        "particle_size": features["particle_size"],
        "volume_spike":  features["volume_spike"],
    }])
    proba = model.predict_proba(df)[0, 1]
    raw_label = model.predict(df)[0]
    return {
        "predicted_type": "vape" if int(raw_label) == 1 else "normal",
        "confidence":     float(proba),
    }
