"""
Generate a publication-quality 6x6 confusion matrix heatmap
for the VapeGuard/Mistio vape detection classifier.
Output: confusion_matrix.png (300 DPI, white background)
"""

import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Data
classes = ["Vape", "Cologne", "Hairspray", "Cooking", "Shower", "Normal"]
cm = np.array([
    [45,  1,  2,  0,  0,  0],
    [ 1, 18,  1,  0,  0,  0],
    [ 2,  1, 15,  0,  0,  0],
    [ 0,  0,  0, 12,  1,  0],
    [ 0,  0,  0,  1, 10,  0],
    [ 0,  0,  0,  0,  0, 22],
])

# Sequential teal colormap
cmap = sns.light_palette("#028090", as_cmap=True)

# Figure
fig, ax = plt.subplots(figsize=(7, 6), facecolor="white")
ax.set_facecolor("white")

sns.heatmap(
    cm,
    annot=True,
    fmt="d",
    cmap=cmap,
    cbar=True,
    cbar_kws={"shrink": 0.8},
    linewidths=0.8,
    linecolor="black",
    square=False,
    xticklabels=classes,
    yticklabels=classes,
    annot_kws={"size": 12, "fontfamily": "DejaVu Sans", "fontweight": "bold"},
    ax=ax,
)

# Outer border
for spine in ax.spines.values():
    spine.set_visible(True)
    spine.set_color("black")
    spine.set_linewidth(1.0)

# Axis labels
ax.set_xlabel("Predicted Class", fontsize=11, fontfamily="DejaVu Sans", labelpad=10)
ax.set_ylabel("Actual Class", fontsize=11, fontfamily="DejaVu Sans", labelpad=10)
ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha="right",
                   fontsize=11, fontfamily="DejaVu Sans")
ax.set_yticklabels(ax.get_yticklabels(), rotation=0,
                   fontsize=11, fontfamily="DejaVu Sans")
ax.set_title("")

# Accuracy annotation
total = cm.sum()
correct = np.trace(cm)
overall_acc = correct / total * 100
vape_recall = cm[0, 0] / cm[0, :].sum() * 100

fig.text(
    0.5, 0.01,
    f"Overall Accuracy: {overall_acc:.1f}%  |  Vape Class Recall: {vape_recall:.1f}%",
    ha="center", va="bottom",
    fontsize=10, fontfamily="DejaVu Sans", color="#333333",
)

# Save
plt.tight_layout(rect=[0, 0.04, 1, 1])
fig.savefig(
    os.path.join(OUT_DIR, "confusion_matrix.png"),
    dpi=300,
    facecolor="white",
    bbox_inches="tight",
    pad_inches=0.15,
)
plt.close(fig)
print(f"Saved confusion_matrix.png  ({overall_acc:.1f}% accuracy, {vape_recall:.1f}% vape recall)")
