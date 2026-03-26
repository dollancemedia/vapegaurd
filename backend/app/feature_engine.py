import statistics
import math
from typing import List, Dict, Optional, Any
from datetime import datetime

class FeatureEngine:
    """
    Handles feature extraction for vape detection without Pandas.
    Operates on lists of sample dictionaries.
    """
    
    @staticmethod
    def update_ewma(current_value: float, previous_ewma: Optional[float], alpha: float) -> float:
        """
        Updates the Exponentially Weighted Moving Average.
        St = alpha * xt + (1 - alpha) * St-1
        """
        if previous_ewma is None:
            return current_value
        if current_value is None:
            return previous_ewma
        return alpha * current_value + (1 - alpha) * previous_ewma

    @staticmethod
    def compute_features(
        baseline_samples: List[Dict[str, Any]],
        event_samples: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Computes the feature vector for the ensemble model.
        
        Args:
            baseline_samples: List of samples from [t0-10s, t0]
            event_samples: List of samples from [t0, t0+20s]
            
        Returns:
            Dictionary of features matching the training format.
        """
        features = {}
        
        # Helper to safely get values
        def get_vals(samples, key):
            return [s.get(key) for s in samples if s.get(key) is not None]

        # 1. Start Values (at t0 - first sample of event_samples)
        start_sample = event_samples[0] if event_samples else (baseline_samples[-1] if baseline_samples else {})
        
        features['pm1_start'] = start_sample.get('pm1')
        features['pm25_start'] = start_sample.get('pm25')
        features['pm10_start'] = start_sample.get('pm10')
        features['humidity_start'] = start_sample.get('humidity')
        features['gas_start'] = start_sample.get('gas_resistance')
        features['temp_start'] = start_sample.get('temperature')

        # 2. Baselines (Median of baseline window)
        # If baseline samples are empty, fall back to start values
        def safe_median(vals, default=None):
            return statistics.median(vals) if vals else default

        pm25_base = safe_median(get_vals(baseline_samples, 'pm25'), features['pm25_start'])
        pm1_base = safe_median(get_vals(baseline_samples, 'pm1'), features['pm1_start'])
        pm10_base = safe_median(get_vals(baseline_samples, 'pm10'), features['pm10_start'])
        gas_base = safe_median(get_vals(baseline_samples, 'gas_resistance'), features['gas_start'])
        humidity_base = safe_median(get_vals(baseline_samples, 'humidity'), features['humidity_start'])

        features['pm25_base'] = pm25_base
        features['pm1_base'] = pm1_base
        features['pm10_base'] = pm10_base
        features['gas_base'] = gas_base
        features['humidity_base'] = humidity_base

        # 3. Peaks in Confirm Window
        pm25_vals = get_vals(event_samples, 'pm25')
        pm1_vals = get_vals(event_samples, 'pm1')
        pm10_vals = get_vals(event_samples, 'pm10')

        pm25_peak = max(pm25_vals) if pm25_vals else features['pm25_start']
        pm1_peak = max(pm1_vals) if pm1_vals else features['pm1_start']
        pm10_peak = max(pm10_vals) if pm10_vals else features['pm10_start']

        features['pm25_peak'] = pm25_peak
        features['pm1_peak'] = pm1_peak
        features['pm10_peak'] = pm10_peak

        # 4. Deltas
        # Handle None values safely
        def safe_sub(a, b):
            return a - b if (a is not None and b is not None) else None

        features['d_pm25_peak'] = safe_sub(pm25_peak, pm25_base)
        features['d_pm1_peak'] = safe_sub(pm1_peak, pm1_base)
        features['d_pm10_peak'] = safe_sub(pm10_peak, pm10_base)

        # 5. Time to Peak & Rise Slope
        # Find index of peak in event_samples
        t_to_peak = 0.0
        if pm25_vals and event_samples:
            peak_idx = pm25_vals.index(pm25_peak)
            # Calculate time difference in seconds
            # Assuming timestamps are datetime objects or ISO strings we can parse
            # For this calculation, we iterate and sum diffs or subtract timestamps
            try:
                t0 = event_samples[0]['timestamp']
                t_peak = event_samples[peak_idx]['timestamp']
                
                if isinstance(t0, str):
                    # Basic ISO parsing if string - assume already parsed in Detector, but double check
                    from datetime import datetime
                    # Simplistic parsing if needed, but detector should pass datetimes
                    pass 
                
                # If they are datetimes:
                if hasattr(t0, 'timestamp') and hasattr(t_peak, 'timestamp'):
                     t_to_peak = (t_peak - t0).total_seconds()
            except Exception:
                # Fallback to index assuming 1Hz if timestamps fail (shouldn't happen with proper logic)
                t_to_peak = float(peak_idx)

        features['t_to_pm25_peak_sec'] = t_to_peak
        
        # Slope
        d_pm25 = features['d_pm25_peak']
        if d_pm25 is not None:
            features['pm25_rise_slope'] = d_pm25 / max(t_to_peak, 1.0)
        else:
            features['pm25_rise_slope'] = 0.0

        # 6. AUC above baseline (Trapezoidal)
        # Area = sum(0.5 * (y1+y2 - 2*base) * dt)
        auc = 0.0
        if len(event_samples) > 1 and pm25_base is not None:
            for i in range(1, len(event_samples)):
                s1 = event_samples[i-1]
                s2 = event_samples[i]
                
                v1 = s1.get('pm25')
                v2 = s2.get('pm25')
                
                if v1 is None or v2 is None:
                    continue
                    
                # Time delta
                dt = 1.0 # Default
                if hasattr(s1['timestamp'], 'timestamp') and hasattr(s2['timestamp'], 'timestamp'):
                    dt = (s2['timestamp'] - s1['timestamp']).total_seconds()
                
                # Height above baseline (clamped to 0)
                h1 = max(0, v1 - pm25_base)
                h2 = max(0, v2 - pm25_base)
                
                auc += 0.5 * (h1 + h2) * dt
        
        features['pm25_auc_above_base'] = auc

        # 7. Ratios
        eps = 1e-6
        def calc_ratios(pm1, pm25, pm10):
            if pm1 is None or pm25 is None or pm10 is None:
                return None, None
            return pm1 / (pm25 + eps), pm1 / (pm10 + eps)

        r1, r2 = calc_ratios(features['pm1_start'], features['pm25_start'], features['pm10_start'])
        features['r_pm1_pm25_start'] = r1
        features['r_pm1_pm10_start'] = r2

        r1_peak, r2_peak = calc_ratios(features['pm1_peak'], features['pm25_peak'], features['pm10_peak'])
        features['r_pm1_pm25_peak'] = r1_peak
        features['r_pm1_pm10_peak'] = r2_peak

        # 8. Humidity/Gas Dynamics
        # Delta 20s (end - start)
        end_sample = event_samples[-1] if event_samples else start_sample
        
        features['humidity_delta_20s'] = safe_sub(end_sample.get('humidity'), features['humidity_start'])
        features['gas_delta_20s'] = safe_sub(end_sample.get('gas_resistance'), features['gas_start'])

        # Slopes 0-10s
        # Find sample closest to 10s
        t_10s_idx = 0
        if event_samples:
            t0 = event_samples[0]['timestamp']
            for i, s in enumerate(event_samples):
                if hasattr(t0, 'timestamp') and hasattr(s['timestamp'], 'timestamp'):
                    if (s['timestamp'] - t0).total_seconds() >= 10.0:
                        t_10s_idx = i
                        break
            else:
                t_10s_idx = len(event_samples) - 1
        
        sample_10s = event_samples[t_10s_idx] if event_samples else start_sample
        dt_10s = 10.0 # Approx
        
        if features['humidity_start'] is not None and sample_10s.get('humidity') is not None:
             features['humidity_slope_0_10s'] = (sample_10s['humidity'] - features['humidity_start']) / dt_10s
        else:
             features['humidity_slope_0_10s'] = None

        if features['gas_start'] is not None and sample_10s.get('gas_resistance') is not None:
             features['gas_slope_0_10s'] = (sample_10s['gas_resistance'] - features['gas_start']) / dt_10s
        else:
             features['gas_slope_0_10s'] = None

        # 9. Stability: pm25_std_last5s
        # Last 5 seconds of the event window
        last_5s_vals = []
        if event_samples:
            t_end = event_samples[-1]['timestamp']
            for s in reversed(event_samples):
                if hasattr(t_end, 'timestamp') and hasattr(s['timestamp'], 'timestamp'):
                     if (t_end - s['timestamp']).total_seconds() > 5.0:
                         break
                last_5s_vals.append(s.get('pm25'))

        # Filter Nones
        last_5s_vals = [v for v in last_5s_vals if v is not None]

        if len(last_5s_vals) > 1:
            features['pm25_std_last5s'] = statistics.stdev(last_5s_vals)
        else:
            features['pm25_std_last5s'] = 0.0

        # ── 10. NEW: Cross-sensor interactions ──────────────────────────
        # Pressure at event start
        features['pressure_start'] = start_sample.get('pressure', 0)

        # Temperature/humidity ratio — vape produces warm, humid aerosol
        hum_start = features['humidity_start']
        temp_start = features['temp_start']
        if hum_start and hum_start > 0 and temp_start is not None:
            features['temp_humidity_ratio'] = temp_start / hum_start
        else:
            features['temp_humidity_ratio'] = 0.0

        # Gas-temperature interaction — VOC sensitivity varies with temperature
        gas_start = features['gas_start']
        if gas_start is not None and temp_start is not None:
            features['gas_temp_interaction'] = gas_start * temp_start
        else:
            features['gas_temp_interaction'] = 0.0

        # ── 11. NEW: Decay dynamics ─────────────────────────────────────
        # PM2.5 decay rate: slope from peak to end of window
        # Vape aerosol dissipates quickly (~3-5s), fire/cooking lingers
        features['pm25_decay_rate'] = 0.0
        if pm25_vals and len(pm25_vals) >= 3:
            peak_idx_in_vals = pm25_vals.index(pm25_peak) if pm25_peak in pm25_vals else 0
            post_peak = pm25_vals[peak_idx_in_vals:]
            if len(post_peak) >= 2:
                # Time from peak to end
                dt_decay = len(post_peak) - 1  # approximate 1 sample/sec
                if event_samples and len(event_samples) > peak_idx_in_vals:
                    try:
                        t_pk = event_samples[peak_idx_in_vals]['timestamp']
                        t_last = event_samples[-1]['timestamp']
                        if hasattr(t_pk, 'timestamp') and hasattr(t_last, 'timestamp'):
                            dt_decay = max((t_last - t_pk).total_seconds(), 1.0)
                    except Exception:
                        pass
                decay_amount = pm25_peak - post_peak[-1]
                features['pm25_decay_rate'] = decay_amount / max(dt_decay, 1.0)

        # Gas recovery slope: how fast gas resistance recovers after VOC event
        # Higher recovery = transient aerosol (vape), low recovery = persistent (fire)
        gas_vals = get_vals(event_samples, 'gas_resistance')
        features['gas_recovery_slope'] = 0.0
        if gas_vals and len(gas_vals) >= 3:
            gas_min = min(gas_vals)
            gas_min_idx = gas_vals.index(gas_min)
            post_min = gas_vals[gas_min_idx:]
            if len(post_min) >= 2:
                dt_recovery = len(post_min) - 1
                try:
                    if event_samples and len(event_samples) > gas_min_idx:
                        t_gmin = event_samples[gas_min_idx]['timestamp']
                        t_glast = event_samples[-1]['timestamp']
                        if hasattr(t_gmin, 'timestamp') and hasattr(t_glast, 'timestamp'):
                            dt_recovery = max((t_glast - t_gmin).total_seconds(), 1.0)
                except Exception:
                    pass
                features['gas_recovery_slope'] = (post_min[-1] - gas_min) / max(dt_recovery, 1.0)

        # PM ratio at peak: pm25/pm10 (vape ~0.7-0.9, fire ~0.3-0.5)
        if pm25_peak is not None and pm10_peak is not None and pm10_peak > eps:
            features['pm_ratio_peak'] = pm25_peak / pm10_peak
        else:
            features['pm_ratio_peak'] = 0.0

        return features
