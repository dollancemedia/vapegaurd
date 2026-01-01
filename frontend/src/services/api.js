import axios from 'axios';

// Base API URL
const API_BASE = process.env.REACT_APP_API_URL || "https://vapegaurd-production.up.railway.app";
const API_BASE_URL = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
