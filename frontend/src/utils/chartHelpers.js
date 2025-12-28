// Chart.js configuration helpers

export const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        usePointStyle: true,
        padding: 20,
        font: {
          size: 12,
          family: 'Inter, sans-serif'
        }
      }
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      titleColor: '#fff',
      bodyColor: '#fff',
      borderColor: '#374151',
      borderWidth: 1,
      cornerRadius: 8,
      displayColors: true,
      titleFont: {
        size: 14,
        family: 'Inter, sans-serif'
      },
      bodyFont: {
        size: 12,
        family: 'Inter, sans-serif'
      }
    }
  },
  scales: {
    x: {
      grid: {
        color: 'rgba(156, 163, 175, 0.2)',
        drawBorder: false
      },
      ticks: {
        color: '#6B7280',
        font: {
          size: 12,
          family: 'Inter, sans-serif'
        }
      }
    },
    y: {
      grid: {
        color: 'rgba(156, 163, 175, 0.2)',
        drawBorder: false
      },
      ticks: {
        color: '#6B7280',
        font: {
          size: 12,
          family: 'Inter, sans-serif'
        }
      }
    }
  },
  interaction: {
    intersect: false,
    mode: 'index'
  }
};

export const getSeverityColor = (severity) => {
  switch (severity) {
    case 'critical':
      return '#DC2626';
    case 'high':
      return '#EF4444';
    case 'medium':
      return '#F59E0B';
    case 'low':
      return '#10B981';
    default:
      return '#6B7280';
  }
};

export const getStatusColor = (status) => {
  switch (status) {
    case 'online':
      return '#10B981';
    case 'offline':
      return '#EF4444';
    case 'warning':
      return '#F59E0B';
    default:
      return '#6B7280';
  }
};

export const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) {
    return 'Just now';
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  }
};

export const formatDateTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};