"""
Generate a publication-quality grouped bar chart comparing 4 ML models.
Output: model_comparison.png (300 DPI, white background)
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Data
models = ["XGBoost", "Random Forest", "KNN (k=7)", "Ensemble"]
accuracy = [94.8, 92.7, 88.4, 97.6]
f1_scores = [0.94, 0.92, 0.87, 0.97]

# Colors: lighter shades for first 3, bold teal for Ensemble
colors = ["#66B2B2", "#99CCCC", "#B2D8D8", "#028090"]

# Figure
fig, ax = plt.subplots(figsize=(8, 5), facecolor="white")
ax.set_facecolor("white")

x = np.arange(len(models))
bar_width = 0.55

bars = ax.bar(x, accuracy, width=bar_width, color=colors,
              edgecolor="#333333", linewidth=0.5, zorder=3)

# Horizontal dashed line at Ensemble accuracy
ax.axhline(y=97.6, color="#028090", linestyle="--", linewidth=1.0,
           alpha=0.5, zorder=2)

# Light gray horizontal gridlines only
ax.yaxis.grid(True, color="#DDDDDD", linestyle="-", linewidth=0.5, zorder=0)
ax.xaxis.grid(False)
ax.set_axisbelow(True)

# Y-axis starting at 75%
ax.set_ylim(82, 101)
ax.set_ylabel("Classification Accuracy (%)", fontsize=11,
              fontfamily="DejaVu Sans", labelpad=10)

# X-axis
ax.set_xticks(x)
ax.set_xticklabels(models, fontsize=11, fontfamily="DejaVu Sans")

# Tick styling
ax.tick_params(axis="y", labelsize=10)
ax.tick_params(axis="x", bottom=False)

# Remove top and right spines
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.spines["left"].set_color("#333333")
ax.spines["bottom"].set_color("#333333")

# Value labels on top of each bar
for i, (bar, acc, f1) in enumerate(zip(bars, accuracy, f1_scores)):
    # Accuracy label
    ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.4,
            f"{acc}%", ha="center", va="bottom",
            fontsize=12, fontweight="bold", fontfamily="DejaVu Sans",
            color="#222222")
    # F1 score below accuracy label
    ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.4,
            f"F1: {f1:.2f}", ha="center", va="top",
            fontsize=9, fontfamily="DejaVu Sans", color="#555555",
            style="italic")

# No title
ax.set_title("")

# Save
plt.tight_layout()
fig.savefig(
    os.path.join(OUT_DIR, "model_comparison.png"),
    dpi=300,
    facecolor="white",
    bbox_inches="tight",
    pad_inches=0.15,
)
plt.close(fig)
print("Saved model_comparison.png")
