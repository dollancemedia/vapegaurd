import React, { useState, useCallback, useEffect } from 'react';
import DeviceMap from '../components/DeviceMap';
import DeviceList from '../components/DeviceList';
import DeviceDetailPanel from '../components/DeviceDetailPanel';
import AddDeviceModal from '../components/AddDeviceModal';
import { useDevices } from '../hooks/useDevices';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../services/api';
import { useAuth, useOrganization } from '@clerk/clerk-react';
import { Edit2 } from 'lucide-react';

const MobileDashboard = () => {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    search: ''
  });
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isMapEditing, setIsMapEditing] = useState(false); // State for map editing mode
  const [deviceHistory, setDeviceHistory] = useState({});
  
  const { organization } = useOrganization();
  const name = organization?.name || 'School';
  const school = name.toLowerCase();
  // Get Clerk token
  const { getToken } = useAuth();
  const [token, setToken] = useState(null);

  const { devices, refreshDevices, pingDevice, updateDeviceStatus, deleteDevice } = useDevices(school, token);

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
    }, 5000);
    return () => clearInterval(pollInterval);
  }, [refreshDevices]);

  // Fetch recent history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await api.get('/sensors/sensor-data');
        const historyData = response.data;
        const historyMap = {};
        historyData.forEach(reading => {
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

  // WebSocket handler
  const handleWebSocketMessage = useCallback((message) => {
    // console.log('WebSocket update:', message);
    if (message.type === 'device_update') {
      const { device_id, ...updates } = message.data;
      if (device_id) {
        updateDeviceStatus(device_id, updates);
      }
    }
  }, [updateDeviceStatus]);

  useWebSocket('/ws/events', {
    onMessage: handleWebSocketMessage,
    queryParams: { token }
  });

  const handleDeviceSelect = (device) => {
    setSelectedDevice(device);
    setIsPanelOpen(true);
  };

  const handlePanelClose = () => {
    setIsPanelOpen(false);
    setSelectedDevice(null);
  };

  // Handle map edit toggle from parent (MobileDashboard)
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

  const isSystemOnline = devices.some(device => device.status === 'online');

  return (
    <div className="min-h-screen bg-gray-50 pb-20 flex flex-col"> {/* pb-20 for bottom nav space */}
      
      {/* Mobile Header & Title Section */}
      <div className="bg-white pb-4 pt-2 px-4 rounded-b-3xl shadow-sm mb-4 flex-shrink-0">
        <div className="flex justify-between items-start mb-4">
           {/* Logo and Bell handled in App.js header on desktop, but for mobile view we might want to emphasize title */}
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
        {/* Campus Map Card - Made taller/fuller */}
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
              isEditingExternal={isMapEditing} // Pass editing state
            />

            {/* Edit Map FAB (Pencil) - Replaces Zoom/Plus */}
            <button 
              onClick={toggleMapEdit}
              className={`absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all ${isMapEditing ? 'bg-[#00C2CB] text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
            >
              <Edit2 size={18} />
            </button>
          </div>
        </div>

        {/* Device List / Empty State */}
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

      <DeviceDetailPanel
        device={selectedDevice}
        isOpen={isPanelOpen}
        onClose={handlePanelClose}
        onPingDevice={handlePingDevice}
        onDeleteDevice={deleteDevice}
        history={selectedDevice ? (deviceHistory[selectedDevice.id] || []) : []}
      />

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
