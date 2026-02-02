import unittest
from datetime import datetime, timedelta
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.feature_engine import FeatureEngine

class TestFeatureEngine(unittest.TestCase):
    def test_ewma(self):
        # Test EWMA logic
        # First value
        val1 = 10.0
        ewma1 = FeatureEngine.update_ewma(val1, None, 0.1)
        self.assertEqual(ewma1, 10.0)
        
        # Second value
        val2 = 20.0
        # ewma = 0.1 * 20 + 0.9 * 10 = 2 + 9 = 11
        ewma2 = FeatureEngine.update_ewma(val2, ewma1, 0.1)
        self.assertAlmostEqual(ewma2, 11.0)

    def test_feature_computation(self):
        t0 = datetime(2023, 1, 1, 12, 0, 0)
        
        baseline_samples = [
            {"pm25": 10.0, "pm1": 5.0, "pm10": 11.0, "humidity": 50, "gas_resistance": 1000, "timestamp": t0 - timedelta(seconds=5)},
            {"pm25": 10.0, "pm1": 5.0, "pm10": 11.0, "humidity": 50, "gas_resistance": 1000, "timestamp": t0 - timedelta(seconds=1)},
        ]
        
        event_samples = [
            {"pm25": 20.0, "pm1": 15.0, "pm10": 22.0, "humidity": 50, "gas_resistance": 1000, "timestamp": t0},
            {"pm25": 50.0, "pm1": 45.0, "pm10": 55.0, "humidity": 50, "gas_resistance": 1000, "timestamp": t0 + timedelta(seconds=10)},
            {"pm25": 30.0, "pm1": 25.0, "pm10": 35.0, "humidity": 50, "gas_resistance": 1000, "timestamp": t0 + timedelta(seconds=20)},
        ]
        
        features = FeatureEngine.compute_features(baseline_samples, event_samples)
        
        # Check basic extractions
        self.assertEqual(features['pm25_start'], 20.0)
        self.assertEqual(features['pm25_base'], 10.0) # Median of baseline
        self.assertEqual(features['pm25_peak'], 50.0)
        self.assertEqual(features['d_pm25_peak'], 40.0) # 50 - 10
        
        # Check AUC
        # simple check: positive
        self.assertGreater(features['pm25_auc_above_base'], 0)

if __name__ == '__main__':
    unittest.main()
