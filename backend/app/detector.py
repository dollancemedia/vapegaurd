from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple
from .config import settings
from .state_manager import state_manager
from .feature_engine import FeatureEngine
from .ensemble_predictor import ensemble
import uuid

class Detector:
    def __init__(self):
        pass

    def _get_now(self):
        return datetime.now(timezone.utc)

    def process_sample(self, device_id: str, sample: Dict[str, Any]) -> Tuple[Optional[Dict], Optional[str]]:
        """
        Main pipeline entry point.
        Returns:
            event_doc: Dict to save to 'events' collection (or None)
            notification_type: 'suspicious', 'confirmed', or None
        """
        # 1. Parse timestamp
        if isinstance(sample.get('timestamp'), str):
            try:
                sample['timestamp'] = datetime.fromisoformat(sample['timestamp'])
            except ValueError:
                sample['timestamp'] = self._get_now() # Fallback
        
        if not sample.get('timestamp').tzinfo:
            sample['timestamp'] = sample['timestamp'].replace(tzinfo=timezone.utc)

        current_ts = sample['timestamp']
        
        # 2. Add to rolling buffer
        state_manager.add_sample(device_id, sample)
        
        # 3. Get current state
        state = state_manager.get_state(device_id)
        status = state.get("status", "IDLE")
        
        event_doc = None
        notification_type = None
        
        # 4. State Machine
        if status == "IDLE":
            event_doc, notification_type = self._handle_idle(device_id, sample, state)
            
        elif status == "CONFIRMING":
            event_doc, notification_type = self._handle_confirming(device_id, sample, state)
            
        elif status == "COOLDOWN":
            self._handle_cooldown(device_id, state, current_ts)

        return event_doc, notification_type

    def _handle_idle(self, device_id: str, sample: Dict[str, Any], state: Dict[str, Any]):
        # Update EWMA
        pm25 = sample.get('pm25')
        if pm25 is None:
            return None, None
            
        prev_ewma = state.get('ewma_pm25')
        new_ewma = FeatureEngine.update_ewma(pm25, prev_ewma, settings.EWMA_ALPHA)
        
        # Calculate Delta
        # If no previous EWMA (first sample), delta is 0
        d_pm25 = (pm25 - prev_ewma) if prev_ewma is not None else 0.0
        
        # Verbose Logging for IDLE state (sampled to avoid flooding)
        if prev_ewma is not None and abs(d_pm25) > 1.0:
             print(f"[Detector] IDLE | Dev: {device_id} | PM2.5: {pm25} | Base: {prev_ewma:.2f} | Delta: {d_pm25:.2f}")

        # Trigger Check
        is_triggered = False
        if d_pm25 >= settings.D_PM25_SUS:
            print(f"[Detector] TRIGGERED! | Delta {d_pm25:.2f} >= Threshold {settings.D_PM25_SUS}")
            is_triggered = True
        
        # Update State with new EWMA
        updates = {"ewma_pm25": new_ewma}
        
        if is_triggered:
            # Transition to CONFIRMING
            t0 = sample['timestamp']
            event_id = str(uuid.uuid4())
            
            updates.update({
                "status": "CONFIRMING",
                "t0": t0,
                "event_id": event_id,
                # Snapshot baselines
                "snapshot_pm25_base": new_ewma, 
                "snapshot_pm1_base": sample.get('pm1'), # Approx
                "snapshot_pm10_base": sample.get('pm10') # Approx
            })
            
            state_manager.update_state(device_id, updates)
            
            # Create Suspicious Event
            event_doc = {
                "event_id": event_id,
                "device_id": device_id,
                "t_start": t0,
                "status": "suspected",
                "phase1_reason": {
                    "d_pm25": d_pm25,
                    "trigger_val": pm25,
                    "baseline_val": prev_ewma
                },
                "created_at": self._get_now()
            }
            return event_doc, "suspicious"
        else:
            state_manager.update_state(device_id, updates)
            return None, None

    def _handle_confirming(self, device_id: str, sample: Dict[str, Any], state: Dict[str, Any]):
        t0 = state.get("t0")
        if not t0:
            # Error state, reset
            state_manager.clear_state(device_id)
            return None, None
            
        now = sample['timestamp']
        duration = (now - t0).total_seconds()
        
        # Log progress every ~5 seconds
        if int(duration) % 5 == 0:
             print(f"[Detector] CONFIRMING | Dev: {device_id} | T+{duration:.1f}s / {settings.CONFIRM_WINDOW_SEC}s")

        if duration >= settings.CONFIRM_WINDOW_SEC:
            # DECISION TIME
            print(f"[Detector] DECISION TIME | Dev: {device_id} | Window Complete")
            return self._make_decision(device_id, state, now)
            
        return None, None

    def _make_decision(self, device_id: str, state: Dict[str, Any], decision_time: datetime):
        t0 = state.get("t0")
        event_id = state.get("event_id")
        
        # Fetch Data
        # Baseline: [t0 - 10s, t0]
        # Event: [t0, t0 + 20s] (or current time)
        
        baseline_start = t0 - timedelta(seconds=settings.BASELINE_WINDOW_SEC)
        
        # We fetch all needed samples in one go
        all_samples = state_manager.get_samples(device_id, baseline_start, decision_time)
        
        # Split them
        baseline_samples = [s for s in all_samples if s['timestamp'] <= t0]
        event_samples = [s for s in all_samples if s['timestamp'] > t0]
        
        # Compute Features
        features = FeatureEngine.compute_features(baseline_samples, event_samples)
        
        # Predict
        prediction = ensemble.predict(features)
        
        # Transition to COOLDOWN
        cooldown_until = decision_time + timedelta(seconds=settings.COOLDOWN_SEC)
        state_manager.update_state(device_id, {
            "status": "COOLDOWN",
            "cooldown_until": cooldown_until
        })
        
        # Construct Final Event Doc
        event_doc = {
            "event_id": event_id,
            "device_id": device_id,
            "t_start": t0,
            "t_decision": decision_time,
            "status": prediction["status"], # confirmed or uncertain
            "top_class": prediction["top_class"],
            "probs": prediction["probs"],
            "top_prob": prediction["top_prob"],
            "margin": prediction["margin"],
            "event_features": features, # Optional: store features
            "ensemble_detail": prediction["per_model"],
            "created_at": self._get_now()
        }
        
        return event_doc, "confirmed"

    def _handle_cooldown(self, device_id: str, state: Dict[str, Any], current_ts: datetime):
        cooldown_until = state.get("cooldown_until")
        if cooldown_until and current_ts > cooldown_until:
            state_manager.update_state(device_id, {"status": "IDLE"})

detector = Detector()
