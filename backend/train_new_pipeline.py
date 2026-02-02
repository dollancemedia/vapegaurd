import os
import sys
import argparse
from datetime import datetime, timedelta, timezone
import random
import joblib
import numpy as np
from pymongo import MongoClient
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from typing import List, Dict, Any

# Add the app directory to sys.path so we can import our modules
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from feature_engine import FeatureEngine
from class_config import CLASS_ORDER, FEATURE_ORDER

# --- Configuration ---
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = "vape-alert"
COLLECTION_NAME = "events"  # Updated from 'readings' to match user DB

# --- Helper Functions ---

def get_db():
    client = MongoClient(MONGODB_URI)
    return client[DATABASE_NAME]

def fetch_all_samples(db, device_id=None, limit=None):
    """
    Fetches all raw sensor readings, sorted by timestamp.
    """
    query = {}
    if device_id:
        query["device_id"] = device_id
    
    cursor = db[COLLECTION_NAME].find(query).sort("timestamp", 1)
    if limit:
        cursor = cursor.limit(limit)
        
    samples = list(cursor)
    # Ensure timestamps are datetime objects and Fix Sensor Mapping
    valid_samples = []
    for s in samples:
        # 1. Parse Timestamp
        if isinstance(s.get('timestamp'), str):
            try:
                s['timestamp'] = datetime.fromisoformat(s['timestamp'].replace('Z', '+00:00'))
            except ValueError:
                continue # Skip invalid timestamps
        
        # 2. Fix Historical Data Mapping (PM1.0 was labeled as PM10.0)
        # If 'pm1' is missing but 'pm10' exists, assume it's the swapped data
        if s.get('pm1') is None and s.get('pm10') is not None:
            s['pm1'] = s['pm10']
            # We don't have real PM10, so set to None or approx (PM2.5 * 1.1?)
            # Setting to None allows FeatureEngine to handle it (likely 0.0 in vector)
            s['pm10'] = None 
            
        valid_samples.append(s)
    
    print(f"Fetched {len(valid_samples)} samples.")
    return valid_samples

def extract_windows(samples: List[Dict], event_starts: List[datetime], event_label: str, window_sec=25, is_normal=False, require_verified=False):
    """
    Extracts windows of data for feature calculation.
    
    Args:
        samples: List of all samples (sorted).
        event_starts: List of start times for this event class.
        event_label: The label to assign (e.g., "vape", "normal").
        window_sec: Duration of the event window.
        is_normal: If True, randomly samples windows from 'samples' that DO NOT overlap with event_starts.
        require_verified: If True, only selects windows where 'verified' is True (for Normal data).
    """
    X = []
    y = []
    
    # Pre-compute timestamps for fast lookup
    timestamps = [s['timestamp'] for s in samples]
    
    if is_normal:
        # Strategy for Normal:
        # Randomly pick N start times that are NOT within any known event window.
        # For this script, we'll generate roughly as many normal samples as we have total event samples (balanced),
        # or a fixed number if provided.
        
        # Define forbidden ranges (existing events)
        forbidden_ranges = []
        for start in event_starts:
            forbidden_ranges.append((start, start + timedelta(seconds=window_sec)))
            
        # Try to find valid windows
        num_attempts = 0
        # Strategy: Use more normal data but keep it balanced-ish. 
        # 12 events vs 1440 normal is 1:120 imbalance (hard).
        # We'll aim for ~10x-20x the number of positive events, or at least 200.
        target_count = max(len(event_starts) * 15, 200) 
        
        while len(X) < target_count and num_attempts < target_count * 50:
            num_attempts += 1
            # Pick random start index
            idx = random.randint(0, len(samples) - 100)
            
            # Check verified status if required
            if require_verified:
                # Check if the start sample is verified. 
                # Ideally check the whole window, but start sample is a good proxy if data is continuous.
                if not samples[idx].get('verified'):
                    continue

            t_start = timestamps[idx]
            t_end = t_start + timedelta(seconds=window_sec)
            
            # Check overlap
            is_clean = True
            for f_start, f_end in forbidden_ranges:
                # If window overlaps with forbidden range
                if not (t_end < f_start or t_start > f_end):
                    is_clean = False
                    break
            
            if is_clean:
                # Extract window
                # Need baseline (previous 10s) and event (next 20s)
                # FeatureEngine expects: baseline_samples, event_samples
                
                # Baseline: [t_start - 10s, t_start]
                # Event: [t_start, t_start + 20s]
                
                # Find indices
                # This is O(N) per window, optimization possible but fine for offline script
                base_samples = [s for s in samples if t_start - timedelta(seconds=10) <= s['timestamp'] < t_start]
                evt_samples = [s for s in samples if t_start <= s['timestamp'] <= t_start + timedelta(seconds=20)]
                
                if len(evt_samples) > 2:
                    feats = FeatureEngine.compute_features(base_samples, evt_samples)
                    
                    # Convert feats dict to list in correct order
                    feat_vector = [feats.get(k, 0.0) if feats.get(k) is not None else 0.0 for k in FEATURE_ORDER]
                    
                    X.append(feat_vector)
                    y.append(event_label)
                    
                    # Add to forbidden so we don't pick same spot twice
                    forbidden_ranges.append((t_start, t_end))

    else:
        # Strategy for Known Events
        for start in event_starts:
            # Baseline: [t_start - 10s, t_start]
            base_samples = [s for s in samples if start - timedelta(seconds=10) <= s['timestamp'] < start]
            # Event: [t_start, t_start + 20s]
            evt_samples = [s for s in samples if start <= s['timestamp'] <= start + timedelta(seconds=20)]
            
            if len(evt_samples) > 2:
                feats = FeatureEngine.compute_features(base_samples, evt_samples)
                feat_vector = [feats.get(k, 0.0) if feats.get(k) is not None else 0.0 for k in FEATURE_ORDER]
                X.append(feat_vector)
                y.append(event_label)
            else:
                print(f"Warning: Skipped event at {start} due to insufficient samples ({len(evt_samples)})")

    return X, y

