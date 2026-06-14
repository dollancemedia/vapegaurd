"""
Training Monitor v2 — Serial-based training pipeline.

Captures sensor data directly from serial (no MongoDB dependency).
Parses SENSOR: lines for all fields, tracks DEEP_SENSE events,
stores everything locally, and trains models from local data.

Usage:
    python training_monitor_v2.py

    1. Wait for green "READY" state (baseline frozen)
    2. Vape when countdown shows "VAPE NOW!"
    3. Red circle = event captured with data
    4. Repeat until 15-20+ events
    5. Click TRAIN or SAVE & QUIT
"""

import tkinter as tk
from tkinter import messagebox
import serial
import serial.tools.list_ports
import threading
import json
import time
import sys
import os
import traceback
from datetime import datetime, timezone, timedelta
from pathlib import Path
from collections import deque

# ── Make backend importable ──────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

from app.feature_engine import FeatureEngine
from app.class_config import FEATURE_ORDER

BAUD = 115200
DATA_DIR = Path("backend/training/serial_captures")
MODELS_DIR = Path("backend/models")
SNIFF_INTERVAL = 60


def find_serial_port():
    """Auto-detect the ESP32 serial port."""
    ports = serial.tools.list_ports.comports()
    for p in ports:
        desc = (p.description or "").lower()
        if "cp210" in desc or "ch340" in desc or "usb" in desc or "serial" in desc or "com3" in p.device.lower():
            return p.device
    # Fallback
    for p in ports:
        if "COM" in p.device:
            return p.device
    return "COM3"


def parse_sensor_line(line):
    """Parse 'SENSOR: T=x H=x P=x G=x PM1=x PM25=x PM10=x' into a dict."""
    if "SENSOR:" not in line:
        return None
    try:
        parts = line.split("SENSOR:")[1].strip().split()
        data = {}
        for part in parts:
            if "=" not in part:
                continue
            key, val = part.split("=", 1)
            data[key] = float(val)
        if "PM25" not in data:
            return None
        return {
            "temperature": data.get("T", 0),
            "humidity": data.get("H", 0),
            "pressure": data.get("P", 0),
            "gas_resistance": data.get("G", 0),
            "pm1": data.get("PM1", 0),
            "pm25": data.get("PM25", 0),
            "pm10": data.get("PM10", 0),
            "timestamp": datetime.now(timezone.utc),
        }
    except Exception:
        return None


