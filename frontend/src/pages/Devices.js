import React, { useState, useCallback, useEffect, useRef } from 'react';
import DeviceMap from '../components/DeviceMap';
import DeviceList from '../components/DeviceList';
import DeviceDetailPanel from '../components/DeviceDetailPanel';
import AddDeviceModal from '../components/AddDeviceModal';
import { useDevices } from '../hooks/useDevices';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../services/api';
import deviceService from '../services/deviceService';
import { useAuth, useOrganization } from '@clerk/clerk-react';
import MobileDashboard from './MobileDashboard';
import { useMediaQuery } from 'react-responsive';

// ── System Health Gauge (SVG semi-circle, green→red) ─────────────────────────
const SystemGauge = ({ score = 85 }) => {
  const cx = 80, cy = 80, r = 60, needleLen = 48;
  const toRad = d => (d * Math.PI) / 180;
  // score 100 → needle left (green), score 0 → needle right (red)
  const θ = toRad((score / 100) * 180);
  const nx = (cx + needleLen * Math.cos(θ)).toFixed(2);
  const ny = (cy - needleLen * Math.sin(θ)).toFixed(2);

  // Arc segments: sweep-flag=1 → clockwise in SVG = left→top→right
  // Precomputed points on the circle using standard math angles
  // 180°→140°→110°→60°→30°→0°
  const pts = [
    { angle: 140, x: 34.1, y: 41.4 },
    { angle: 110, x: 59.5, y: 23.7 },
    { angle:  60, x: 110,  y: 28.0 },
    { angle:  30, x: 132,  y: 50.0 },
    { angle:   0, x: 140,  y: 80.0 },
  ];

  const segments = [
    { d: `M 20 80 A ${r} ${r} 0 0 1 ${pts[0].x} ${pts[0].y}`, color: '#16a34a' },
    { d: `M ${pts[0].x} ${pts[0].y} A ${r} ${r} 0 0 1 ${pts[1].x} ${pts[1].y}`, color: '#86efac' },
    { d: `M ${pts[1].x} ${pts[1].y} A ${r} ${r} 0 0 1 ${pts[2].x} ${pts[2].y}`, color: '#facc15' },
    { d: `M ${pts[2].x} ${pts[2].y} A ${r} ${r} 0 0 1 ${pts[3].x} ${pts[3].y}`, color: '#fb923c' },
    { d: `M ${pts[3].x} ${pts[3].y} A ${r} ${r} 0 0 1 ${pts[4].x} ${pts[4].y}`, color: '#ef4444' },
  ];

  return (
    <svg width="160" height="90" viewBox="0 0 160 90" aria-hidden="true">
      {/* grey track */}
      <path d={`M 20 80 A ${r} ${r} 0 0 1 140 80`} fill="none" stroke="#e5e7eb" strokeWidth="13" />
      {/* coloured segments */}
      {segments.map((s, i) => (
        <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth="13"
          strokeLinecap={i === 0 || i === segments.length - 1 ? 'round' : 'butt'} />
      ))}
      {/* needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke="#1f2937" strokeWidth="2.5" strokeLinecap="round" />
      {/* hub */}
      <circle cx={cx} cy={cy} r="5.5" fill="#1f2937" />
      <circle cx={cx} cy={cy} r="3"   fill="white" />
    </svg>
  );
};

// ── Demo / testing device with rich sample data ───────────────────────────────
const now = Date.now();
const makeTs = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();

const DEMO_DEVICE_NORMAL = {
  id: '__demo__',
  name: 'Demo Sensor',
  type: 'detector',
  status: 'online',
  isOnline: true,
  location: { building: 'Main Hall', floor: '2', room: 'B-204' },
  lastSeen: makeTs(0),
  uptime: '99.9%',
  sensorData: {
    humidity: 62.3,
    temperature: 22.1,
    pm25: 18,
    gasResistance: 45200,
    particleSize: 0.4,
    volumeSpike: false,
    predictedClass: 'normal',
    confidence: 92,
    timestamp: makeTs(0),
    baseline_humidity: 58.5,
    baseline_pm25: 12.3,
    baseline_temperature: 21.8,
    baseline_gas_resistance: 48000,
    ewma_pm25: 12.3,
  },
};

