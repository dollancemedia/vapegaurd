import json
import time
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta, timezone
import os
from .config import settings

# Try importing redis
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

class DeviceStateManager:
    """
    Abstracts state management for devices.
    Supports In-Memory (single worker) and Redis (multi-worker).
    """
    
    def __init__(self):
        self.redis_client = None
        
        if not REDIS_AVAILABLE:
            print("[StateManager] Redis library not installed. Using in-memory storage.")
        elif not settings.REDIS_URL:
            print("[StateManager] No REDIS_URL configured. Using in-memory storage.")
        else:
            try:
                self.redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
                print(f"[StateManager] Connected to Redis at {settings.REDIS_URL.split('@')[-1]}")
            except Exception as e:
                print(f"[StateManager] Failed to connect to Redis: {e}. Falling back to in-memory.")
        
        # In-memory fallback
        self._local_state = {}
        self._local_samples = {} # device_id -> list of samples

    def _get_now_utc(self) -> datetime:
        return datetime.now(timezone.utc)

    def _serialize_dt(self, dt: Optional[datetime]) -> Optional[str]:
        return dt.isoformat() if dt else None

    def _parse_dt(self, dt_str: Optional[str]) -> Optional[datetime]:
        if not dt_str:
            return None
        try:
            return datetime.fromisoformat(dt_str)
        except ValueError:
            return None

    def add_sample(self, device_id: str, sample: Dict[str, Any]):
        """
        Adds a sample to the device's rolling buffer.
        Maintains ~60 seconds of history.
        """
        # Create a copy to avoid mutating the original sample (especially timestamp)
        stored_sample = sample.copy()
        
        # Ensure timestamp is ISO string in storage
        if isinstance(stored_sample.get('timestamp'), datetime):
            stored_sample['timestamp'] = stored_sample['timestamp'].isoformat()
        
        if self.redis_client:
            key = f"device:{device_id}:samples"
            # Push to head (left)
            self.redis_client.lpush(key, json.dumps(stored_sample))
            # Trim to keep last 120 samples (approx 60-120s at 1-2Hz)
            # Better: trim by time logic could be expensive in Redis (lrange + lrem)
            # So strict capping is okay for now, assuming max 2Hz -> 120 items = 60s.
            self.redis_client.ltrim(key, 0, 199) 
            # Set expiry to auto-clean inactive devices
            self.redis_client.expire(key, 300)
        else:
            if device_id not in self._local_samples:
                self._local_samples[device_id] = []
            self._local_samples[device_id].insert(0, stored_sample)
            # Local time trim
            now = self._get_now_utc()
            # Keep samples within 60s window
            valid_samples = []
            for s in self._local_samples[device_id]:
                ts = self._parse_dt(s['timestamp'])
                if ts and (now - ts).total_seconds() < 60:
                    valid_samples.append(s)
                else:
                    break # Assuming ordered
            self._local_samples[device_id] = valid_samples

    def get_samples(self, device_id: str, start_time: datetime, end_time: datetime) -> List[Dict[str, Any]]:
        """
        Retrieves samples within the specified time window.
        Returns list sorted by timestamp (oldest first).
        """
        samples = []
        if self.redis_client:
            key = f"device:{device_id}:samples"
            raw_list = self.redis_client.lrange(key, 0, -1)
            for item in raw_list:
                try:
                    s = json.loads(item)
                    ts = self._parse_dt(s['timestamp'])
                    if ts and start_time <= ts <= end_time:
                        s['timestamp'] = ts # Convert back to object
                        samples.append(s)
                except:
                    continue
        else:
            local_list = self._local_samples.get(device_id, [])
            for s in local_list:
                ts = self._parse_dt(s['timestamp']) if isinstance(s['timestamp'], str) else s['timestamp']
                if ts and start_time <= ts <= end_time:
                    # Create copy to avoid mutating storage
                    s_copy = s.copy()
                    s_copy['timestamp'] = ts
                    samples.append(s_copy)
        
        # Sort by timestamp ascending
        samples.sort(key=lambda x: x['timestamp'])
        return samples

    def get_state(self, device_id: str) -> Dict[str, Any]:
        """
        Returns the current state dict for the device.
        Includes: status, t0, cooldown_until, ewma values.
        """
        default_state = {
            "status": "IDLE",
            "t0": None,
            "cooldown_until": None,
            "ewma_pm25": None,
            "ewma_pm25_slope": None,
            "warmup_start": None,
            "calibration_start": None,
            "event_id": None
            # Add other EWMAs as needed
        }
        
        if self.redis_client:
            key = f"device:{device_id}:state"
            stored = self.redis_client.hgetall(key)
            if not stored:
                return default_state
            
            # Parse types
            return {
                "status": stored.get("status", "IDLE"),
                "t0": self._parse_dt(stored.get("t0")),
                "cooldown_until": self._parse_dt(stored.get("cooldown_until")),
                "ewma_pm25": float(stored.get("ewma_pm25")) if stored.get("ewma_pm25") else None,
                "ewma_pm25_slope": float(stored.get("ewma_pm25_slope")) if stored.get("ewma_pm25_slope") else None,
                "warmup_start": self._parse_dt(stored.get("warmup_start")),
                "calibration_start": self._parse_dt(stored.get("calibration_start")),
                "event_id": stored.get("event_id") or None,
            }
        else:
            return self._local_state.get(device_id, default_state)

    def update_state(self, device_id: str, updates: Dict[str, Any]):
        """
        Updates specific fields in the device state.
        """
        if self.redis_client:
            key = f"device:{device_id}:state"
            # Prepare for Redis (stringify dates/Nones)
            redis_updates = {}
            for k, v in updates.items():
                if isinstance(v, datetime):
                    redis_updates[k] = self._serialize_dt(v)
                elif v is None:
                    # Redis hset doesn't like None/Null, usually we remove or set empty string
                    # But if we want to "clear" it, we might need hdel.
                    # For simplicity, store as empty string or keep logic consistent
                    redis_updates[k] = "" 
                else:
                    redis_updates[k] = str(v)
            
            if redis_updates:
                self.redis_client.hset(key, mapping=redis_updates)
                self.redis_client.expire(key, 3600) # 1 hour expiry
        else:
            if device_id not in self._local_state:
                self._local_state[device_id] = self.get_state(device_id) # init default
            
            current = self._local_state[device_id]
            for k, v in updates.items():
                current[k] = v

    def clear_state(self, device_id: str):
        """Resets state to defaults (keeps EWMAs if desired, or full wipe)."""
        # Usually we just set status to IDLE and clear timestamps
        self.update_state(device_id, {
            "status": "IDLE",
            "t0": None,
            "cooldown_until": None
        })

state_manager = DeviceStateManager()
