import os
import joblib
import numpy as np
from typing import Dict, Any, List, Optional
from .config import settings
from .class_config import CLASS_ORDER, MODELS, FEATURE_ORDER

class EnsemblePredictor:
    def __init__(self, models_dir: str = "../models"):
        self.models = {}
        self.models_dir = models_dir
        self.load_models()

    def load_models(self):
        """Loads models from disk and validates them."""
        # Adjust path if running from app directory
        if not os.path.exists(self.models_dir):
            # Try finding models relative to this file
            base_path = os.path.dirname(os.path.abspath(__file__))
            # backend/app -> backend/models
            alt_path = os.path.join(base_path, "../models")
            if os.path.exists(alt_path):
                self.models_dir = alt_path
            else:
                 # Try backend/models from CWD (common in docker)
                 if os.path.exists("backend/models"):
                     self.models_dir = "backend/models"
            
        print(f"Loading models from {self.models_dir}...")
        
        for name, filename in MODELS.items():
            path = os.path.join(self.models_dir, filename)
            if os.path.exists(path):
                try:
                    model = joblib.load(path)
                    
                    # Validate classes if possible
                    if hasattr(model, "classes_"):
                        # Check if classes match CLASS_ORDER
                        # Note: sets might be unordered, so we convert to list and sort or check set equality
                        # Strict order check:
                        if list(model.classes_) != CLASS_ORDER:
                            print(f"WARNING: Model {name} classes {model.classes_} do not match {CLASS_ORDER}. Skipping.")
                            continue
                            
                    self.models[name] = model
                    print(f"Loaded {name}")
                except Exception as e:
                    print(f"Failed to load {name}: {e}")
            else:
                print(f"Model file not found: {path}")

        if not self.models:
            print("WARNING: No models loaded. Ensemble will fallback to default logic.")

    def predict(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """
        Runs the ensemble prediction.
        """
        # Convert features dict to ordered list/array
        # Handle None values -> 0.0 or mean? 
        # Ideally features shouldn't be None. If they are, impute with 0.
        feature_vector = []
        for key in FEATURE_ORDER:
            val = features.get(key)
            if val is None:
                val = 0.0
            feature_vector.append(val)
        
        # Reshape for sklearn (1, n_features)
        X = np.array([feature_vector])
        
        # Collect probabilities
        sum_probs = np.zeros(len(CLASS_ORDER))
        valid_models = 0
        per_model_results = {}

        for name, model in self.models.items():
            try:
                # predict_proba returns [n_samples, n_classes]
                probs = model.predict_proba(X)[0]
                
                # Verify shape
                if len(probs) != len(CLASS_ORDER):
                     print(f"Model {name} returned wrong prob shape: {len(probs)}")
                     continue
                
                sum_probs += probs
                valid_models += 1
                
                # Store per-model result
                per_model_results[name] = {
                    class_name: float(p) for class_name, p in zip(CLASS_ORDER, probs)
                }
                
            except Exception as e:
                print(f"Error predicting with {name}: {e}")

        # If no models worked
        if valid_models == 0:
            return self._fallback_prediction()

        # Average probabilities (Soft Voting)
        avg_probs = sum_probs / valid_models
        
        # Find top class
        top_idx = np.argmax(avg_probs)
        top_class = CLASS_ORDER[top_idx]
        top_prob = float(avg_probs[top_idx])
        
        # Calculate margin (diff between top and second)
        sorted_probs = np.sort(avg_probs)
        second_prob = float(sorted_probs[-2]) if len(sorted_probs) > 1 else 0.0
        margin = top_prob - second_prob
        
        # Uncertainty Logic
        status = "confirmed"
        if top_prob < settings.MIN_TOP_PROB or margin < settings.MIN_MARGIN:
            status = "uncertain"

        # Construct result
        probs_dict = {class_name: float(p) for class_name, p in zip(CLASS_ORDER, avg_probs)}
        
        return {
            "top_class": top_class,
            "probs": probs_dict,
            "top_prob": top_prob,
            "margin": margin,
            "status": status,
            "per_model": per_model_results,
            "confidence": top_prob * 100
        }

    def _fallback_prediction(self):
        """Returns a safe default if all models fail."""
        # Default to 'normal' or 'uncertain'
        return {
            "top_class": "normal",
            "probs": {c: (1.0 if c == "normal" else 0.0) for c in CLASS_ORDER},
            "top_prob": 1.0,
            "margin": 1.0,
            "status": "uncertain", # Flag as uncertain because models failed
            "per_model": {},
            "confidence": 0.0
        }

# Global instance
ensemble = EnsemblePredictor()
