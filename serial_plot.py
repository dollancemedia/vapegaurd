"""Real-time serial plotter for ESP32 vape sensor PM2.5 + Gas data.
Reads COM3, parses debug lines, plots a rolling graph with matplotlib.
Compare with the dashboard website to verify data matches.

Usage: python serial_plot.py
"""

import re
import time
from collections import deque
from datetime import datetime

import serial
import matplotlib.pyplot as plt
import matplotlib.animation as animation

PORT = "COM3"
BAUD = 115200
WINDOW = 120  # seconds of data to show

# Rolling buffers
timestamps = deque(maxlen=500)
pm25_vals = deque(maxlen=500)
gas_vals = deque(maxlen=500)
batt_vals = deque(maxlen=500)

# Regex for the sniff line:
# Sniff #1: PM2.5=4.7 (base=4.5, d=0.2) Gas=312.5 Batt=3.45V Heap=245000
sniff_re = re.compile(
    r"Sniff #\d+: PM2\.5=([\d.]+) \(base=([\d.]+), d=([-\d.]+)\) Gas=([\d.]+) Batt=([\d.]+)V"
)

# Also catch DEEP_SENSE reads:
# READ: T=25.1 H=45.2 G=310.5 PM2.5=8.3 [BME=1 BMV=1]
read_re = re.compile(
    r"READ: T=([\d.]+) H=([\d.]+) G=([\d.]+) PM2\.5=([\d.]+)"
)

ser = serial.Serial(PORT, BAUD, timeout=1)
print(f"Connected to {PORT} at {BAUD} baud. Waiting for data...")

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 6), sharex=True)
fig.suptitle("ESP32 Vape Sensor — Live Serial Data")

def update(frame):
    while ser.in_waiting:
        try:
            line = ser.readline().decode("utf-8", errors="ignore").strip()
        except Exception:
            continue

        if not line:
            continue

        now = datetime.now()

        m = sniff_re.search(line)
        if m:
            pm25 = float(m.group(1))
            gas = float(m.group(4))
            batt = float(m.group(5))
            timestamps.append(now)
            pm25_vals.append(pm25)
            gas_vals.append(gas)
            batt_vals.append(batt)
            print(f"[{now:%H:%M:%S}] PM2.5={pm25:.1f}  Gas={gas:.1f}  Batt={batt:.2f}V")
            continue

        m = read_re.search(line)
        if m:
            pm25 = float(m.group(4))
            gas = float(m.group(3))
            timestamps.append(now)
            pm25_vals.append(pm25)
            gas_vals.append(gas)
            print(f"[{now:%H:%M:%S}] DEEP_SENSE PM2.5={pm25:.1f}  Gas={gas:.1f}")
            continue

    if not timestamps:
        return

    ax1.clear()
    ax2.clear()

    times = list(timestamps)
    ax1.plot(times, list(pm25_vals), color="#e74c3c", linewidth=1.5, label="PM2.5 (μg/m³)")
    ax1.set_ylabel("PM2.5 (μg/m³)")
    ax1.legend(loc="upper left")
    ax1.grid(True, alpha=0.3)
    ax1.set_ylim(bottom=0)

    ax2.plot(times, list(gas_vals), color="#3498db", linewidth=1.5, label="Gas Resistance (kΩ)")
    ax2.set_ylabel("Gas (kΩ)")
    ax2.set_xlabel("Time")
    ax2.legend(loc="upper left")
    ax2.grid(True, alpha=0.3)

    fig.autofmt_xdate()

ani = animation.FuncAnimation(fig, update, interval=1000, cache_frame_data=False)
plt.tight_layout()
plt.show()

ser.close()
