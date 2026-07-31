import argparse
import os
import sys

# Allowed models and their corresponding friendly names
# Only models that actually exist in backend/models/ and match the current
# 35-feature FEATURE_ORDER. knn/svc/l_svm were removed: knn was a stale
# 29-feature build labelled clean_air/vape, and svc/linear_svc were never
# produced by the current training pipeline.
ALLOWED_MODELS = {
    "xgb": "XGBoost",
    "rf": "Random Forest",
    "lr": "Logistic Regression"
}

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "app", "model_config.py")

def update_config(model_type):
    content = f"""# This file is automatically updated by switch_model.py
# Do not edit manually unless you know what you are doing.

MODEL_TYPE = "{model_type}"
"""
    try:
        with open(CONFIG_PATH, "w") as f:
            f.write(content)
        print(f"Successfully switched model to: {ALLOWED_MODELS[model_type]} ({model_type})")
        print("The backend server should reload automatically if running in dev mode.")
    except Exception as e:
        print(f"Error updating config file: {e}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Switch the active AI model for inference.")
    parser.add_argument("model", help=f"The model to switch to. Options: {', '.join(ALLOWED_MODELS.keys())}")
    
    args = parser.parse_args()
    
    model_input = args.model.lower().strip()
    
    if model_input not in ALLOWED_MODELS:
        print(f"Error: '{model_input}' is not a valid model.")
        print(f"Available models: {', '.join(ALLOWED_MODELS.keys())}")
        sys.exit(1)
        
    update_config(model_input)

if __name__ == "__main__":
    main()
