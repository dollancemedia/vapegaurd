import React, { useState, useCallback, useEffect, useRef } from 'react';
import DeviceMap from '../components/DeviceMap';
import DeviceList from '../components/DeviceList';
import { MobileDeviceDetail } from '../components/DeviceDetailPanel';
import AddDeviceModal from '../components/AddDeviceModal';
import { useDevices } from '../hooks/useDevices';
import { useSharedWebSocket } from '../hooks/useSharedWebSocket';
import api from '../services/api';
import { useOrganization } from '@clerk/clerk-react';
import { Edit2 } from 'lucide-react';

const pickDefined = (obj = {}) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined && value !== null)
  );

const mergeDefined = (base = {}, patch = {}) => ({
  ...base,
  ...pickDefined(patch)
});

const MobileDashboard = () => {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    search: ''
  });
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isMapEditing, setIsMapEditing] = useState(false);
  const [deviceHistory, setDeviceHistory] = useState({});
  const staleClearTimersRef = useRef({});

  const { organization } = useOrganization();

  const school = (organization?.name === 'Admin' || organization?.slug === 'admin')
    ? 'admin'
    : organization?.id;

  const { devices, refreshDevices, pingDevice, updateDeviceStatus, deleteDevice } = useDevices(school);

  useEffect(() => {
    const pollInterval = setInterval(() => {
      refreshDevices();
    }, 15000);
    return () => clearInterval(pollInterval);
  }, [refreshDevices]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await api.get('/sensors/sensor-data');
        const historyData = response.data;
        const isValidTimestamp = (ts) => {
          if (!ts || typeof ts !== 'string' || !ts.includes('T')) return false;
          const d = new Date(ts);
          return !isNaN(d) && d.getFullYear() >= 2020 && d.getFullYear() <= 2100;
        };

        const historyMap = {};
        historyData.forEach(reading => {
          if (!isValidTimestamp(reading.timestamp)) return;
          const deviceId = reading.device_id;
          if (!historyMap[deviceId]) {
            historyMap[deviceId] = [];
          }
          const formattedReading = {
            humidity: reading.humidity,
            temperature: reading.temperature || 0,
            pm25: reading.pm25,
            particleSize: reading.particle_size || reading.particleSize || 0,
            volumeSpike: reading.volume_spike || reading.volumeSpike || false,
            predictedClass: reading.predicted_class || (reading.prediction ? reading.prediction.type : 'normal'),
            timestamp: reading.timestamp,
            confidence: reading.confidence || (reading.prediction ? reading.prediction.confidence : 0)
          };
          historyMap[deviceId].push(formattedReading);
        });

        Object.keys(historyMap).forEach(deviceId => {
            historyMap[deviceId].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            if (historyMap[deviceId].length > 0) {
              const latest = historyMap[deviceId][0];
              const updates = {
                sensorData: { ...latest },
                lastSeen: latest.timestamp,
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

  const handleWebSocketMessage = useCallback((message) => {
    if (!message) return;

    if (message.type === 'sensor_data' || message.type === 'newSensorData') {
      const payload = message.data || message;
      const reading = payload.sensor_data || payload;
      const deviceId = payload.device_id || (payload.sensor_data && payload.sensor_data.device_id);
      if (!deviceId) return;

      const wsState = reading?.prediction?.status;
      const derivedStatus =
        wsState === 'WARMUP' || wsState === 'CALIBRATING' || wsState === 'CONFIRMING' || wsState === 'COOLDOWN' || wsState === 'IDLE'
          ? wsState
          : 'online';

      updateDeviceStatus(deviceId, {
        sensorData: pickDefined({
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
        }),
        lastSeen: new Date().toISOString(),
        isOnline: true,
        status: derivedStatus
      });

      // Auto-clear detection status after 90s if no new message arrives
      const predictedClass = reading.predicted_class ?? (reading.prediction ? reading.prediction.type : 'normal');
      if (predictedClass && predictedClass !== 'normal' && predictedClass !== 'cooldown') {
        clearTimeout(staleClearTimersRef.current[deviceId]);
        staleClearTimersRef.current[deviceId] = setTimeout(() => {
          updateDeviceStatus(deviceId, {
            status: 'online',
            sensorData: { predictedClass: 'normal', confidence: 0 },
          });
          setSelectedDevice(prev => {
            if (prev?.id === deviceId) {
              return { ...prev, status: 'online', sensorData: { ...prev.sensorData, predictedClass: 'normal', confidence: 0 } };
            }
            return prev;
          });
        }, 90000);
      } else if (predictedClass === 'normal') {
        clearTimeout(staleClearTimersRef.current[deviceId]);
      }

      setDeviceHistory(prev => {
        const currentHistory = prev[deviceId] || [];
        const latestKnown = currentHistory[0] || {};
        const mergedReading = mergeDefined(latestKnown, pickDefined({
          humidity: reading.humidity,
          temperature: reading.temperature,
          pm25: reading.pm25,
          particleSize: reading.particle_size ?? reading.particleSize,
          volumeSpike: reading.volume_spike ?? reading.volumeSpike,
          predictedClass: reading.predicted_class ?? (reading.prediction ? reading.prediction.type : undefined),
          timestamp: reading.timestamp || new Date().toISOString(),
          confidence: reading.confidence ?? (reading.prediction && reading.prediction.confidence),
          gasResistance: reading.gas_resistance ?? reading.gasResistance
        }));
        mergedReading.timestamp = mergedReading.timestamp || new Date().toISOString();
        return {
          ...prev,
          [deviceId]: [mergedReading, ...currentHistory].slice(0, 50)
        };
      });

      setSelectedDevice(prev => {
        if (prev && prev.id === deviceId) {
          const patch = pickDefined({
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
          });
          return {
            ...prev,
            status: derivedStatus,
            lastSeen: new Date().toISOString(),
            isOnline: true,
            sensorData: mergeDefined(prev.sensorData || {}, patch),
            location: reading.location ? { ...prev.location, ...reading.location } : prev.location
          };
        }
        return prev;
      });
    }
  }, [updateDeviceStatus]);

  useSharedWebSocket(handleWebSocketMessage);

  const handleDeviceSelect = (device) => {
    setSelectedDevice(device);
    setIsPanelOpen(true);
  };

  const handlePanelClose = () => {
    setIsPanelOpen(false);
    setSelectedDevice(null);
  };

  const toggleMapEdit = () => {
    setIsMapEditing(!isMapEditing);
  };

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
  };

  const handlePingDevice = async (deviceId) => {
    try {
      await pingDevice(deviceId);
      refreshDevices();
    } catch (error) {
      console.error('Failed to ping device:', error);
    }
  };

  const filteredDevices = devices.filter(device => {
    const matchesStatus = filters.status === 'all' || device.status === filters.status;
    const matchesType = filters.type === 'all' || device.type === filters.type;
    const matchesSearch = device.name.toLowerCase().includes(filters.search.toLowerCase()) ||
                         device.location.building.toLowerCase().includes(filters.search.toLowerCase()) ||
                         device.location.room.toLowerCase().includes(filters.search.toLowerCase());
    return matchesStatus && matchesType && matchesSearch;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const isSystemOnline = devices.some(device => device.isOnline !== false);

  // ── When a device is selected, show the full-page detail view ──
  if (isPanelOpen && selectedDevice) {
    return (
      <MobileDeviceDetail
        device={selectedDevice}
        onClose={handlePanelClose}
        onPingDevice={handlePingDevice}
        onDeleteDevice={deleteDevice}
        history={deviceHistory[selectedDevice.id] || []}
      />
    );
  }

  // ── Default: dashboard list view ──
  return (
    <div className="min-h-screen bg-gray-50 pb-20 flex flex-col">

      <div className="bg-white pb-4 pt-2 px-4 rounded-b-3xl shadow-sm mb-4 flex-shrink-0">
        <div className="flex justify-between items-start mb-4">
        </div>

        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Device Management</h1>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${isSystemOnline ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isSystemOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
             {isSystemOnline ? 'System Online' : 'System Offline'}
          </span>
        </div>
        <p className="text-sm text-gray-500">Monitor and manage {devices.length} devices across the campus</p>
      </div>

      <div className="px-4 space-y-4 flex-1 flex flex-col">
        <div className="bg-white rounded-3xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-[50vh]">
          <div className="px-4 py-3 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
            <h3 className="text-lg font-bold text-gray-900">Campus Map</h3>
            <span className="text-xs font-medium px-3 py-1 bg-gray-100 rounded-full text-gray-600">
              {filteredDevices.length} devices shown
            </span>
          </div>

          <div className="relative flex-1 bg-white overflow-hidden">
            <DeviceMap
              devices={filteredDevices}
              selectedDevice={selectedDevice}
              onDeviceSelect={handleDeviceSelect}
              onRefresh={refreshDevices}
              isEditingExternal={isMapEditing}
            />

            <button
              onClick={toggleMapEdit}
              className={`absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all ${isMapEditing ? 'bg-[#00C2CB] text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
            >
              <Edit2 size={18} />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm min-h-[200px] flex-shrink-0">
           <DeviceList
            devices={filteredDevices}
            selectedDevice={selectedDevice}
            onDeviceSelect={handleDeviceSelect}
            filters={filters}
            onFilterChange={handleFilterChange}
            onAddDevice={() => setIsAddDeviceOpen(true)}
          />
        </div>
      </div>

      <div className="text-center text-xs text-gray-400 py-6">
        v2.1.0 · Mistio
      </div>

      <AddDeviceModal
        isOpen={isAddDeviceOpen}
        onClose={() => setIsAddDeviceOpen(false)}
        onDeviceAdded={() => {
          refreshDevices();
        }}
      />
    </div>
  );
};

export default MobileDashboard;
