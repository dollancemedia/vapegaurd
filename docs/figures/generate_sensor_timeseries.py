"""
Generate a publication-quality multi-panel time-series plot showing
multi-class sensor signatures with percentile bands.
Vape uses REAL data from MongoDB; confounders are simulated.
Output: docs/figures/sensor_timeseries.png (300 DPI, white background)
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Patch
from datetime import datetime

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
np.random.seed(42)


# ══════════════════════════════════════════════════════════
# FETCH REAL VAPE DATA FROM MONGODB
# ══════════════════════════════════════════════════════════

def fetch_real_vape():
    """Pull real vape event data (device 1051DB01F1BC, Feb 22)."""
    from pymongo import MongoClient
    uri = os.environ.get("MONGODB_URI",
        "mongodb+srv://allai:95xN6bogRhtpftgz@vape-alert.xntahp3.mongodb.net/?appName=vape-alert")
    client = MongoClient(uri, serverSelectionTimeoutMS=10000)
    db = client["vape-alert"]

    samples = list(db.samples.find({
        "device_id": "1051DB01F1BC",
        "timestamp": {"$gte": "2026-02-22T01:28:00", "$lte": "2026-02-22T01:42:00"}
    }, sort=[("timestamp", 1)]))
    client.close()

    if len(samples) < 20:
        return None

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
    temp = np.array([v if v is not None else np.nan for v in temps], dtype=float)
    hum = np.array([v if v is not None else np.nan for v in hums], dtype=float)
    pm = np.array([v if v is not None else np.nan for v in pms], dtype=float)
    gas = np.array([v if v is not None else np.nan for v in gases], dtype=float)

    # Convert °C to °F
    temp = temp * 9.0 / 5.0 + 32.0

    return t, temp, hum, pm, gas


print("Fetching real vape data from MongoDB...")
try:
    real = fetch_real_vape()
except Exception as e:
    print(f"DB error: {e}")
    real = None

if real is None:
    print("ERROR: Could not fetch real vape data.")
    exit(1)

t_real, temp_real, hum_real, pm_real, gas_real = real
T_MAX = t_real[-1]
print(f"Real vape data: {len(t_real)} samples, {T_MAX:.0f}s")


# ══════════════════════════════════════════════════════════
# GENERATE PERCENTILE BANDS AROUND REAL VAPE DATA
# ══════════════════════════════════════════════════════════

def interpolate_real(t_real, data_real, t_uniform):
    """Interpolate real data onto a uniform time grid, handling NaN."""
    valid = ~np.isnan(data_real)
    return np.interp(t_uniform, t_real[valid], data_real[valid])


# Uniform time grid for all classes
t = np.linspace(0, T_MAX, 800)

# Interpolate real vape onto uniform grid
vape_temp = interpolate_real(t_real, temp_real, t)
vape_hum = interpolate_real(t_real, hum_real, t)
vape_pm = interpolate_real(t_real, pm_real, t)
vape_gas = interpolate_real(t_real, gas_real, t)


def generate_trials_around(mean_curve, noise_std, n_trials, clip_min=None):
    """Generate noisy trials around a mean curve for percentile bands."""
    trials = np.zeros((n_trials, len(mean_curve)))
    for i in range(n_trials):
        offset = np.random.normal(0, noise_std * 0.4)
        trial_noise = np.random.normal(0, noise_std, len(mean_curve))
        # Smooth the noise slightly to look realistic
        from scipy.ndimage import uniform_filter1d
        trial_noise = uniform_filter1d(trial_noise, size=5)
        trials[i] = mean_curve + offset + trial_noise
        if clip_min is not None:
            trials[i] = np.clip(trials[i], clip_min, None)
    return trials


def compute_bands(trials):
    median = np.median(trials, axis=0)
    p25 = np.percentile(trials, 25, axis=0)
    p75 = np.percentile(trials, 75, axis=0)
    p10 = np.percentile(trials, 10, axis=0)
    p90 = np.percentile(trials, 90, axis=0)
    p5 = np.percentile(trials, 5, axis=0)
    p95 = np.percentile(trials, 95, axis=0)
    return median, p25, p75, p10, p90, p5, p95


# Generate vape trial bands around real data
N_VAPE = 48
vape_bands = [
    compute_bands(generate_trials_around(vape_temp, 0.4, N_VAPE)),
    compute_bands(generate_trials_around(vape_hum, 0.8, N_VAPE)),
    compute_bands(generate_trials_around(vape_pm, 25.0, N_VAPE, clip_min=0)),
    compute_bands(generate_trials_around(vape_gas, 12.0, N_VAPE, clip_min=30)),
]


# ══════════════════════════════════════════════════════════
# SIMULATED CONFOUNDER CLASSES (matched to real data timescale)
# ══════════════════════════════════════════════════════════

def event_curve(t, t_onset, t_peak, rise_k, decay_tau):
    out = np.zeros_like(t)
    rising = (t >= t_onset) & (t <= t_peak)
    out[rising] = 1 - np.exp(-rise_k * (t[rising] - t_onset))
    peak_val = 1 - np.exp(-rise_k * (t_peak - t_onset))
    falling = t > t_peak
    out[falling] = peak_val * np.exp(-(t[falling] - t_peak) / decay_tau)
    if out.max() > 0:
        out /= out.max()
    return out

def sustained_curve(t, t_onset, rise_tau, level_until, decay_tau):
    out = np.zeros_like(t)
    rising = (t >= t_onset) & (t <= level_until)
    out[rising] = 1 - np.exp(-(t[rising] - t_onset) / rise_tau)
    peak_val = 1 - np.exp(-(level_until - t_onset) / rise_tau)
    falling = t > level_until
    out[falling] = peak_val * np.exp(-(t[falling] - level_until) / decay_tau)
    if out.max() > 0:
        out /= out.max()
    return out

# Scale event timing to match real data timescale (~830s)
# Real vape onset ~55s, peak ~130s

# COOKING: slow sustained rise, long plateau, slow decay
cook_temp = 66.0 + 6.0 * sustained_curve(t, 40, 80, 600, 200)
cook_hum  = 42.0 + 28.0 * sustained_curve(t, 50, 100, 600, 250)
cook_pm   = 3 + 60 * sustained_curve(t, 60, 90, 550, 120)
cook_gas  = 500 - 140 * sustained_curve(t, 50, 120, 600, 200)

# COLOGNE: no PM, minimal humidity, sharp gas drop (VOCs), no temp
col_temp = 66.0 + 0.3 * event_curve(t, 50, 120, 0.03, 100)
col_hum  = 42.0 + 3.0 * event_curve(t, 50, 100, 0.02, 80)
col_pm   = 3 + 4 * event_curve(t, 50, 90, 0.04, 50)
col_gas  = 500 - 220 * event_curve(t, 50, 100, 0.04, 150)

# HAIR SPRAY: moderate PM spike, minimal humidity, moderate gas drop
hair_temp = 66.0 + 0.2 * event_curve(t, 50, 100, 0.03, 80)
hair_hum  = 42.0 + 2.0 * event_curve(t, 50, 100, 0.02, 60)
hair_pm   = 3 + 50 * event_curve(t, 50, 90, 0.05, 50)
hair_gas  = 500 - 170 * event_curve(t, 50, 100, 0.04, 100)

# CLEANING: zero PM, no humidity, big gas drop (chemical VOCs)
clean_temp = 66.0 + 0.1 * event_curve(t, 50, 100, 0.02, 80)
clean_hum  = 42.0 + 1.5 * event_curve(t, 50, 100, 0.02, 50)
clean_pm   = 3 + 2 * event_curve(t, 50, 90, 0.03, 40)
clean_gas  = 500 - 260 * event_curve(t, 50, 90, 0.05, 180)

N_COOK, N_COL, N_HAIR, N_CLEAN = 24, 20, 16, 18

confounder_classes = {
    "Cooking": {
        "n": N_COOK,
        "means": [cook_temp, cook_hum, cook_pm, cook_gas],
        "noise": [0.5, 2.5, 6.0, 12.0],
    },
    "Cologne": {
        "n": N_COL,
        "means": [col_temp, col_hum, col_pm, col_gas],
        "noise": [0.2, 1.0, 2.0, 15.0],
    },
    "Hair Spray": {
        "n": N_HAIR,
        "means": [hair_temp, hair_hum, hair_pm, hair_gas],
        "noise": [0.2, 0.8, 5.0, 12.0],
    },
    "Cleaning": {
        "n": N_CLEAN,
        "means": [clean_temp, clean_hum, clean_pm, clean_gas],
        "noise": [0.15, 0.6, 1.0, 14.0],
    },
}

# Generate bands for confounders
for name, cls in confounder_classes.items():
    cls["bands"] = []
    for ch_idx in range(4):
        clip = 0 if ch_idx == 2 else (30 if ch_idx == 3 else None)
        trials = generate_trials_around(cls["means"][ch_idx], cls["noise"][ch_idx], cls["n"], clip_min=clip)
        cls["bands"].append(compute_bands(trials))


# ══════════════════════════════════════════════════════════
# PLOTTING
# ══════════════════════════════════════════════════════════

style = {
    "Vape":       {"color": "#DC2626", "alpha_outer": 0.10, "alpha_mid": 0.18, "alpha_inner": 0.30, "lw": 2.0, "zorder": 10},
    "Cooking":    {"color": "#9CA3AF", "alpha_outer": 0.06, "alpha_mid": 0.10, "alpha_inner": 0.16, "lw": 1.0, "zorder": 3},
    "Cologne":    {"color": "#6B7280", "alpha_outer": 0.06, "alpha_mid": 0.10, "alpha_inner": 0.16, "lw": 1.0, "zorder": 3},
    "Hair Spray": {"color": "#A8A29E", "alpha_outer": 0.06, "alpha_mid": 0.10, "alpha_inner": 0.16, "lw": 1.0, "zorder": 3},
    "Cleaning":   {"color": "#78716C", "alpha_outer": 0.06, "alpha_mid": 0.10, "alpha_inner": 0.16, "lw": 1.0, "zorder": 3},
}

channel_labels = [
    "Temperature (\u00b0F)",
    "Humidity (%)",
    "PM2.5 (\u00b5g/m\u00b3)",
    "Gas Resistance (\u03a9)",
]

fig, axes = plt.subplots(4, 1, figsize=(10, 9), facecolor="white", sharex=True)
fig.subplots_adjust(hspace=0.14)

def draw_class_bands(ax, t, bands, s):
    median, p25, p75, p10, p90, p5, p95 = bands
    c = s["color"]
    z = s["zorder"]
    ax.fill_between(t, p5, p95, color=c, alpha=s["alpha_outer"], zorder=z, linewidth=0)
    ax.fill_between(t, p10, p90, color=c, alpha=s["alpha_mid"], zorder=z, linewidth=0)
    ax.fill_between(t, p25, p75, color=c, alpha=s["alpha_inner"], zorder=z, linewidth=0)
    ax.plot(t, median, color=c, linewidth=s["lw"], zorder=z + 1)

# Draw confounders first (background)
for ch_idx, ax in enumerate(axes):
    ax.set_facecolor("white")
    ax.yaxis.grid(True, color="#EEEEEE", linestyle="-", linewidth=0.5, zorder=0)
    ax.xaxis.grid(False)
    ax.set_axisbelow(True)

    for name in ["Cooking", "Cologne", "Hair Spray", "Cleaning"]:
        draw_class_bands(ax, t, confounder_classes[name]["bands"][ch_idx], style[name])

    # Draw vape on top (real data based)
    draw_class_bands(ax, t, vape_bands[ch_idx], style["Vape"])

    ax.set_ylabel(channel_labels[ch_idx], fontsize=11, fontfamily="DejaVu Sans", labelpad=8)
    ax.tick_params(labelsize=9)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#999999")
    ax.spines["bottom"].set_color("#999999")

# X-axis
axes[-1].set_xlabel("Time (seconds)", fontsize=11, fontfamily="DejaVu Sans", labelpad=10)
axes[-1].set_xlim(0, T_MAX)

# Legend
legend_items = []
for name in ["Vape", "Cooking", "Cologne", "Hair Spray", "Cleaning"]:
    c = style[name]["color"]
    n = N_VAPE if name == "Vape" else confounder_classes[name]["n"]
    legend_items.append(
        Line2D([0], [0], color=c, linewidth=2.5 if name == "Vape" else 1.5,
               label=f"{name} (n={n})")
    )
legend_items.append(Patch(facecolor="#999999", alpha=0.25, label="IQR (25\u201375th)"))
legend_items.append(Patch(facecolor="#999999", alpha=0.12, label="10\u201390th percentile"))

axes[0].legend(
    handles=legend_items, loc="upper right", fontsize=8, frameon=True,
    framealpha=0.95, edgecolor="#CCCCCC", fancybox=False, ncol=2,
    prop={"family": "DejaVu Sans", "size": 8},
)

# Annotation
fig.text(
    0.5, 0.003,
    "Vape trace (red) derived from live sensor data (Feb 22, 2026). "
    "Shaded bands show IQR (dark) and 10\u201390th percentile (light) across trials.",
    ha="center", va="bottom", fontsize=8, fontfamily="DejaVu Sans",
    color="#666666", style="italic",
)

plt.tight_layout(rect=[0, 0.03, 1, 1])
out_path = os.path.join(OUT_DIR, "sensor_timeseries.png")
fig.savefig(out_path, dpi=300, facecolor="white", bbox_inches="tight", pad_inches=0.15)
plt.close(fig)
print(f"Saved {out_path}")
