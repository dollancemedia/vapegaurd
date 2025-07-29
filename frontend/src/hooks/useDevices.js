import { useState, useEffect, useCallback } from 'react';
import { deviceService } from '../services/deviceService';

export const useDevices = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch all devices
  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await deviceService.getAllDevices();
      setDevices(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch devices');
      console.error('Error fetching devices:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh devices (alias for fetchDevices)
  const refreshDevices = useCallback(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Get device by ID
  const getDevice = useCallback(async (deviceId) => {
    try {
      const device = await deviceService.getDevice(deviceId);
      return device;
    } catch (err) {
      console.error('Error fetching device:', err);
      throw err;
    }
  }, []);

  // Ping device
  const pingDevice = useCallback(async (deviceId) => {
    try {
      const result = await deviceService.pingDevice(deviceId);
      
      // Update the device in the local state
      setDevices(prevDevices => 
        prevDevices.map(device => 
          device.id === deviceId 
            ? { ...device, lastSeen: new Date().toISOString(), status: 'online' }
            : device
        )
      );
      
      return result;
    } catch (err) {
      console.error('Error pinging device:', err);
      throw err;
    }
  }, []);

  // Update device status (for real-time updates)
  const updateDeviceStatus = useCallback((deviceId, updates) => {
    setDevices(prevDevices => 
      prevDevices.map(device => 
        device.id === deviceId 
          ? { ...device, ...updates, lastSeen: new Date().toISOString() }
          : device
      )
    );
  }, []);

  // Add new device (for real-time updates)
  const addDevice = useCallback((newDevice) => {
    setDevices(prevDevices => {
      const exists = prevDevices.some(device => device.id === newDevice.id);
      if (exists) {
        return prevDevices.map(device => 
          device.id === newDevice.id ? newDevice : device
        );
      }
      return [...prevDevices, newDevice];
    });
  }, []);

  // Remove device
  const removeDevice = useCallback((deviceId) => {
    setDevices(prevDevices => 
      prevDevices.filter(device => device.id !== deviceId)
    );
  }, []);

  // Get devices by status
  const getDevicesByStatus = useCallback((status) => {
    return devices.filter(device => device.status === status);
  }, [devices]);

  // Get devices by type
  const getDevicesByType = useCallback((type) => {
    return devices.filter(device => device.type === type);
  }, [devices]);

  // Get device statistics
  const getDeviceStats = useCallback(() => {
    const stats = {
      total: devices.length,
      online: devices.filter(d => d.status === 'online').length,
      offline: devices.filter(d => d.status === 'offline').length,
      alarm: devices.filter(d => d.status === 'alarm').length,
      detectors: devices.filter(d => d.type === 'detector').length,
      adminConsoles: devices.filter(d => d.type === 'admin').length
    };
    return stats;
  }, [devices]);

  // Initial fetch on mount
  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  return {
    devices,
    loading,
    error,
    fetchDevices,
    refreshDevices,
    getDevice,
    pingDevice,
    updateDeviceStatus,
    addDevice,
    removeDevice,
    getDevicesByStatus,
    getDevicesByType,
    getDeviceStats
  };
};