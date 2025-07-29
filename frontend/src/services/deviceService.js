import axios from 'axios';

// Base API URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

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

// Mock data for development (remove when backend is ready)
const mockDevices = [
  {
    id: 'detector-1',
    name: 'Detector 1',
    type: 'detector',
    status: 'online',
    location: {
      building: 'Building A',
      floor: 'Floor 1',
      room: 'Room 101'
    },
    lastSeen: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
    uptime: '99.5%',
    sensorData: {
      humidity: 45,
      pm25: 12,
      particleSize: 0.8,
      volumeSpike: false,
      confidence: 85,
      timestamp: new Date(Date.now() - 60000).toISOString()
    }
  },
  {
    id: 'detector-2',
    name: 'Detector 2',
    type: 'detector',
    status: 'alarm',
    location: {
      building: 'Building A',
      floor: 'Floor 2',
      room: 'Room 201'
    },
    lastSeen: new Date(Date.now() - 30000).toISOString(), // 30 seconds ago
    uptime: '98.2%',
    sensorData: {
      humidity: 52,
      pm25: 28,
      particleSize: 1.2,
      volumeSpike: true,
      confidence: 92,
      timestamp: new Date(Date.now() - 30000).toISOString()
    }
  },
  {
    id: 'detector-3',
    name: 'Detector 3',
    type: 'detector',
    status: 'online',
    location: {
      building: 'Building B',
      floor: 'Floor 1',
      room: 'Room 105'
    },
    lastSeen: new Date(Date.now() - 180000).toISOString(), // 3 minutes ago
    uptime: '99.8%',
    sensorData: {
      humidity: 43,
      pm25: 8,
      particleSize: 0.6,
      volumeSpike: false,
      confidence: 78,
      timestamp: new Date(Date.now() - 90000).toISOString()
    }
  },
  {
    id: 'detector-4',
    name: 'Detector 4',
    type: 'detector',
    status: 'offline',
    location: {
      building: 'Building B',
      floor: 'Floor 2',
      room: 'Room 205'
    },
    lastSeen: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
    uptime: '95.1%',
    sensorData: {
      humidity: 41,
      pm25: 10,
      particleSize: 0.7,
      volumeSpike: false,
      confidence: 72,
      timestamp: new Date(Date.now() - 1800000).toISOString()
    }
  },
  {
    id: 'detector-5',
    name: 'Detector 5',
    type: 'detector',
    status: 'online',
    location: {
      building: 'Building C',
      floor: 'Floor 1',
      room: 'Room 110'
    },
    lastSeen: new Date(Date.now() - 90000).toISOString(), // 1.5 minutes ago
    uptime: '99.9%',
    sensorData: {
      humidity: 47,
      pm25: 14,
      particleSize: 0.9,
      volumeSpike: false,
      confidence: 81,
      timestamp: new Date(Date.now() - 90000).toISOString()
    }
  },
  {
    id: 'admin-console',
    name: 'Admin Console',
    type: 'admin',
    status: 'online',
    location: {
      building: 'Admin Building',
      floor: 'Floor 1',
      room: 'Control Room'
    },
    lastSeen: new Date(Date.now() - 15000).toISOString(), // 15 seconds ago
    uptime: '99.99%',
    sensorData: null // Admin console doesn't have sensor data
  }
];

// Device service functions
export const deviceService = {
  // Get all devices
  async getAllDevices() {
    try {
      // For development, return mock data
      // In production, uncomment the line below:
      // const response = await apiClient.get('/devices');
      // return response.data;
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return mockDevices;
    } catch (error) {
      console.error('Error fetching devices:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch devices');
    }
  },

  // Get device by ID
  async getDevice(deviceId) {
    try {
      // For development, return mock data
      // In production, uncomment the line below:
      // const response = await apiClient.get(`/devices/${deviceId}`);
      // return response.data;
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 300));
      const device = mockDevices.find(d => d.id === deviceId);
      if (!device) {
        throw new Error('Device not found');
      }
      return device;
    } catch (error) {
      console.error('Error fetching device:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch device');
    }
  },

  // Ping device
  async pingDevice(deviceId) {
    try {
      // For development, simulate ping
      // In production, uncomment the line below:
      // const response = await apiClient.post(`/devices/${deviceId}/ping`);
      // return response.data;
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate ping response
      const device = mockDevices.find(d => d.id === deviceId);
      if (!device) {
        throw new Error('Device not found');
      }
      
      // Update mock device status
      device.status = 'online';
      device.lastSeen = new Date().toISOString();
      
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