# --- Main Training Logic ---

def main():
    # ==========================================
    # 1. USER CONFIGURATION
    # ==========================================
    
    # [OPTIONAL] Only train on data after this date (ISO format)
    # Useful if you have old "junk" data in your DB.
    # Set to None to use ALL data.
    # Example: "2023-10-27T08:00:00"
    TRAINING_DATA_START_DATE = None 

    # Paste your vape event start times here (ISO format)
    # Example: "2023-10-27T10:00:00"
    MANUAL_VAPE_TIMES = [
        "2025-12-31T00:42:09",
        "2025-12-31T00:49:05",
        "2025-12-31T00:54:23",
        "2025-12-31T00:57:10",
        "2025-12-31T01:02:11",
        "2025-12-31T01:04:06",
        "2025-12-31T01:11:37",
        "2025-12-31T01:18:06",
        "2025-12-31T01:21:22",
        "2025-12-31T01:25:47",
        "2025-12-31T01:27:57",
        "2025-12-31T01:41:28"
    ]
    # ==========================================

    parser = argparse.ArgumentParser(description="Train Vape Detection Models")
    parser.add_argument("--vape-times", nargs="+", help="List of vape start timestamps (ISO format)", default=[])
    args = parser.parse_args()
    
    db = get_db()
    
    # 2. Fetch All Data
    print(f"Connecting to MongoDB at: {MONGODB_URI.split('@')[-1] if '@' in MONGODB_URI else 'localhost'}")
    print("Fetching data from MongoDB...")
    
    # Apply time filter if configured
    query_limit = {}
    
    # NOTE: We fetch ALL data to ensure we get the vape events (which might not be verified).
    # We will filter for 'verified=True' in the Python logic for Normal samples.
     
    if TRAINING_DATA_START_DATE:
        try:
            start_dt = datetime.fromisoformat(TRAINING_DATA_START_DATE.replace('Z', '+00:00'))
            query_limit["timestamp"] = {"$gte": start_dt.isoformat()} 
            print(f"Filtering data: Only using samples after {start_dt}")
        except Exception as e:
            print(f"Warning: Invalid TRAINING_DATA_START_DATE ({e}). Using all data.")

    # Modified fetch logic inline since we need query support
    print(f"Querying MongoDB with: {query_limit}")
    cursor = db[COLLECTION_NAME].find(query_limit).sort("timestamp", 1)
    raw_samples = list(cursor)
    
    # Ensure timestamps are datetime objects and Fix Mappings
    samples = []
    for s in raw_samples:
        if 'timestamp' not in s:
            continue
            
        # 1. Timestamp
        if isinstance(s.get('timestamp'), str):
            try:
                s['timestamp'] = datetime.fromisoformat(s['timestamp'].replace('Z', '+00:00'))
            except ValueError:
                continue
        
        # Ensure it is now a datetime
        if not isinstance(s['timestamp'], datetime):
            continue
            
        # Force UTC if naive (PyMongo returns naive datetimes by default)
        if s['timestamp'].tzinfo is None:
            s['timestamp'] = s['timestamp'].replace(tzinfo=timezone.utc)

        # 2. Fix Historical Data Mapping (PM1.0 was labeled as PM10.0)
        if s.get('pm1') is None and s.get('pm10') is not None:
            s['pm1'] = s['pm10']
            s['pm10'] = None
            
        samples.append(s)

    print(f"Fetched {len(samples)} total samples.")

    if not samples:
        print("No data found in MongoDB matching criteria. Exiting.")
        return

    # 3. Parse Event Times
    vape_starts = []
    
    # Combine command line args and manual list
    all_time_strings = args.vape_times + MANUAL_VAPE_TIMES
    
    if not all_time_strings:
        print("Error: No vape event times provided!")
        print("Please edit MANUAL_VAPE_TIMES in the script OR pass them via command line:")
        print("python train_new_pipeline.py --vape-times 2023-10-27T10:00:00 2023-10-27T12:00:00")
        return

    for t_str in all_time_strings:
        try:
            # Handle Z or no Z
            t_str_clean = t_str.replace('Z', '+00:00')
            dt = datetime.fromisoformat(t_str_clean)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            vape_starts.append(dt)
        except ValueError:
            print(f"Invalid timestamp format: {t_str}")
    
    print(f"Loaded {len(vape_starts)} vape events.")

    # DEBUG TIMESTAMPS
    if samples:
        print(f"Sample[0] timestamp: {samples[0]['timestamp']} (tz={samples[0]['timestamp'].tzinfo})")
    if vape_starts:
        print(f"VapeStart[0]: {vape_starts[0]} (tz={vape_starts[0].tzinfo})")

    # 4. Extract Features
    print("Extracting features...")
    X_vape, y_vape = extract_windows(samples, vape_starts, "vape", is_normal=False)
    print(f"Extracted {len(X_vape)} vape events.")
    
    # Treat everything else as Normal candidates
    # Pass vape_starts so we don't pick normal samples from vape windows
    # REQUIRE VERIFIED=TRUE for normal data as per user instruction
    X_norm, y_norm = extract_windows(samples, vape_starts, "normal", is_normal=True, require_verified=True)
    print(f"Extracted {len(X_norm)} normal events.")
    
    X = X_vape + X_norm
    y = y_vape + y_norm
    
    if not X:
        print("No training data generated. Check your timestamps.")
        return

    # Convert to arrays
    X = np.array(X)
    y = np.array(y)
    
    # 4. Train Models
    print(f"Training on {len(X)} samples with {len(FEATURE_ORDER)} features...")
    
    # Train Test Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # --- XGBoost ---
    print("\nTraining XGBoost...")
    # Calculate sample weights to handle imbalance
    from sklearn.utils.class_weight import compute_sample_weight
    sample_weights = compute_sample_weight(class_weight='balanced', y=y_train)
    
    # Encode labels to 0, 1, 2... for XGBoost strictness
    from sklearn.preprocessing import LabelEncoder
    le = LabelEncoder()
    y_train_enc = le.fit_transform(y_train)
    y_test_enc = le.transform(y_test)
    
    xgb = XGBClassifier(
        eval_metric='mlogloss', 
    )
    
    xgb.fit(X_train, y_train_enc, sample_weight=sample_weights)
    print("XGBoost Accuracy:", xgb.score(X_test, y_test_enc))
    
    # HACK: Overwrite classes_ with the actual string labels so ensemble_predictor knows what 0/1 mean!
    # XGBoost usually stores integers [0, 1] in classes_ when trained on integers.
    # We replace it with ['normal', 'vape'] (or whatever le.classes_ is).
    # XGBClassifier.classes_ is sometimes read-only, so we use a custom attribute
    xgb.custom_classes_ = le.classes_
    print(f"Patched XGBoost custom_classes_: {xgb.custom_classes_}")
    
    # --- Random Forest ---
    print("Training Random Forest...")
    # NOTE: We remove class_weight='balanced' because we are passing 'sample_weight' which is already balanced.
    rf = RandomForestClassifier(n_estimators=100, random_state=42)
    rf.fit(X_train, y_train, sample_weight=sample_weights)
    print("RF Accuracy:", rf.score(X_test, y_test))
    
    # --- KNN ---
    print("Training KNN...")
    from sklearn.neighbors import KNeighborsClassifier
    # Use 5 neighbors (or 3 if dataset is tiny)
    knn = KNeighborsClassifier(n_neighbors=5) 
    knn.fit(X_train, y_train) # KNN doesn't typically take sample_weight in fit, but supports it in some versions. Standard sklearn KNN does not use sample_weight for distance, unless using a custom metric. 
    # Actually, let's keep it simple.
    print("KNN Accuracy:", knn.score(X_test, y_test))
    
    # 5. Save Models
    models_dir = os.path.join(os.path.dirname(__file__), 'models')
    os.makedirs(models_dir, exist_ok=True)
    
    print(f"\nSaving models to {models_dir}...")
    joblib.dump(xgb, os.path.join(models_dir, 'xgb_model.joblib'))
    joblib.dump(rf, os.path.join(models_dir, 'rf_model.joblib'))
    joblib.dump(knn, os.path.join(models_dir, 'knn_model.joblib'))
    
    print("Done! Models are ready for the backend.")

if __name__ == "__main__":
    main()
