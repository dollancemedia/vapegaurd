import os
import pymongo
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import joblib
import xgboost as xgb
from dotenv import load_dotenv
from datetime import datetime, timedelta

# --- CONSTANTS ---
INTERVAL_SECONDS = 60
AI_COLORS = {
    'XGBoost': 'purple',
    'Random Forest': 'orange',
    'KNN': 'blue',
    'SVC': 'cyan',
    'Linear SVM': 'magenta'
}
# -----------------

# Load environment variables from backend/.env
env_path = os.path.join(os.path.dirname(__file__), '..', 'backend', '.env')
load_dotenv(env_path)

def get_database():
    """Connect to MongoDB"""
    mongo_uri = os.getenv("MONGODB_URI")
    db_name = os.getenv("DATABASE_NAME", "vape-alert")
    
    if not mongo_uri:
        raise ValueError("MONGODB_URI not found in environment variables")
        
    client = pymongo.MongoClient(mongo_uri)
    return client[db_name]

def load_models():
    """Load all 5 AI models from backend/models"""
    models = {}
    model_dir = os.path.join(os.path.dirname(__file__), '..', 'backend', 'models')
    
    files = {
        'XGBoost': 'xgb_model.joblib',
        'Random Forest': 'rf_model.joblib',
        'KNN': 'knn_model.joblib',
        'SVC': 'svc_model.joblib',
        'Linear SVM': 'linear_svc_model.joblib'
    }
    
    print("Loading AI models...")
    for name, filename in files.items():
        path = os.path.join(model_dir, filename)
        if os.path.exists(path):
            try:
                models[name] = joblib.load(path)
                print(f"Loaded {name}")
            except Exception as e:
                print(f"Failed to load {name}: {e}")
        else:
            print(f"Model file not found: {filename}")
            
    return models

def prepare_features(df):
    """
    Transform raw sensor data into model features.
    Matches logic in backend/app/inference.py
    """
    # Create a copy to avoid SettingWithCopy warnings
    features = pd.DataFrame()
    
    # 1. Humidity (default 50)
    features['humidity'] = df['humidity'].fillna(50)
    
    # 2. PM2.5 (default 10)
    features['pm25'] = df['pm25'].fillna(10)
    
    # 3. Particle Size (derived from gas_resistance)
    # particle_size = 400 - (gas_resistance * 2)
    # Clamped between 100 and 400
    gas_res = df['gas_resistance'].fillna(-999)
    particle_size = 400 - (gas_res * 2)
    # Apply logic: if gas_res is missing (-999), set to default? 
    # In inference.py: if gas_resistance != -999 else 200
    # Vectorized approach:
    particle_size = np.where(gas_res == -999, 200, particle_size)
    features['particle_size'] = np.clip(particle_size, 100, 400)
    
    # 4. Volume Spike (sound_level, default 0)
    # Assuming sound_level might not exist in df, check first
    if 'sound_level' in df.columns:
        features['volume_spike'] = df['sound_level'].fillna(0)
    else:
        features['volume_spike'] = 0.0
        
    return features

def parse_timestamp(ts_val):
    """Helper to safely parse timestamps"""
    if isinstance(ts_val, str):
        try:
            return datetime.fromisoformat(ts_val.replace('Z', '+00:00'))
        except ValueError:
            return None
    return ts_val