const DEMO_DEVICE_ALERT = {
  id: '__demo__',
  name: 'Demo Sensor',
  type: 'detector',
  status: 'alarm',
  isOnline: true,
  location: { building: 'Main Hall', floor: '2', room: 'B-204' },
  lastSeen: new Date().toISOString(),
  uptime: '99.9%',
  sensorData: {
    humidity: 78.5,
    temperature: 23.8,
    pm25: 285,
    gasResistance: 12400,
    particleSize: 4.8,
    volumeSpike: true,
    predictedClass: 'vape',
    confidence: 97,
    timestamp: new Date().toISOString(),
    baseline_humidity: 58.5,
    baseline_pm25: 12.3,
    baseline_temperature: 21.8,
    baseline_gas_resistance: 48000,
    ewma_pm25: 12.3,
  },
};

// Rich history: normal → rising → vape event → cooldown → normal
const DEMO_HISTORY = [
  // Most recent — back to normal
  { humidity: 62.3, temperature: 22.1, pm25: 18, gasResistance: 45200, particleSize: 0.4, volumeSpike: false, predictedClass: 'normal',  confidence: 92, timestamp: makeTs(0)  },
  { humidity: 63.1, temperature: 22.0, pm25: 20, gasResistance: 44800, particleSize: 0.5, volumeSpike: false, predictedClass: 'normal',  confidence: 89, timestamp: makeTs(1)  },
  { humidity: 63.8, temperature: 22.2, pm25: 22, gasResistance: 43500, particleSize: 0.5, volumeSpike: false, predictedClass: 'normal',  confidence: 85, timestamp: makeTs(2)  },
  // Cooldown after detection
  { humidity: 66.0, temperature: 22.5, pm25: 38, gasResistance: 38200, particleSize: 1.2, volumeSpike: false, predictedClass: 'normal',  confidence: 78, timestamp: makeTs(3)  },
  { humidity: 68.2, temperature: 22.7, pm25: 55, gasResistance: 32100, particleSize: 2.0, volumeSpike: true,  predictedClass: 'normal',  confidence: 70, timestamp: makeTs(4)  },
  // Vape detected
  { humidity: 71.5, temperature: 23.0, pm25: 87, gasResistance: 22400, particleSize: 3.8, volumeSpike: true,  predictedClass: 'vape',    confidence: 97, timestamp: makeTs(5)  },
  { humidity: 73.2, temperature: 23.1, pm25: 102,gasResistance: 18900, particleSize: 4.5, volumeSpike: true,  predictedClass: 'vape',    confidence: 98, timestamp: makeTs(6)  },
  { humidity: 72.8, temperature: 23.0, pm25: 95, gasResistance: 19500, particleSize: 4.2, volumeSpike: true,  predictedClass: 'vape',    confidence: 96, timestamp: makeTs(7)  },
  // Suspected / confirming
  { humidity: 69.4, temperature: 22.8, pm25: 64, gasResistance: 28800, particleSize: 2.8, volumeSpike: true,  predictedClass: 'suspected',confidence: 82,timestamp: makeTs(8)  },
  { humidity: 66.7, temperature: 22.6, pm25: 45, gasResistance: 33600, particleSize: 1.8, volumeSpike: false, predictedClass: 'suspected',confidence: 74,timestamp: makeTs(9)  },
  // Rising
  { humidity: 64.1, temperature: 22.3, pm25: 31, gasResistance: 40200, particleSize: 0.9, volumeSpike: false, predictedClass: 'normal',  confidence: 88, timestamp: makeTs(10) },
  { humidity: 62.5, temperature: 22.2, pm25: 24, gasResistance: 43100, particleSize: 0.6, volumeSpike: false, predictedClass: 'normal',  confidence: 91, timestamp: makeTs(12) },
  // Baseline
  { humidity: 61.8, temperature: 22.0, pm25: 14, gasResistance: 47800, particleSize: 0.3, volumeSpike: false, predictedClass: 'normal',  confidence: 95, timestamp: makeTs(15) },
  { humidity: 61.2, temperature: 21.9, pm25: 12, gasResistance: 48500, particleSize: 0.3, volumeSpike: false, predictedClass: 'normal',  confidence: 96, timestamp: makeTs(18) },
  { humidity: 61.0, temperature: 21.8, pm25: 11, gasResistance: 49100, particleSize: 0.2, volumeSpike: false, predictedClass: 'normal',  confidence: 97, timestamp: makeTs(22) },
  { humidity: 60.8, temperature: 21.8, pm25: 11, gasResistance: 49300, particleSize: 0.2, volumeSpike: false, predictedClass: 'normal',  confidence: 97, timestamp: makeTs(26) },
  { humidity: 60.9, temperature: 21.9, pm25: 12, gasResistance: 49000, particleSize: 0.2, volumeSpike: false, predictedClass: 'normal',  confidence: 96, timestamp: makeTs(30) },
];

