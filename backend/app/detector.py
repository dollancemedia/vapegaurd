from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple
from .config import settings
from .state_manager import state_manager
from .feature_engine import FeatureEngine
from .ensemble_predictor import ensemble
import uuid

class Detector:
    """
    Detection pipeline that works with v3 firmware's local spike detection.

    The ESP32 sensor does its own spike detection locally and sends duty_state:
      - "startup"   → warming up + calibrating (1Hz data, build baselines)
      - "sniff"     → normal monitoring, heartbeat every 4th cycle
      - "deep_sense" → spike detected locally, 1Hz burst of all sensor data
      - "deep_sense_complete" → burst finished, run ML inference now
      - "cooldown"  → post-event cooldown
      - "batch_baseline" → pre-trigger ring buffer data (baseline context)

    Backend flow:
      1. All incoming data → rolling buffer + raw storage
      2. startup/sniff/heartbeat → update baselines (EWMA), no spike detection needed
      3. batch_baseline → pre-spike context data, store in buffer
      4. deep_sense → accumulate event window data
      5. deep_sense_complete → compute features from buffer, run ML ensemble
      6. Also supports legacy cloud-side spike detection for non-v3 sensors
    """

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
        Main pipeline entry point. Handles both v3 firmware (local spike detection)
        and legacy firmware (cloud-side spike detection).
        """
        ts_val = sample.get('timestamp')
        if isinstance(ts_val, str):
            try:
                data_ts = datetime.fromisoformat(ts_val.replace("Z", "+00:00"))
            except ValueError:
                data_ts = self._get_now()
        elif isinstance(ts_val, datetime):
            data_ts = ts_val
        else:
            data_ts = self._get_now()

        if not data_ts.tzinfo:
            data_ts = data_ts.replace(tzinfo=timezone.utc)

        server_now = self._get_now()

        # Add to rolling buffer (all data, regardless of duty_state)
        state_manager.add_sample(device_id, sample)

        # Get current backend state
        state = state_manager.get_state(device_id) or {}
        duty_state = sample.get("duty_state", "")

        # ── V3 firmware path: sensor tells us what's happening ──────────
        if duty_state in ("startup", "sniff", "deep_sense", "deep_sense_complete",
                          "cooldown", "batch_baseline"):
            return self._handle_v3_sample(device_id, sample, state, server_now, duty_state)

        # ── Legacy firmware path: cloud-side state machine ──────────────
        return self._handle_legacy_sample(device_id, sample, state, server_now)

    # =====================================================================
    #  V3 FIRMWARE PATH — sensor does local spike detection
    # =====================================================================
    def _handle_v3_sample(self, device_id: str, sample: Dict[str, Any],
                          state: Dict[str, Any], server_now: datetime,
                          duty_state: str) -> Tuple[Optional[Dict], Optional[str]]:

        pm25 = sample.get('pm25')

        if duty_state == "startup":
            # Sensor is warming up and calibrating — update backend baselines
            # PM2.5 = 0 is valid (clean air); only skip if None
            if pm25 is not None and pm25 >= 0:
                prev_ewma = state.get('ewma_pm25')
                new_ewma = FeatureEngine.update_ewma(pm25, prev_ewma, settings.EWMA_ALPHA_CALIBRATION)
                state_manager.update_state(device_id, {
                    "status": "CALIBRATING",
                    "ewma_pm25": new_ewma,
                    "baseline_pm25": sample.get("baseline_pm25", new_ewma),
                    "baseline_gas_resistance": sample.get("baseline_gas", sample.get("gas_resistance")),
                    "baseline_humidity": sample.get("humidity"),
                    "baseline_temperature": sample.get("temperature"),
                    "baseline_pm10": sample.get("pm10"),
                })
            return None, None

        elif duty_state == "sniff":
            # Normal heartbeat — update baselines with slow drift
            # PM2.5 = 0 is valid (clean air); only skip if None
            if pm25 is not None and pm25 >= 0:
                prev_ewma = state.get('baseline_pm25') or state.get('ewma_pm25')
                if prev_ewma is None:
                    prev_ewma = pm25

                d_pm25 = pm25 - prev_ewma

                # Server-side spike detection: if firmware missed the spike,
                # flag it and tell the device to enter DEEP_SENSE via response
                if d_pm25 >= settings.D_PM25_SUS and state.get("status") != "CONFIRMING":
                    event_id = str(uuid.uuid4())
                    state_manager.update_state(device_id, {
                        "status": "CONFIRMING",
                        "t0": server_now,
                        "event_id": event_id,
                        "last_trigger_time": server_now.isoformat(),
                        "snapshot_pm25_base": prev_ewma,
                        "force_deep_sense": True,
                        "ewma_pm25": prev_ewma,
                        "baseline_pm25": prev_ewma,
                        "prev_pm25": pm25,
                        "prev_ts": server_now.isoformat(),
                    })
                    print(f"[Detector] SERVER SPIKE | Dev: {device_id} | PM2.5={pm25} base={prev_ewma:.1f} d={d_pm25:.1f}")
                    event_doc = {
                        "event_id": event_id,
                        "device_id": device_id,
                        "t_start": server_now,
                        "timestamp": self._iso_utc(server_now),
                        "status": "suspected",
                        "phase1_reason": {
                            "trigger": "server_spike",
                            "d_pm25": d_pm25,
                            "trigger_val": pm25,
                            "baseline_val": prev_ewma,
                        },
                        "created_at": self._get_now()
                    }
                    return event_doc, "suspicious"

                drifted = prev_ewma * (1.0 - settings.BASELINE_DRIFT_ALPHA) + pm25 * settings.BASELINE_DRIFT_ALPHA
                state_manager.update_state(device_id, {
                    "status": "IDLE",
                    "ewma_pm25": drifted,
                    "baseline_pm25": drifted,
                    "baseline_gas_resistance": sample.get("baseline_gas", sample.get("gas_resistance")),
                    "prev_pm25": pm25,
                    "prev_ts": server_now.isoformat(),
                    "force_deep_sense": False,
                })
            return None, None

        elif duty_state == "batch_baseline":
            # Pre-trigger ring buffer data — just store in buffer (already done above)
            return None, None

        elif duty_state == "deep_sense":
            # Spike-triggered burst — accumulate data
            # Clear force flag since device is now in DEEP_SENSE
            if state.get("force_deep_sense"):
                state_manager.update_state(device_id, {"force_deep_sense": False})

            status = state.get("status")

            if status != "CONFIRMING":
                # First deep_sense sample — transition to CONFIRMING
                event_id = str(uuid.uuid4())
                t0 = server_now

                baseline_pm25 = state.get('baseline_pm25') or state.get('ewma_pm25') or pm25

                state_manager.update_state(device_id, {
                    "status": "CONFIRMING",
                    "t0": t0,
                    "event_id": event_id,
                    "last_trigger_time": server_now.isoformat(),
                    "snapshot_pm25_base": baseline_pm25,
                    "snapshot_pm1_base": sample.get('pm1'),
                    "snapshot_pm10_base": sample.get('pm10'),
                })

                # Emit "suspicious" event
                event_doc = {
                    "event_id": event_id,
                    "device_id": device_id,
                    "t_start": t0,
                    "timestamp": self._iso_utc(t0),
                    "status": "suspected",
                    "phase1_reason": {
                        "trigger": "local_spike",
                        "d_pm25": (pm25 or 0) - (baseline_pm25 or 0),
                        "trigger_val": pm25,
                        "baseline_val": baseline_pm25,
                    },
                    "created_at": self._get_now()
                }
                return event_doc, "suspicious"

            # Already CONFIRMING — just accumulating (data already in buffer)
            return None, None

        elif duty_state == "deep_sense_complete":
            # Burst finished — run ML inference NOW
            return self._v3_make_decision(device_id, state, server_now)

        elif duty_state == "cooldown":
            # Post-event cooldown — just monitor
            state_manager.update_state(device_id, {"status": "COOLDOWN"})
            return None, None

        return None, None

    def _v3_make_decision(self, device_id: str, state: Dict[str, Any],
                          decision_time: datetime) -> Tuple[Optional[Dict], Optional[str]]:
        """Run ML inference on the accumulated deep_sense burst data."""
        t0 = state.get("t0")
        event_id = state.get("event_id")

        if not t0 or not event_id:
            # No active event — shouldn't happen, but handle gracefully
            print(f"[Detector] deep_sense_complete but no active event for {device_id}")
            state_manager.update_state(device_id, {"status": "IDLE"})
            return None, None

        # Fetch all samples: baseline = before t0, event = after t0
        baseline_start = t0 - timedelta(seconds=settings.BASELINE_WINDOW_SEC + 5)
        all_samples = state_manager.get_samples(device_id, baseline_start, decision_time)

        baseline_samples = [s for s in all_samples if s['timestamp'] <= t0]
        event_samples = [s for s in all_samples if s['timestamp'] > t0]

        # During DEEP_SENSE, PM2.5=0 likely means failed read (someone IS vaping)
        # But baseline PM2.5=0 is valid (clean air)
        event_samples_clean = [s for s in event_samples if s.get('pm25') is not None and s['pm25'] > 0]
        baseline_samples_clean = [s for s in baseline_samples if s.get('pm25') is not None and s['pm25'] >= 0]

        print(f"[Detector] ML DECISION | Dev: {device_id} | baseline={len(baseline_samples)}({len(baseline_samples_clean)} valid) event={len(event_samples)}({len(event_samples_clean)} valid) samples")

        # Transition to COOLDOWN regardless of outcome
        cooldown_until = decision_time + timedelta(seconds=settings.COOLDOWN_SEC)
        state_manager.update_state(device_id, {
            "status": "COOLDOWN",
            "cooldown_until": cooldown_until
        })

        # Sanity check: if fewer than 3 valid event samples, data is garbage
        if len(event_samples_clean) < 3:
            print(f"[Detector] SKIP ML — only {len(event_samples_clean)} valid event samples (need 3+)")
            event_doc = {
                "event_id": event_id,
                "device_id": device_id,
                "t_start": t0,
                "t_decision": decision_time,
                "timestamp": self._iso_utc(decision_time),
                "status": "confirmed",
                "top_class": "normal",
                "probs": {"normal": 1.0},
                "top_prob": 1.0,
                "margin": 1.0,
                "event_features": {"skipped": "insufficient_valid_samples", "valid_count": len(event_samples_clean)},
                "ensemble_detail": {},
                "created_at": self._get_now()
            }
            return event_doc, "confirmed"

        # Compute features using cleaned samples
        features = FeatureEngine.compute_features(
            baseline_samples_clean if baseline_samples_clean else baseline_samples,
            event_samples_clean
        )

        # Sanity check: if PM2.5 peak is at or below baseline, it's not vape
        d_pm25_peak = features.get('d_pm25_peak')
        if d_pm25_peak is not None and d_pm25_peak < settings.MIN_D_PM25_PEAK:
            print(f"[Detector] SKIP ML — d_pm25_peak={d_pm25_peak:.2f} "
                  f"(below MIN_D_PM25_PEAK={settings.MIN_D_PM25_PEAK} = no real rise)")
            event_doc = {
                "event_id": event_id,
                "device_id": device_id,
                "t_start": t0,
                "t_decision": decision_time,
                "timestamp": self._iso_utc(decision_time),
                "status": "confirmed",
                "top_class": "normal",
                "probs": {"normal": 1.0},
                "top_prob": 1.0,
                "margin": 1.0,
                "event_features": features,
                "ensemble_detail": {"skipped": "negative_pm25_delta"},
                "created_at": self._get_now()
            }
            return event_doc, "confirmed"

        prediction = ensemble.predict(features)

        event_doc = {
            "event_id": event_id,
            "device_id": device_id,
            "t_start": t0,
            "t_decision": decision_time,
            "timestamp": self._iso_utc(decision_time),
            "status": prediction["status"],
            "top_class": prediction["top_class"],
            "probs": prediction["probs"],
            "top_prob": prediction["top_prob"],
            "margin": prediction["margin"],
            "event_features": features,
            "ensemble_detail": prediction["per_model"],
            "created_at": self._get_now()
        }

        return event_doc, "confirmed"

    # =====================================================================
    #  LEGACY FIRMWARE PATH — cloud-side state machine (unchanged)
    # =====================================================================
    def _handle_legacy_sample(self, device_id: str, sample: Dict[str, Any],
                              state: Dict[str, Any], server_now: datetime) -> Tuple[Optional[Dict], Optional[str]]:
        """Original cloud-side spike detection for non-v3 sensors."""

        # Initialize state if new
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

        if status == "WARMUP":
            self._handle_warmup(device_id, state, server_now)
            return None, None

        elif status == "CALIBRATING":
            self._handle_calibrating(device_id, sample, state, server_now)
            return None, None

        elif status == "IDLE":
            return self._handle_idle(device_id, sample, state, server_now)

        elif status == "CONFIRMING":
            return self._handle_confirming(device_id, sample, state, server_now)

        elif status == "COOLDOWN":
            self._handle_cooldown(device_id, state, server_now)
            return None, None

        return None, None

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
        pm25 = sample.get('pm25')
        if pm25 is None:
            return

        prev_ewma = state.get('ewma_pm25')
        new_ewma = FeatureEngine.update_ewma(pm25, prev_ewma, settings.EWMA_ALPHA_CALIBRATION)

        updates = {"ewma_pm25": new_ewma}

        cal_start_str = state.get("calibration_start")
        if cal_start_str:
            cal_start = self._parse_state_dt(cal_start_str)
            if cal_start:
                now = current_ts
                elapsed = (now - cal_start).total_seconds()

                if int(elapsed) % 5 == 0:
                     print(f"[Detector] CALIBRATING | Dev: {device_id} | PM2.5: {pm25} | Base: {new_ewma:.2f} | T+{elapsed:.1f}s")

                if elapsed >= settings.CALIBRATION_DURATION_SEC:
                    print(f"[Detector] CALIBRATION COMPLETE | Dev: {device_id} | Final Base: {new_ewma:.2f}")
                    updates.update({
                        "status": "IDLE",
                        "baseline_pm25": new_ewma,
                        "baseline_pm10": sample.get("pm10"),
                        "baseline_humidity": sample.get("humidity"),
                        "baseline_temperature": sample.get("temperature"),
                        "baseline_gas_resistance": sample.get("gas_resistance")
                    })
            else:
                updates["calibration_start"] = self._get_now().isoformat()
        else:
             updates["calibration_start"] = self._get_now().isoformat()

        state_manager.update_state(device_id, updates)

    def _handle_idle(self, device_id: str, sample: Dict[str, Any], state: Dict[str, Any], current_ts: datetime):
        pm25 = sample.get('pm25')
        if pm25 is None:
            return None, None

        baseline_pm25 = state.get('baseline_pm25')
        prev_ewma = baseline_pm25 if baseline_pm25 is not None else state.get('ewma_pm25')
        if prev_ewma is None:
            prev_ewma = pm25

        d_pm25 = pm25 - prev_ewma

        if prev_ewma is not None and abs(d_pm25) > 1.0:
            print(f"[Detector] IDLE | Dev: {device_id} | PM2.5: {pm25} | Base: {prev_ewma:.2f} | Delta: {d_pm25:.2f}")

        slope = 0.0
        prev_pm25 = state.get('prev_pm25')
        prev_ts_str = state.get('prev_ts')
        if prev_pm25 is not None and prev_ts_str is not None:
            prev_ts_dt = self._parse_state_dt(prev_ts_str)
            if prev_ts_dt:
                dt = max((current_ts - prev_ts_dt).total_seconds(), 0.5)
                slope = (pm25 - prev_pm25) / dt

        is_triggered = False
        trigger_reason = None

        if d_pm25 >= settings.D_PM25_SUS:
            is_triggered = True
            trigger_reason = "delta"

        if not is_triggered and slope >= settings.SLOPE_SUS:
            is_triggered = True
            trigger_reason = "slope"

        updates = {
            "ewma_pm25": prev_ewma,
            "prev_pm25": pm25,
            "prev_ts": current_ts.isoformat(),
        }

        if is_triggered:
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
            state_manager.clear_state(device_id)
            return None, None

        now = current_ts
        duration = (now - t0).total_seconds()

        if int(duration) % 5 == 0:
             print(f"[Detector] CONFIRMING | Dev: {device_id} | T+{duration:.1f}s / {settings.CONFIRM_WINDOW_SEC}s")

        if duration >= settings.CONFIRM_WINDOW_SEC:
            print(f"[Detector] DECISION TIME | Dev: {device_id} | Window Complete")
            return self._make_decision(device_id, state, now)

        return None, None

    def _make_decision(self, device_id: str, state: Dict[str, Any], decision_time: datetime):
        t0 = state.get("t0")
        event_id = state.get("event_id")

        baseline_start = t0 - timedelta(seconds=settings.BASELINE_WINDOW_SEC)
        all_samples = state_manager.get_samples(device_id, baseline_start, decision_time)

        baseline_samples = [s for s in all_samples if s['timestamp'] <= t0]
        event_samples = [s for s in all_samples if s['timestamp'] > t0]

        # During DEEP_SENSE, PM2.5=0 = failed read. Baseline PM2.5=0 = clean air (valid).
        event_samples_clean = [s for s in event_samples if s.get('pm25') is not None and s['pm25'] > 0]
        baseline_samples_clean = [s for s in baseline_samples if s.get('pm25') is not None and s['pm25'] >= 0]

        cooldown_until = decision_time + timedelta(seconds=settings.COOLDOWN_SEC)
        state_manager.update_state(device_id, {
            "status": "COOLDOWN",
            "cooldown_until": cooldown_until
        })

        if len(event_samples_clean) < 3:
            print(f"[Detector] SKIP ML (legacy) — only {len(event_samples_clean)} valid event samples")
            event_doc = {
                "event_id": event_id,
                "device_id": device_id,
                "t_start": t0,
                "t_decision": decision_time,
                "timestamp": self._iso_utc(decision_time),
                "status": "confirmed",
                "top_class": "normal",
                "probs": {"normal": 1.0},
                "top_prob": 1.0,
                "margin": 1.0,
                "event_features": {"skipped": "insufficient_valid_samples", "valid_count": len(event_samples_clean)},
                "ensemble_detail": {},
                "created_at": self._get_now()
            }
            return event_doc, "confirmed"

        features = FeatureEngine.compute_features(
            baseline_samples_clean if baseline_samples_clean else baseline_samples,
            event_samples_clean
        )

        d_pm25_peak = features.get('d_pm25_peak')
        if d_pm25_peak is not None and d_pm25_peak < settings.MIN_D_PM25_PEAK:
            print(f"[Detector] SKIP ML (legacy) — d_pm25_peak={d_pm25_peak:.2f} "
                  f"(below MIN_D_PM25_PEAK={settings.MIN_D_PM25_PEAK})")
            event_doc = {
                "event_id": event_id,
                "device_id": device_id,
                "t_start": t0,
                "t_decision": decision_time,
                "timestamp": self._iso_utc(decision_time),
                "status": "confirmed",
                "top_class": "normal",
                "probs": {"normal": 1.0},
                "top_prob": 1.0,
                "margin": 1.0,
                "event_features": features,
                "ensemble_detail": {"skipped": "negative_pm25_delta"},
                "created_at": self._get_now()
            }
            return event_doc, "confirmed"

        prediction = ensemble.predict(features)

        event_doc = {
            "event_id": event_id,
            "device_id": device_id,
            "t_start": t0,
            "t_decision": decision_time,
            "timestamp": self._iso_utc(decision_time),
            "status": prediction["status"],
            "top_class": prediction["top_class"],
            "probs": prediction["probs"],
            "top_prob": prediction["top_prob"],
            "margin": prediction["margin"],
            "event_features": features,
            "ensemble_detail": prediction["per_model"],
            "created_at": self._get_now()
        }

        return event_doc, "confirmed"

    def _handle_cooldown(self, device_id: str, state: Dict[str, Any], current_ts: datetime):
        cooldown_until = state.get("cooldown_until")
        if cooldown_until and current_ts > cooldown_until:
            state_manager.update_state(device_id, {"status": "IDLE"})

detector = Detector()
