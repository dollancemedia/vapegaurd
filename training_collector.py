"""
Mistio Training Studio — long-session capture with manual spike selection.

Records everything the sensor emits, draws it on a scrubable timeline, and lets
you mark spikes either live (as you vape) or afterwards by dragging across the
chart. Built for multi-hour sessions with 20-30+ events.

Works with BOTH firmware modes:
  * TRAINING_MODE 1 — continuous 1Hz `SENSOR:` lines, no WiFi. Best for capture.
  * TRAINING_MODE 0 — production. Sparse 1Hz during STARTUP/DEEP_SENSE plus a
    60s `Sniff #N:` heartbeat. The timeline draws duty-cycle state bands so you
    can watch SNIFF <-> DEEP_SENSE and BMV080 duty <-> continuous transitions.

Usage:
    python training_collector.py                 (auto-detects COM port)
    python training_collector.py --port COM5

    1. Wait for the sensor to warm up (status turns green).
    2. Either press MARK SPIKE while vaping, or just vape and select the spike
       on the timeline afterwards by dragging across it.
    3. Pick the label, hit ADD SELECTION.
    4. TRAIN MODELS when you have 15-20+ events.

Sessions autosave every 2 minutes to backend/training/serial_captures/.
"""

import sys
import os
import json
import time
import threading
import argparse
import traceback
from datetime import datetime, timezone
from pathlib import Path
from collections import deque, Counter

import tkinter as tk
from tkinter import messagebox, ttk

import serial
import serial.tools.list_ports

# ── Backend imports ──────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.feature_engine import FeatureEngine
from app.class_config import FEATURE_ORDER

MODELS_DIR = BACKEND_DIR / "models"
DATA_DIR = BACKEND_DIR / "training" / "serial_captures"
CLASSES_FILE = BACKEND_DIR / "classifications.txt"
BAUD = 115200
AUTOSAVE_SEC = 120

# ── Palette ──────────────────────────────────────────────────────────────────
BG        = "#0b0e14"
BG_PANEL  = "#12161f"
BG_CARD   = "#171c26"
BG_INPUT  = "#1e2430"
BORDER    = "#232936"
FG        = "#e6e9ef"
FG_MID    = "#9aa4b2"
FG_DIM    = "#5f6875"
ACCENT    = "#4ecca3"
RED       = "#ef4444"
AMBER     = "#f59e0b"
BLUE      = "#3b82f6"
PURPLE    = "#a78bfa"
GRID      = "#1d2330"

# State -> colour for the timeline band
STATE_COLORS = {
    "startup":    AMBER,
    "sniff":      ACCENT,
    "deep_sense": RED,
    "cooldown":   BLUE,
    "training":   PURPLE,
    "unknown":    "#2a3140",
}

LABEL_COLORS = {
    "vape":       RED,
    "cologne":    PURPLE,
    "hair spray": "#ec4899",
    "cleaning":   BLUE,
    "shower":     "#06b6d4",
    "normal":     FG_DIM,
}

FONT_UI     = "Segoe UI"
FONT_MONO   = "Consolas"


def load_classes():
    """Label options, from backend/classifications.txt with a safe fallback."""
    try:
        raw = CLASSES_FILE.read_text(encoding="utf-8")
        vals = [ln.strip() for ln in raw.splitlines() if ln.strip()]
        # 'normal' is the implicit clean-air class, not a spike label
        return [v for v in vals if v.lower() != "normal"] or ["vape"]
    except Exception:
        return ["vape", "cologne", "hair spray", "cleaning", "shower"]


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
    """`SENSOR: T=.. H=.. P=.. G=.. PM1=.. PM25=.. PM10=..` — 1Hz full sample."""
    if "SENSOR:" not in line:
        return None
    try:
        parts = line.split("SENSOR:")[1].strip().split()
        data = {}
        for part in parts:
            if "=" not in part:
                continue
            key, val = part.split("=", 1)
            try:
                data[key] = float(val)
            except ValueError:
                continue
        if "PM25" not in data:
            return None
        return {
            "temperature":    data.get("T", 0.0),
            "humidity":       data.get("H", 0.0),
            "pressure":       data.get("P", 0.0),
            "gas_resistance": data.get("G", 0.0),
            "pm1":            data.get("PM1", 0.0),
            "pm25":           data.get("PM25", 0.0),
            "pm10":           data.get("PM10", 0.0),
        }
    except Exception:
        return None


def parse_sniff_line(line):
    """`Sniff #12: PM2.5=13.6 (base=11.2, d=2.4) Gas=22.0 Batt=3.31V Heap=134000`

    Production firmware's 60s heartbeat. Carries fewer fields than SENSOR:, so
    temperature/humidity land as None and are skipped for training windows.
    """
    if "Sniff #" not in line or "PM2.5=" not in line:
        return None
    try:
        out = {}
        seg = line.split("PM2.5=", 1)[1]
        out["pm25"] = float(seg.split()[0].strip("(),"))
        if "Gas=" in line:
            out["gas_resistance"] = float(line.split("Gas=", 1)[1].split()[0].strip("(),V"))
        if "Batt=" in line:
            out["battery"] = float(line.split("Batt=", 1)[1].split("V")[0])
        if "Heap=" in line:
            out["heap"] = int(float(line.split("Heap=", 1)[1].split()[0]))
        out.setdefault("gas_resistance", 0.0)
        out.update({"temperature": 0.0, "humidity": 0.0, "pressure": 0.0,
                    "pm1": 0.0, "pm10": 0.0})
        return out
    except Exception:
        return None


