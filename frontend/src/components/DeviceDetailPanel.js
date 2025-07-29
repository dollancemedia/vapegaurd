import React, { useState } from 'react';

const DeviceDetailPanel = ({ device, isOpen, onClose, onPingDevice }) => {
  const [isPinging, setIsPinging] = useState(false);
  const [showFullLog, setShowFullLog] = useState(false);

  if (!device) return null;

  // Handle ping device
  const handlePing = async () => {
    setIsPinging(true);
    try {
      await onPingDevice(device.id);
    } catch (error) {
      console.error('Ping failed:', error);
    } finally {
      setIsPinging(false);
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return '#10B981';
      case 'offline': return '#6B7280';
      case 'alarm': return '#EF4444';
      default: return '#6B7280';
    }
  };

  // Get device type display name
  const getDeviceTypeName = (type) => {
    return type === 'admin' ? 'Admin Console' : 'Vape Detector';
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  // Mock sensor readings history (in real app, this would come from API)
  const sensorHistory = [
    { timestamp: new Date(Date.now() - 300000), humidity: 45, pm25: 12, particleSize: 0.8, volumeSpike: false },
    { timestamp: new Date(Date.now() - 600000), humidity: 47, pm25: 15, particleSize: 0.9, volumeSpike: true },
    { timestamp: new Date(Date.now() - 900000), humidity: 44, pm25: 11, particleSize: 0.7, volumeSpike: false },
    { timestamp: new Date(Date.now() - 1200000), humidity: 46, pm25: 13, particleSize: 0.8, volumeSpike: false },
    { timestamp: new Date(Date.now() - 1500000), humidity: 48, pm25: 16, particleSize: 1.0, volumeSpike: true },
  ];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="panel-backdrop"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div className={`device-detail-panel ${isOpen ? 'open' : ''}`}>
        {/* Panel Header */}
        <div className="panel-header">
          <div className="panel-title">
            <span className="device-icon">
              {device.type === 'admin' ? '🖥️' : '📡'}
            </span>
            <div>
              <h2>{device.name}</h2>
              <p className="device-subtitle">{getDeviceTypeName(device.type)}</p>
            </div>
          </div>
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Panel Content */}
        <div className="panel-content">
          {/* Status Section */}
          <div className="info-section">
            <h3>Status</h3>
            <div className="status-info">
              <div className="status-item">
                <span 
                  className="status-dot"
                  style={{ backgroundColor: getStatusColor(device.status) }}
                />
                <span className="status-text">{device.status.toUpperCase()}</span>
                {device.status === 'alarm' && (
                  <span className="alarm-badge">🚨 ACTIVE ALERT</span>
                )}
              </div>
              <div className="status-details">
                <div className="detail-item">
                  <span className="label">Last Seen:</span>
                  <span className="value">{formatTimestamp(device.lastSeen)}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Uptime:</span>
                  <span className="value">{device.uptime || '99.2%'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sensor Readings Section */}
          {device.sensorData && (
            <div className="info-section">
              <h3>Latest Sensor Readings</h3>
              <div className="sensor-grid">
                <div className="sensor-item">
                  <div className="sensor-icon">💧</div>
                  <div className="sensor-info">
                    <span className="sensor-label">Humidity</span>
                    <span className="sensor-value">{device.sensorData.humidity}%</span>
                  </div>
                </div>
                <div className="sensor-item">
                  <div className="sensor-icon">🌫️</div>
                  <div className="sensor-info">
                    <span className="sensor-label">PM2.5</span>
                    <span className="sensor-value">{device.sensorData.pm25} μg/m³</span>
                  </div>
                </div>
                <div className="sensor-item">
                  <div className="sensor-icon">⚫</div>
                  <div className="sensor-info">
                    <span className="sensor-label">Particle Size</span>
                    <span className="sensor-value">{device.sensorData.particleSize} μm</span>
                  </div>
                </div>
                <div className="sensor-item">
                  <div className="sensor-icon">🔊</div>
                  <div className="sensor-info">
                    <span className="sensor-label">Volume Spike</span>
                    <span className="sensor-value">
                      {device.sensorData.volumeSpike ? 'Detected' : 'Normal'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="sensor-meta">
                <span className="timestamp">Updated: {formatTimestamp(device.sensorData.timestamp)}</span>
                <span className="confidence">
                  Confidence: <strong>{device.sensorData.confidence}%</strong>
                </span>
              </div>
            </div>
          )}

          {/* Location Section */}
          <div className="info-section">
            <h3>Location Metadata</h3>
            <div className="location-info">
              <div className="location-item">
                <span className="location-icon">🏢</span>
                <div>
                  <span className="location-label">Building:</span>
                  <span className="location-value">{device.location.building}</span>
                </div>
              </div>
              <div className="location-item">
                <span className="location-icon">🏠</span>
                <div>
                  <span className="location-label">Floor:</span>
                  <span className="location-value">{device.location.floor}</span>
                </div>
              </div>
              <div className="location-item">
                <span className="location-icon">📍</span>
                <div>
                  <span className="location-label">Room:</span>
                  <span className="location-value">{device.location.room}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions Section */}
          <div className="info-section">
            <h3>Actions</h3>
            <div className="actions-grid">
              <button 
                className="action-button primary"
                onClick={handlePing}
                disabled={isPinging}
              >
                {isPinging ? '⏳ Pinging...' : '📡 Ping Device'}
              </button>
              
              <button 
                className="action-button secondary"
                onClick={() => setShowFullLog(!showFullLog)}
              >
                📊 {showFullLog ? 'Hide' : 'View'} Full Log
              </button>
              
              {device.status === 'alarm' && (
                <button className="action-button warning">
                  ✅ Acknowledge Alarm
                </button>
              )}
              
              {device.type === 'admin' && (
                <>
                  <button className="action-button admin">
                    ⚙️ System Settings
                  </button>
                  <button className="action-button admin">
                    🏥 Global Health
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Sensor History (if expanded) */}
          {showFullLog && (
            <div className="info-section">
              <h3>Sensor History</h3>
              <div className="sensor-history">
                {sensorHistory.map((reading, index) => (
                  <div key={index} className="history-item">
                    <div className="history-time">
                      {formatTimestamp(reading.timestamp)}
                    </div>
                    <div className="history-data">
                      <span>H: {reading.humidity}%</span>
                      <span>PM2.5: {reading.pm25}</span>
                      <span>Size: {reading.particleSize}μm</span>
                      <span className={reading.volumeSpike ? 'spike' : ''}>
                        {reading.volumeSpike ? '🔊 Spike' : '🔇 Normal'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .panel-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 999;
          opacity: 0;
          animation: fadeIn 0.3s ease forwards;
        }

        .device-detail-panel {
          position: fixed;
          top: 0;
          right: -500px;
          width: 500px;
          height: 100vh;
          background: white;
          box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
          z-index: 1000;
          transition: right 0.3s ease;
          overflow-y: auto;
        }

        .device-detail-panel.open {
          right: 0;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 24px;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .panel-title {
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }

        .device-icon {
          font-size: 32px;
        }

        .panel-title h2 {
          margin: 0 0 4px 0;
          font-size: 24px;
          font-weight: 700;
          color: #111827;
        }

        .device-subtitle {
          margin: 0;
          color: #6b7280;
          font-size: 14px;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 20px;
          color: #6b7280;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .close-button:hover {
          background: #e5e7eb;
          color: #374151;
        }

        .panel-content {
          padding: 0;
        }

        .info-section {
          padding: 24px;
          border-bottom: 1px solid #f3f4f6;
        }

        .info-section:last-child {
          border-bottom: none;
        }

        .info-section h3 {
          margin: 0 0 16px 0;
          font-size: 18px;
          font-weight: 600;
          color: #111827;
        }

        .status-info {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .status-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .status-text {
          font-weight: 600;
          font-size: 16px;
        }

        .alarm-badge {
          background: #fef2f2;
          color: #dc2626;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }

        .status-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .detail-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .label {
          color: #6b7280;
          font-size: 14px;
        }

        .value {
          font-weight: 600;
          color: #111827;
          font-size: 14px;
        }

        .sensor-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }

        .sensor-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #f9fafb;
          border-radius: 8px;
        }

        .sensor-icon {
          font-size: 20px;
        }

        .sensor-info {
          display: flex;
          flex-direction: column;
        }

        .sensor-label {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 2px;
        }

        .sensor-value {
          font-weight: 600;
          color: #111827;
          font-size: 14px;
        }

        .sensor-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: #6b7280;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
        }

        .confidence {
          color: #059669;
        }

        .location-info {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .location-item {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .location-icon {
          font-size: 16px;
          width: 20px;
        }

        .location-label {
          color: #6b7280;
          font-size: 14px;
          margin-right: 8px;
        }

        .location-value {
          font-weight: 600;
          color: #111827;
          font-size: 14px;
        }

        .actions-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .action-button {
          padding: 12px 16px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
        }

        .action-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .action-button.primary {
          background: #3b82f6;
          color: white;
        }

        .action-button.primary:hover:not(:disabled) {
          background: #2563eb;
        }

        .action-button.secondary {
          background: #f3f4f6;
          color: #374151;
        }

        .action-button.secondary:hover {
          background: #e5e7eb;
        }

        .action-button.warning {
          background: #fef3c7;
          color: #d97706;
        }

        .action-button.warning:hover {
          background: #fde68a;
        }

        .action-button.admin {
          background: #ede9fe;
          color: #7c3aed;
        }

        .action-button.admin:hover {
          background: #ddd6fe;
        }

        .sensor-history {
          max-height: 300px;
          overflow-y: auto;
        }

        .history-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-bottom: 1px solid #f3f4f6;
        }

        .history-item:last-child {
          border-bottom: none;
        }

        .history-time {
          font-size: 12px;
          color: #6b7280;
          min-width: 120px;
        }

        .history-data {
          display: flex;
          gap: 12px;
          font-size: 12px;
        }

        .history-data span {
          padding: 2px 6px;
          background: #f3f4f6;
          border-radius: 4px;
        }

        .history-data span.spike {
          background: #fef2f2;
          color: #dc2626;
        }

        @keyframes fadeIn {
          to {
            opacity: 1;
          }
        }

        @media (max-width: 768px) {
          .device-detail-panel {
            width: 100vw;
            right: -100vw;
          }

          .sensor-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
};

export default DeviceDetailPanel;