// Alert-active history: hazardous readings at the top, escalating from normal
const DEMO_HISTORY_ALERT = [
  { humidity: 78.5, temperature: 23.8, pm25: 285, gasResistance: 12400, particleSize: 4.8, volumeSpike: true,  predictedClass: 'vape',      confidence: 97, timestamp: makeTs(0)  },
  { humidity: 76.8, temperature: 23.5, pm25: 260, gasResistance: 13200, particleSize: 4.5, volumeSpike: true,  predictedClass: 'vape',      confidence: 96, timestamp: makeTs(1)  },
  { humidity: 75.1, temperature: 23.3, pm25: 230, gasResistance: 14800, particleSize: 4.2, volumeSpike: true,  predictedClass: 'vape',      confidence: 95, timestamp: makeTs(2)  },
  { humidity: 73.4, temperature: 23.1, pm25: 195, gasResistance: 16500, particleSize: 3.8, volumeSpike: true,  predictedClass: 'vape',      confidence: 93, timestamp: makeTs(3)  },
  { humidity: 71.2, temperature: 22.9, pm25: 155, gasResistance: 19200, particleSize: 3.2, volumeSpike: true,  predictedClass: 'suspected', confidence: 85, timestamp: makeTs(4)  },
  { humidity: 68.5, temperature: 22.7, pm25: 110, gasResistance: 24600, particleSize: 2.5, volumeSpike: true,  predictedClass: 'suspected', confidence: 78, timestamp: makeTs(5)  },
  { humidity: 65.8, temperature: 22.5, pm25: 72,  gasResistance: 31400, particleSize: 1.6, volumeSpike: false, predictedClass: 'normal',    confidence: 70, timestamp: makeTs(6)  },
  { humidity: 63.4, temperature: 22.3, pm25: 38,  gasResistance: 39800, particleSize: 0.8, volumeSpike: false, predictedClass: 'normal',    confidence: 88, timestamp: makeTs(8)  },
  { humidity: 62.1, temperature: 22.1, pm25: 18,  gasResistance: 45200, particleSize: 0.4, volumeSpike: false, predictedClass: 'normal',    confidence: 92, timestamp: makeTs(10) },
  { humidity: 61.5, temperature: 22.0, pm25: 14,  gasResistance: 47800, particleSize: 0.3, volumeSpike: false, predictedClass: 'normal',    confidence: 95, timestamp: makeTs(15) },
];