def fetch_episodes(collection_name):
    """
    Fetch data episodes based on start events from specified collection.
    Returns a list of dictionaries:
    {
        'type': 'vape' or 'normal',
        'start_time': datetime,
        'data': DataFrame
    }
    """
    db = get_database()
    collection = db[collection_name]
    
    # 1. Find all start events
    print(f"Finding start events in {collection_name}...")
    start_events = list(collection.find({
        "event_start": True
    }).sort("timestamp", 1))
    
    episodes = []
    
    for event in start_events:
        start_ts = parse_timestamp(event.get("timestamp"))
        if not start_ts:
            continue
            
        end_ts = start_ts + timedelta(seconds=INTERVAL_SECONDS)
        
        # Determine type
        episode_type = event.get("event_type")
        if episode_type not in ["vape", "normal"]:
            continue
            
        # Re-query using datetime objects if stored as date, or string if stored as string.
        if isinstance(event["timestamp"], str):
            start_str = event["timestamp"]
            end_str = end_ts.isoformat().replace('+00:00', 'Z')
            query = {"timestamp": {"$gte": start_str, "$lte": end_str}}
        else:
            query = {"timestamp": {"$gte": start_ts, "$lte": end_ts}}

        interval_data = []
        interval_cursor = collection.find(query).sort("timestamp", 1)
        
        for doc in interval_cursor:
            ts = parse_timestamp(doc.get("timestamp"))
            if not ts:
                continue
                
            # Calculate relative time in seconds
            relative_seconds = (ts - start_ts).total_seconds()
            
            temp_c = doc.get("temperature")
            temp_f = (temp_c * 9/5) + 32 if temp_c is not None else None
            
            entry = {
                "relative_time": relative_seconds,
                "temperature": temp_f,
                "humidity": doc.get("humidity"),
                "pm25": doc.get("pm25"),
                "gas_resistance": doc.get("gas_resistance")
            }
            if "sound_level" in doc:
                entry["sound_level"] = doc["sound_level"]
                
            interval_data.append(entry)
            
        if interval_data:
            df = pd.DataFrame(interval_data)
            episodes.append({
                "type": episode_type,
                "start_time": start_ts,
                "data": df
            })
            
    return episodes

def calculate_stats(episodes):
    """
    Aggregate episodes into statistical bands (fan chart data).
    Returns a dict with interpolated percentiles for each metric and type.
    """
    # Group by type
    grouped = {'vape': [], 'normal': []}
    for ep in episodes:
        grouped[ep['type']].append(ep['data'])
    
    stats = {} 
    
    # Create a common time grid (e.g., every 1 second)
    time_grid = np.linspace(0, INTERVAL_SECONDS, num=INTERVAL_SECONDS+1)
    
    metrics = ['temperature', 'humidity', 'pm25', 'gas_resistance']
    
    for etype, dfs in grouped.items():
        if not dfs:
            continue
            
        stats[etype] = {}
        
        for col in metrics:
            values_matrix = []
            for df in dfs:
                # Ensure sorted by time
                df = df.sort_values('relative_time')
                
                # Interpolate to common grid
                if not df.empty:
                    # Handle missing columns safely
                    if col in df.columns:
                        interp_vals = np.interp(time_grid, df['relative_time'], df[col])
                        values_matrix.append(interp_vals)
            
            if not values_matrix:
                continue
                
            values_matrix = np.array(values_matrix)
            
            # Calculate Percentiles: 10, 20, 30, 40, 50, 60, 70, 80, 90
            percentiles = np.nanpercentile(values_matrix, [10, 20, 30, 40, 50, 60, 70, 80, 90], axis=0)
            
            stats[etype][col] = {
                'grid': time_grid,
                'median': percentiles[4],
                'bands': [
                    (percentiles[3], percentiles[5], 0.4), # 40-60%
                    (percentiles[2], percentiles[6], 0.3), # 30-70%
                    (percentiles[1], percentiles[7], 0.2), # 20-80%
                    (percentiles[0], percentiles[8], 0.1), # 10-90%
                ]
            }
            
    return stats

def plot_single_ax(ax, stats, metric, etypes, colors, show_legend=False):
    """Helper to plot data on a single axis"""
    has_data = False
    for etype in etypes:
        if etype not in stats or metric not in stats[etype]:
            continue
            
        data = stats[etype][metric]
        grid = data['grid']
        median = data['median']
        bands = data['bands']
        base_color = colors[etype]
        
        # Plot Median Line (Solid, Dark)
        ax.plot(grid, median, color=base_color, linewidth=2, label=f"{etype.capitalize()}")
        
        # Plot Bands
        for lower, upper, alpha in bands:
            ax.fill_between(grid, lower, upper, color=base_color, alpha=alpha, linewidth=0)
        
        has_data = True
            
    ax.grid(True, alpha=0.3)
    if show_legend and has_data:
        ax.legend(loc='upper right', fontsize='small')

