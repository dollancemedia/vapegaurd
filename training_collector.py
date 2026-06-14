"""
Training Collector v3 — Manual-label, continuous 1Hz data collection + direct training.

Replaces the old approach of relying on firmware spike detection to capture training data.
Instead: sensor runs in permanent 1Hz mode (TRAINING_MODE=1 in firmware), and YOU label
events by pressing a button when you vape.

Usage:
    1. Flash firmware with TRAINING_MODE 1
    2. python training_collector.py            (auto-detects COM port)
       python training_collector.py --port COM5  (or specify)
    3. Wait ~45s for sensor warmup (orange flashes → green LED)
    4. Click [VAPE] when you start vaping, click [STOP] when cloud dissipates (~30s)
    5. Repeat 15-20 times with 1-2 min rest between
    6. Click [TRAIN MODELS] → models saved to backend/models/
    7. Upload to Railway, done.
"""

import sys
import os
import json
import time
import threading
import argparse
import traceback
from datetime import datetime, timezone, timedelta
from pathlib import Path
from collections import deque

import tkinter as tk
from tkinter import messagebox

import serial
import serial.tools.list_ports

# ── Backend imports ──────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.feature_engine import FeatureEngine
from app.class_config import FEATURE_ORDER

MODELS_DIR = BACKEND_DIR / "models"
DATA_DIR = BACKEND_DIR / "training" / "serial_captures"
BAUD = 115200

# ── Colors ───────────────────────────────────────────────────────────────────
BG = "#0f0f1a"
BG_CARD = "#1a1a2e"
FG = "#e0e0e0"
FG_DIM = "#666"
GREEN = "#22c55e"
RED = "#ef4444"
AMBER = "#f59e0b"
TEAL = "#4ecca3"


def find_serial_port():
    ports = serial.tools.list_ports.comports()
    for p in ports:
        desc = (p.description or "").lower()
        if any(x in desc for x in ("cp210", "ch340", "usb", "serial", "jtag")):
            return p.device
    for p in ports:
        if "COM" in p.device.upper():
            return p.device
    return None


def parse_sensor_line(line):
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