class TrainingMonitorV2:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Mistio Training Monitor v2")
        self.root.geometry("520x820")
        self.root.configure(bg="#1a1a2e")
        self.root.attributes("-topmost", True)

        self.running = True
        self.session_start = datetime.now(timezone.utc)
        self.in_deep_sense = False
        self.baseline_ready = False
        self.last_heartbeat_time = None

        # Data storage
        self.all_samples = deque(maxlen=5000)
        self.baseline_samples = deque(maxlen=200)
        self.events = []  # list of {start_ts, samples: [...], label: "vape"}
        self.current_event_samples = []
        self.deep_sense_sample_count = 0

        self.build_ui()
        self.connect_serial()
        self.tick_countdown()

    def build_ui(self):
        tk.Label(self.root, text="TRAINING MONITOR v2", font=("Consolas", 18, "bold"),
                 fg="#e0e0e0", bg="#1a1a2e").pack(pady=(15, 5))
        tk.Label(self.root, text="serial capture — no MongoDB needed", font=("Consolas", 9),
                 fg="#555", bg="#1a1a2e").pack()

        # Status light
        self.status_light = tk.Canvas(self.root, width=200, height=200,
                                       bg="#1a1a2e", highlightthickness=0)
        self.status_light.pack(pady=10)
        self.light_circle = self.status_light.create_oval(10, 10, 190, 190, fill="#2d2d4e", outline="#444")

        self.status_label = tk.Label(self.root, text="WAITING...", font=("Consolas", 24, "bold"),
                                      fg="#888", bg="#1a1a2e")
        self.status_label.pack(pady=(0, 5))

        self.sub_label = tk.Label(self.root, text="Waiting for sensor data",
                                   font=("Consolas", 11), fg="#666", bg="#1a1a2e")
        self.sub_label.pack()

        # Countdown
        self.countdown_frame = tk.Frame(self.root, bg="#1a1a2e")
        self.countdown_frame.pack(pady=(10, 0))
        tk.Label(self.countdown_frame, text="Next sniff in:", font=("Consolas", 10),
                 fg="#888", bg="#1a1a2e").pack()
        self.countdown_label = tk.Label(self.countdown_frame, text="--",
                                         font=("Consolas", 32, "bold"), fg="#888", bg="#1a1a2e")
        self.countdown_label.pack()
        self.vape_hint = tk.Label(self.countdown_frame, text="",
                                   font=("Consolas", 12, "bold"), fg="#1a1a2e", bg="#1a1a2e")
        self.vape_hint.pack()

        # Event counter
        self.count_label = tk.Label(self.root, text="0", font=("Consolas", 48, "bold"),
                                     fg="#4ecca3", bg="#1a1a2e")
        self.count_label.pack(pady=(10, 0))
        tk.Label(self.root, text="events captured", font=("Consolas", 12),
                 fg="#666", bg="#1a1a2e").pack()

        # Data quality indicator
        self.quality_label = tk.Label(self.root, text="", font=("Consolas", 10),
                                       fg="#888", bg="#1a1a2e")
        self.quality_label.pack(pady=(5, 0))

        # Event log
        log_frame = tk.Frame(self.root, bg="#1a1a2e")
        log_frame.pack(pady=10, fill="both", expand=True, padx=20)
        tk.Label(log_frame, text="Detected Events:", font=("Consolas", 10, "bold"),
                 fg="#aaa", bg="#1a1a2e", anchor="w").pack(fill="x")
        self.log_text = tk.Text(log_frame, font=("Consolas", 9), bg="#0f0f23",
                                 fg="#4ecca3", height=6, state="disabled",
                                 relief="flat", padx=8, pady=8)
        self.log_text.pack(fill="both", expand=True)

        # Serial line
        self.serial_label = tk.Label(self.root, text="", font=("Consolas", 8),
                                      fg="#555", bg="#1a1a2e", wraplength=480, anchor="w")
        self.serial_label.pack(padx=20, fill="x")

        # Buttons
        btn_frame = tk.Frame(self.root, bg="#1a1a2e")
        btn_frame.pack(pady=10, padx=20, fill="x")

        self.train_btn = tk.Button(btn_frame, text="TRAIN MODELS",
                                    font=("Consolas", 11, "bold"),
                                    fg="#1a1a2e", bg="#f59e0b", activebackground="#d97706",
                                    relief="flat", padx=15, pady=6, command=self.train_models)
        self.train_btn.pack(side="left", expand=True, fill="x", padx=(0, 5))

        self.save_btn = tk.Button(btn_frame, text="SAVE & QUIT",
                                   font=("Consolas", 11, "bold"),
                                   fg="#1a1a2e", bg="#4ecca3", activebackground="#3ba88a",
                                   relief="flat", padx=15, pady=6, command=self.save_and_quit)
        self.save_btn.pack(side="right", expand=True, fill="x", padx=(5, 0))

        self.root.protocol("WM_DELETE_WINDOW", self.save_and_quit)

    def connect_serial(self):
        port = find_serial_port()
        try:
            self.ser = serial.Serial(port, BAUD, timeout=1)
            self.sub_label.config(text=f"Connected to {port}")
            self.serial_thread = threading.Thread(target=self.read_serial, daemon=True)
            self.serial_thread.start()
        except Exception as e:
            self.sub_label.config(text=f"ERROR: {e}", fg="#e74c3c")
            self.ser = None

    def read_serial(self):
        while self.running:
            try:
                line = self.ser.readline().decode("utf-8", errors="ignore").strip()
                if not line:
                    continue
                self.root.after(0, self.process_line, line)
            except Exception:
                if self.running:
                    self.root.after(0, self.sub_label.config, {"text": "Serial disconnected", "fg": "#e74c3c"})
                break

    def process_line(self, line):
        self.serial_label.config(text=line[-80:])

        # Parse sensor data from every SENSOR: line
        sample = parse_sensor_line(line)
        if sample:
            self.all_samples.append(sample)
            if self.in_deep_sense:
                self.current_event_samples.append(sample)
                self.deep_sense_sample_count += 1
                self.quality_label.config(
                    text=f"Capturing: {self.deep_sense_sample_count} samples | PM2.5={sample['pm25']:.1f}",
                    fg="#e74c3c")
            else:
                self.baseline_samples.append(sample)

        # State transitions
        if "LOCAL SPIKE" in line or "SNIFF -> DEEP_SENSE" in line:
            if not self.in_deep_sense:
                self.in_deep_sense = True
                self.current_event_samples = []
                self.deep_sense_sample_count = 0
                # Grab the last ~30 seconds of baseline samples
                self.current_baseline = list(self.baseline_samples)[-30:]
                self.set_state("deep_sense")

        elif "Deep sense complete" in line:
            if self.in_deep_sense:
                self.in_deep_sense = False
                self.finish_event()
                self.set_state("cooldown")

        elif "COOLDOWN" in line and "SNIFF" in line:
            self.last_heartbeat_time = time.time()
            self.set_state("sniff")

        elif "Baseline frozen" in line:
            self.baseline_ready = True
            self.last_heartbeat_time = time.time()
            self.set_state("ready")

        elif "Heartbeat POST" in line and not self.in_deep_sense:
            self.last_heartbeat_time = time.time()
            if self.baseline_ready:
                self.set_state("sniff")

    def finish_event(self):
        """Called when DEEP_SENSE completes. Saves the captured event data."""
        n_samples = len(self.current_event_samples)
        n_baseline = len(self.current_baseline) if hasattr(self, 'current_baseline') else 0

        if n_samples < 3:
            self.quality_label.config(
                text=f"Event DROPPED — only {n_samples} samples (need 3+)", fg="#e74c3c")
            return

        # Check data quality
        pm25_vals = [s["pm25"] for s in self.current_event_samples if s["pm25"] > 0]
        if not pm25_vals:
            self.quality_label.config(text="Event DROPPED — all PM2.5 readings were 0", fg="#e74c3c")
            return

        pm25_peak = max(pm25_vals)
        baseline_pm25 = 0
        if hasattr(self, 'current_baseline') and self.current_baseline:
            base_vals = [s["pm25"] for s in self.current_baseline]
            if base_vals:
                baseline_pm25 = sum(base_vals) / len(base_vals)

        event = {
            "start_ts": self.current_event_samples[0]["timestamp"].isoformat(),
            "end_ts": self.current_event_samples[-1]["timestamp"].isoformat(),
            "label": "vape",
            "samples": self.current_event_samples.copy(),
            "baseline_samples": self.current_baseline.copy() if hasattr(self, 'current_baseline') else [],
            "n_event_samples": n_samples,
            "n_baseline_samples": n_baseline,
            "pm25_peak": pm25_peak,
            "pm25_baseline": baseline_pm25,
        }
        self.events.append(event)

        n = len(self.events)
        local = self.current_event_samples[0]["timestamp"].astimezone().strftime("%I:%M:%S %p")
        self.count_label.config(text=str(n))
        self.quality_label.config(
            text=f"Event #{n}: {n_samples} samples, {n_baseline} baseline | peak PM2.5={pm25_peak:.1f} (base={baseline_pm25:.1f})",
            fg="#4ecca3")

        self.log_text.config(state="normal")
        self.log_text.insert("end",
            f"  #{n}  {local}  |  {n_samples} samples  |  PM2.5 peak={pm25_peak:.1f}\n")
        self.log_text.see("end")
        self.log_text.config(state="disabled")

        self.flash_window()

    def tick_countdown(self):
        if self.last_heartbeat_time and not self.in_deep_sense:
            elapsed = time.time() - self.last_heartbeat_time
            remaining = max(0, SNIFF_INTERVAL - elapsed)
            secs = int(remaining)
            self.countdown_label.config(text=f"{secs}s")

            if remaining <= 25 and remaining > 0:
                self.countdown_label.config(fg="#e74c3c")
                self.vape_hint.config(text="VAPE NOW!", fg="#e74c3c")
            elif remaining <= 40:
                self.countdown_label.config(fg="#f59e0b")
                self.vape_hint.config(text="Get ready...", fg="#f59e0b")
            else:
                self.countdown_label.config(fg="#888")
                self.vape_hint.config(text="", fg="#1a1a2e")

            if remaining <= 0:
                self.countdown_label.config(text="NOW", fg="#22c55e")
                self.vape_hint.config(text="", fg="#1a1a2e")
        else:
            self.countdown_label.config(text="--", fg="#888")
            self.vape_hint.config(text="", fg="#1a1a2e")

        self.root.after(500, self.tick_countdown)

    def set_state(self, state):
        if state == "deep_sense":
            self.status_light.itemconfig(self.light_circle, fill="#e74c3c")
            self.status_label.config(text="DEEP SENSE", fg="#e74c3c")
            n = len(self.events) + 1
            self.sub_label.config(text=f"Capturing vape #{n} — hold still!", fg="#e74c3c")
            self.countdown_label.config(text="!!", fg="#e74c3c")
            self.vape_hint.config(text="CAPTURING...", fg="#e74c3c")

        elif state == "cooldown":
            self.status_light.itemconfig(self.light_circle, fill="#f59e0b")
            self.status_label.config(text="COOLDOWN", fg="#f59e0b")
            self.sub_label.config(text="Cooling down...", fg="#f59e0b")

        elif state == "sniff":
            self.status_light.itemconfig(self.light_circle, fill="#22c55e")
            self.status_label.config(text="SNIFFING", fg="#22c55e")
            self.sub_label.config(text="Watch countdown — vape when it says VAPE NOW!", fg="#22c55e")

        elif state == "ready":
            self.status_light.itemconfig(self.light_circle, fill="#22c55e")
            self.status_label.config(text="READY", fg="#22c55e")
            self.sub_label.config(text="Baseline set — ready to detect", fg="#22c55e")

    def flash_window(self):
        for i in range(6):
            self.root.after(i * 300, lambda c=("#e74c3c" if i % 2 == 0 else "#1a1a2e"):
                           self.root.configure(bg=c))
        self.root.after(1800, lambda: self.root.configure(bg="#1a1a2e"))

    def save_data(self):
        """Save captured data to JSON for reproducibility."""
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = DATA_DIR / f"session_{ts}.json"

        def serialize_sample(s):
            out = {}
            for k, v in s.items():
                if isinstance(v, datetime):
                    out[k] = v.isoformat()
                else:
                    out[k] = v
            return out

        data = {
            "session_start": self.session_start.isoformat(),
            "session_end": datetime.now(timezone.utc).isoformat(),
            "n_events": len(self.events),
            "events": []
        }
        for ev in self.events:
            data["events"].append({
                "start_ts": ev["start_ts"],
                "end_ts": ev["end_ts"],
                "label": ev["label"],
                "n_event_samples": ev["n_event_samples"],
                "n_baseline_samples": ev["n_baseline_samples"],
                "pm25_peak": ev["pm25_peak"],
                "pm25_baseline": ev["pm25_baseline"],
                "samples": [serialize_sample(s) for s in ev["samples"]],
                "baseline_samples": [serialize_sample(s) for s in ev["baseline_samples"]],
            })

        # Also save clean_air baseline data (all non-event samples)
        data["clean_air_samples"] = [serialize_sample(s) for s in self.baseline_samples]

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        return path

    def train_models(self):
        """Train models directly from captured serial data."""
        if len(self.events) < 2:
            messagebox.showwarning("Not Enough Data",
                f"Only {len(self.events)} events captured. Need at least 2 to train.\n"
                f"Recommend 10-20 for good models.")
            return

        self.train_btn.config(state="disabled", text="TRAINING...")
        self.root.update()

        try:
            self._do_training()
        except Exception as e:
            traceback.print_exc()
            messagebox.showerror("Training Error", str(e))
        finally:
            self.train_btn.config(state="normal", text="TRAIN MODELS")

    def _do_training(self):
        import numpy as np
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import classification_report
        from sklearn.model_selection import train_test_split
        from sklearn.preprocessing import LabelEncoder, StandardScaler
        from sklearn.utils.class_weight import compute_sample_weight
        import joblib

        try:
            from xgboost import XGBClassifier
            xgb_available = True
        except ImportError:
            xgb_available = False

        # ── Build training rows from local data ─────────────────────────
        all_rows = []  # (features_dict, label)

        # Vape events: use each event's baseline + event samples directly
        for i, ev in enumerate(self.events):
            baseline = ev["baseline_samples"]
            event = ev["samples"]

            if len(event) < 3:
                print(f"  Event #{i+1}: skipped (only {len(event)} samples)")
                continue

            # Slide windows through the event data for augmentation
            window_sec = 20
            slide_sec = 5

            if len(event) <= 5:
                # Too few samples for sliding — use the whole thing as one window
                try:
                    feats = FeatureEngine.compute_features(baseline, event)
                    all_rows.append((feats, "vape"))
                except Exception:
                    pass
            else:
                # Slide through event samples
                for start_idx in range(0, max(1, len(event) - 5), 3):
                    end_idx = min(start_idx + window_sec, len(event))
                    event_slice = event[start_idx:end_idx]
                    if len(event_slice) < 3:
                        continue
                    try:
                        feats = FeatureEngine.compute_features(baseline, event_slice)
                        all_rows.append((feats, "vape"))
                    except Exception:
                        continue

            n_windows = sum(1 for f, l in all_rows if l == "vape") - sum(
                1 for f, l in all_rows[:max(0, len(all_rows)-20)] if l == "vape"
            )
            print(f"  Event #{i+1}: {ev['n_event_samples']} samples -> windows generated")

        # Clean air: build windows from baseline samples
        baseline_list = list(self.baseline_samples)
        if len(baseline_list) >= 6:
            # Slide 20-sample windows through baseline data
            for i in range(0, len(baseline_list) - 5, 5):
                window = baseline_list[i:i+20]
                if len(window) < 4:
                    continue
                mid = len(window) // 3
                base_slice = window[:mid]
                event_slice = window[mid:]
                if len(base_slice) >= 2 and len(event_slice) >= 2:
                    try:
                        feats = FeatureEngine.compute_features(base_slice, event_slice)
                        all_rows.append((feats, "clean_air"))
                    except Exception:
                        continue

        if not all_rows:
            messagebox.showerror("No Data", "No valid training windows could be built from the captured data.")
            return

        # ── Build feature matrix ─────────────────────────────────────────
        X_list, y_list = [], []
        for feats, label in all_rows:
            vec = [float(feats.get(k) or 0.0) for k in FEATURE_ORDER]
            X_list.append(vec)
            y_list.append(label)

        X = np.array(X_list, dtype=float)
        y = np.array(y_list)

        from collections import Counter
        counts = Counter(y)
        print(f"\nTraining data: {len(X)} windows | {len(FEATURE_ORDER)} features")
        print(f"Class distribution: {dict(counts)}")

        if len(set(y)) < 2:
            messagebox.showerror("Need Both Classes",
                f"Only have '{y[0]}' class. Need both 'vape' and 'clean_air'.\n"
                f"Make sure the sensor was idle (sniffing) between vape events to collect baseline data.")
            return

        # ── Train/test split ─────────────────────────────────────────────
        try:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.20, random_state=42, stratify=y)
        except ValueError:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.20, random_state=42)

        sw = compute_sample_weight("balanced", y=y_train)

        # ── Random Forest ────────────────────────────────────────────────
        rf = RandomForestClassifier(n_estimators=300, random_state=42,
                                    class_weight="balanced_subsample")
        rf.fit(X_train, y_train, sample_weight=sw)

        # ── Logistic Regression ──────────────────────────────────────────
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        lr = LogisticRegression(random_state=42, max_iter=1000,
                                class_weight="balanced", solver="lbfgs",
                                multi_class="multinomial", C=1.0)
        lr.fit(X_train_scaled, y_train, sample_weight=sw)
        lr._scaler = scaler

        # ── XGBoost ──────────────────────────────────────────────────────
        xgb_model = None
        if xgb_available:
            le = LabelEncoder()
            yt_enc = le.fit_transform(y_train)
            xgb_model = XGBClassifier(random_state=42, eval_metric="mlogloss",
                                       n_estimators=400, max_depth=6,
                                       learning_rate=0.05, subsample=0.9,
                                       colsample_bytree=0.9)
            xgb_model.fit(X_train, yt_enc, sample_weight=sw)
            xgb_model.custom_classes_ = le.classes_

        # ── Evaluate & save ──────────────────────────────────────────────
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        results = []

        models = [("rf", rf, "rf_model.joblib"), ("lr", lr, "lr_model.joblib")]
        if xgb_model:
            models.append(("xgb", xgb_model, "xgb_model.joblib"))

        for name, model, filename in models:
            path = MODELS_DIR / filename
            joblib.dump(model, path)

            X_eval = X_test
            if hasattr(model, '_scaler'):
                X_eval = model._scaler.transform(X_test)

            y_pred = model.predict(X_eval)
            if hasattr(model, "custom_classes_"):
                y_pred = model.custom_classes_[y_pred.astype(int)]

            rep = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
            acc = rep.get("accuracy", 0)
            results.append(f"{name}: {acc:.1%}")
            print(f"  {name}: accuracy={acc:.3f} -> {path}")

        # Save session data too
        data_path = self.save_data()

        result_str = " | ".join(results)
        self.quality_label.config(
            text=f"TRAINED: {result_str} | {len(X)} windows", fg="#4ecca3")

        messagebox.showinfo("Training Complete",
            f"Models trained and saved to {MODELS_DIR}/\n\n"
            f"Results: {result_str}\n"
            f"Training windows: {len(X)} ({dict(counts)})\n"
            f"Session data: {data_path}\n\n"
            f"Deploy: upload model files to Railway")

    def save_and_quit(self):
        self.running = False
        try:
            if self.ser:
                self.ser.close()
        except Exception:
            pass

        if self.events:
            path = self.save_data()
            print(f"\nSaved {len(self.events)} events to {path}")
        else:
            print("\nNo events to save.")

        self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    app = TrainingMonitorV2()
    app.run()