def plot_fan_chart(stats):
    """Figure 1: Plot statistical fan charts in 3 columns"""
    if not stats:
        print("No stats to plot for Figure 1.")
        return

    # 4 rows (metrics), 3 columns (Combined, Vape, Normal)
    fig, axes = plt.subplots(4, 3, figsize=(18, 16), sharex=True)
    fig.canvas.manager.set_window_title('Figure 1: Sensor Data Analysis')
    
    # Define base colors
    colors = {'vape': 'red', 'normal': 'green'}
    
    metrics_map = [
        ('temperature', "Temperature (°F)", "Temp"),
        ('humidity', "Humidity (%)", "Humidity"),
        ('pm25', "PM2.5 (µg/m³)", "PM2.5"),
        ('gas_resistance', "Gas Resistance (Ω)", "Resistance")
    ]
    
    print("Plotting Figure 1 (Fan Charts)...")

    for i, (metric, ylabel, title) in enumerate(metrics_map):
        # Column 1: Combined
        ax_combined = axes[i, 0]
        plot_single_ax(ax_combined, stats, metric, ['normal', 'vape'], colors, show_legend=(i==0))
        ax_combined.set_ylabel(ylabel)
        if i == 0:
            ax_combined.set_title("Combined")
        
        # Column 2: Vape Only
        ax_vape = axes[i, 1]
        plot_single_ax(ax_vape, stats, metric, ['vape'], colors, show_legend=(i==0))
        if i == 0:
            ax_vape.set_title("Vape Only")

        # Column 3: Normal Only
        ax_normal = axes[i, 2]
        plot_single_ax(ax_normal, stats, metric, ['normal'], colors, show_legend=(i==0))
        if i == 0:
            ax_normal.set_title("Normal Only")

    # Set common x-label for the bottom row
    for j in range(3):
        axes[3, j].set_xlabel("Time (s)")
        axes[3, j].set_xlim(0, INTERVAL_SECONDS)

    plt.tight_layout()

from sklearn.metrics import confusion_matrix
import seaborn as sns

def run_ai_predictions(episodes, models):
    """
    Run predictions for all episodes using all models.
    Returns:
    1. results: structured data for plotting confidence (Fig 2)
    2. all_preds: structured data for confusion matrices (Fig 3)
       { 'XGBoost': {'y_true': [], 'y_pred': []}, ... }
    """
    results = {model_name: {'correct': [], 'incorrect': []} for model_name in models.keys()}
    all_preds = {model_name: {'y_true': [], 'y_pred': []} for model_name in models.keys()}
    
    print("Running AI predictions...")
    
    for ep in episodes:
        df = ep['data']
        actual_class = ep['type'] # 'vape' or 'normal'
        actual_label = 1 if actual_class == 'vape' else 0
        
        if df.empty:
            continue
            
        features = prepare_features(df)
        
        for model_name, model in models.items():
            try:
                # Get predictions
                preds = model.predict(features)
                
                # Store for Confusion Matrix
                # Extend list with this episode's true labels and predictions
                all_preds[model_name]['y_true'].extend([actual_label] * len(preds))
                all_preds[model_name]['y_pred'].extend(preds)

                # Get confidences for Fig 2
                try:
                    probs = model.predict_proba(features)
                    max_probs = np.max(probs, axis=1) * 100
                except AttributeError:
                    max_probs = np.full(len(preds), 100.0)
                
                # Compare for Fig 2
                times = df['relative_time'].values
                for t, pred, conf in zip(times, preds, max_probs):
                    pred_label = int(pred)
                    is_correct = (pred_label == actual_label)
                    
                    point = (t, conf)
                    if is_correct:
                        results[model_name]['correct'].append(point)
                    else:
                        results[model_name]['incorrect'].append(point)
                        
            except Exception as e:
                print(f"Error running {model_name}: {e}")
                
    return results, all_preds

