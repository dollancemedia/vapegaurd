import axios from 'axios';

const API_BASE =
  process.env.REACT_APP_API_URL || 'https://vapegaurd-production.up.railway.app';
const API_BASE_URL = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const trainingService = {
  async getProgress() {
    const res = await apiClient.get('/training/progress');
    return res.data;
  },

  async getBaselineStatus(deviceId) {
    const res = await apiClient.get(`/training/baseline-status/${deviceId}`);
    return res.data;
  },

  async getClasses() {
    const res = await apiClient.get('/training/classes');
    return res.data.classes;
  },

  async getTargets() {
    const res = await apiClient.get('/training/targets');
    return res.data.targets;
  },

  async createLabel(labelData) {
    const res = await apiClient.post('/training/labels', labelData);
    return res.data;
  },

  async listLabels({ sessionId, eventType, limit = 50 } = {}) {
    const params = new URLSearchParams();
    if (sessionId) params.append('session_id', sessionId);
    if (eventType) params.append('event_type', eventType);
    if (limit) params.append('limit', limit.toString());
    const res = await apiClient.get(`/training/labels?${params}`);
    return res.data;
  },

  async updateLabel(labelId, updates) {
    const res = await apiClient.put(`/training/labels/${labelId}`, updates);
    return res.data;
  },

  async deleteLabel(labelId) {
    const res = await apiClient.delete(`/training/labels/${labelId}`);
    return res.data;
  },
};

export default trainingService;
