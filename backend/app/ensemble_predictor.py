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
                        print(f"Loaded {name} with classes: {model.classes_}")
                        # We allow subset of classes now, so no strict check here.
                            
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
        Handles models trained with different feature counts (backward compat).
        """
        # Build full feature vector from current FEATURE_ORDER
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
                # Handle models trained with fewer features (backward compat)
                n_expected = None
                if hasattr(model, 'n_features_in_'):
                    n_expected = model.n_features_in_
                elif hasattr(model, '_scaler') and hasattr(model._scaler, 'n_features_in_'):
                    n_expected = model._scaler.n_features_in_

                X_input = X
                if n_expected is not None and n_expected < X.shape[1]:
                    # Model was trained with fewer features — truncate to match
                    X_input = X[:, :n_expected]

                # Apply scaler if model has one (e.g. LogisticRegression)
                if hasattr(model, '_scaler'):
                    X_input = model._scaler.transform(X_input)

                # predict_proba returns [n_samples, n_classes]
                probs = model.predict_proba(X_input)[0]
                
                # Flexible Class Mapping
                model_classes = []
                if hasattr(model, "custom_classes_"):
                    model_classes = list(model.custom_classes_)
                elif hasattr(model, "classes_"):
                    model_classes = list(model.classes_)
                
                if model_classes:
                    # Create full vector initialized to 0
                    full_probs = np.zeros(len(CLASS_ORDER))
                    
                    for i, cls in enumerate(model_classes):
                        # Find where this class belongs in the master CLASS_ORDER
                        target_idx = -1
                        
                        if isinstance(cls, str):
                            if cls in CLASS_ORDER:
                                target_idx = CLASS_ORDER.index(cls)
                        elif isinstance(cls, (int, np.integer)):
                            # If int, assume it maps directly to CLASS_ORDER index
                            if 0 <= cls < len(CLASS_ORDER):
                                target_idx = int(cls)
                        
                        # Handle numpy str/int types just in case
                        elif str(cls) in CLASS_ORDER:
                             target_idx = CLASS_ORDER.index(str(cls))
                                
                        if target_idx != -1:
                            full_probs[target_idx] = probs[i]
                            
                    probs = full_probs # Use the mapped vector
                else:
                    # Fallback for models without classes_ metadata
                    if len(probs) != len(CLASS_ORDER):
                         print(f"Model {name} returned wrong prob shape: {len(probs)} and no metadata.")
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
