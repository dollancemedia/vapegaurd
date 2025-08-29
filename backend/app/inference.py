import joblib
import pandas as pd
from pathlib import Path
from sklearn.pipeline import Pipeline
import logging

logger = logging.getLogger(__name__)

def predict(features: dict) -> dict:
    """
    Simple prediction function that works with ESP32 sensor data.
    Returns a basic prediction based on sensor thresholds.
    """
    try:
        # Extract sensor values with defaults
        gas_resistance = features.get("gas_resistance", -999)
        temperature = features.get("temperature", -999)
        humidity = features.get("humidity", -999)
        pm25 = features.get("pm25", -999)
        sound_level = features.get("sound_level", 0)
        
        # Simple rule-based prediction for now
        # This can be replaced with actual ML model later
        vape_indicators = 0
        confidence = 0.0
        
        # Check for vape indicators
        if gas_resistance != -999 and gas_resistance < 50:  # Low gas resistance indicates smoke
            vape_indicators += 1
            confidence += 0.3
            
        if pm25 != -999 and pm25 > 35:  # High PM2.5 indicates particles
            vape_indicators += 1
            confidence += 0.3
            
        if temperature != -999 and humidity != -999:
            if temperature > 25 and humidity > 60:  # Warm and humid conditions
                vape_indicators += 1
                confidence += 0.2
                
        if sound_level > 30:  # Sound activity
            confidence += 0.2
            
        # Determine prediction
        predicted_class = "vape" if vape_indicators >= 2 else "normal"
        confidence = min(confidence, 0.95)  # Cap confidence at 95%
        
        return {
            "predicted_class": predicted_class,
            "confidence": float(confidence),
            "vape_indicators": vape_indicators,
            "model_version": "rule_based_v1"
        }
        
    except Exception as e:
        logger.error(f"Error in prediction: {str(e)}")
        # Return safe default prediction
        return {
            "predicted_class": "normal",
            "confidence": 0.0,
            "vape_indicators": 0,
            "model_version": "fallback",
            "error": str(e)
        }
