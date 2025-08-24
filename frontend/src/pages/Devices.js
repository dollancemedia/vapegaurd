import React, { useState } from 'react';
import DeviceMap from '../components/DeviceMap';
import DeviceList from '../components/DeviceList';
import DeviceDetailPanel from '../components/DeviceDetailPanel';
import { useDevices } from '../hooks/useDevices';
import { useWebSocket } from '../hooks/useWebSocket';

const Devices = () => {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    search: ''
  });
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  
  const { devices, loading, error, refreshDevices, pingDevice } = useDevices();
  const { isConnected } = useWebSocket('/ws/devices/status');

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
  });

  if (loading) {
    return (
      <div className="devices-page">
        <div className="container">
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading devices...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="devices-page">
        <div className="container">
          <div className="error-state">
            <h2>Error Loading Devices</h2>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={refreshDevices}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="devices-page">
      <div className="container-fluid">
        <div className="devices-header">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h1>Device Management</h1>
              <p className="devices-subtitle">
                Monitor and manage {devices.length} devices across the campus
                <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
                  {isConnected ? '🟢 Live' : '🔴 Offline'}
                </span>
              </p>
            </div>
            <button className="btn btn-outline-primary" onClick={refreshDevices}>
              🔄 Refresh
            </button>
          </div>
        </div>

        <div className="devices-content">
          <div className="row">
            {/* Map Section */}
            <div className="col-lg-8">
              <div className="card map-card">
                <div className="card-header">
                  <h3>Campus Map</h3>
                  <span className="device-count">{filteredDevices.length} devices shown</span>
                </div>
                <div className="card-body p-0">
                  <DeviceMap 
                    devices={filteredDevices}
                    selectedDevice={selectedDevice}
                    onDeviceSelect={handleDeviceSelect}
                  />
                </div>
              </div>
            </div>

            {/* Device List Section */}
            <div className="col-lg-4">
              <div className="card device-list-card">
                <div className="card-header">
                  <h3>Device List</h3>
                </div>
                <div className="card-body p-0">
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
          </div>
        </div>

        {/* Device Detail Panel */}
        <DeviceDetailPanel 
          device={selectedDevice}
          isOpen={isPanelOpen}
          onClose={handlePanelClose}
          onPingDevice={handlePingDevice}
        />
      </div>
    </div>
  );
};

export default Devices;