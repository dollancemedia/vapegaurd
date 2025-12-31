import axios from 'axios';

// Base API URL
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth tokens
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Device service functions
export const deviceService = {
  // Get all devices
  async getAllDevices(school) {
    try {
      // Fetch from real API
      const path = school ? `/devices?school=${encodeURIComponent(school)}` : '/devices';
      const response = await apiClient.get(path);
      const backendDevices = response.data;
      
      // Map backend data to frontend model
      return backendDevices.map(device => {
        const latest = device.latest_event || {};
        const lastSeenTime = device.last_seen ? new Date(device.last_seen) : new Date(0);
        const isOnline = (new Date() - lastSeenTime) < 120000; // Online if seen in last 2 mins

        // Prioritize persistent name if available
        const deviceName = device.name_override || device.device_id;
        
        // Prioritize persistent location if available
        const location = device.location_override || device.last_location || {
          building: 'Unknown',
          floor: 'Unknown',
          room: 'Unknown'
        };

        return {
          id: device.device_id,
          name: deviceName,
          type: 'detector',
          status: isOnline ? 'online' : 'offline',
          location: location,
          mapLocation: device.map_location || null,
          lastSeen: device.last_seen || new Date().toISOString(),
          uptime: 'N/A',
          sensorData: {
            humidity: latest.humidity || 0,
            temperature: latest.temperature || 0,
            pm25: latest.pm25 || 0,
            particleSize: latest.particle_size || latest.particleSize || 0,
            volumeSpike: latest.volume_spike || latest.volumeSpike || false,
            gasResistance: latest.gas_resistance || 0,
            predictedClass: latest.predicted_class || (latest.prediction ? latest.prediction.type : 'normal'),
            confidence: latest.confidence || (latest.prediction ? latest.prediction.confidence : 0),
            timestamp: latest.timestamp || device.last_seen
          }
        };
      });
    } catch (error) {
      console.error('Error fetching devices:', error);
      // Fallback to empty array if API fails, do NOT show mock data
      return []; 
    }
  },

  // Update device info (name, location)
  async updateDeviceInfo(deviceId, info) {
    try {
      await apiClient.put(`/devices/${deviceId}/info`, info);
      return true;
    } catch (error) {
      console.error('Error updating device info:', error);
      throw new Error(error.response?.data?.message || 'Failed to update device info');
    }
  },

  // Get device by ID
  async getDevice(deviceId) {
    try {
      // Fetch all devices and find the one we need
      // (Since backend doesn't have a specific get-by-id endpoint yet)
      const devices = await this.getAllDevices();
      const device = devices.find(d => d.id === deviceId);
      
      if (!device) {
        throw new Error('Device not found');
      }
      return device;
    } catch (error) {
      console.error('Error fetching device:', error);
      throw error;
    }
  },

  async updateDeviceLocation(deviceId, x, y) {
    try {
      await apiClient.put(`/devices/${deviceId}/location`, { x, y });
      return true;
    } catch (error) {
      console.error('Error updating device location:', error);
      return false;
    }
  },

  // Ping device
  async pingDevice(deviceId) {
    try {
      // In production, uncomment the line below:
      // const response = await apiClient.post(`/devices/${deviceId}/ping`);
      // return response.data;
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Return simulated success
      return {
        success: true,
        deviceId,
        timestamp: new Date().toISOString(),
        responseTime: Math.floor(Math.random() * 100) + 50 // 50-150ms
      };
    } catch (error) {
      console.error('Error pinging device:', error);
      throw new Error(error.response?.data?.message || 'Failed to ping device');
    }
  },

  // Update device settings (admin only)
  async updateDeviceSettings(deviceId, settings) {
    try {
      const response = await apiClient.put(`/devices/${deviceId}/settings`, settings);
      return response.data;
    } catch (error) {
      console.error('Error updating device settings:', error);
      throw new Error(error.response?.data?.message || 'Failed to update device settings');
    }
  },

  // Get device logs
  async getDeviceLogs(deviceId, options = {}) {
    try {
      const { startDate, endDate, limit = 100 } = options;
      const params = new URLSearchParams();
      
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (limit) params.append('limit', limit.toString());
      
      const response = await apiClient.get(`/devices/${deviceId}/logs?${params}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching device logs:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch device logs');
    }
  },

  // Acknowledge device alarm
  async acknowledgeAlarm(deviceId, userId) {
    try {
      const response = await apiClient.post(`/devices/${deviceId}/acknowledge`, {
        userId,
        timestamp: new Date().toISOString()
      });
      return response.data;
    } catch (error) {
      console.error('Error acknowledging alarm:', error);
      throw new Error(error.response?.data?.message || 'Failed to acknowledge alarm');
    }
  },

  // Get device statistics
  async getDeviceStatistics(timeRange = '24h') {
    try {
      const response = await apiClient.get(`/devices/statistics?timeRange=${timeRange}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching device statistics:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch device statistics');
    }
  },

  // Test device connection
  async testDeviceConnection(deviceId) {
    try {
      const response = await apiClient.post(`/devices/${deviceId}/test`);
      return response.data;
    } catch (error) {
      console.error('Error testing device connection:', error);
      throw new Error(error.response?.data?.message || 'Failed to test device connection');
    }
  }
};

export default deviceService;
