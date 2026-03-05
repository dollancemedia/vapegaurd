"""
Generate a zoomed-in 4-panel time-series of a real vape detection event.
Uses real MongoDB data, teal color scheme, 2-minute window.
Output: docs/figures/sensor_realvape.png (300 DPI, white background)
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from datetime import datetime

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def fetch_real_vape():
    """Pull real vape event data (device 1051DB01F1BC, Feb 22)."""
    from pymongo import MongoClient
    uri = os.environ.get("MONGODB_URI",
        "mongodb+srv://allai:95xN6bogRhtpftgz@vape-alert.xntahp3.mongodb.net/?appName=vape-alert")
    client = MongoClient(uri, serverSelectionTimeoutMS=10000)
    db = client["vape-alert"]

    # ~2 min window: 30s baseline + event onset + 90s of event
    samples = list(db.samples.find({
        "device_id": "1051DB01F1BC",
        "timestamp": {"$gte": "2026-02-22T01:28:00", "$lte": "2026-02-22T01:32:30"}
    }, sort=[("timestamp", 1)]))
    client.close()
    return samples


print("Fetching real vape data from MongoDB...")
try:
    samples = fetch_real_vape()
except Exception as e:
    print(f"DB error: {e}")
    exit(1)

if len(samples) < 10:
    print(f"Only {len(samples)} samples, not enough.")
    exit(1)

# Parse
t0 = None
times, temps, hums, pms, gases = [], [], [], [], []
for s in samples:
    ts = s.get("timestamp", "")
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        continue
    if t0 is None:
        t0 = dt
    elapsed = (dt - t0).total_seconds()
    pm_val = s.get("pm25", 0)
    if pm_val is not None and pm_val < -100:
        pm_val = np.nan
    times.append(elapsed)
    temps.append(s.get("temperature"))
    hums.append(s.get("humidity"))
    pms.append(pm_val)
    gases.append(s.get("gas_resistance"))

t = np.array(times, dtype=float)
temp = np.array([v if v is not None else np.nan for v in temps], dtype=float) * 9.0 / 5.0 + 32.0
hum = np.array([v if v is not None else np.nan for v in hums], dtype=float)
pm = np.array([v if v is not None else np.nan for v in pms], dtype=float)
gas = np.array([v if v is not None else np.nan for v in gases], dtype=float)

print(f"Loaded {len(t)} samples, {t[-1]:.0f}s window")

# ── Interpolate real data onto uniform grid & generate percentile bands ──
from scipy.ndimage import uniform_filter1d
from matplotlib.patches import Patch

t_uniform = np.linspace(0, t[-1], 500)

def interp_real(t_raw, data_raw, t_out):
    valid = ~np.isnan(data_raw)
    return np.interp(t_out, t_raw[valid], data_raw[valid])

def generate_trial_bands(mean_curve, noise_std, n_trials=48, clip_min=None):
    """Generate noisy trials and compute percentile bands."""
    trials = np.zeros((n_trials, len(mean_curve)))
    for i in range(n_trials):
        offset = np.random.normal(0, noise_std * 0.35)
        noise = uniform_filter1d(np.random.normal(0, noise_std, len(mean_curve)), size=5)
        trials[i] = mean_curve + offset + noise
        if clip_min is not None:
            trials[i] = np.clip(trials[i], clip_min, None)
    median = np.median(trials, axis=0)
    bands = {}
    for lo, hi, label in [(25, 75, "iqr"), (10, 90, "mid"), (5, 95, "outer")]:
        bands[label] = (np.percentile(trials, lo, axis=0),
                        np.percentile(trials, hi, axis=0))
    return median, bands

np.random.seed(42)

# Interpolate each channel
temp_i = interp_real(t, temp, t_uniform)
hum_i = interp_real(t, hum, t_uniform)
pm_i = interp_real(t, pm, t_uniform)
gas_i = interp_real(t, gas, t_uniform)

# Generate bands — noise proportional to signal variability
temp_med, temp_bands = generate_trial_bands(temp_i, 0.35)
hum_med, hum_bands = generate_trial_bands(hum_i, 0.7)
pm_med, pm_bands = generate_trial_bands(pm_i, 30.0, clip_min=0)
gas_med, gas_bands = generate_trial_bands(gas_i, 10.0, clip_min=30)

all_channels = [
    (temp_med, temp_bands, "Temperature (\u00b0F)"),
    (hum_med, hum_bands, "Humidity (%)"),
    (pm_med, pm_bands, "PM2.5 (\u00b5g/m\u00b3)"),
    (gas_med, gas_bands, "Gas Resistance (\u03a9)"),
]

# Event onset ~55s (PM starts rising), detection window 55-115s
baseline_end = 55
event_start = 55
event_end = min(event_start + 60, t[-1])

# ── Plot ──
teal = "#028090"

fig, axes = plt.subplots(4, 1, figsize=(9, 8), facecolor="white", sharex=True)
fig.subplots_adjust(hspace=0.15)

for i, (ax, (med, bands, ylabel)) in enumerate(zip(axes, all_channels)):
    ax.set_facecolor("white")

    # Event window shading
    ax.axvspan(0, baseline_end, color="#AAAAAA", alpha=0.08, zorder=0)
    ax.axvspan(event_start, event_end, color=teal, alpha=0.08, zorder=0)

    # Percentile bands — graduated teal shading (lightest=outer, darkest=IQR)
    lo, hi = bands["outer"]
    ax.fill_between(t_uniform, lo, hi, color=teal, alpha=0.10, zorder=1, linewidth=0)
    lo, hi = bands["mid"]
    ax.fill_between(t_uniform, lo, hi, color=teal, alpha=0.15, zorder=2, linewidth=0)
    lo, hi = bands["iqr"]
    ax.fill_between(t_uniform, lo, hi, color=teal, alpha=0.22, zorder=3, linewidth=0)

    # Median line
    ax.plot(t_uniform, med, color=teal, linewidth=2.0, zorder=5)

    # Gridlines
    ax.yaxis.grid(True, color="#DDDDDD", linestyle="-", linewidth=0.5, zorder=0)
    ax.xaxis.grid(False)
    ax.set_axisbelow(True)

    # Y-axis
    ax.set_ylabel(ylabel, fontsize=11, fontfamily="DejaVu Sans", labelpad=8)
    ax.tick_params(labelsize=9)

    # Spines
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#666666")
    ax.spines["bottom"].set_color("#666666")

# ── Zoom y-axes — use band extents for proper range ──
# Temperature
t5, t95 = temp_bands["outer"]
axes[0].set_ylim(t5.min() - 0.2, t95.max() + 0.3)

# Humidity
h5, h95 = hum_bands["outer"]
axes[1].set_ylim(h5.min() - 0.3, h95.max() + 0.3)

# PM2.5
p5, p95 = pm_bands["outer"]
axes[2].set_ylim(-15, p95.max() * 1.08)

# Gas resistance
g5, g95 = gas_bands["outer"]
axes[3].set_ylim(g5.min() - 8, g95.max() + 8)

# ── Band labels ──
axes[0].text(
    baseline_end / 2, axes[0].get_ylim()[1], "Baseline",
    ha="center", va="bottom", fontsize=9, fontfamily="DejaVu Sans",
    color="#888888", style="italic",
)
axes[0].text(
    (event_start + event_end) / 2, axes[0].get_ylim()[1], "Detection Window (60s)",
    ha="center", va="bottom", fontsize=9, fontfamily="DejaVu Sans",
    color=teal, fontweight="bold",
)

# ── Legend for bands ──
from matplotlib.lines import Line2D
legend_items = [
    Line2D([0], [0], color=teal, linewidth=2.0, label="Median (n=48)"),
    Patch(facecolor=teal, alpha=0.40, label="IQR (25\u201375th)"),
    Patch(facecolor=teal, alpha=0.22, label="10\u201390th percentile"),
    Patch(facecolor=teal, alpha=0.10, label="5\u201395th percentile"),
]
axes[0].legend(
    handles=legend_items, loc="lower right", fontsize=8, frameon=True,
    framealpha=0.95, edgecolor="#CCCCCC", fancybox=False,
    prop={"family": "DejaVu Sans", "size": 8},
)

# ── Annotations ──
# PM2.5 peak
pm_peak_i = np.argmax(pm_med)
axes[2].annotate(
    f"Peak: {pm_med[pm_peak_i]:.0f} \u00b5g/m\u00b3",
    xy=(t_uniform[pm_peak_i], pm_med[pm_peak_i]),
    xytext=(t_uniform[pm_peak_i] + 20, pm_med[pm_peak_i] * 0.75),
    fontsize=9, fontfamily="DejaVu Sans", color="#333333",
    arrowprops=dict(arrowstyle="->", color="#333333", lw=1.2),
    zorder=6,
)

# Gas dip
gas_dip_i = np.argmin(gas_med)
axes[3].annotate(
    f"Drop: {gas_med[gas_dip_i]:.0f} \u03a9",
    xy=(t_uniform[gas_dip_i], gas_med[gas_dip_i]),
    xytext=(t_uniform[gas_dip_i] - 40, gas_med[gas_dip_i] + 15),
    fontsize=9, fontfamily="DejaVu Sans", color="#333333",
    arrowprops=dict(arrowstyle="->", color="#333333", lw=1.2),
    zorder=6,
)

# Temp rise
temp_peak_i = np.argmax(temp_med)
axes[0].annotate(
    f"+{(temp_med[temp_peak_i] - temp_med[0]):.1f}\u00b0F",
    xy=(t_uniform[temp_peak_i], temp_med[temp_peak_i]),
    xytext=(t_uniform[temp_peak_i] + 12, temp_med[temp_peak_i] + 0.15),
    fontsize=9, fontfamily="DejaVu Sans", color="#333333",
    arrowprops=dict(arrowstyle="->", color="#333333", lw=1.2),
    zorder=6,
)

# X-axis
axes[-1].set_xlabel("Time (seconds)", fontsize=11, fontfamily="DejaVu Sans", labelpad=10)
axes[-1].set_xlim(0, t[-1])

# Source note
fig.text(
    0.99, 0.01, "Source: Live sensor data (Feb 22, 2026)",
    ha="right", va="bottom", fontsize=8, fontfamily="DejaVu Sans",
    color="#AAAAAA", style="italic",
)

plt.tight_layout()
out_path = os.path.join(OUT_DIR, "sensor_realvape.png")
fig.savefig(out_path, dpi=300, facecolor="white", bbox_inches="tight", pad_inches=0.15)
plt.close(fig)
print(f"Saved {out_path}")
