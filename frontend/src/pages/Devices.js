import React, { useState, useCallback, useEffect } from 'react';
import DeviceMap from '../components/DeviceMap';
import DeviceList from '../components/DeviceList';
import DeviceDetailPanel from '../components/DeviceDetailPanel';
import { useDevices } from '../hooks/useDevices';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../services/api';
import { useAuth } from '@clerk/clerk-react';

const Devices = () => {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    search: ''
  });
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [deviceHistory, setDeviceHistory] = useState({}); // Map of deviceId -> array of readings
  const [lastUpdated, setLastUpdated] = useState(null);
  const [notifiedDevices, setNotifiedDevices] = useState({}); // Map of deviceId -> lastNotificationTime
  
  const { devices, loading, error, refreshDevices, pingDevice, updateDeviceStatus } = useDevices();

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
    // Initial update time
    setLastUpdated(new Date());

    const pollInterval = setInterval(() => {
      refreshDevices();
      setLastUpdated(new Date());
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [refreshDevices]);

  // Request notification permission on mount
  useEffect(() => {
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  // Check for vape alerts and trigger notifications
  useEffect(() => {
    devices.forEach(device => {
      // Check if device is in vape state
      if (device.sensorData && device.sensorData.predictedClass === 'vape') {
        const now = Date.now();
        const lastNotified = notifiedDevices[device.id] || 0;
        
        // Cooldown check (60 seconds)
        if (now - lastNotified > 60000) {
          // Trigger notification
          if (Notification.permission === 'granted') {
            const eventTime = new Date(device.sensorData.timestamp).toLocaleTimeString();
            const loc = device.location;
            const locString = `Building: ${loc.building || 'Unknown'}, Floor: ${loc.floor || 'Unknown'}, Room: ${loc.room || 'Unknown'}`;
            
            new Notification(`Vape Detected: ${device.name}`, {
              body: `Time: ${eventTime}\nLocation: ${locString}`,
              icon: '/logo.png' // Use the correct logo path
            });
            
            // Update last notified time
            setNotifiedDevices(prev => ({
              ...prev,
              [device.id]: now
            }));
          }
        }
      }
    });
  }, [devices, notifiedDevices]);

  // Fetch recent history on load
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await api.get('/sensors/sensor-data');
        const historyData = response.data; // Array of sensor readings
        
        // Group by device_id
        const historyMap = {};
        historyData.forEach(reading => {
          const deviceId = reading.device_id;
          if (!historyMap[deviceId]) {
            historyMap[deviceId] = [];
          }
          // Normalize reading format
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

    // Check for sensor data updates
    // Message format: { type: 'sensor_data', data: { device_id: '...', sensor_data: { ... } } }
    if (message.type === 'sensor_data' || message.type === 'newSensorData') {
      const payload = message.data || message;
      // Handle both nested sensor_data structure and flat structure
      const deviceId = payload.device_id || (payload.sensor_data && payload.sensor_data.device_id);
      
      if (deviceId) {
        // Extract sensor reading
        const reading = payload.sensor_data || payload;
        
        // Map to format expected by DeviceDetailPanel
        const updates = {
          sensorData: {
            humidity: reading.humidity,
            temperature: reading.temperature || 0,
            pm25: reading.pm25,
            particleSize: reading.particle_size || reading.particleSize || 0,
            volumeSpike: reading.volume_spike || reading.volumeSpike || false,
            predictedClass: reading.predicted_class || (reading.prediction ? reading.prediction.type : 'normal'),
            timestamp: reading.timestamp || new Date().toISOString(),
            confidence: reading.confidence || (reading.prediction && reading.prediction.confidence) || 0
          },
          lastSeen: new Date().toISOString(),
          status: 'online'
        };
        
        // Update device in the list
        updateDeviceStatus(deviceId, updates);
        
        // Update history for this device
        setDeviceHistory(prev => {
          const currentHistory = prev[deviceId] || [];
          // Prepend new reading, keep last 50
          const newHistory = [{
            ...updates.sensorData,
            timestamp: updates.sensorData.timestamp // Ensure timestamp is included
          }, ...currentHistory].slice(0, 50);
          
          return {
            ...prev,
            [deviceId]: newHistory
          };
        });

        // Update selected device if it matches
        setSelectedDevice(prev => {
          if (prev && prev.id === deviceId) {
            return {
              ...prev,
              ...updates,
              // Merge location if present in payload, otherwise keep existing
              location: reading.location ? { ...prev.location, ...reading.location } : prev.location
            };
          }
          return prev;
        });
      }
    }
  }, [updateDeviceStatus]);

  const { isConnected } = useWebSocket('/ws/events', {
    onMessage: handleWebSocketMessage,
    queryParams: { token }
  });

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

  // Sync selectedDevice with devices list when it updates (e.g. after edit)
  useEffect(() => {
    if (selectedDevice && devices.length > 0) {
      const updated = devices.find(d => d.id === selectedDevice.id);
      // Check if name or location changed
      if (updated && (
          updated.name !== selectedDevice.name || 
          JSON.stringify(updated.location) !== JSON.stringify(selectedDevice.location)
        )) {
        setSelectedDevice(prev => ({ ...prev, ...updated }));
      }
    }
  }, [devices, selectedDevice]);

  // Handle filter changes
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  // Manual refresh handler
  const handleManualRefresh = () => {
    refreshDevices();
    setLastUpdated(new Date());
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
    const matchesStatus = filters.status === 'all' || device.status === filters.status;
    const matchesType = filters.type === 'all' || device.type === filters.type;
    const matchesSearch = device.name.toLowerCase().includes(filters.search.toLowerCase()) ||
                         device.location.building.toLowerCase().includes(filters.search.toLowerCase()) ||
                         device.location.room.toLowerCase().includes(filters.search.toLowerCase());
    
    return matchesStatus && matchesType && matchesSearch;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  // Don't show full page loading spinner on background refreshes if we already have data
  // But initial load should show it
  if (loading && devices.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">Loading devices...</p>
        </div>
      </div>
    );
  }

  if (error && devices.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg border border-red-100">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error Loading Devices</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            onClick={refreshDevices}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Determine overall system status
  // Show "Live" if ANY device is online, otherwise "Offline"
  const isSystemOnline = devices.some(device => device.status === 'online');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header - Matches Analytics Aesthetic */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Device Management</h1>
                <span className={`
                  inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                  ${isSystemOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                `}>
                  <span className={`w-2 h-2 rounded-full mr-1.5 ${isSystemOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  {isSystemOnline ? 'System Online' : 'System Offline'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Monitor and manage {devices.length} devices across the campus
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {lastUpdated && (
                <span className="text-sm text-gray-500 hidden sm:block">
                  Last Updated: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
              <button 
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
                onClick={handleManualRefresh}
              >
                <svg className="-ml-1 mr-2 h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-9rem)]">
          {/* Map Section - Takes up 2 columns */}
          <div className="lg:col-span-2 flex flex-col h-full min-h-[500px]">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Campus Map</h3>
                <span className="text-xs font-medium px-2 py-1 bg-white border border-gray-200 rounded text-gray-600">
                  {filteredDevices.length} devices shown
                </span>
              </div>
              <div className="flex-1 relative bg-gray-100">
                <DeviceMap 
                  devices={filteredDevices}
                  selectedDevice={selectedDevice}
                  onDeviceSelect={handleDeviceSelect}
                  onRefresh={refreshDevices}
                />
              </div>
            </div>
          </div>

          {/* Device List Section - Takes up 1 column */}
          <div className="lg:col-span-1 h-full min-h-[500px]">
            <DeviceList 
              devices={filteredDevices}
              selectedDevice={selectedDevice}
              onDeviceSelect={handleDeviceSelect}
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          </div>
        </div>
      </div>

      {/* Device Detail Panel - Slide over */}
      <DeviceDetailPanel
        device={selectedDevice}
        isOpen={isPanelOpen}
        onClose={handlePanelClose}
        onPingDevice={handlePingDevice}
        history={selectedDevice ? (deviceHistory[selectedDevice.id] || []) : []}
      />
    </div>
  );
};

export default Devices;
