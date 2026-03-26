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
    "lr": "lr_model.joblib"
}

# Feature order for model input (MUST MATCH TRAINING)
# 35 features: original 29 + 6 new discriminative features
FEATURE_ORDER = [
    # ── Start values (6) ──
    'pm1_start', 'pm25_start', 'pm10_start', 'humidity_start', 'gas_start', 'temp_start',
    # ── Baselines (5) ──
    'pm25_base', 'pm1_base', 'pm10_base', 'gas_base', 'humidity_base',
    # ── Peaks (3) ──
    'pm25_peak', 'pm1_peak', 'pm10_peak',
    # ── Deltas (3) ──
    'd_pm25_peak', 'd_pm1_peak', 'd_pm10_peak',
    # ── Temporal (2) ──
    't_to_pm25_peak_sec', 'pm25_rise_slope',
    # ── AUC (1) ──
    'pm25_auc_above_base',
    # ── Ratios (4) ──
    'r_pm1_pm25_start', 'r_pm1_pm10_start', 'r_pm1_pm25_peak', 'r_pm1_pm10_peak',
    # ── Humidity/Gas dynamics (4) ──
    'humidity_delta_20s', 'gas_delta_20s', 'humidity_slope_0_10s', 'gas_slope_0_10s',
    # ── Stability (1) ──
    'pm25_std_last5s',
    # ── NEW: Cross-sensor interactions (3) ──
    'pressure_start',           # absolute pressure (altitude proxy, affects PM dispersion)
    'temp_humidity_ratio',      # vape aerosol signature: warm + humid
    'gas_temp_interaction',     # gas_resistance * temperature (VOC sensitivity varies with temp)
    # ── NEW: Decay dynamics (3) ──
    'pm25_decay_rate',          # how fast PM2.5 falls after peak (vape decays fast, fire slow)
    'gas_recovery_slope',       # gas resistance recovery after VOC exposure
    'pm_ratio_peak',            # pm25/pm10 at peak (vape ~0.7-0.9, fire ~0.3-0.5)
]
