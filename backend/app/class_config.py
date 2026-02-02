# Class order configuration for consistency across training and inference
CLASS_ORDER = [
    "vape",
    "shower",
    "hairspray",
    "cleaning",
    "normal",
    "other"
]

# Model filenames
MODELS = {
    "xgb": "xgb_model.joblib",
    "rf": "rf_model.joblib",
    "svc": "svc_model.joblib",  # Or linear_svc_model.joblib depending on what's available
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
