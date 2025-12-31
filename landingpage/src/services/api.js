import axios from 'axios';

// Base API URL
// If running in development with proxy, this can be just '/api'
// If REACT_APP_API_URL is set, use that.
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
