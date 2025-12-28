// Mock data service for analytics dashboard

// Generate random data for KPI cards
export const generateAnalyticsSummary = () => {
  const totalDevices = 1247;
  const activeDevices = Math.floor(totalDevices * (0.92 + Math.random() * 0.06));
  const uptimePercentage = 94.5 + Math.random() * 2;
  const errorRate = 1.5 + Math.random() * 2;
  
  return {
    totalDevices,
    activeDevices,
    uptimePercentage: Number(uptimePercentage.toFixed(1)),
    errorRate: Number(errorRate.toFixed(1)),
    previousUptime: 94.8,
    previousErrorRate: 2.3,
    timestamp: new Date().toISOString()
  };
};

// Generate device health data
export const generateDeviceHealth = () => {
  const devices = [];
  const deviceNames = [
    'Temperature Sensor A1', 'Humidity Monitor B2', 'Air Quality C3', 'Motion Detector D4',
    'Pressure Sensor E5', 'Light Meter F6', 'Sound Monitor G7', 'Vibration Sensor H8',
    'CO2 Detector I9', 'PM2.5 Monitor J10', 'VOC Sensor K11', 'Ozone Monitor L12'
  ];
  
  const locations = [
    'Building A, Floor 1', 'Building A, Floor 2', 'Building B, Floor 1', 'Building B, Floor 2',
    'Building C, Floor 1', 'Building C, Floor 2', 'Building D, Floor 1', 'Building D, Floor 2',
    'Building E, Floor 1', 'Building E, Floor 2', 'Building F, Floor 1', 'Building F, Floor 2'
  ];
  
  for (let i = 1; i <= 12; i++) {
    const status = Math.random() > 0.9 ? 'offline' : 'online';
    const batteryLevel = Math.floor(60 + Math.random() * 40);
    const signalStrength = Math.floor(70 + Math.random() * 30);
    const healthScore = Math.floor((batteryLevel + signalStrength) / 2);
    
    devices.push({
      deviceId: `DEV${String(i).padStart(3, '0')}`,
      name: deviceNames[i - 1],
      status,
      batteryLevel,
      signalStrength,
      healthScore,
      lastSeen: new Date(Date.now() - Math.random() * 3600000).toISOString(),
      location: locations[i - 1]
    });
  }
  
  return {
    devices,
    lastUpdate: new Date().toISOString()
  };
};

// Generate trend data for charts
export const generateTrendData = (range = '24h') => {
  const dataPoints = range === '24h' ? 24 : range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const labels = [];
  const activeDevices = [];
  const errorCounts = [];
  const avgBattery = [];
  const avgSignal = [];
  
  for (let i = 0; i < dataPoints; i++) {
    if (range === '24h') {
      labels.push(`${String(i).padStart(2, '0')}:00`);
    } else if (range === '7d') {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      labels.push(days[i]);
    } else {
      labels.push(`Day ${i + 1}`);
    }
    
    activeDevices.push(1180 + Math.floor(Math.random() * 20));
    errorCounts.push(15 + Math.floor(Math.random() * 15));
    avgBattery.push(75 + Math.floor(Math.random() * 20));
    avgSignal.push(80 + Math.floor(Math.random() * 15));
  }
  
  return {
    labels,
    datasets: [
      {
        label: 'Active Devices',
        data: activeDevices,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4
      },
      {
        label: 'Error Count',
        data: errorCounts,
        borderColor: '#EF4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4
      },
      {
        label: 'Avg Battery %',
        data: avgBattery,
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        tension: 0.4
      },
      {
        label: 'Avg Signal %',
        data: avgSignal,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4
      }
    ]
  };
};

// Generate alerts data
export const generateAlerts = () => {
  const alerts = [];
  const severities = ['low', 'medium', 'high', 'critical'];
  const messages = [
    'Device battery below 20%',
    'Device offline for more than 1 hour',
    'Sensor reading out of range',
    'Communication timeout',
    'Firmware update available',
    'Calibration required',
    'High temperature detected',
    'Low signal strength'
  ];
  
  for (let i = 1; i <= 8; i++) {
    const severity = severities[Math.floor(Math.random() * severities.length)];
    const message = messages[Math.floor(Math.random() * messages.length)];
    const deviceId = `DEV${String(Math.floor(Math.random() * 50) + 1).padStart(3, '0')}`;
    
    alerts.push({
      alertId: `ALT${String(i).padStart(3, '0')}`,
      deviceId,
      severity,
      message,
      timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      acknowledged: Math.random() > 0.7
    });
  }
  
  return alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

// Simulate API calls with delays
export const mockDataService = {
  getAnalyticsSummary: () => {
    return new Promise(resolve => {
      setTimeout(() => resolve(generateAnalyticsSummary()), 300);
    });
  },
  
  getDeviceHealth: () => {
    return new Promise(resolve => {
      setTimeout(() => resolve(generateDeviceHealth()), 500);
    });
  },
  
  getTrendData: (range) => {
    return new Promise(resolve => {
      setTimeout(() => resolve(generateTrendData(range)), 400);
    });
  },
  
  getAlerts: () => {
    return new Promise(resolve => {
      setTimeout(() => resolve(generateAlerts()), 200);
    });
  },
  
  acknowledgeAlert: (alertId) => {
    return new Promise(resolve => {
      setTimeout(() => resolve({ success: true }), 150);
    });
  }
};

export default mockDataService;