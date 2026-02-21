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

    def _iso_utc(self, dt: datetime) -> str:
        if not dt.tzinfo:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    def _parse_state_dt(self, raw_val: Any) -> Optional[datetime]:
        if isinstance(raw_val, datetime):
            dt = raw_val
        elif isinstance(raw_val, str):
            try:
                dt = datetime.fromisoformat(raw_val.replace("Z", "+00:00"))
            except ValueError:
                return None
        else:
            return None

        if not dt.tzinfo:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    def process_sample(self, device_id: str, sample: Dict[str, Any]) -> Tuple[Optional[Dict], Optional[str]]:
        """
        Main pipeline entry point.
        Returns:
            event_doc: Dict to save to 'events' collection (or None)
            notification_type: 'suspicious', 'confirmed', or None
        """
        # 1. Parse timestamp (Local variable, do not modify sample in place)
        # This 'ts_val' is the DATA timestamp from the sensor.
        ts_val = sample.get('timestamp')
        if isinstance(ts_val, str):
            try:
                data_ts = datetime.fromisoformat(ts_val)
            except ValueError:
                data_ts = self._get_now()
        elif isinstance(ts_val, datetime):
            data_ts = ts_val
        else:
            data_ts = self._get_now()
        
        if not data_ts.tzinfo:
            data_ts = data_ts.replace(tzinfo=timezone.utc)
            
        # Use SERVER time for all State Machine logic to prevent "freezing" if sensor clock is stuck
        server_now = self._get_now()
        
        # 2. Add to rolling buffer
        state_manager.add_sample(device_id, sample)
        
        # 3. Get current state
        state = state_manager.get_state(device_id) or {}

        # Initialize state if new/default
        if (
            not state
            or "status" not in state
            or (
                state.get("status") == "IDLE"
                and state.get("ewma_pm25") is None
                and state.get("t0") is None
                and state.get("cooldown_until") is None
                and not state.get("warmup_start")
                and not state.get("calibration_start")
            )
        ):
            state = {
                "status": "WARMUP",
                "warmup_start": server_now.isoformat(),
                "ewma_pm25": None
            }
            state_manager.update_state(device_id, state)
            
        status = state.get("status", "WARMUP")
        
        event_doc = None
        notification_type = None
        
        # 4. State Machine
        # PASS server_now for logic control, but methods can access sample['timestamp'] if needed for records
        if status == "WARMUP":
            self._handle_warmup(device_id, state, server_now)

        elif status == "CALIBRATING":
             self._handle_calibrating(device_id, sample, state, server_now)
             
        elif status == "IDLE":
            event_doc, notification_type = self._handle_idle(device_id, sample, state, server_now)
            
        elif status == "CONFIRMING":
            event_doc, notification_type = self._handle_confirming(device_id, sample, state, server_now)
            
        elif status == "COOLDOWN":
            self._handle_cooldown(device_id, state, server_now)

        return event_doc, notification_type

    def _handle_warmup(self, device_id: str, state: Dict[str, Any], current_ts: datetime):
        warmup_start_str = state.get("warmup_start")
        updates: Dict[str, Any] = {}

        if warmup_start_str:
            warmup_start = self._parse_state_dt(warmup_start_str)
            if warmup_start:
                elapsed = (current_ts - warmup_start).total_seconds()

                if int(elapsed) % 10 == 0:
                    print(f"[Detector] WARMUP | Dev: {device_id} | T+{elapsed:.1f}s")

                if elapsed >= settings.WARMUP_DURATION_SEC:
                    updates.update({
                        "status": "CALIBRATING",
                        "calibration_start": current_ts.isoformat(),
                        "ewma_pm25": None
                    })
            else:
                updates["warmup_start"] = self._get_now().isoformat()
        else:
            updates["warmup_start"] = self._get_now().isoformat()

        if updates:
            state_manager.update_state(device_id, updates)

    def _handle_calibrating(self, device_id: str, sample: Dict[str, Any], state: Dict[str, Any], current_ts: datetime):
        # Update EWMA aggressively
        pm25 = sample.get('pm25')
        if pm25 is None:
            return

        prev_ewma = state.get('ewma_pm25')
        # Use faster alpha during calibration
        new_ewma = FeatureEngine.update_ewma(pm25, prev_ewma, settings.EWMA_ALPHA_CALIBRATION)
        
        updates = {"ewma_pm25": new_ewma}
        
        # Check time
        cal_start_str = state.get("calibration_start")
        if cal_start_str:
            cal_start = self._parse_state_dt(cal_start_str)
            if cal_start:
                # Use server time (current_ts) for reliable duration
                now = current_ts
                
                elapsed = (now - cal_start).total_seconds()
                
                # Log calibration progress occasionally
                if int(elapsed) % 5 == 0:
                     print(f"[Detector] CALIBRATING | Dev: {device_id} | PM2.5: {pm25} | Base: {new_ewma:.2f} | T+{elapsed:.1f}s")

                if elapsed >= settings.CALIBRATION_DURATION_SEC:
                    print(f"[Detector] CALIBRATION COMPLETE | Dev: {device_id} | Final Base: {new_ewma:.2f}")
                    updates.update({
                        "status": "IDLE",
                        # Freeze baseline after calibration until explicit recalibration
                        "baseline_pm25": new_ewma,
                        "baseline_pm10": sample.get("pm10"),
                        "baseline_humidity": sample.get("humidity"),
                        "baseline_temperature": sample.get("temperature"),
                        "baseline_gas_resistance": sample.get("gas_resistance")
                    })
            else:
                # If date parsing fails, reset calibration
                updates["calibration_start"] = self._get_now().isoformat()
        else:
             updates["calibration_start"] = self._get_now().isoformat()
             
        state_manager.update_state(device_id, updates)

    def _handle_idle(self, device_id: str, sample: Dict[str, Any], state: Dict[str, Any], current_ts: datetime):
        # Use frozen baseline from calibration (not rolling) unless missing.
        pm25 = sample.get('pm25')
        if pm25 is None:
            return None, None

        baseline_pm25 = state.get('baseline_pm25')
        prev_ewma = baseline_pm25 if baseline_pm25 is not None else state.get('ewma_pm25')
        if prev_ewma is None:
            prev_ewma = pm25

        # Calculate Delta
        d_pm25 = pm25 - prev_ewma

        # Verbose Logging for IDLE state (sampled to avoid flooding)
        if prev_ewma is not None and abs(d_pm25) > 1.0:
            print(f"[Detector] IDLE | Dev: {device_id} | PM2.5: {pm25} | Base: {prev_ewma:.2f} | Delta: {d_pm25:.2f}")

        # Slope: µg/m³ per second since last reading (catches slow/low-output vaping)
        slope = 0.0
        prev_pm25 = state.get('prev_pm25')
        prev_ts_str = state.get('prev_ts')
        if prev_pm25 is not None and prev_ts_str is not None:
            prev_ts_dt = self._parse_state_dt(prev_ts_str)
            if prev_ts_dt:
                dt = max((current_ts - prev_ts_dt).total_seconds(), 0.5)
                slope = (pm25 - prev_pm25) / dt

        # Trigger Check
        is_triggered = False
        trigger_reason = None

        # Trigger 1: Sudden jump (delta)
        if d_pm25 >= settings.D_PM25_SUS:
            print(f"[Detector] TRIGGERED (delta) | Dev: {device_id} | Delta {d_pm25:.2f} >= {settings.D_PM25_SUS}")
            is_triggered = True
            trigger_reason = "delta"

        # Trigger 2: Sustained rise rate (catches slow/low-output vaping that never
        # produces a single large jump but rises consistently above SLOPE_SUS µg/m³/s)
        if not is_triggered and slope >= settings.SLOPE_SUS:
            print(f"[Detector] TRIGGERED (slope) | Dev: {device_id} | Slope {slope:.2f} µg/m³/s >= {settings.SLOPE_SUS}")
            is_triggered = True
            trigger_reason = "slope"

        updates = {
            "ewma_pm25": prev_ewma,
            "prev_pm25": pm25,
            "prev_ts": current_ts.isoformat(),
        }

        if is_triggered:
            # Transition to CONFIRMING
            t0 = current_ts
            event_id = str(uuid.uuid4())

            updates.update({
                "status": "CONFIRMING",
                "t0": t0,
                "event_id": event_id,
                "last_trigger_time": current_ts.isoformat(),
                "snapshot_pm25_base": prev_ewma,
                "snapshot_pm1_base": sample.get('pm1'),
                "snapshot_pm10_base": sample.get('pm10'),
            })

            state_manager.update_state(device_id, updates)

            event_doc = {
                "event_id": event_id,
                "device_id": device_id,
                "t_start": t0,
                "timestamp": self._iso_utc(t0),
                "status": "suspected",
                "phase1_reason": {
                    "trigger": trigger_reason,
                    "d_pm25": d_pm25,
                    "slope": slope,
                    "trigger_val": pm25,
                    "baseline_val": prev_ewma,
                },
                "created_at": self._get_now()
            }
            return event_doc, "suspicious"
        else:
            # Slow baseline drift: nudge baseline toward current ambient only when
            # the environment has been quiet for BASELINE_QUIET_SEC seconds.
            # This corrects for multi-hour drift (humidity, outdoor PM, temperature)
            # without chasing acute spikes.
            last_trigger_str = state.get('last_trigger_time')
            quiet_enough = True
            if last_trigger_str:
                last_trigger_dt = self._parse_state_dt(last_trigger_str)
                if last_trigger_dt:
                    quiet_enough = (current_ts - last_trigger_dt).total_seconds() > settings.BASELINE_QUIET_SEC

            if quiet_enough:
                drifted = prev_ewma * (1.0 - settings.BASELINE_DRIFT_ALPHA) + pm25 * settings.BASELINE_DRIFT_ALPHA
                updates['baseline_pm25'] = drifted
                updates['ewma_pm25'] = drifted

            state_manager.update_state(device_id, updates)
            return None, None

    def _handle_confirming(self, device_id: str, sample: Dict[str, Any], state: Dict[str, Any], current_ts: datetime):
        t0 = state.get("t0")
        if not t0:
            # Error state, reset
            state_manager.clear_state(device_id)
            return None, None
            
        now = current_ts # Use server time
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
            "timestamp": self._iso_utc(decision_time),
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
