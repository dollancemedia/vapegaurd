import React, { useState, useEffect } from 'react';
import axios from 'axios';

const DeviceSummary = () => {
  const [devices, setDevices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDevices = async () => {
      setIsLoading(true);
      try {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
        const response = await axios.get(`${apiUrl}/devices`);
        setDevices(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching device summary:', err);
        setError('Failed to load device data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDevices();
  }, []);

  // Format the timestamp for display
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  // Format location object for display
  const formatLocation = (location) => {
    if (!location) return 'Unknown';
    if (typeof location === 'string') return location;
    
    const parts = [];
    if (location.building) parts.push(`Building ${location.building}`);
    if (location.floor) parts.push(`Floor ${location.floor}`);
    if (location.room) parts.push(`Room ${location.room}`);
    
    return parts.length > 0 ? parts.join(', ') : 'Unknown';
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Device Summary</h2>
        <span className="card-subtitle">Status of all monitoring devices</span>
      </div>
      <div className="card-body">
        {isLoading ? (
          <div className="d-flex justify-content-center">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : devices.length === 0 ? (
          <div className="alert alert-info" role="alert">
            No devices found in the system.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Last Seen</th>
                  <th>Location</th>
                  <th>Total Events</th>
                  <th>Recent Events (24h)</th>
                  <th>Verified Events</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.device_id}>
                    <td>{device.device_id}</td>
                    <td>{formatTimestamp(device.last_seen)}</td>
                    <td>{formatLocation(device.last_location)}</td>
                    <td>{device.total_events}</td>
                    <td>
                      <span className={device.recent_events > 0 ? 'badge bg-warning' : 'badge bg-secondary'}>
                        {device.recent_events}
                      </span>
                    </td>
                    <td>
                      <div className="progress" style={{ height: '20px' }}>
                        <div 
                          className="progress-bar bg-success" 
                          role="progressbar" 
                          style={{ 
                            width: `${device.total_events > 0 ? (device.verified_events / device.total_events) * 100 : 0}%` 
                          }}
                          aria-valuenow={device.verified_events} 
                          aria-valuemin="0" 
                          aria-valuemax={device.total_events}
                        >
                          {device.verified_events}/{device.total_events}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceSummary;