import axios from 'axios';

// Base API URL
const API_BASE =
  process.env.REACT_APP_API_URL || 'https://vapegaurd-production.up.railway.app';
const API_BASE_URL = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth tokens
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
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
    let mappedDevices = [];
    try {
      // Fastest-win fix: hit the trailing-slash route directly to avoid 307 redirects
      const path = !school ? `/devices/?school=noaccess` :
        ((school === 'admin') ? '/devices/' : `/devices/?school=${encodeURIComponent(school)}`);

      // Actually fetch devices
      const response = await apiClient.get(path);
      const backendDevices = response.data;

      // Defensive: backend might return {devices:[...]} instead of [...]
      const devicesArray = Array.isArray(backendDevices)
        ? backendDevices
        : Array.isArray(backendDevices?.devices)
          ? backendDevices.devices
          : [];

      // Map backend data to frontend model
      mappedDevices = devicesArray.map((device) => {
        const latest = device.latest_event || {};
        const lastSeenTime = device.last_seen ? new Date(device.last_seen) : new Date(0);
        const isOnline = (new Date() - lastSeenTime) < 600000; // Online if seen in last 10 mins (sniff heartbeat every ~4 min, plus startup gap)

        const deviceName = device.name_override || device.device_id;

        const location = device.location_override || device.last_location || {
          building: 'Unknown',
          floor: 'Unknown',
          room: 'Unknown',
        };

        // Determine status: prioritize specific backend states if online
        let status = isOnline ? 'online' : 'offline';
        if (isOnline && latest.status) {
           // If backend reports specific state, use it
           if (['WARMUP', 'CALIBRATING', 'CONFIRMING', 'ALARM', 'IDLE', 'COOLDOWN'].includes(latest.status)) {
             status = latest.status;
           } else if (latest.status === 'suspected') {
             status = 'CONFIRMING';
           } else if (latest.status === 'monitoring') {
             status = 'online';
           }
        }

        const predictedClass =
          latest.predicted_class ||
          latest.top_class ||
          (latest.prediction ? latest.prediction.type : 'normal');

        const confidence = (
          latest.confidence ??
          (typeof latest.top_prob === 'number' ? latest.top_prob * 100 : undefined) ??
          (latest.prediction ? latest.prediction.confidence : 0)
        );

        return {
          id: device.device_id,
          name: deviceName,
          type: 'detector',
          status: status,
          isOnline,
          location,
          mapLocation: device.map_location || null,
          lastSeen: device.last_seen || new Date().toISOString(),
          uptime: 'N/A',
          sensorData: {
            humidity: latest.humidity ?? undefined,
            temperature: latest.temperature ?? undefined,
            pm25: latest.pm25 ?? undefined,
            ewma_pm25: latest.ewma_pm25,
            particleSize: latest.particle_size ?? latest.particleSize ?? undefined,
            volumeSpike: latest.volume_spike ?? latest.volumeSpike ?? false,
            gasResistance: latest.gas_resistance ?? undefined,
            baseline_humidity: latest.baseline_humidity,
            predictedClass,
            confidence,
            timestamp: latest.timestamp || device.last_seen,
            baseline_pm25: latest.baseline_pm25 ?? latest.ewma_pm25,
            baseline_pm10: latest.baseline_pm10,
            baseline_temperature: latest.baseline_temperature,
            baseline_gas_resistance: latest.baseline_gas_resistance,
          },
        };
      });
    } catch (error) {
      console.error('Error fetching devices:', error);
      // Re-throw so useDevices preserves existing state instead of wiping to empty
      throw error;
    }

    // Add Test Sensor for UI changes (Always added, even if backend fails)
    // mappedDevices.push({
    //   id: 'test-sensor-001',
    //   name: 'UI Test Sensor',
    //   type: 'detector',
    //   status: 'online',
    //   location: {
    //     building: 'Test Building',
    //     floor: '1',
    //     room: '101',
    //   },
    //   mapLocation: null,
    //   lastSeen: new Date().toISOString(),
    //   uptime: '99.9%',
    //   sensorData: {
    //     humidity: 45,
    //     temperature: 22,
    //     pm25: 12,
    //     particleSize: 0.5,
    //     volumeSpike: false,
    //     gasResistance: 10000,
    //     predictedClass: 'normal',
    //     confidence: 0.95,
    //     timestamp: new Date().toISOString(),
    //   },
    // });

    return mappedDevices;
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
      const devices = await this.getAllDevices();
      const device = devices.find((d) => d.id === deviceId);

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

      await new Promise((resolve) => setTimeout(resolve, 1000));

      return {
        success: true,
        deviceId,
        timestamp: new Date().toISOString(),
        responseTime: Math.floor(Math.random() * 100) + 50,
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
        timestamp: new Date().toISOString(),
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
      const response = await apiClient.get(
        `/devices/statistics?timeRange=${encodeURIComponent(timeRange)}`
      );
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
  },

  // Recalibrate device
  async recalibrateDevice(deviceId) {
    try {
      const response = await apiClient.post(`/devices/${deviceId}/recalibrate`);
      return response.data;
    } catch (error) {
      console.error('Error recalibrating device:', error);
      throw new Error(error.response?.data?.message || 'Failed to recalibrate device');
    }
  },

  // Delete device
  async deleteDevice(deviceId) {
    try {
      await apiClient.delete(`/devices/${deviceId}`);
      return true;
    } catch (error) {
      console.error('Error deleting device:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete device');
    }
  }
};

export default deviceService;
