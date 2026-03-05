"""
Generate a publication-quality horizontal bar chart of top 15 feature importances.
Output: feature_importance.png (300 DPI, white background)
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Data (descending order)
features = [
    "PM2.5 delta (peak - baseline)",
    "PM2.5 slope (\u00b5g/m\u00b3/s)",
    "Gas resistance AUC",
    "Humidity rate of change",
    "PM1/PM2.5 ratio",
    "PM2.5 AUC (event window)",
    "Gas resistance delta",
    "Temperature delta",
    "PM10 delta",
    "PM2.5/PM10 ratio",
    "Humidity delta",
    "PM2.5 stability (std dev)",
    "Gas slope",
    "PM1 delta",
    "Temperature stability",
]
importances = [0.182, 0.156, 0.121, 0.098, 0.082, 0.071, 0.058, 0.045,
               0.038, 0.033, 0.029, 0.025, 0.022, 0.019, 0.015]

# Reverse for horizontal bar chart (top feature at top)
features_r = features[::-1]
importances_r = importances[::-1]

# Colors: top 3 darker, rest standard teal
colors_r = []
n = len(features_r)
for i in range(n):
    orig_idx = n - 1 - i  # map back to original descending index
    colors_r.append("#015F6B" if orig_idx < 3 else "#028090")

# Figure
fig, ax = plt.subplots(figsize=(8, 6), facecolor="white")
ax.set_facecolor("white")

y = np.arange(len(features_r))
bars = ax.barh(y, importances_r, height=0.65, color=colors_r,
               edgecolor="#333333", linewidth=0.5, zorder=3)

# Light gray vertical gridlines behind bars
ax.xaxis.grid(True, color="#DDDDDD", linestyle="-", linewidth=0.5, zorder=0)
ax.yaxis.grid(False)
ax.set_axisbelow(True)

# Value labels at end of each bar
for bar, val in zip(bars, importances_r):
    ax.text(bar.get_width() + 0.003, bar.get_y() + bar.get_height() / 2,
            f"{val:.3f}", ha="left", va="center",
            fontsize=9, fontfamily="DejaVu Sans", color="#333333")

# Axis labels
ax.set_yticks(y)
ax.set_yticklabels(features_r, fontsize=10, fontfamily="DejaVu Sans")
ax.set_xlabel("Feature Importance Score", fontsize=11,
              fontfamily="DejaVu Sans", labelpad=10)
ax.set_xlim(0, max(importances) + 0.025)

# Tick styling
ax.tick_params(axis="x", labelsize=9)
ax.tick_params(axis="y", left=False)

# Spines
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.spines["left"].set_color("#333333")
ax.spines["bottom"].set_color("#333333")

# No title
ax.set_title("")

# Save
plt.tight_layout()
fig.savefig(
    os.path.join(OUT_DIR, "feature_importance.png"),
    dpi=300,
    facecolor="white",
    bbox_inches="tight",
    pad_inches=0.15,
)
plt.close(fig)
print("Saved feature_importance.png")