// ── AQI helpers (EPA breakpoints for PM2.5) ──────────────────────────────────
const calcAQI = (pm25) => {
  if (!pm25 || pm25 <= 0) return 0;
  if (pm25 <= 12.0)  return Math.round((50  / 12.0)  * pm25);
  if (pm25 <= 35.4)  return Math.round(50  + (50  / 23.3)  * (pm25 - 12.1));
  if (pm25 <= 55.4)  return Math.round(100 + (49  / 19.9)  * (pm25 - 35.5));
  if (pm25 <= 150.4) return Math.round(150 + (49  / 94.9)  * (pm25 - 55.5));
  if (pm25 <= 250.4) return Math.round(200 + (99  / 99.9)  * (pm25 - 150.5));
  return Math.min(500, Math.round(300 + (199 / 249.9) * (pm25 - 250.5)));
};
const getAQIInfo = (aqi) => {
  if (aqi <= 50)  return { label: 'Good',      color: '#22c55e' };
  if (aqi <= 100) return { label: 'Moderate',  color: '#eab308' };
  if (aqi <= 150) return { label: 'Sensitive', color: '#f97316' };
  if (aqi <= 200) return { label: 'Unhealthy', color: '#ef4444' };
  if (aqi <= 300) return { label: 'Very Poor', color: '#a855f7' };
  return              { label: 'Hazardous', color: '#dc2626' };
};

// ── Status classifier (mirrors DeviceList's getStatusClass) ──────────────────
const getDevStatusClass = (device) => {
  const { status, sensorData, isOnline } = device;
  if (sensorData?.predictedClass === 'vape' || status === 'alarm') return 'alarm';
  if (status === 'CONFIRMING' || sensorData?.predictedClass === 'suspected') return 'warning';
  if (status === 'WARMUP' || status === 'CALIBRATING') return 'warning';
  if (status === 'COOLDOWN') return 'cooldown';
  if (status === 'offline' || isOnline === false) return 'offline';
  return 'online';
};

const mergeDefined = (base = {}, patch = {}) => {
  const result = { ...base };
  for (const key in patch) {
    if (patch[key] !== undefined && patch[key] !== null) {
      result[key] = patch[key];
    }
  }
  return result;
};

