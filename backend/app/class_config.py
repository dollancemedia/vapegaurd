import os
from pathlib import Path

# Class order configuration for consistency across training and inference
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
    CLASSIFICATIONS = ["normal", "vape", "cologne", "hair spray", "cleaning"]

CLASS_ORDER = [CLASSIFICATIONS[1]] + CLASSIFICATIONS[2:] + [CLASSIFICATIONS[0], "other"]

# Model filenames
MODELS = {
    "xgb": "xgb_model.joblib",
    "rf": "rf_model.joblib",
    "knn": "knn_model.joblib"
}

# Feature order for model input (MUST MATCH TRAINING)
FEATURE_ORDER = [
    'pm1_start', 'pm25_start', 'pm10_start', 'humidity_start', 'gas_start', 'temp_start',
    'pm25_base', 'pm1_base', 'pm10_base', 'gas_base', 'humidity_base',
    'pm25_peak', 'pm1_peak', 'pm10_peak',
    'd_pm25_peak', 'd_pm1_peak', 'd_pm10_peak',
    't_to_pm25_peak_sec', 'pm25_rise_slope', 'pm25_auc_above_base',
    'r_pm1_pm25_start', 'r_pm1_pm10_start', 'r_pm1_pm25_peak', 'r_pm1_pm10_peak',
    'humidity_delta_20s', 'gas_delta_20s', 'humidity_slope_0_10s', 'gas_slope_0_10s',
    'pm25_std_last5s'
]
