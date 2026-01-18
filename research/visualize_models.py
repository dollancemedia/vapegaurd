import matplotlib.pyplot as plt
import numpy as np

def plot_model_specialization():
    # Data Setup
    models = ['Logistic Regression', 'KNN', 'Random Forest', 'XGBoost']
    
    # Metrics
    speed = [12, 28, 45, 67]  # ms
    accuracy = [65, 94, 82, 79]  # %
    false_positive = [8.2, 6.1, 1.8, 3.4]  # %
    confidence = [87.3, 91.7, 96.8, 97.1]  # %
    
    # Colors
    # Logistic Regression: darkest blue
    # KNN: cyan
    # Random Forest: orange
    # XGBoost: dark blue
    colors = ['#000033', 'cyan', 'orange', '#00008B']
    
    # Create Figure
    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    fig.canvas.manager.set_window_title('Graph A: Model Specialization Bar Chart')
    fig.suptitle('AI Model Specialization Analysis', fontsize=16, fontweight='bold')
    
    # Helper to plot bars
    def plot_bar(ax, data, title, ylabel, label_idx, label_text, place_below=False):
        bars = ax.bar(models, data, color=colors, edgecolor='black', alpha=0.8)
        ax.set_title(title, fontsize=12, fontweight='bold')
        ax.set_ylabel(ylabel)
        ax.grid(axis='y', linestyle='--', alpha=0.5)
        
        # Add value labels on top of bars
        for bar in bars:
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height,
                    f'{height}',
                    ha='center', va='bottom', fontsize=10)
            
        # Add Special Annotation
        target_bar = bars[label_idx]
        height = target_bar.get_height()
        
        if place_below:
            # Place inside the bar
            xytext = (0, -25)
            va = 'top'
        else:
            # Place above the bar
            xytext = (0, 20)
            va = 'bottom'
            
        ax.annotate(f'{label_text}',
                    xy=(target_bar.get_x() + target_bar.get_width()/2, height),
                    xytext=xytext,
                    textcoords="offset points",
                    ha='center', va=va,
                    bbox=dict(boxstyle="round,pad=0.3", fc="yellow", alpha=0.9),
                    arrowprops=dict(arrowstyle="->", connectionstyle="arc3,rad=0"))

    # Chart 1: Speed
    plot_bar(axes[0, 0], speed, "Speed (Response Time)", "Time (ms)", 0, "Fastest ✓")
    
    # Chart 2: Pattern Recognition Accuracy
    # Move label below/inside because 94% is too high
    plot_bar(axes[0, 1], accuracy, "Pattern Recognition Accuracy", "Accuracy (%)", 1, "Best Match ✓", place_below=True)
    
    # Chart 3: False Positive Rate
    plot_bar(axes[1, 0], false_positive, "False Positive Rate", "Rate (%)", 2, "Lowest Noise ✓")
    
    # Chart 4: Overall Confidence
    # Move label below/inside because 97.1% is too high
    plot_bar(axes[1, 1], confidence, "Overall Confidence", "Confidence (%)", 3, "Highest Precision ✓", place_below=True)
    
    plt.tight_layout(rect=[0, 0.03, 1, 0.95]) # Adjust for suptitle
    plt.show()

if __name__ == "__main__":
    plot_model_specialization()