class TrainingStudio:
    def __init__(self, port=None, baud=BAUD):
        # forced_port comes from --port and pins us to one device; otherwise we
        # re-scan on every reconnect so unplug/replug just works.
        self.forced_port = port
        self.active_port = None
        self.baud = baud
        self.ser = None
        self.conn_status = "searching"
        self.running = True

        self.samples = []          # every captured sample, in order
        self.lock = threading.Lock()
        self.events = []           # {label, start_idx, end_idx, pm25_peak, pm25_base, duration_sec}

        # Live labelling
        self.labeling = False
        self.label_start_idx = 0
        self.label_start_time = None

        # Firmware state tracking
        self.fw_state = "unknown"
        self.bmv_mode = "-"
        # Mirrors the device's live-capture flag. Only ever set from the
        # firmware's own LIVE: replies, never optimistically on click, so the
        # button always reflects what the board is actually doing.
        self.live_mode = False
        self.battery = None
        self.heap = None
        self.warmup_done = False

        # Timeline view + selection (indices into self.samples)
        self.view_start = 0
        self.view_span = 0         # 0 == full session
        self.sel_start = None
        self.sel_end = None
        self._drag_anchor = None

        self.latest = {}
        self.hz = 0.0
        self._hz_ts = deque(maxlen=15)
        self.session_start = time.time()
        self._last_autosave = time.time()
        self._last_save_path = None

        self.classes = load_classes()

        self._build_gui()
        self._connect_serial()
        self._tick()

    # ── GUI construction ──────────────────────────────────────────────────

    def _build_gui(self):
        self.root = tk.Tk()
        self.root.title("Mistio Training Studio")
        self.root.geometry("1180x880")
        self.root.minsize(980, 720)
        self.root.configure(bg=BG)
        self.root.protocol("WM_DELETE_WINDOW", self._quit)

        self._build_header()
        self._build_live_panel()
        self._build_timeline()
        self._build_controls()
        self._build_event_list()
        self._build_footer()

    def _card(self, parent, **kw):
        """A panel with a 1px border, faked via an outer frame."""
        outer = tk.Frame(parent, bg=BORDER, **kw)
        inner = tk.Frame(outer, bg=BG_CARD)
        inner.pack(fill="both", expand=True, padx=1, pady=1)
        return outer, inner

    def _build_header(self):
        bar = tk.Frame(self.root, bg=BG_PANEL, height=60)
        bar.pack(fill="x")
        bar.pack_propagate(False)

        left = tk.Frame(bar, bg=BG_PANEL)
        left.pack(side="left", padx=20)
        tk.Label(left, text="MISTIO", font=(FONT_UI, 15, "bold"),
                 fg=ACCENT, bg=BG_PANEL).pack(side="left")
        tk.Label(left, text="TRAINING STUDIO", font=(FONT_UI, 15),
                 fg=FG, bg=BG_PANEL).pack(side="left", padx=(7, 0))

        right = tk.Frame(bar, bg=BG_PANEL)
        right.pack(side="right", padx=20)
        self.conn_label = tk.Label(right, text="connecting...",
                                   font=(FONT_MONO, 10), fg=FG_DIM, bg=BG_PANEL)
        self.conn_label.pack(side="right")

        mid = tk.Frame(bar, bg=BG_PANEL)
        mid.pack(side="left", padx=30)
        self.rec_dot = tk.Label(mid, text="●", font=(FONT_UI, 13),
                                fg=FG_DIM, bg=BG_PANEL)
        self.rec_dot.pack(side="left")
        self.rec_label = tk.Label(mid, text="waiting", font=(FONT_MONO, 10),
                                  fg=FG_MID, bg=BG_PANEL)
        self.rec_label.pack(side="left", padx=(6, 0))

    def _build_live_panel(self):
        wrap = tk.Frame(self.root, bg=BG)
        wrap.pack(fill="x", padx=16, pady=(14, 8))

        # Left: sensor bars
        o1, bars = self._card(wrap)
        o1.pack(side="left", fill="both", expand=True, padx=(0, 8))
        tk.Label(bars, text="LIVE READINGS", font=(FONT_UI, 9, "bold"),
                 fg=FG_DIM, bg=BG_CARD, anchor="w").pack(fill="x", padx=14, pady=(11, 7))

        self.reading_widgets = {}
        for name, unit, max_val in [
            ("PM2.5", "", 100), ("PM1", "", 80), ("PM10", "", 120),
            ("Gas", " kΩ", 500), ("Humidity", "%", 100), ("Temp", "°C", 50),
        ]:
            row = tk.Frame(bars, bg=BG_CARD)
            row.pack(fill="x", padx=14, pady=3)
            tk.Label(row, text=name, font=(FONT_UI, 10), fg=FG_MID, bg=BG_CARD,
                     width=9, anchor="w").pack(side="left")
            cv = tk.Canvas(row, width=250, height=10, bg=BG_INPUT,
                           highlightthickness=0)
            cv.pack(side="left", padx=(4, 10))
            rect = cv.create_rectangle(0, 0, 0, 10, fill=ACCENT, outline="")
            val = tk.Label(row, text="--", font=(FONT_MONO, 11, "bold"),
                           fg=FG, bg=BG_CARD, width=11, anchor="w")
            val.pack(side="left")
            self.reading_widgets[name] = (cv, rect, val, max_val, unit)
        tk.Frame(bars, bg=BG_CARD, height=10).pack()

        # Right: firmware status
        o2, stat = self._card(wrap)
        o2.pack(side="left", fill="both", padx=(8, 0))
        tk.Label(stat, text="SENSOR STATE", font=(FONT_UI, 9, "bold"),
                 fg=FG_DIM, bg=BG_CARD, anchor="w").pack(fill="x", padx=14, pady=(11, 7))

        self.stat_labels = {}
        for key, caption in [("capture", "Capture mode"), ("state", "State"),
                             ("bmv", "BMV080"), ("batt", "Battery"),
                             ("heap", "Free heap"), ("rate", "Sample rate"),
                             ("elapsed", "Elapsed")]:
            row = tk.Frame(stat, bg=BG_CARD)
            row.pack(fill="x", padx=14, pady=3)
            tk.Label(row, text=caption, font=(FONT_UI, 10), fg=FG_MID,
                     bg=BG_CARD, width=12, anchor="w").pack(side="left")
            v = tk.Label(row, text="--", font=(FONT_MONO, 11, "bold"),
                         fg=FG, bg=BG_CARD, width=16, anchor="w")
            v.pack(side="left")
            self.stat_labels[key] = v
        tk.Frame(stat, bg=BG_CARD, height=10).pack()

    def _build_timeline(self):
        outer, card = self._card(self.root)
        outer.pack(fill="both", expand=True, padx=16, pady=8)

        head = tk.Frame(card, bg=BG_CARD)
        head.pack(fill="x", padx=14, pady=(11, 6))
        tk.Label(head, text="TIMELINE", font=(FONT_UI, 9, "bold"),
                 fg=FG_DIM, bg=BG_CARD).pack(side="left")
        tk.Label(head, text="drag across a spike to select it",
                 font=(FONT_UI, 9), fg=FG_DIM, bg=BG_CARD).pack(side="left", padx=(12, 0))

        self.sel_label = tk.Label(head, text="", font=(FONT_MONO, 9),
                                  fg=ACCENT, bg=BG_CARD)
        self.sel_label.pack(side="right")

        self.canvas = tk.Canvas(card, bg=BG_PANEL, highlightthickness=0, height=260)
        self.canvas.pack(fill="both", expand=True, padx=14, pady=(0, 8))
        self.canvas.bind("<Button-1>", self._on_drag_start)
        self.canvas.bind("<B1-Motion>", self._on_drag_move)
        self.canvas.bind("<ButtonRelease-1>", self._on_drag_end)
        self.canvas.bind("<Configure>", lambda e: self._draw_timeline())

        zoom = tk.Frame(card, bg=BG_CARD)
        zoom.pack(fill="x", padx=14, pady=(0, 11))
        tk.Label(zoom, text="View", font=(FONT_UI, 9), fg=FG_DIM,
                 bg=BG_CARD).pack(side="left", padx=(0, 8))
        for caption, span in [("Full session", 0), ("30 min", 1800),
                              ("10 min", 600), ("2 min", 120)]:
            b = tk.Button(zoom, text=caption, font=(FONT_UI, 9),
                          fg=FG_MID, bg=BG_INPUT, activebackground=BORDER,
                          activeforeground=FG, relief="flat", padx=12, pady=4,
                          cursor="hand2", bd=0,
                          command=lambda s=span: self._set_zoom(s))
            b.pack(side="left", padx=3)

        self.follow_var = tk.BooleanVar(value=True)
        tk.Checkbutton(zoom, text="Follow live", variable=self.follow_var,
                       font=(FONT_UI, 9), fg=FG_MID, bg=BG_CARD,
                       selectcolor=BG_INPUT, activebackground=BG_CARD,
                       activeforeground=FG, bd=0, highlightthickness=0,
                       command=self._draw_timeline).pack(side="right")

    def _build_controls(self):
        wrap = tk.Frame(self.root, bg=BG)
        wrap.pack(fill="x", padx=16, pady=(0, 8))

        self.live_btn = tk.Button(wrap, text="LIVE MODE: OFF",
                                  font=(FONT_UI, 12, "bold"),
                                  fg=FG, bg=BG_INPUT, activebackground=BORDER,
                                  activeforeground=FG, relief="flat",
                                  padx=18, pady=12, cursor="hand2", bd=0,
                                  command=self._toggle_live_mode)
        self.live_btn.pack(side="left", padx=(0, 10))

        self.mark_btn = tk.Button(wrap, text="MARK SPIKE  (live)",
                                  font=(FONT_UI, 12, "bold"),
                                  fg="white", bg="#16a34a", activebackground="#15803d",
                                  activeforeground="white", relief="flat",
                                  padx=20, pady=12, cursor="hand2", bd=0,
                                  command=self._toggle_live_label)
        self.mark_btn.pack(side="left")

        tk.Label(wrap, text="Label", font=(FONT_UI, 10), fg=FG_MID,
                 bg=BG).pack(side="left", padx=(18, 6))

        self.label_var = tk.StringVar(value=self.classes[0])
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("Studio.TCombobox", fieldbackground=BG_INPUT,
                        background=BG_INPUT, foreground=FG,
                        arrowcolor=FG_MID, bordercolor=BORDER, lightcolor=BORDER,
                        darkcolor=BORDER, selectbackground=BG_INPUT,
                        selectforeground=FG)
        self.label_menu = ttk.Combobox(wrap, textvariable=self.label_var,
                                       values=self.classes, state="readonly",
                                       width=14, style="Studio.TCombobox",
                                       font=(FONT_UI, 10))
        self.label_menu.pack(side="left")

        self.add_btn = tk.Button(wrap, text="ADD SELECTION",
                                 font=(FONT_UI, 11, "bold"),
                                 fg=BG, bg=ACCENT, activebackground="#3ba88a",
                                 activeforeground=BG, relief="flat",
                                 padx=18, pady=11, cursor="hand2", bd=0,
                                 state="disabled",
                                 command=self._add_selection)
        self.add_btn.pack(side="left", padx=(10, 0))

        self.clear_sel_btn = tk.Button(wrap, text="Clear selection",
                                       font=(FONT_UI, 10),
                                       fg=FG_MID, bg=BG_INPUT, activebackground=BORDER,
                                       activeforeground=FG, relief="flat",
                                       padx=14, pady=10, cursor="hand2", bd=0,
                                       command=self._clear_selection)
        self.clear_sel_btn.pack(side="left", padx=(8, 0))

        self.msg_label = tk.Label(wrap, text="Waiting for sensor data...",
                                  font=(FONT_UI, 10), fg=AMBER, bg=BG, anchor="e")
        self.msg_label.pack(side="right")

    def _build_event_list(self):
        outer, card = self._card(self.root)
        outer.pack(fill="both", expand=True, padx=16, pady=(0, 8))

        head = tk.Frame(card, bg=BG_CARD)
        head.pack(fill="x", padx=14, pady=(11, 4))
        tk.Label(head, text="EVENTS", font=(FONT_UI, 9, "bold"),
                 fg=FG_DIM, bg=BG_CARD).pack(side="left")
        self.count_label = tk.Label(head, text="0 marked", font=(FONT_MONO, 9),
                                    fg=ACCENT, bg=BG_CARD)
        self.count_label.pack(side="left", padx=(10, 0))
        tk.Button(head, text="Delete selected row", font=(FONT_UI, 9),
                  fg=RED, bg=BG_INPUT, activebackground=BORDER,
                  activeforeground=RED, relief="flat", padx=12, pady=3,
                  cursor="hand2", bd=0,
                  command=self._delete_event).pack(side="right")
        tk.Button(head, text="Zoom to event", font=(FONT_UI, 9),
                  fg=FG_MID, bg=BG_INPUT, activebackground=BORDER,
                  activeforeground=FG, relief="flat", padx=12, pady=3,
                  cursor="hand2", bd=0,
                  command=self._zoom_to_event).pack(side="right", padx=(0, 6))

        body = tk.Frame(card, bg=BG_CARD)
        body.pack(fill="both", expand=True, padx=14, pady=(0, 12))

        self.event_list = tk.Listbox(body, font=(FONT_MONO, 10), bg=BG_INPUT,
                                     fg=FG, selectbackground=BORDER,
                                     selectforeground=ACCENT, relief="flat",
                                     highlightthickness=0, activestyle="none",
                                     height=7)
        self.event_list.pack(side="left", fill="both", expand=True)
        sb = tk.Scrollbar(body, command=self.event_list.yview,
                          bg=BG_INPUT, troughcolor=BG_CARD, bd=0,
                          highlightthickness=0, relief="flat")
        sb.pack(side="right", fill="y")
        self.event_list.config(yscrollcommand=sb.set)

    def _build_footer(self):
        bar = tk.Frame(self.root, bg=BG_PANEL, height=62)
        bar.pack(fill="x", side="bottom")
        bar.pack_propagate(False)

        inner = tk.Frame(bar, bg=BG_PANEL)
        inner.pack(side="right", padx=18, pady=12)

        tk.Button(inner, text="SAVE SESSION", font=(FONT_UI, 11, "bold"),
                  fg=FG, bg=BG_INPUT, activebackground=BORDER,
                  activeforeground=FG, relief="flat", padx=18, pady=10,
                  cursor="hand2", bd=0,
                  command=self._manual_save).pack(side="left", padx=(0, 8))

        self.train_btn = tk.Button(inner, text="TRAIN MODELS",
                                   font=(FONT_UI, 11, "bold"),
                                   fg=BG, bg=AMBER, activebackground="#d97706",
                                   activeforeground=BG, relief="flat",
                                   padx=18, pady=10, cursor="hand2", bd=0,
                                   command=self._train_models)
        self.train_btn.pack(side="left", padx=(0, 8))

        tk.Button(inner, text="QUIT", font=(FONT_UI, 11, "bold"),
                  fg=FG_MID, bg=BG_INPUT, activebackground=BORDER,
                  activeforeground=FG, relief="flat", padx=18, pady=10,
                  cursor="hand2", bd=0,
                  command=self._quit).pack(side="left")

        self.footer_label = tk.Label(bar, text="", font=(FONT_MONO, 9),
                                     fg=FG_DIM, bg=BG_PANEL)
        self.footer_label.pack(side="left", padx=20)

    # ── Serial ────────────────────────────────────────────────────────────

    def _connect_serial(self):
        threading.Thread(target=self._serial_worker, daemon=True).start()

    def _serial_worker(self):
        """Owns connect, read, and reconnect. Survives unplug/replug so the
        sensor can be disconnected mid-session without restarting the app."""
        while self.running:
            if self.ser is None:
                port = self.forced_port or find_serial_port()
                if not port:
                    self.conn_status = "searching"
                    time.sleep(1.5)
                    continue
                try:
                    self.ser = serial.Serial(port, self.baud, timeout=1)
                    self.active_port = port
                    self.conn_status = "connected"
                    self.root.after(0, self._set_msg,
                                    f"Connected to {port} — waiting for sensor data...", ACCENT)
                    # Resync the live-mode flag with whatever the board is
                    # actually doing (it may already be live from a prior run).
                    self.root.after(900, lambda: self._send_command("STATUS"))
                except Exception:
                    self.ser = None
                    self.conn_status = "waiting"
                    time.sleep(1.5)
                continue

            try:
                raw = self.ser.readline()
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="ignore").strip()
                if line:
                    self._handle_line(line)
            except Exception:
                # Port vanished (unplugged, or the board reset). Drop it and
                # let the loop above find it again.
                try:
                    self.ser.close()
                except Exception:
                    pass
                self.ser = None
                self.active_port = None
                self.conn_status = "searching"
                self.root.after(0, self._set_msg,
                                "Sensor disconnected — waiting for it to come back...", AMBER)
                time.sleep(1.0)

    def _send_command(self, cmd):
        """Write a line command to the board. Returns False if not connected."""
        if self.ser is None:
            self._set_msg("Not connected — cannot send commands to the sensor.", RED)
            return False
        try:
            self.ser.write((cmd + "\n").encode("utf-8"))
            self.ser.flush()
            return True
        except Exception as e:
            self._set_msg(f"Command failed: {e}", RED)
            return False

    def _toggle_live_mode(self):
        want_on = not self.live_mode
        if self._send_command("LIVE:ON" if want_on else "LIVE:OFF"):
            self._set_msg(
                "Switching to continuous 1Hz capture..." if want_on
                else "Returning to duty cycling...", AMBER)

    def _handle_line(self, line):
        # ── Live-mode replies from the firmware ──
        if line.startswith("LIVE:"):
            body = line[5:].strip().upper()
            if body.startswith("ON"):
                self.live_mode = True
                self.root.after(0, self._set_msg,
                                "LIVE — continuous 1Hz capture, duty cycling suspended.", ACCENT)
            elif body.startswith("OFF"):
                self.live_mode = False
                self.root.after(0, self._set_msg,
                                "Duty cycling resumed — sampling once per sniff interval.", FG_MID)
            # "LIVE: 120 samples captured" is progress noise; ignore it.
            return

        if line.startswith("STATUS:"):
            self.live_mode = "live=1" in line
            return

        # ── Firmware state transitions ──
        if "State:" in line and "->" in line:
            try:
                self.fw_state = line.split("->")[1].strip().lower()
            except Exception:
                pass
            return

        if "BMV080 ->" in line:
            self.bmv_mode = line.split("BMV080 ->")[1].strip()
            return

        if "TRAINING MODE" in line:
            self.fw_state = "training"
            return

        if "WARMUP:" in line:
            try:
                n = int(line.split("WARMUP:")[1].strip().split("/")[0])
                self.root.after(0, self._set_msg, f"Sensor warming up... {n}/45s", AMBER)
            except Exception:
                pass
            return

        if "READY:" in line or "Baseline frozen" in line:
            self.root.after(0, self._warmup_complete)
            return

        # ── Samples ──
        sample = parse_sensor_line(line)
        source = "sensor"
        if sample is None:
            sample = parse_sniff_line(line)
            source = "sniff"
        if sample is None:
            return

        if "battery" in sample:
            self.battery = sample.pop("battery")
        if "heap" in sample:
            self.heap = sample.pop("heap")

        sample["timestamp"] = datetime.now(timezone.utc)
        sample["state"] = self.fw_state
        sample["bmv_mode"] = self.bmv_mode
        sample["source"] = source

        self._hz_ts.append(time.monotonic())
        with self.lock:
            self.samples.append(sample)
            self.latest = sample

    # ── Periodic UI tick ──────────────────────────────────────────────────

    def _tick(self):
        """Single repaint timer — cheaper and smoother than redrawing per sample."""
        if not self.running:
            return
        try:
            self._update_display()
            self._draw_timeline()
            if time.time() - self._last_autosave >= AUTOSAVE_SEC:
                with self.lock:
                    n = len(self.samples)
                if n > 30:
                    try:
                        p = self._save_session(autosave=True)
                        self._last_autosave = time.time()
                        self.footer_label.config(
                            text=f"autosaved {n:,} samples -> {Path(p).name}")
                    except Exception:
                        pass
        except Exception:
            traceback.print_exc()
        self.root.after(400, self._tick)

    def _set_msg(self, text, color=FG_MID):
        self.msg_label.config(text=text, fg=color)

    def _warmup_complete(self):
        if not self.warmup_done:
            self.warmup_done = True
            self._set_msg("Ready — vape and mark spikes, or select them after.", ACCENT)

    def _update_display(self):
        with self.lock:
            s = dict(self.latest) if self.latest else {}
            n = len(self.samples)

        if s:
            mapping = {
                "PM2.5":    (s.get("pm25", 0), ""),
                "PM1":      (s.get("pm1", 0), ""),
                "PM10":     (s.get("pm10", 0), ""),
                "Gas":      (s.get("gas_resistance", 0), " kΩ"),
                "Humidity": (s.get("humidity", 0), "%"),
                "Temp":     (s.get("temperature", 0), "°C"),
            }
            for name, (val, unit) in mapping.items():
                cv, rect, lbl, max_v, _ = self.reading_widgets[name]
                w = int(cv.winfo_width()) or 250
                bar = min(w, max(0, int(w * val / max_v))) if max_v else 0
                cv.coords(rect, 0, 0, bar, 10)
                color = ACCENT
                if name == "PM2.5":
                    if self.labeling:
                        color = RED
                    elif val > 25:
                        color = AMBER
                cv.itemconfig(rect, fill=color)
                lbl.config(text=f"{val:.1f}{unit}")

        if len(self._hz_ts) >= 2:
            span = self._hz_ts[-1] - self._hz_ts[0]
            if span > 0:
                self.hz = (len(self._hz_ts) - 1) / span

        if self.live_mode:
            self.stat_labels["capture"].config(text="LIVE 1 Hz", fg=BLUE)
            self.live_btn.config(text="LIVE MODE: ON", bg=BLUE, fg="white",
                                 activebackground="#2563eb", activeforeground="white")
        else:
            self.stat_labels["capture"].config(text="duty cycled", fg=FG)
            self.live_btn.config(text="LIVE MODE: OFF", bg=BG_INPUT, fg=FG,
                                 activebackground=BORDER, activeforeground=FG)

        st = self.fw_state or "unknown"
        self.stat_labels["state"].config(text=st, fg=STATE_COLORS.get(st, FG))
        self.stat_labels["bmv"].config(text=self.bmv_mode or "-", fg=FG)
        self.stat_labels["batt"].config(
            text=f"{self.battery:.2f} V" if self.battery else "--",
            fg=RED if (self.battery and self.battery < 3.0) else FG)
        self.stat_labels["heap"].config(
            text=f"{self.heap // 1024} KB" if self.heap else "--", fg=FG)
        self.stat_labels["rate"].config(text=f"{self.hz:.2f} Hz", fg=FG)

        el = int(time.time() - self.session_start)
        self.stat_labels["elapsed"].config(
            text=f"{el // 3600:02d}:{(el % 3600) // 60:02d}:{el % 60:02d}", fg=FG)

        if self.ser is not None and self.active_port:
            self.conn_label.config(
                text=f"{self.active_port} @ {self.baud}  |  {n:,} samples", fg=FG_MID)
        elif self.conn_status == "waiting":
            self.conn_label.config(text="port busy — retrying...", fg=AMBER)
        else:
            self.conn_label.config(text="searching for sensor...", fg=AMBER)

        if self.labeling:
            secs = int(time.time() - self.label_start_time)
            self.rec_dot.config(fg=RED)
            self.rec_label.config(text=f"RECORDING SPIKE  {secs}s", fg=RED)
        elif n > 0:
            self.rec_dot.config(fg=ACCENT)
            self.rec_label.config(text="capturing", fg=FG_MID)

    # ── Timeline ──────────────────────────────────────────────────────────

    def _visible_range(self):
        with self.lock:
            total = len(self.samples)
        if total == 0:
            return 0, 0, 0
        if self.view_span <= 0:
            return 0, total, total
        span = min(self.view_span, total)
        if self.follow_var.get():
            start = max(0, total - span)
        else:
            start = min(self.view_start, max(0, total - span))
        return start, min(total, start + span), total

    def _set_zoom(self, span):
        self.view_span = span
        self.follow_var.set(True)
        self._draw_timeline()

    def _x_to_idx(self, x, w, lo, hi):
        if w <= 0 or hi <= lo:
            return lo
        frac = min(1.0, max(0.0, x / w))
        return int(lo + frac * (hi - lo))

    def _idx_to_x(self, idx, w, lo, hi):
        if hi <= lo:
            return 0
        return int((idx - lo) / (hi - lo) * w)

    def _draw_timeline(self):
        cv = self.canvas
        cv.delete("all")
        w = cv.winfo_width()
        h = cv.winfo_height()
        if w < 10 or h < 10:
            return

        band_h = 14
        pad_b = band_h + 6
        plot_h = h - pad_b - 8
        if plot_h < 20:
            return

        lo, hi, total = self._visible_range()
        if total == 0:
            cv.create_text(w // 2, h // 2, text="waiting for samples...",
                           fill=FG_DIM, font=(FONT_UI, 11))
            return

        with self.lock:
            window = self.samples[lo:hi]
        if not window:
            return

        peak = max((s.get("pm25", 0) or 0) for s in window)
        scale_max = max(20.0, peak * 1.15)

        # horizontal grid + labels
        for frac in (0.0, 0.25, 0.5, 0.75, 1.0):
            y = 8 + plot_h * (1 - frac)
            cv.create_line(0, y, w, y, fill=GRID)
            cv.create_text(4, y - 7, anchor="w", text=f"{scale_max * frac:.0f}",
                           fill=FG_DIM, font=(FONT_MONO, 8))

        n = len(window)
        # Bucket into one column per pixel so multi-hour sessions stay fast
        cols = max(1, min(w, n))
        per = n / cols

        # state band
        for c in range(cols):
            i0 = int(c * per)
            st = window[i0].get("state", "unknown") or "unknown"
            cv.create_rectangle(c, h - band_h, c + 1, h,
                                fill=STATE_COLORS.get(st, STATE_COLORS["unknown"]),
                                outline="")

        # event shading (draw under the trace)
        for ev in self.events:
            a = max(ev["start_idx"], lo)
            b = min(ev["end_idx"], hi)
            if b <= a:
                continue
            x0 = self._idx_to_x(a, w, lo, hi)
            x1 = max(x0 + 1, self._idx_to_x(b, w, lo, hi))
            col = LABEL_COLORS.get(ev["label"], RED)
            cv.create_rectangle(x0, 8, x1, 8 + plot_h, fill=col, outline="",
                                stipple="gray12")
            cv.create_line(x0, 8, x0, 8 + plot_h, fill=col)
            cv.create_line(x1, 8, x1, 8 + plot_h, fill=col)

        # PM2.5 trace, min/max per column
        pts = []
        for c in range(cols):
            i0 = int(c * per)
            i1 = max(i0 + 1, int((c + 1) * per))
            chunk = window[i0:i1]
            if not chunk:
                continue
            vals = [(s.get("pm25", 0) or 0) for s in chunk]
            vmin, vmax = min(vals), max(vals)
            ymin = 8 + plot_h * (1 - min(1.0, vmin / scale_max))
            ymax = 8 + plot_h * (1 - min(1.0, vmax / scale_max))
            if ymax != ymin:
                cv.create_line(c, ymin, c, ymax, fill="#2f8f74")
            pts.append((c, ymax))

        if len(pts) > 1:
            flat = []
            for x, y in pts:
                flat.extend([x, y])
            cv.create_line(*flat, fill=ACCENT, width=2, smooth=False)

        # selection overlay
        if self.sel_start is not None and self.sel_end is not None:
            a, b = sorted((self.sel_start, self.sel_end))
            a2, b2 = max(a, lo), min(b, hi)
            if b2 > a2:
                x0 = self._idx_to_x(a2, w, lo, hi)
                x1 = max(x0 + 1, self._idx_to_x(b2, w, lo, hi))
                cv.create_rectangle(x0, 8, x1, 8 + plot_h, fill=AMBER,
                                    outline=AMBER, stipple="gray25")

        # time axis hint
        cv.create_text(w - 4, h - band_h - 6, anchor="e",
                       text=f"{n:,} samples shown", fill=FG_DIM,
                       font=(FONT_MONO, 8))

    # ── Selection ─────────────────────────────────────────────────────────

    def _on_drag_start(self, ev):
        lo, hi, total = self._visible_range()
        if total == 0:
            return
        w = self.canvas.winfo_width()
        self._drag_anchor = self._x_to_idx(ev.x, w, lo, hi)
        self.sel_start = self._drag_anchor
        self.sel_end = self._drag_anchor
        self.follow_var.set(False)

    def _on_drag_move(self, ev):
        if self._drag_anchor is None:
            return
        lo, hi, total = self._visible_range()
        w = self.canvas.winfo_width()
        self.sel_end = self._x_to_idx(ev.x, w, lo, hi)
        self._refresh_selection_label()
        self._draw_timeline()

    def _on_drag_end(self, ev):
        if self._drag_anchor is None:
            return
        self._drag_anchor = None
        self._refresh_selection_label()
        self._draw_timeline()

    def _refresh_selection_label(self):
        if self.sel_start is None or self.sel_end is None:
            self.sel_label.config(text="")
            self.add_btn.config(state="disabled", bg="#2a3140", fg=FG_DIM)
            return
        a, b = sorted((self.sel_start, self.sel_end))
        n = b - a
        if n < 3:
            self.sel_label.config(text=f"selection too short ({n})")
            self.add_btn.config(state="disabled", bg="#2a3140", fg=FG_DIM)
            return
        with self.lock:
            chunk = self.samples[a:b]
        pk = max((s.get("pm25", 0) or 0) for s in chunk) if chunk else 0
        self.sel_label.config(text=f"selected {n} samples  |  peak PM2.5 {pk:.1f}")
        self.add_btn.config(state="normal", bg=ACCENT, fg=BG)

    def _clear_selection(self):
        self.sel_start = self.sel_end = self._drag_anchor = None
        self._refresh_selection_label()
        self._draw_timeline()

    def _add_selection(self):
        if self.sel_start is None or self.sel_end is None:
            return
        a, b = sorted((self.sel_start, self.sel_end))
        if b - a < 3:
            self._set_msg("Selection too short — drag across more of the spike.", AMBER)
            return
        self._record_event(self.label_var.get(), a, b)
        self._clear_selection()

    # ── Live labelling ────────────────────────────────────────────────────

    def _toggle_live_label(self):
        if not self.labeling:
            with self.lock:
                self.label_start_idx = len(self.samples)
            self.label_start_time = time.time()
            self.labeling = True
            self.mark_btn.config(text="STOP  (recording...)", bg=RED,
                                 activebackground="#b91c1c")
            self._set_msg("Recording spike — press STOP when the cloud clears.", RED)
        else:
            with self.lock:
                end_idx = len(self.samples)
            start_idx = self.label_start_idx
            self.labeling = False
            self.label_start_time = None
            self.mark_btn.config(text="MARK SPIKE  (live)", bg="#16a34a",
                                 activebackground="#15803d")
            if end_idx - start_idx < 3:
                self._set_msg("Too short — dropped. Hold for 10-30s.", AMBER)
            else:
                self._record_event(self.label_var.get(), start_idx, end_idx)

    # ── Event bookkeeping ─────────────────────────────────────────────────

    def _record_event(self, label, start_idx, end_idx):
        with self.lock:
            chunk = self.samples[start_idx:end_idx]
            base_from = max(0, start_idx - 10)
            base_chunk = self.samples[base_from:start_idx]

        if not chunk:
            return
        pm_vals = [(s.get("pm25", 0) or 0) for s in chunk]
        peak = max(pm_vals) if pm_vals else 0.0
        base_vals = [(s.get("pm25", 0) or 0) for s in base_chunk]
        base = sum(base_vals) / len(base_vals) if base_vals else 0.0

        self.events.append({
            "label": label,
            "start_idx": start_idx,
            "end_idx": end_idx,
            "pm25_peak": peak,
            "pm25_base": base,
            "duration_sec": end_idx - start_idx,
        })
        self.events.sort(key=lambda e: e["start_idx"])
        self._refresh_event_list()
        self._set_msg(
            f"Event #{len(self.events)} added — {end_idx - start_idx} samples, "
            f"peak {peak:.1f} (base {base:.1f})", ACCENT)
        self._draw_timeline()

    def _refresh_event_list(self):
        self.event_list.delete(0, "end")
        for i, ev in enumerate(self.events, 1):
            self.event_list.insert(
                "end",
                f" #{i:>2}  {ev['label']:<11}  {ev['duration_sec']:>4}s   "
                f"peak {ev['pm25_peak']:>7.1f}   base {ev['pm25_base']:>6.1f}   "
                f"idx {ev['start_idx']}-{ev['end_idx']}")
        counts = Counter(e["label"] for e in self.events)
        summary = "  ".join(f"{k} x{v}" for k, v in sorted(counts.items()))
        self.count_label.config(
            text=f"{len(self.events)} marked" + (f"   ({summary})" if summary else ""))

    def _selected_event_index(self):
        sel = self.event_list.curselection()
        return sel[0] if sel else None

    def _delete_event(self):
        i = self._selected_event_index()
        if i is None:
            self._set_msg("Pick a row in the events list first.", AMBER)
            return
        ev = self.events.pop(i)
        self._refresh_event_list()
        self._set_msg(f"Deleted {ev['label']} event ({ev['duration_sec']}s).", FG_MID)
        self._draw_timeline()

    def _zoom_to_event(self):
        i = self._selected_event_index()
        if i is None:
            self._set_msg("Pick a row in the events list first.", AMBER)
            return
        ev = self.events[i]
        pad = max(30, ev["duration_sec"])
        self.follow_var.set(False)
        self.view_span = (ev["end_idx"] - ev["start_idx"]) + pad * 2
        self.view_start = max(0, ev["start_idx"] - pad)
        self.sel_start, self.sel_end = ev["start_idx"], ev["end_idx"]
        self._refresh_selection_label()
        self._draw_timeline()

    # ── Training (pipeline unchanged from v3) ─────────────────────────────

    def _train_models(self):
        if len(self.events) < 3:
            messagebox.showwarning(
                "Need More Data",
                f"Only {len(self.events)} events. Collect at least 5 (15-20 recommended).")
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

        for ev in self.events:
            start, end, label = ev["start_idx"], ev["end_idx"], ev["label"]
            t = start
            while t + EVENT_SEC <= end:
                baseline = self.samples[max(0, t - BASELINE_SEC):t]
                event = self.samples[t:t + EVENT_SEC]
                if len(baseline) >= 2 and len(event) >= 3:
                    try:
                        all_rows.append((FeatureEngine.compute_features(baseline, event), label))
                    except Exception:
                        pass
                t += SLIDE_STEP

            if end - start < EVENT_SEC and end - start >= 5:
                baseline = self.samples[max(0, start - BASELINE_SEC):start]
                event = self.samples[start:end]
                if len(baseline) >= 2 and len(event) >= 3:
                    try:
                        all_rows.append((FeatureEngine.compute_features(baseline, event), label))
                    except Exception:
                        pass

        vape_count = sum(1 for _, l in all_rows if l != "normal")

        event_ranges = sorted([(e["start_idx"], e["end_idx"]) for e in self.events])
        clean_ranges = []
        prev_end = 0
        for (s, e) in event_ranges:
            if max(0, s - 5) - prev_end >= BASELINE_SEC + EVENT_SEC:
                clean_ranges.append((prev_end, max(0, s - 5)))
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
                        all_rows.append((FeatureEngine.compute_features(baseline, event), "normal"))
                    except Exception:
                        pass
                t += SLIDE_STEP

        normal_count = sum(1 for _, l in all_rows if l == "normal")

        if not all_rows:
            raise RuntimeError("No training windows generated!")
        if vape_count == 0 or normal_count == 0:
            raise RuntimeError(
                f"Need both classes. Got {vape_count} event, {normal_count} normal windows.\n"
                f"Leave idle gaps between spikes so clean-air data exists.")

        X = np.array([[float(f.get(k) or 0.0) for k in FEATURE_ORDER] for f, _ in all_rows])
        y = np.array([l for _, l in all_rows])

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

        rf = RandomForestClassifier(n_estimators=300, random_state=42,
                                    class_weight="balanced_subsample")
        rf.fit(X_train, y_train, sample_weight=sw)
        joblib.dump(rf, MODELS_DIR / "rf_model.joblib")
        acc_rf = float((rf.predict(X_test) == y_test).mean())
        lines.append(f"  RF:  accuracy={acc_rf:.1%}")

        scaler = StandardScaler()
        X_train_s = scaler.fit_transform(X_train)
        lr = LogisticRegression(random_state=42, max_iter=1000,
                                class_weight="balanced", solver="lbfgs")
        lr.fit(X_train_s, y_train, sample_weight=sw)
        lr._scaler = scaler
        joblib.dump(lr, MODELS_DIR / "lr_model.joblib")
        acc_lr = float((lr.predict(scaler.transform(X_test)) == y_test).mean())
        lines.append(f"  LR:  accuracy={acc_lr:.1%}")

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
            acc_xgb = float((le.classes_[xgb.predict(X_test)] == y_test).mean())
            lines.append(f"  XGB: accuracy={acc_xgb:.1%}")

        data_path = self._save_session()
        lines.append(f"\nModels saved to {MODELS_DIR}/")
        lines.append(f"Session saved to {data_path}")

        self._set_msg(f"Trained — RF {acc_rf:.0%}, LR {acc_lr:.0%}", ACCENT)
        return "\n".join(lines)

    # ── Save / quit ───────────────────────────────────────────────────────

    def _save_session(self, autosave=False):
        """Autosaves overwrite a single rolling file — each dump already contains
        every sample so far, so timestamping them would just pile up dozens of
        nested duplicates over a long session. Explicit saves get their own file."""
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if autosave:
            path = DATA_DIR / "session_autosave.json"
        else:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            path = DATA_DIR / f"session_{ts}.json"

        def ser(s):
            out = {}
            for k, v in s.items():
                out[k] = v.isoformat() if isinstance(v, datetime) else v
            return out

        with self.lock:
            data = {
                "captured_at": datetime.now(timezone.utc).isoformat(),
                "port": self.active_port,
                "n_samples": len(self.samples),
                "n_events": len(self.events),
                "events": self.events,
                "samples": [ser(s) for s in self.samples],
            }

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        self._last_save_path = path
        return path

    def _manual_save(self):
        try:
            p = self._save_session()
            self._last_autosave = time.time()
            self._set_msg(f"Saved {Path(p).name}", ACCENT)
            self.footer_label.config(text=f"saved -> {p}")
        except Exception as e:
            messagebox.showerror("Save failed", str(e))

    def _quit(self):
        with self.lock:
            n = len(self.samples)
        if self.events or n > 60:
            try:
                path = self._save_session()
                print(f"Session saved: {path}")
            except Exception as e:
                print(f"Save failed: {e}")
        self.running = False
        if self.ser:
            try:
                self.ser.close()
            except Exception:
                pass
        self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mistio training studio")
    parser.add_argument("--port", help="Serial port (e.g. COM5). Auto-detects if omitted.")
    parser.add_argument("--baud", type=int, default=BAUD)
    args = parser.parse_args()

    TrainingStudio(port=args.port, baud=args.baud).run()
