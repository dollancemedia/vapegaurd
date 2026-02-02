import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

# Mock Env Vars BEFORE importing app modules
os.environ['MONGODB_URI'] = 'mongodb://mock-uri'

from app.detector import Detector
from app.config import settings
from app.state_manager import state_manager

class TestDetectorLogic(unittest.TestCase):
    def setUp(self):
        # Reset state manager
        state_manager._local_state = {}
        state_manager._local_samples = {}
        state_manager.redis_client = None # Force local
        
        # Mock Ensemble to avoid loading actual models
        self.patcher = patch('app.detector.ensemble')
        self.mock_ensemble = self.patcher.start()
        self.mock_ensemble.predict.return_value = {
            "top_class": "vape",
            "probs": {"vape": 0.9, "normal": 0.1},
            "top_prob": 0.9,
            "margin": 0.8,
            "status": "confirmed",
            "per_model": {}
        }
        
        self.detector = Detector()
        self.device_id = "test_device_001"
        self.start_time = datetime.now(timezone.utc)

    def tearDown(self):
        self.patcher.stop()

    def test_flow(self):
        print("\nTesting Detector Flow...")
        
        # 1. Feed Baseline (15s of stable data)
        # pm25 ~ 5.0
        current_time = self.start_time
        for i in range(15):
            sample = {
                "timestamp": current_time,
                "pm25": 5.0,
                "pm1": 5.0,
                "pm10": 5.0,
                "humidity": 50.0,
                "temperature": 20.0,
                "gas_resistance": 10000.0,
                "device_id": self.device_id
            }
            event, notif = self.detector.process_sample(self.device_id, sample)
            self.assertIsNone(event)
            self.assertIsNone(notif)
            current_time += timedelta(seconds=1)

        # Verify State is IDLE and EWMA is updated
        state = state_manager.get_state(self.device_id)
        self.assertEqual(state["status"], "IDLE")
        self.assertAlmostEqual(state["ewma_pm25"], 5.0, delta=0.5)

        # 2. Feed Trigger (Jump to 20.0)
        # Delta = 15.0 > 10.0 (D_PM25_SUS)
        print("Triggering Event...")
        trigger_sample = {
            "timestamp": current_time,
            "pm25": 25.0, # Jump of 20
            "pm1": 25.0,
            "pm10": 25.0,
            "humidity": 50.0,
            "temperature": 20.0,
            "gas_resistance": 10000.0,
            "device_id": self.device_id
        }
        event, notif = self.detector.process_sample(self.device_id, trigger_sample)
        
        self.assertIsNotNone(event)
        self.assertEqual(notif, "suspicious")
        self.assertEqual(event["status"], "suspected")
        
        state = state_manager.get_state(self.device_id)
        self.assertEqual(state["status"], "CONFIRMING")
        self.assertIsNotNone(state["t0"])
        
        t0 = state["t0"]

        # 3. Feed Confirm Window (20s)
        print("Feeding Confirm Window...")
        # We need to feed enough samples to cover 20s
        for i in range(21):
            current_time += timedelta(seconds=1)
            sample = {
                "timestamp": current_time,
                "pm25": 30.0, # High values
                "pm1": 30.0,
                "pm10": 30.0,
                "humidity": 50.0,
                "temperature": 20.0,
                "gas_resistance": 10000.0,
                "device_id": self.device_id
            }
            event, notif = self.detector.process_sample(self.device_id, sample)
            
            # Should be None until 20s passed
            if (current_time - t0).total_seconds() < 20.0:
                if event is not None:
                     print(f"Unexpected event at {current_time - t0}: {event}")
                self.assertIsNone(event)
            else:
                # Decision time!
                print("Decision Reached!")
                self.assertIsNotNone(event)
                self.assertEqual(notif, "confirmed")
                self.assertEqual(event["top_class"], "vape")
                
                # State should be COOLDOWN
                state = state_manager.get_state(self.device_id)
                self.assertEqual(state["status"], "COOLDOWN")
                break

if __name__ == '__main__':
    unittest.main()