class TrainingCollector:
    def __init__(self, port=None):
        self.port = port or find_serial_port()
        self.ser = None
        self.running = True

        self.samples = []
        self.lock = threading.Lock()

        # Events: [{label, start_idx, end_idx, pm25_peak, duration_sec}]
        self.events = []

        # Labeling state
        self.labeling = False
        self.label_start_idx = 0
        self.label_start_time = None
        self.current_label = None

        # Sensor warmup tracking
        self.warmup_done = False
        self.warmup_count = 0

        self.latest = {}
        self.hz = 0.0
        self._hz_timestamps = deque(maxlen=10)

        self._build_gui()
        self._connect_serial()

    # ── GUI ───────────────────────────────────────────────────────────────

    def _build_gui(self):
        self.root = tk.Tk()
        self.root.title("Training Collector")
        self.root.geometry("600x750")
        self.root.configure(bg=BG)
        self.root.attributes("-topmost", True)
        self.root.protocol("WM_DELETE_WINDOW", self._quit)

        # Header
        hdr = tk.Frame(self.root, bg=BG_CARD, pady=8)
        hdr.pack(fill="x")
        tk.Label(hdr, text="TRAINING COLLECTOR", font=("Consolas", 16, "bold"),
                 fg=FG, bg=BG_CARD).pack()
        self.status_bar = tk.Label(hdr, text="Connecting...", font=("Consolas", 9),
                                   fg=FG_DIM, bg=BG_CARD)
        self.status_bar.pack()

        # Sensor readings
        readings_frame = tk.Frame(self.root, bg=BG, pady=10, padx=20)
        readings_frame.pack(fill="x")

        self.reading_labels = {}
        for name, unit, max_val in [
            ("PM2.5", "", 100), ("PM1", "", 80), ("PM10", "", 120),
            ("Gas", "kΩ", 500), ("Humidity", "%", 100), ("Temp", "°C", 50)
        ]:
            row = tk.Frame(readings_frame, bg=BG)
            row.pack(fill="x", pady=2)
            tk.Label(row, text=f"{name:>8}", font=("Consolas", 10),
                     fg=FG_DIM, bg=BG, width=9, anchor="e").pack(side="left")
            bar_canvas = tk.Canvas(row, width=300, height=16, bg="#1a1a2e",
                                    highlightthickness=0)
            bar_canvas.pack(side="left", padx=(8, 8))
            bar_rect = bar_canvas.create_rectangle(0, 0, 0, 16, fill=TEAL, outline="")
            val_label = tk.Label(row, text="--", font=("Consolas", 10, "bold"),
                                  fg=FG, bg=BG, width=10, anchor="w")
            val_label.pack(side="left")
            self.reading_labels[name] = (bar_canvas, bar_rect, val_label, max_val, unit)

        # Warmup / status message
        self.msg_label = tk.Label(self.root, text="Waiting for sensor data...",
                                   font=("Consolas", 11), fg=AMBER, bg=BG, pady=5)
        self.msg_label.pack()

        # Big action button
        btn_frame = tk.Frame(self.root, bg=BG, pady=10)
        btn_frame.pack(fill="x", padx=30)

        self.vape_btn = tk.Button(btn_frame, text="MARK VAPE EVENT",
                                   font=("Consolas", 16, "bold"),
                                   fg="white", bg="#16a34a", activebackground="#15803d",
                                   relief="flat", pady=15, cursor="hand2",
                                   command=self._toggle_vape_label)
        self.vape_btn.pack(fill="x")

        # Timer label (shown during active labeling)
        self.timer_label = tk.Label(self.root, text="", font=("Consolas", 20, "bold"),
                                     fg=RED, bg=BG)
        self.timer_label.pack()

        # Event summary
        summary_frame = tk.Frame(self.root, bg=BG, padx=20)
        summary_frame.pack(fill="x", pady=(5, 0))
        self.summary_label = tk.Label(summary_frame, text="Events: 0",
                                       font=("Consolas", 11, "bold"), fg=TEAL, bg=BG,
                                       anchor="w")
        self.summary_label.pack(fill="x")

        # Event log
        log_frame = tk.Frame(self.root, bg=BG, padx=20)
        log_frame.pack(fill="both", expand=True, pady=(5, 10))
        self.log_text = tk.Text(log_frame, font=("Consolas", 9), bg=BG_CARD,
                                 fg=TEAL, height=8, state="disabled",
                                 relief="flat", padx=8, pady=8)
        self.log_text.pack(fill="both", expand=True)

        # Bottom buttons
        bottom = tk.Frame(self.root, bg=BG, padx=20, pady=10)
        bottom.pack(fill="x")

        self.train_btn = tk.Button(bottom, text="TRAIN MODELS",
                                    font=("Consolas", 12, "bold"),
                                    fg=BG, bg=AMBER, activebackground="#d97706",
                                    relief="flat", pady=8, cursor="hand2",
                                    command=self._train_models)
        self.train_btn.pack(side="left", expand=True, fill="x", padx=(0, 5))

        self.save_btn = tk.Button(bottom, text="SAVE & QUIT",
                                   font=("Consolas", 12, "bold"),
                                   fg=BG, bg=TEAL, activebackground="#3ba88a",
                                   relief="flat", pady=8, cursor="hand2",
                                   command=self._quit)
        self.save_btn.pack(side="right", expand=True, fill="x", padx=(5, 0))

    # ── Serial ────────────────────────────────────────────────────────────

    def _connect_serial(self):
        if not self.port:
            self.status_bar.config(text="ERROR: No serial port found", fg=RED)
            return
        try:
            self.ser = serial.Serial(self.port, BAUD, timeout=1)
            self.status_bar.config(text=f"{self.port} @ {BAUD} | 0 samples")
            t = threading.Thread(target=self._serial_loop, daemon=True)
            t.start()
        except Exception as e:
            self.status_bar.config(text=f"ERROR: {e}", fg=RED)

    def _serial_loop(self):
        while self.running:
            try:
                raw = self.ser.readline()
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="ignore").strip()
                if not line:
                    continue

                if "WARMUP:" in line:
                    try:
                        n = int(line.split("WARMUP:")[1].strip().split("/")[0])
                        self.root.after(0, self._update_warmup, n)
                    except Exception:
                        pass
                    continue

                if "READY:" in line:
                    self.root.after(0, self._warmup_complete)
                    continue

                sample = parse_sensor_line(line)
                if sample:
                    self._hz_timestamps.append(time.monotonic())
                    with self.lock:
                        self.samples.append(sample)
                        self.latest = sample
                    self.root.after(0, self._update_display)

            except Exception:
                if self.running:
                    time.sleep(0.5)

    # ── Display updates ───────────────────────────────────────────────────

    def _update_warmup(self, n):
        self.warmup_count = n
        self.msg_label.config(text=f"Sensor warming up... {n}/45s", fg=AMBER)
        self.vape_btn.config(state="disabled", bg="#555")

    def _warmup_complete(self):
        self.warmup_done = True
        self.msg_label.config(text="READY — vape and press the button!", fg=GREEN)
        self.vape_btn.config(state="normal", bg="#16a34a")

    def _update_display(self):
        s = self.latest
        if not s:
            return

        # Auto-detect warmup complete if firmware doesn't send READY line
        if not self.warmup_done:
            with self.lock:
                n = len(self.samples)
            if n > 50:
                self._warmup_complete()

        mapping = {
            "PM2.5": (s["pm25"], ""),
            "PM1": (s["pm1"], ""),
            "PM10": (s["pm10"], ""),
            "Gas": (s["gas_resistance"], " kΩ"),
            "Humidity": (s["humidity"], "%"),
            "Temp": (s["temperature"], "°C"),
        }

        for name, (val, unit) in mapping.items():
            if name in self.reading_labels:
                canvas, rect, label, max_v, _ = self.reading_labels[name]
                bar_w = min(300, max(0, int(300 * val / max_v)))
                canvas.coords(rect, 0, 0, bar_w, 16)

                color = TEAL
                if name == "PM2.5" and self.labeling:
                    color = RED
                elif name == "PM2.5" and val > 10:
                    color = AMBER
                canvas.itemconfig(rect, fill=color)

                label.config(text=f"{val:.1f}{unit}")

        # Hz calculation
        if len(self._hz_timestamps) >= 2:
            span = self._hz_timestamps[-1] - self._hz_timestamps[0]
            if span > 0:
                self.hz = (len(self._hz_timestamps) - 1) / span

        with self.lock:
            n = len(self.samples)
        self.status_bar.config(
            text=f"{self.port} | {n} samples | {self.hz:.1f} Hz",
            fg=FG_DIM)

        # Update timer during labeling
        if self.labeling and self.label_start_time:
            elapsed = time.time() - self.label_start_time
            self.timer_label.config(text=f"{elapsed:.0f}s")

    # ── Labeling ──────────────────────────────────────────────────────────

    def _toggle_vape_label(self):
        if not self.labeling:
            self._start_label("vape")
        else:
            self._stop_label()

    def _start_label(self, label):
        with self.lock:
            self.label_start_idx = len(self.samples)
        self.label_start_time = time.time()
        self.labeling = True
        self.current_label = label

        self.vape_btn.config(text="STOP  (vaping...)", bg=RED, activebackground="#b91c1c")
        self.msg_label.config(text="RECORDING — press STOP when smoke clears", fg=RED)
        self.timer_label.config(text="0s")

    def _stop_label(self):
        with self.lock:
            end_idx = len(self.samples)
            start_idx = self.label_start_idx
            duration = end_idx - start_idx

            if duration < 5:
                self.msg_label.config(
                    text=f"Event too short ({duration}s) — dropped. Hold for 10-30s.", fg=AMBER)
            else:
                # Calculate peak PM2.5 in this event
                event_samples = self.samples[start_idx:end_idx]
                pm25_vals = [s["pm25"] for s in event_samples if s["pm25"] > 0]
                pm25_peak = max(pm25_vals) if pm25_vals else 0

                # Get baseline PM2.5 (10s before event)
                base_start = max(0, start_idx - 10)
                base_samples = self.samples[base_start:start_idx]
                base_pm25 = 0
                if base_samples:
                    base_vals = [s["pm25"] for s in base_samples]
                    base_pm25 = sum(base_vals) / len(base_vals) if base_vals else 0

                self.events.append({
                    "label": self.current_label,
                    "start_idx": start_idx,
                    "end_idx": end_idx,
                    "pm25_peak": pm25_peak,
                    "pm25_base": base_pm25,
                    "duration_sec": duration,
                })

                n = len(self.events)
                self.summary_label.config(text=f"Events: {n} vape")
                self.msg_label.config(
                    text=f"Event #{n} saved — {duration}s, peak PM2.5={pm25_peak:.1f} (base={base_pm25:.1f})",
                    fg=GREEN)

                self.log_text.config(state="normal")
                ts = datetime.now().strftime("%H:%M:%S")
                self.log_text.insert("end",
                    f"  #{n:>2}  {ts}  {self.current_label:>8}  {duration:>3}s  "
                    f"peak={pm25_peak:>6.1f}  base={base_pm25:>5.1f}\n")
                self.log_text.see("end")
                self.log_text.config(state="disabled")

        self.labeling = False
        self.current_label = None
        self.label_start_time = None
        self.timer_label.config(text="")
        self.vape_btn.config(text="MARK VAPE EVENT", bg="#16a34a", activebackground="#15803d")

    # ── Training ──────────────────────────────────────────────────────────

    def _train_models(self):
        if len(self.events) < 3:
            messagebox.showwarning("Need More Data",
                f"Only {len(self.events)} events. Collect at least 5 (recommend 15-20).")
            return

        self.train_btn.config(state="disabled", text="TRAINING...")
        self.root.update()

        try:
            report = self._do_training()
            messagebox.showinfo("Training Complete", report)
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
            xgb_avail = True
        except ImportError:
            xgb_avail = False

        BASELINE_SEC = 10
        EVENT_SEC = 20
        SLIDE_STEP = 5

        all_rows = []

        # ── Vape events: slide windows through each labeled event ──
        for ev in self.events:
            start = ev["start_idx"]
            end = ev["end_idx"]
            label = ev["label"]

            t = start
            while t + EVENT_SEC <= end:
                base_start = max(0, t - BASELINE_SEC)
                baseline = self.samples[base_start:t]
                event = self.samples[t:t + EVENT_SEC]

                if len(baseline) >= 2 and len(event) >= 3:
                    try:
                        feats = FeatureEngine.compute_features(baseline, event)
                        all_rows.append((feats, label))
                    except Exception:
                        pass
                t += SLIDE_STEP

            # If event is shorter than EVENT_SEC, use the whole thing as one window
            if end - start < EVENT_SEC and end - start >= 5:
                base_start = max(0, start - BASELINE_SEC)
                baseline = self.samples[base_start:start]
                event = self.samples[start:end]
                if len(baseline) >= 2 and len(event) >= 3:
                    try:
                        feats = FeatureEngine.compute_features(baseline, event)
                        all_rows.append((feats, label))
                    except Exception:
                        pass

        vape_count = sum(1 for _, l in all_rows if l != "normal")

        # ── Clean air: windows from non-event periods ──
        event_ranges = sorted([(e["start_idx"], e["end_idx"]) for e in self.events])
        clean_ranges = []
        prev_end = 0
        for (s, e) in event_ranges:
            gap_start = prev_end
            gap_end = max(0, s - 5)
            if gap_end - gap_start >= BASELINE_SEC + EVENT_SEC:
                clean_ranges.append((gap_start, gap_end))
            prev_end = e + 5

        total = len(self.samples)
        if total - prev_end >= BASELINE_SEC + EVENT_SEC:
            clean_ranges.append((prev_end, total))

        for (rng_start, rng_end) in clean_ranges:
            t = rng_start + BASELINE_SEC
            while t + EVENT_SEC <= rng_end:
                baseline = self.samples[t - BASELINE_SEC:t]
                event = self.samples[t:t + EVENT_SEC]
                if len(baseline) >= 2 and len(event) >= 3:
                    try:
                        feats = FeatureEngine.compute_features(baseline, event)
                        all_rows.append((feats, "normal"))
                    except Exception:
                        pass
                t += SLIDE_STEP

        normal_count = sum(1 for _, l in all_rows if l == "normal")

        if not all_rows:
            raise RuntimeError("No training windows generated!")

        if vape_count == 0 or normal_count == 0:
            raise RuntimeError(
                f"Need both classes. Got {vape_count} vape, {normal_count} normal windows.\n"
                f"Make sure you have idle time between events for clean-air data.")

        # ── Build matrix ──
        X = np.array([[float(f.get(k) or 0.0) for k in FEATURE_ORDER] for f, _ in all_rows])
        y = np.array([l for _, l in all_rows])

        from collections import Counter
        counts = Counter(y)
        lines = [f"Training data: {len(X)} windows", f"  Classes: {dict(counts)}"]

        try:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.20, random_state=42, stratify=y)
        except ValueError:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.20, random_state=42)

        sw = compute_sample_weight("balanced", y=y_train)
        MODELS_DIR.mkdir(parents=True, exist_ok=True)

        # RF
        rf = RandomForestClassifier(n_estimators=300, random_state=42,
                                    class_weight="balanced_subsample")
        rf.fit(X_train, y_train, sample_weight=sw)
        joblib.dump(rf, MODELS_DIR / "rf_model.joblib")
        acc_rf = float((rf.predict(X_test) == y_test).mean())
        lines.append(f"  RF:  accuracy={acc_rf:.1%}")

        # LR
        scaler = StandardScaler()
        X_train_s = scaler.fit_transform(X_train)
        lr = LogisticRegression(random_state=42, max_iter=1000,
                                class_weight="balanced", solver="lbfgs",
                                multi_class="multinomial")
        lr.fit(X_train_s, y_train, sample_weight=sw)
        lr._scaler = scaler
        joblib.dump(lr, MODELS_DIR / "lr_model.joblib")
        acc_lr = float((lr.predict(scaler.transform(X_test)) == y_test).mean())
        lines.append(f"  LR:  accuracy={acc_lr:.1%}")

        # XGB
        if xgb_avail:
            le = LabelEncoder()
            yt_enc = le.fit_transform(y_train)
            xgb = XGBClassifier(random_state=42, eval_metric="mlogloss",
                                n_estimators=400, max_depth=6,
                                learning_rate=0.05, subsample=0.9,
                                colsample_bytree=0.9)
            xgb.fit(X_train, yt_enc, sample_weight=sw)
            xgb.custom_classes_ = le.classes_
            joblib.dump(xgb, MODELS_DIR / "xgb_model.joblib")
            y_pred = le.classes_[xgb.predict(X_test)]
            acc_xgb = float((y_pred == y_test).mean())
            lines.append(f"  XGB: accuracy={acc_xgb:.1%}")

        # Save session
        data_path = self._save_session()
        lines.append(f"\nModels saved to {MODELS_DIR}/")
        lines.append(f"Session saved to {data_path}")
        lines.append(f"\nNext: upload models to Railway")

        self.msg_label.config(text=f"TRAINED — RF={acc_rf:.0%} LR={acc_lr:.0%}", fg=GREEN)

        return "\n".join(lines)

    # ── Save / Quit ───────────────────────────────────────────────────────

    def _save_session(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = DATA_DIR / f"session_{ts}.json"

        def ser(s):
            out = {}
            for k, v in s.items():
                if isinstance(v, datetime):
                    out[k] = v.isoformat()
                else:
                    out[k] = v
            return out

        with self.lock:
            data = {
                "captured_at": datetime.now(timezone.utc).isoformat(),
                "n_samples": len(self.samples),
                "n_events": len(self.events),
                "events": self.events,
                "samples": [ser(s) for s in self.samples],
            }

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return path

    def _quit(self):
        self.running = False
        if self.ser:
            try:
                self.ser.close()
            except Exception:
                pass

        if self.events or len(self.samples) > 60:
            path = self._save_session()
            print(f"Session saved: {path}")

        self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Vape detection training collector")
    parser.add_argument("--port", help="Serial port (e.g. COM5). Auto-detects if omitted.")
    parser.add_argument("--baud", type=int, default=115200)
    args = parser.parse_args()

    app = TrainingCollector(port=args.port)
    app.run()
