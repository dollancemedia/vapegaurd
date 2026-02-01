import joblib
import pandas as pd
from pathlib import Path
from sklearn.pipeline import Pipeline
import logging
import os

base_path = Path(__file__).resolve().parent.parent
class_path = "classifications.txt"
class_path = base_path / class_path
CLASSIFICATIONS = []
if os.path.exists(class_path):
    with open(class_path, "r") as file:
        for line in file:
            CLASSIFICATIONS.append(line.strip())
else:
    print(f"file \"{class_path}\" not found")
    CLASSIFICATIONS = ["normal", "vape"]

logger = logging.getLogger(__name__)

# Default configuration
MODEL_TYPE = "xgb"
try:
    from .model_config import MODEL_TYPE as _MT
    MODEL_TYPE = _MT
except ImportError:
    logger.warning("Could not import MODEL_TYPE from .model_config, using default 'xgb'")
except Exception as e:
    logger.warning(f"Error loading model config: {e}, using default 'xgb'")

# Global variable to store the loaded model
_model = None
_load_error = None

def check_type(test):
    if test and test != "none":
        for i in range(len(CLASSIFICATIONS)):
            if test == CLASSIFICATIONS[i]:
                return i

def get_model_error():
    """Return the error message if model loading failed."""
    return _load_error

def load_model():
    """
    Load the trained XGBoost model from disk.
    """
    global _model, _load_error
    if _model is None:
        try:
            if MODEL_TYPE == "knn":
                filename = "knn_model.joblib"
                model_name = "KNN"
            elif MODEL_TYPE == "svc":
                filename = "svc_model.joblib"
                model_name = "SVC"
            elif MODEL_TYPE == "l_svm":
                filename = "linear_svc_model.joblib"
                model_name = "Linear SVM"
            elif MODEL_TYPE == "rf":
                filename = "rf_model.joblib"
                model_name = "Random Forest"
            else:
                filename = "xgb_model.joblib"
                model_name = "XGBoost"

            model_path = Path(__file__).parent.parent / "models" / filename
            if model_path.exists():
                _model = joblib.load(model_path)
                logger.info(f"{model_name} model loaded successfully from {model_path}")
                _load_error = None
            else:
                msg = f"Model file not found at {model_path}"
                logger.warning(f"{msg}, using rule-based fallback")
                _model = "fallback"
                _load_error = msg
        except Exception as e:
            msg = f"Error loading XGBoost model: {str(e)}"
            logger.error(f"{msg}, using rule-based fallback")
            _model = "fallback"
            _load_error = msg
    return _model

def reload_model():
    """
    Force reload the model from disk.
    Useful after retraining the model.
    """
    global _model
    _model = None
    logger.info("Model cache cleared, reloading...")
    return load_model()

def _coerce_number(value, default):
    try:
        if value is None:
            return default
        if isinstance(value, (int, float)):
            return value
        if isinstance(value, str):
            # Try float first to handle decimals
            try:
                f = float(value)
                # Return int if it is an integer value
                return int(f) if f.is_integer() else f
            except Exception:
                return default
        return default
    except Exception:
        return default

def predict(features: dict) -> dict:
    """
    Predict using the trained XGBoost model or rule-based fallback.
    Maps ESP32 sensor data to model features and returns prediction.
    """
    try:
        model = load_model()
        
        # Extract and coerce sensor values to numeric types
        # ESP32 sends: gas_resistance, temperature, humidity, pm25, pm10, sound_level
        # Model expects: humidity, pm25, particle_size, volume_spike

        humidity = _coerce_number(features.get("humidity"), -999)
        pm25 = _coerce_number(features.get("pm25"), -999)
        gas_resistance = _coerce_number(features.get("gas_resistance"), -999)
        sound_level = _coerce_number(features.get("sound_level"), 0)
        mic_available = bool(features.get("mic_available", True))
        temperature = _coerce_number(features.get("temperature"), -999)
        
        # Map ESP32 data to model features
        # particle_size: derived from gas resistance (lower resistance = larger particles)
        particle_size = 400 - (gas_resistance * 2) if gas_resistance != -999 else 200
        particle_size = max(100, min(400, particle_size))  # Clamp to reasonable range
        
        # volume_spike: use sound level as proxy for volume changes, guard if mic unavailable
        volume_spike = sound_level if (mic_available and sound_level > 0) else 0
        
        # Use actual model if available
        if model != "fallback" and model is not None:
            try:
                # Prepare data for model
                model_features = pd.DataFrame([{
                    'humidity': humidity if humidity != -999 else 50,
                    'pm25': pm25 if pm25 != -999 else 10,
                    'particle_size': float(particle_size),
                    'volume_spike': float(volume_spike)
                }])
                
                # Get prediction and probability
                prediction = model.predict(model_features)[0]
                probabilities = model.predict_proba(model_features)[0]
                
                prediction_class = ""
                for i in range(len(CLASSIFICATIONS)):
                    if prediction == i:
                        predicted_class = CLASSIFICATIONS[i]
                # Ensure we have valid probabilities
                if len(probabilities) >= 2:
                    confidence = float(probabilities[prediction]) * 100  # Probability of vape class
                else:
                    # Fallback if probabilities are not as expected
                    confidence = 75.0 if predicted_class == "vape" else 25.0
                
                return {
                    "predicted_class": predicted_class,
                    "confidence": round(confidence, 2),
                    "model_version": f"{MODEL_TYPE}_v1",
                    "features_used": {
                        "humidity": humidity,
                        "pm25": pm25,
                        "particle_size": particle_size,
                        "volume_spike": volume_spike
                    }
                }
            except Exception as model_error:
                logger.error(f"Error using {MODEL_TYPE} model: {str(model_error)}, falling back to rules")
                # Fall through to rule-based prediction
        
        # Rule-based fallback prediction
        vape_indicators = 0
        confidence = 0.0
        
        # Check for vape indicators
        if gas_resistance != -999 and gas_resistance < 50:  # Low gas resistance indicates smoke
            vape_indicators += 1
            confidence += 30
            
        if pm25 != -999 and pm25 > 35:  # High PM2.5 indicates particles
            vape_indicators += 1
            confidence += 30
            
        if temperature != -999 and humidity != -999:
            if temperature > 25 and humidity > 60:  # Warm and humid conditions
                vape_indicators += 1
                confidence += 20
                
        if mic_available and sound_level > 30:  # Sound activity only if mic present
            confidence += 20
            
        # Determine prediction
        predicted_class = "vape" if vape_indicators >= 2 else "normal"
        confidence = min(confidence, 95)  # Cap confidence at 95%
        
        return {
            "predicted_class": predicted_class,
            "confidence": float(confidence),
            "vape_indicators": vape_indicators,
            "model_version": "rule_based_fallback_v1"
        }
        
    except Exception as e:
        logger.error(f"Error in prediction: {str(e)}")
        # Return safe default prediction
        return {
            "predicted_class": "normal",
            "confidence": 0.0,
            "vape_indicators": 0,
            "model_version": "error_fallback",
            "error": str(e)
        }
