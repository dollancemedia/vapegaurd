import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

const RawDataCard = () => {
  const [messages, setMessages] = useState([]);
  const [paused, setPaused] = useState(false);

  // Force reconnect on component mount
  useEffect(() => {
    console.log("RawDataCard mounted - connecting to WebSocket");
  }, []);

  const { isConnected, reconnect, getReadyStateString } = useWebSocket('/ws/events', {
    reconnectInterval: 3000,
    maxReconnectAttempts: 5,
    heartbeatInterval: 30000,
    onMessage: (data) => {
      if (paused) return;
      console.log("WebSocket message received:", data);
      const payload = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      // Use server-provided timestamp only; do not generate local time
      const obj = typeof data === 'object' && data ? data : null;
      const timestamp = obj 
        ? (obj.timestamp 
           || (obj.data && obj.data.timestamp) 
           || (obj.sensor_data && obj.sensor_data.timestamp)
           || (obj.data && obj.data.sensor_data && obj.data.sensor_data.timestamp)
           || null)
        : null;
      setMessages((prev) => {
        const next = [{ timestamp, payload }, ...prev];
        return next.length > 200 ? next.slice(0, 200) : next;
      });
    }
  });

  const clearLog = () => setMessages([]);
  const togglePause = () => setPaused((p) => !p);

  const stateString = typeof getReadyStateString === 'function' ? getReadyStateString() : '';
  // Treat presence of live messages or OPEN socket as Online, even during reconnection churn
  const isOnline = isConnected || stateString === 'OPEN' || messages.length > 0;

  return (
    <div className="card">
      <div className="card-header">
        <h2>Raw Data</h2>
        <span className="card-subtitle">Live unprocessed incoming messages</span>
      </div>
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className={`connection-status ${isOnline ? 'connected' : 'disconnected'}`}>
            {isOnline ? '🟢 Online' : '🔴 Offline'} {stateString ? `(${stateString})` : ''}
          </div>
          <div className="btn-group">
            <button className="btn btn-sm btn-outline-primary" onClick={togglePause}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={clearLog}>
              Clear
            </button>
            <button className="btn btn-sm btn-outline-primary" onClick={reconnect}>
              Reconnect
            </button>
          </div>
        </div>

        {/* Suppress rapid error/no-message toggling to avoid flicker */}
        {/* Always show a stable waiting state until real messages arrive */}

        <div className="raw-log-container">
          <div className="raw-log" role="log" aria-live="polite">
            {messages.length === 0 ? (
              <div className="loading-state">
                <p>Waiting for live data… Send sensor data to the API.</p>
              </div>
            ) : (
              messages.map((m, idx) => (
                <pre key={idx} className="raw-log-line">
                  [{m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : 'N/A'}] {m.payload}
                </pre>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RawDataCard;