def plot_ai_confidence(results):
    """Figure 2: Plot AI Confidence (Correct vs Incorrect)"""
    if not results:
        print("No AI results to plot.")
        return
        
    # GridSpec allows for custom layout
    fig = plt.figure(figsize=(16, 8))
    fig.canvas.manager.set_window_title('Figure 2: AI Model Confidence')
    gs = fig.add_gridspec(2, 2)
    
    # Left Column: Correct Predictions (Full Height)
    ax_correct = fig.add_subplot(gs[:, 0])
    
    # Right Column: 
    # Top Half: Zoomed Correct (99-100%)
    # Bottom Half: Incorrect Predictions
    ax_zoomed = fig.add_subplot(gs[0, 1])
    ax_incorrect = fig.add_subplot(gs[1, 1])
    
    print("Plotting Figure 2 (AI Confidence)...")
    
    for model_name, data in results.items():
        color = AI_COLORS.get(model_name, 'black')
        
        # Plot Correct (Main)
        pts_corr = data['correct']
        if pts_corr:
            pts_corr = np.array(pts_corr)
            ax_correct.scatter(pts_corr[:, 0], pts_corr[:, 1], 
                             c=color, alpha=0.3, s=10, label=model_name)
            # Plot Zoomed Correct
            ax_zoomed.scatter(pts_corr[:, 0], pts_corr[:, 1], 
                            c=color, alpha=0.3, s=10)
            
        # Plot Incorrect
        pts_inc = data['incorrect']
        if pts_inc:
            pts_inc = np.array(pts_inc)
            ax_incorrect.scatter(pts_inc[:, 0], pts_inc[:, 1], 
                               c=color, alpha=0.3, s=10)

    # Formatting Left (Main Correct)
    ax_correct.set_title("Correct Predictions (Full Range)")
    ax_correct.set_xlabel("Time (s)")
    ax_correct.set_ylabel("Confidence (%)")
    ax_correct.set_ylim(45, 105)
    ax_correct.grid(True, alpha=0.3)
    ax_correct.legend(loc='lower right')
    
    # Formatting Top Right (Zoomed Correct)
    ax_zoomed.set_title("Correct Predictions (Zoomed 99-100%)")
    ax_zoomed.set_ylabel("Confidence (%)")
    ax_zoomed.set_ylim(98.8, 100.2) # Zoom in
    ax_zoomed.grid(True, alpha=0.3)
    ax_zoomed.set_xticklabels([]) # Hide x labels for top plot
    
    # Formatting Bottom Right (Incorrect)
    ax_incorrect.set_title("Incorrect Predictions")
    ax_incorrect.set_xlabel("Time (s)")
    ax_incorrect.set_ylabel("Confidence (%)")
    ax_incorrect.set_ylim(45, 105)
    ax_incorrect.grid(True, alpha=0.3)
    
    plt.tight_layout()

def plot_confusion_matrices(all_preds):
    """Figure 3: Plot Confusion Matrices for all models"""
    if not all_preds:
        print("No prediction data for Figure 3.")
        return

    # 2 rows, 3 columns (to fit 5 models)
    fig, axes = plt.subplots(2, 3, figsize=(15, 10))
    fig.canvas.manager.set_window_title('Figure 3: Confusion Matrices')
    axes = axes.flatten()
    
    # Hide the 6th subplot (index 5) as we only have 5 models
    axes[5].axis('off')
    
    print("Plotting Figure 3 (Confusion Matrices)...")
    
    for i, (model_name, data) in enumerate(all_preds.items()):
        if i >= 5: break
        
        ax = axes[i]
        y_true = data['y_true']
        y_pred = data['y_pred']
        
        if not y_true:
            ax.text(0.5, 0.5, "No Data", ha='center')
            continue
            
        # Compute Matrix
        cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
        
        # Plot Heatmap
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax, cbar=False,
                   xticklabels=['Normal', 'Vape'], yticklabels=['Normal', 'Vape'])
        
        ax.set_title(f"{model_name}")
        ax.set_ylabel('Actual')
        ax.set_xlabel('Predicted')
    
    plt.tight_layout()

if __name__ == "__main__":
    try:
        # --- Figure 1: Sensor Data (research-events) ---
        episodes_events = fetch_episodes("research-events")
        if episodes_events:
            stats = calculate_stats(episodes_events)
            plot_fan_chart(stats)
        else:
            print("No episodes found in 'research-events'")

        # --- Figure 2 & 3: AI Analysis (research-ais) ---
        episodes_ai = fetch_episodes("research-ais")
        if episodes_ai:
            models = load_models()
            if models:
                # Run predictions once for both figures
                ai_results, all_preds = run_ai_predictions(episodes_ai, models)
                
                plot_ai_confidence(ai_results)
                plot_confusion_matrices(all_preds)
            else:
                print("No models loaded, skipping AI figures.")
        else:
            print("No episodes found in 'research-ais'")
            
        print("Displaying plots...")
        plt.show()
        
    except Exception as e:
        print(f"An error occurred: {e}")