const Devices = () => {
  const isMobile = useMediaQuery({ maxWidth: 768 });

  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [demoAlertActive, setDemoAlertActive] = useState(false);
  const demoDevice = demoAlertActive ? DEMO_DEVICE_ALERT : DEMO_DEVICE_NORMAL;
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    search: ''
  });
  
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isCalibratingAll, setIsCalibratingAll] = useState(false);
  const [mapEditAfterAdd, setMapEditAfterAdd] = useState(false);
  const [deviceHistory, setDeviceHistory] = useState({}); // Map of deviceId -> array of readings
  const lastHistoryUpdateRef = useRef({});
  const { organization } = useOrganization();
  // Use organization ID for specific sites to match registration data
  // If org name is Admin, pass 'admin' to see all devices
  const school = (organization?.name === 'admin' || organization?.slug === 'admin') 
    ? 'admin' 
    : organization?.id;
    
  const { devices, loading, error, refreshDevices, pingDevice, updateDeviceStatus, deleteDevice } = useDevices(school);

  // Keep a ref so handleWebSocketMessage never captures a stale devices array (F1)
  const devicesRef = useRef(devices);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  // Re-sync selectedDevice from devices array after each poll (F4)
  useEffect(() => {
    if (!selectedDevice) return;
    const updated = devices.find(d => d.id === selectedDevice.id);
    if (updated) setSelectedDevice(prev => ({ ...prev, ...updated }));
  }, [devices]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get Clerk token
  const { getToken } = useAuth();
  const [token, setToken] = useState(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const t = await getToken();
        setToken(t);
      } catch (error) {
        console.error("Error fetching Clerk token:", error);
      }
    };
    fetchToken();
  }, [getToken]);

  // Setup silent polling
  useEffect(() => {
    const pollInterval = setInterval(() => {
      refreshDevices();
    }, 15000);

    return () => clearInterval(pollInterval);
  }, [refreshDevices]);

  // Fetch recent history on load
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await api.get('/sensors/sensor-data');
        const historyData = response.data; // Array of sensor readings
        
        const isValidTimestamp = (ts) => {
          if (!ts || typeof ts !== 'string' || !ts.includes('T')) return false;
          const d = new Date(ts);
          return !isNaN(d) && d.getFullYear() >= 2020 && d.getFullYear() <= 2100;
        };

        // Group by device_id
        const historyMap = {};
        historyData.forEach(reading => {
          if (!isValidTimestamp(reading.timestamp)) return;
          const deviceId = reading.device_id;
          if (!historyMap[deviceId]) {
            historyMap[deviceId] = [];
          }
          // Normalize reading format
          const formattedReading = {
            humidity: reading.humidity,
            temperature: reading.temperature || 0,
            pm25: reading.pm25,
            gasResistance: reading.gas_resistance ?? reading.gasResistance,
            particleSize: reading.particle_size || reading.particleSize || 0,
            volumeSpike: reading.volume_spike || reading.volumeSpike || false,
            predictedClass: reading.predicted_class || (reading.prediction ? reading.prediction.type : 'normal'),
            timestamp: reading.timestamp,
            confidence: reading.confidence || (reading.prediction ? reading.prediction.confidence : 0)
          };
          historyMap[deviceId].push(formattedReading);
        });
        
        // Sort each device's history by timestamp descending
        Object.keys(historyMap).forEach(deviceId => {
            historyMap[deviceId].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            // Update device status with latest reading from history
            if (historyMap[deviceId].length > 0) {
              const latest = historyMap[deviceId][0];
              const updates = {
                sensorData: {
                  humidity: latest.humidity,
                  temperature: latest.temperature,
                  pm25: latest.pm25,
                  particleSize: latest.particleSize,
                  volumeSpike: latest.volumeSpike,
                  predictedClass: latest.predictedClass,
                  timestamp: latest.timestamp,
                  confidence: latest.confidence
                },
                lastSeen: latest.timestamp,
                // If data is very recent (e.g. < 2 mins), mark as online, else offline
                status: (new Date() - new Date(latest.timestamp) < 120000) ? 'online' : 'offline'
              };
              updateDeviceStatus(deviceId, updates);
            }
        });

        setDeviceHistory(historyMap);
      } catch (err) {
        console.error("Failed to fetch device history:", err);
      }
    };
    
    fetchHistory();
  }, [updateDeviceStatus]);

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = useCallback((message) => {
    if (!message) return;

    if (message.type === 'sensor_data' || message.type === 'newSensorData') {
      const payload = message.data || message;
      const deviceId = payload.device_id || (payload.sensor_data && payload.sensor_data.device_id);
      
      if (deviceId) {
        const deviceFromState = devicesRef.current.find(d => d.id === deviceId);
        const latestFullSensorData = deviceFromState?.sensorData || {};

        const reading = payload.sensor_data || payload;
        const wsState = reading?.prediction?.status;
        const derivedStatus =
          wsState === 'WARMUP' || wsState === 'CALIBRATING' || wsState === 'CONFIRMING' || wsState === 'COOLDOWN' || wsState === 'IDLE'
            ? wsState
            : 'online';
        
        const sensorDataUpdate = {
            humidity: reading.humidity,
            temperature: reading.temperature,
            pm25: reading.pm25,
            particleSize: reading.particle_size ?? reading.particleSize,
            volumeSpike: reading.volume_spike ?? reading.volumeSpike,
            predictedClass: reading.predicted_class ?? (reading.prediction ? reading.prediction.type : undefined),
            timestamp: reading.timestamp || new Date().toISOString(),
            confidence: reading.confidence ?? (reading.prediction && reading.prediction.confidence),
            gasResistance: reading.gas_resistance ?? reading.gasResistance,
            ewma_pm25: reading.ewma_pm25,
            baseline_humidity: reading.baseline_humidity,
            baseline_pm25: reading.baseline_pm25,
            baseline_pm10: reading.baseline_pm10,
            baseline_temperature: reading.baseline_temperature,
            baseline_gas_resistance: reading.baseline_gas_resistance
        };

        const newCompleteSensorData = mergeDefined(latestFullSensorData, sensorDataUpdate);

        const updates = {
          sensorData: newCompleteSensorData,
          lastSeen: new Date().toISOString(),
          isOnline: true,
          status: derivedStatus
        };

        updateDeviceStatus(deviceId, updates);

        const now = Date.now();
        if (now - (lastHistoryUpdateRef.current[deviceId] || 0) >= 1000) {
          lastHistoryUpdateRef.current[deviceId] = now;
          setDeviceHistory(prev => {
            const currentHistory = prev[deviceId] || [];
            const newHistoryEntry = { ...newCompleteSensorData, timestamp: sensorDataUpdate.timestamp };
            const newHistory = [newHistoryEntry, ...currentHistory].slice(0, 50);
            return { ...prev, [deviceId]: newHistory };
          });
        }

        setSelectedDevice(prev => {
          if (prev && prev.id === deviceId) {
            return {
              ...prev,
              ...updates,
            };
          }
          return prev;
        });
      }
    }

    // Handle event_update (confirmed events — B1 fix: status update only, no sensor data overwrite)
    if (message.type === 'event_update') {
      const payload = message.data || message;
      const deviceId = payload.device_id;
      if (deviceId && payload.status === 'confirmed') {
        updateDeviceStatus(deviceId, {
          lastSeen: new Date().toISOString(),
          isOnline: true,
        });
      }
    }
  }, [updateDeviceStatus]);

  useWebSocket('/ws/events', {
    onMessage: handleWebSocketMessage,
    queryParams: { token },
    enabled: !!token
  });

  if (isMobile) {
    return <MobileDashboard />;
  }

  // Handle device selection from map or list
  const handleDeviceSelect = (device) => {
    setSelectedDevice(device);
    setIsPanelOpen(true);
  };

  // Handle panel close
  const handlePanelClose = () => {
    setIsPanelOpen(false);
    setSelectedDevice(null);
  };

  // Handle filter changes
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  // Recalibrate every device at once
  const handleCalibrateAll = async () => {
    if (isCalibratingAll || devices.length === 0) return;
    setIsCalibratingAll(true);
    try {
      await Promise.allSettled(devices.map(d => deviceService.recalibrateDevice(d.id)));
      refreshDevices();
    } catch (err) {
      console.error('Calibrate all failed:', err);
    } finally {
      setIsCalibratingAll(false);
    }
  };

  // Toggle demo vape alert — dispatches a custom event for NotificationController
  const handleDemoAlert = () => {
    const next = !demoAlertActive;
    setDemoAlertActive(next);
    if (next) {
      // Update selected device if demo is currently selected
      setSelectedDevice(prev => prev?.id === '__demo__' ? DEMO_DEVICE_ALERT : prev);
      // Fire a global custom event so NotificationController shows the toast
      window.dispatchEvent(new CustomEvent('demoVapeAlert', {
        detail: {
          id: `demo-vape-${Date.now()}`,
          device_id: '__demo__',
          type: 'vape',
          confidence: 97,
          location: 'Main Hall · B-204',
          timestamp: new Date().toISOString(),
        }
      }));
    } else {
      setSelectedDevice(prev => prev?.id === '__demo__' ? DEMO_DEVICE_NORMAL : prev);
    }
  };

  // Handle device ping
  const handlePingDevice = async (deviceId) => {
    try {
      await pingDevice(deviceId);
      // Refresh devices to get updated status
      refreshDevices();
    } catch (error) {
      console.error('Failed to ping device:', error);
    }
  };

  // Filter devices based on current filters
  const filteredDevices = devices.filter(device => {
    const cls = getDevStatusClass(device);
    const matchesStatus = filters.status === 'all' || cls === filters.status;
    const matchesSearch =
      device.name.toLowerCase().includes(filters.search.toLowerCase()) ||
      device.location?.building?.toLowerCase().includes(filters.search.toLowerCase()) ||
      device.location?.room?.toLowerCase().includes(filters.search.toLowerCase());
    return matchesStatus && matchesSearch;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  // Count per status bucket (across ALL devices, not filtered)
  const statusCounts = {
    all:     devices.length,
    online:  devices.filter(d => getDevStatusClass(d) === 'online').length,
    alarm:   devices.filter(d => getDevStatusClass(d) === 'alarm').length,
    warning: devices.filter(d => getDevStatusClass(d) === 'warning').length,
    offline: devices.filter(d => getDevStatusClass(d) === 'offline').length,
  };

  // ── AQI / air quality derived from live sensor data ─────────────────────────
  const onlineWithData = devices.filter(d => d.sensorData?.pm25 != null && d.isOnline !== false);
  const avgPM25 = onlineWithData.length > 0
    ? +(onlineWithData.reduce((s, d) => s + (d.sensorData.pm25 || 0), 0) / onlineWithData.length).toFixed(1)
    : 0;
  const avgHumidity = onlineWithData.length > 0
    ? Math.round(onlineWithData.reduce((s, d) => s + (d.sensorData.humidity || 0), 0) / onlineWithData.length)
    : 0;
  const aqi     = calcAQI(avgPM25);
  const aqiInfo = getAQIInfo(aqi);

  // ── Derived stats for the right panel ───────────────────────────────────────
  const onlineCount  = devices.filter(d =>
    d.status === 'online' || (d.isOnline !== false && d.status !== 'offline'
    && d.status !== 'COOLDOWN' && d.status !== 'WARMUP'
    && d.status !== 'CALIBRATING' && d.status !== 'CONFIRMING')
  ).length;
  const alertCount = devices.filter(d =>
    d.status === 'alarm' || d.sensorData?.predictedClass === 'vape'
  ).length;
  const systemScore  = devices.length > 0
    ? Math.max(0, Math.min(100, Math.round(((onlineCount - alertCount * 2) / Math.max(devices.length, 1)) * 100)))
    : 100;
  const systemLabel  = alertCount > 0
    ? `${alertCount} Alert${alertCount > 1 ? 's' : ''}`
    : systemScore > 70 ? 'All OK!' : 'Degraded';

  // ── Loading / error screens ──────────────────────────────────────────────────
  if (loading && devices.length === 0) {
    return (
      <div className="mistio-loading-screen">
        <div className="mistio-spinner" />
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', fontFamily: 'var(--font-body)' }}>
          Loading devices…
        </p>
      </div>
    );
  }

  if (error && devices.length === 0) {
    return (
      <div className="mistio-loading-screen">
        <p style={{ color: '#ef4444', fontWeight: 600 }}>Error loading devices</p>
        <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>{error}</p>
        <button
          onClick={refreshDevices}
          style={{
            marginTop: 12, padding: '8px 20px',
            background: 'var(--teal)', color: 'white',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontWeight: 600
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div className="mistio-dashboard">
      {/* School name + stats inline */}
      <div className="mistio-page-header">
        <h1 className="mistio-school-name">
          {demoAlertActive ? 'Example High School' : 'Irvington High School'}
        </h1>
        <div className="mistio-stats-row">
          <div className="mistio-stat">
            <span className="mistio-stat-number">{devices.length}</span>
            <span className="mistio-stat-label">Total</span>
          </div>
          <div className="mistio-stat-divider" />
          <div className="mistio-stat">
            <span className="mistio-stat-number">{onlineCount}</span>
            <span className="mistio-stat-label">Online</span>
          </div>
          <div className="mistio-stat-divider" />
          <div className="mistio-stat">
            <span className="mistio-stat-number">{alertCount}</span>
            <span className="mistio-stat-label">Alerts</span>
          </div>
        </div>
      </div>

      {/* 2-column grid */}
      <div className="mistio-main-grid">

        {/* ── Left: campus map ── */}
        <div className="mistio-map-panel">
          {mapEditAfterAdd && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-2 flex items-center justify-between">
              <span className="text-sm text-blue-700">Drag the new sensor to its location on the map, then click Done Editing.</span>
              <button onClick={() => setMapEditAfterAdd(false)} className="text-blue-400 hover:text-blue-600 text-lg leading-none">&times;</button>
            </div>
          )}
          <DeviceMap
            devices={[...filteredDevices, demoDevice]}
            selectedDevice={selectedDevice}
            onDeviceSelect={handleDeviceSelect}
            onRefresh={() => { refreshDevices(); setMapEditAfterAdd(false); }}
            isEditingExternal={mapEditAfterAdd || undefined}
            forceSkeletonMap={demoAlertActive}
          />
        </div>

        {/* ── Right panel ── */}
        <div className="mistio-right-panel">

          {/* Action buttons — aligned with map top */}
          <div className="mistio-action-row">
            <button className="mistio-btn-primary" onClick={() => setIsAddDeviceOpen(true)}>
              + Add Device
            </button>
            <button
              className={`mistio-btn-secondary mistio-btn-calibrate${isCalibratingAll ? ' calibrating' : ''}`}
              onClick={handleCalibrateAll}
              disabled={isCalibratingAll || devices.length === 0}
              title="Send recalibration command to all sensors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
              {isCalibratingAll ? 'Calibrating…' : 'Calibrate All'}
            </button>
          </div>

          {/* System health card */}
          <div className="mistio-health-card">
            <div className="mistio-health-header">
              <span className="mistio-health-title">{systemLabel}</span>
              <div className="mistio-time-chip">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="mistio-gauge-wrap">
              <SystemGauge score={systemScore} />
            </div>
            {/* AQI + air quality mini stats */}
            <div className="mistio-health-stats">
              <div className="mistio-health-stat">
                <span className="mhs-value" style={{ color: aqiInfo.color }}>{aqi || '—'}</span>
                <span className="mhs-label">AQI</span>
                <span className="mhs-sub" style={{ color: aqiInfo.color }}>{aqi ? aqiInfo.label : 'No data'}</span>
              </div>
              <div className="mhs-divider" />
              <div className="mistio-health-stat">
                <span className="mhs-value">{avgPM25 || '—'}</span>
                <span className="mhs-label">PM2.5</span>
                <span className="mhs-sub">μg/m³ avg</span>
              </div>
              <div className="mhs-divider" />
              <div className="mistio-health-stat">
                <span className="mhs-value">{avgHumidity ? `${avgHumidity}%` : '—'}</span>
                <span className="mhs-label">Humidity</span>
                <span className="mhs-sub">avg indoor</span>
              </div>
            </div>
          </div>

          {/* Device list — real devices + demo sensor appended */}
          <div className="mistio-device-list-container">
            <DeviceList
              devices={filteredDevices}
              demoDevice={demoDevice}
              selectedDevice={selectedDevice}
              onDeviceSelect={handleDeviceSelect}
              filters={filters}
              onFilterChange={handleFilterChange}
              statusCounts={statusCounts}
            />
          </div>
        </div>
      </div>

      {/* Detail slide-over — use DEMO_HISTORY when demo device is selected */}
      <DeviceDetailPanel
        device={selectedDevice}
        isOpen={isPanelOpen}
        onClose={handlePanelClose}
        onPingDevice={selectedDevice?.id === '__demo__' ? () => {} : handlePingDevice}
        onDeleteDevice={selectedDevice?.id === '__demo__' ? () => {} : deleteDevice}
        history={
          selectedDevice?.id === '__demo__'
            ? (demoAlertActive ? DEMO_HISTORY_ALERT : DEMO_HISTORY)
            : (selectedDevice ? (deviceHistory[selectedDevice.id] || []) : [])
        }
        isDemo={selectedDevice?.id === '__demo__'}
        demoAlertActive={demoAlertActive}
        onDemoAlert={handleDemoAlert}
      />

      <AddDeviceModal
        isOpen={isAddDeviceOpen}
        onClose={() => setIsAddDeviceOpen(false)}
        onDeviceAdded={() => { refreshDevices(); setMapEditAfterAdd(true); }}
      />
    </div>
  );
};

export default Devices;
