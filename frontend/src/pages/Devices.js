import React, { useState, useCallback, useEffect } from 'react';
import DeviceMap from '../components/DeviceMap';
import DeviceList from '../components/DeviceList';
import DeviceDetailPanel from '../components/DeviceDetailPanel';
import AddDeviceModal from '../components/AddDeviceModal';
import { useDevices } from '../hooks/useDevices';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../services/api';
import { useAuth, useOrganization } from '@clerk/clerk-react';

import MobileDashboard from './MobileDashboard';
import { useMediaQuery } from 'react-responsive';

const Devices = () => {
  const isMobile = useMediaQuery({ maxWidth: 768 });
  
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    search: ''
  });
  
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [deviceHistory, setDeviceHistory] = useState({}); // Map of deviceId -> array of readings
  const [lastUpdated, setLastUpdated] = useState(null);
  
  const { organization } = useOrganization();
  // Use organization ID for specific sites to match registration data
  // If org name is Admin, pass 'admin' to see all devices
  const school = (organization?.name === 'admin' || organization?.slug === 'admin') 
    ? 'admin' 
    : organization?.id;
    
  const { devices, loading, error, refreshDevices, pingDevice, updateDeviceStatus, deleteDevice } = useDevices(school);

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
        const wsState = reading?.prediction?.status;
        const derivedStatus =
          wsState === 'WARMUP' || wsState === 'CALIBRATING' || wsState === 'CONFIRMING' || wsState === 'COOLDOWN' || wsState === 'IDLE'
            ? wsState
            : 'online';
        
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
          isOnline: true,
          status: derivedStatus
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

  useWebSocket('/ws/events', {
    onMessage: handleWebSocketMessage,
    queryParams: { token },
    enabled: !!token
  });

  // Determine overall system status
  // Show "Live" if ANY device is online, otherwise "Offline"
  const isSystemOnline = devices.some(device => device.isOnline !== false);

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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00C2CB] mx-auto mb-4"></div>
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
            className="px-4 py-2 bg-[#00C2CB] text-white rounded-lg hover:bg-[#009FA6] transition-colors"
            onClick={refreshDevices}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (isMobile) {
    return <MobileDashboard />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header - Matches Analytics Aesthetic */}
      <div className="sticky top-0 z-20 pt-4 pb-2 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Device Management</h1>
                <span className={`
                  inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                  ${isSystemOnline ? 'bg-[#00C2CB]/10 text-[#00C2CB]' : 'bg-red-100 text-red-800'}
                `}>
                  <span className={`w-2 h-2 rounded-full mr-1.5 ${isSystemOnline ? 'bg-[#00C2CB]' : 'bg-red-500'}`}></span>
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
                className="inline-flex items-center px-3 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-[#00C2CB] hover:bg-[#009FA6] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00C2CB] transition-all duration-200 shadow-sm"
                onClick={() => setIsAddDeviceOpen(true)}
              >
                <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Device
              </button>
              <button 
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00C2CB] transition-all duration-200 shadow-sm"
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-9rem)]">
          {/* Map Section - Takes up 2 columns */}
          <div className="lg:col-span-2 flex flex-col h-full min-h-[400px]">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Campus Map</h3>
                <span className="text-xs font-medium px-2 py-1 bg-white border border-gray-200 rounded text-gray-600">
                  {filteredDevices.length} devices shown
                </span>
              </div>
              <div className="relative bg-gray-100 h-[360px] sm:h-[420px] md:h-[520px] lg:flex-1 lg:h-auto min-h-[300px]">
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
          <div className="lg:col-span-1 h-full min-h-[400px]">
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
        onDeleteDevice={deleteDevice}
        history={selectedDevice ? (deviceHistory[selectedDevice.id] || []) : []}
      />

      <div className="text-center text-xs text-gray-400 pb-12 pt-4">
        v2.1.0 • Mistio
      </div>

      <AddDeviceModal
        isOpen={isAddDeviceOpen}
        onClose={() => setIsAddDeviceOpen(false)}
        onDeviceAdded={() => {
          refreshDevices();
          setLastUpdated(new Date());
        }}
      />
    </div>
  );
};

export default Devices;
