"""
Training Monitor GUI — visual indicator that lights up on DEEP_SENSE.
Auto-records timestamps. Shows countdown to next sniff so you know when to vape.
"""

import tkinter as tk
import serial
import threading
import json
import time
from datetime import datetime, timezone, timedelta

PORT = "COM3"
BAUD = 115200
LABELS_PATH = "backend/training/bmv080_v2_labels.json"
SNIFF_INTERVAL = 60

class TrainingMonitor:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Mistio Training Monitor")
        self.root.geometry("500x750")
        self.root.configure(bg="#1a1a2e")
        self.root.attributes("-topmost", True)

        self.events = []
        self.session_start = datetime.now(timezone.utc)
        self.in_deep_sense = False
        self.running = True
        self.last_heartbeat_time = None

        self.build_ui()
        self.connect_serial()
        self.tick_countdown()

    def build_ui(self):
        tk.Label(self.root, text="TRAINING MONITOR", font=("Consolas", 18, "bold"),
                 fg="#e0e0e0", bg="#1a1a2e").pack(pady=(15, 5))

        # Big status indicator
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

        # Countdown to next sniff
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

        # Event log
        log_frame = tk.Frame(self.root, bg="#1a1a2e")
        log_frame.pack(pady=10, fill="both", expand=True, padx=20)

        tk.Label(log_frame, text="Detected Events:", font=("Consolas", 10, "bold"),
                 fg="#aaa", bg="#1a1a2e", anchor="w").pack(fill="x")

        self.log_text = tk.Text(log_frame, font=("Consolas", 10), bg="#0f0f23",
                                 fg="#4ecca3", height=8, state="disabled",
                                 relief="flat", padx=8, pady=8)
        self.log_text.pack(fill="both", expand=True)

        # Serial line display
        self.serial_label = tk.Label(self.root, text="", font=("Consolas", 8),
                                      fg="#555", bg="#1a1a2e", wraplength=460, anchor="w")
        self.serial_label.pack(padx=20, fill="x")

        # Save button
        self.save_btn = tk.Button(self.root, text="SAVE LABELS & QUIT",
                                   font=("Consolas", 12, "bold"),
                                   fg="#1a1a2e", bg="#4ecca3", activebackground="#3ba88a",
                                   relief="flat", padx=20, pady=8, command=self.save_and_quit)
        self.save_btn.pack(pady=15)

        self.root.protocol("WM_DELETE_WINDOW", self.save_and_quit)

    def connect_serial(self):
        try:
            self.ser = serial.Serial(PORT, BAUD, timeout=1)
            self.sub_label.config(text=f"Connected to {PORT}")
            self.serial_thread = threading.Thread(target=self.read_serial, daemon=True)
            self.serial_thread.start()
        except Exception as e:
            self.sub_label.config(text=f"ERROR: {e}", fg="#e74c3c")

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

        if "LOCAL SPIKE" in line or "SNIFF -> DEEP_SENSE" in line:
            if not self.in_deep_sense:
                self.in_deep_sense = True
                ts = datetime.now(timezone.utc)
                self.events.append(ts)
                self.set_state("deep_sense", ts)

        elif "Deep sense complete" in line:
            self.in_deep_sense = False
            self.set_state("cooldown")

        elif "COOLDOWN" in line and "SNIFF" in line:
            self.last_heartbeat_time = time.time()
            self.set_state("sniff")

        elif "Baseline frozen" in line:
            self.last_heartbeat_time = time.time()
            self.set_state("ready")

        elif "Heartbeat POST" in line and not self.in_deep_sense:
            self.last_heartbeat_time = time.time()
            self.set_state("sniff")

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

    def set_state(self, state, ts=None):
        if state == "deep_sense":
            self.status_light.itemconfig(self.light_circle, fill="#e74c3c")
            self.status_label.config(text="DEEP SENSE", fg="#e74c3c")
            n = len(self.events)
            local = ts.astimezone().strftime("%I:%M:%S %p")
            utc = ts.strftime("%H:%M:%SZ")
            self.sub_label.config(text=f"Vape #{n} detected!", fg="#e74c3c")
            self.count_label.config(text=str(n))
            self.countdown_label.config(text="!!", fg="#e74c3c")
            self.vape_hint.config(text="CAPTURED!", fg="#e74c3c")
            self.log_text.config(state="normal")
            self.log_text.insert("end", f"  #{n}  {local}  ({utc})\n")
            self.log_text.see("end")
            self.log_text.config(state="disabled")
            self.flash_window()

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

    def save_and_quit(self):
        self.running = False
        try:
            self.ser.close()
        except Exception:
            pass

        if self.events:
            all_events = []

            clean_start = self.session_start
            clean_end = self.events[0] - timedelta(seconds=30)
            if clean_end > clean_start:
                all_events.append({
                    "event_id": "clean_air_v2_001",
                    "event_type": "clean_air",
                    "start_time_zulu": clean_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "end_time_zulu": clean_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "notes": "Pre-training idle baseline"
                })

            clean2_start = self.events[-1] + timedelta(minutes=2)
            clean2_end = clean2_start + timedelta(minutes=30)
            all_events.append({
                "event_id": "clean_air_v2_002",
                "event_type": "clean_air",
                "start_time_zulu": clean2_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end_time_zulu": clean2_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "notes": "Post-training idle (leave sensor running 30 min)"
            })

            for i, ts in enumerate(self.events, 1):
                all_events.append({
                    "event_id": f"vape_v2_{i:03d}",
                    "event_type": "vape",
                    "start_time_zulu": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "end_time_zulu": None,
                    "notes": ""
                })

            with open(LABELS_PATH, "w", encoding="utf-8") as f:
                json.dump({"events": all_events}, f, indent=2)

            print(f"\nSaved {len(self.events)} events to {LABELS_PATH}")

        self.root.destroy()

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    app = TrainingMonitor()
    app.run()
