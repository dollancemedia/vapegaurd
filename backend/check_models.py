import os
import sys
import joblib
import numpy as np
import traceback

# MOCK ENV for Config
os.environ["MONGODB_URI"] = "mongodb://localhost:27017"

# Add app to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

try:
    from app.ensemble_predictor import EnsemblePredictor
    from app.class_config import CLASS_ORDER
except ImportError as e:
    print(f"Import Error: {e}")
    sys.exit(1)

def test_models():
    print("--- Testing Model Loading ---")
    ep = EnsemblePredictor()
    
    print(f"\nLoaded Models: {list(ep.models.keys())}")
    
    if not ep.models:
        print("ERROR: No models loaded!")
        # Debug paths
        print(f"Current CWD: {os.getcwd()}")
        print(f"Models Dir Checked: {ep.models_dir}")
        if os.path.exists(ep.models_dir):
            print(f"Contents: {os.listdir(ep.models_dir)}")
        else:
            print("Models dir does not exist.")
        return

    print("\n--- Testing Prediction ---")
    # Fake feature vector (all zeros)
    from app.config import settings
    from app.class_config import FEATURE_ORDER
    
    features = {k: 0.0 for k in FEATURE_ORDER}
    
    try:
        result = ep.predict(features)
        print("\nPrediction Result:")
        print(f"Top Class: {result['top_class']}")
        print(f"Status: {result['status']}")
        print(f"Probabilities: {result['probs']}")
        print(f"Per Model: {result['per_model']}")
        
        if result['status'] == 'uncertain' and result['top_prob'] == 1.0:
            print("\nWARNING: This looks like the Fallback Prediction (Models failed at runtime).")
            
    except Exception as e:
        print(f"Prediction Failed: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    test_models()
