import React from 'react';

const DeviceList = ({ devices, selectedDevice, onDeviceSelect, filters, onFilterChange }) => {
  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'online': return '🟢';
      case 'offline': return '⚫';
      case 'alarm': return '🔴';
      default: return '⚫';
    }
  };

  // Get device type icon
  const getTypeIcon = (type) => {
    return type === 'admin' ? '🖥️' : '📡';
  };

  // Format last seen time
  const formatLastSeen = (timestamp) => {
    const now = new Date();
    const lastSeen = new Date(timestamp);
    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="device-list">
      {/* Filters */}
      <div className="device-filters">
        {/* Search */}
        <div className="filter-group">
          <input
            type="text"
            placeholder="Search devices..."
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            className="form-control search-input"
          />
        </div>

        {/* Status Filter */}
        <div className="filter-group">
          <select
            value={filters.status}
            onChange={(e) => onFilterChange('status', e.target.value)}
            className="form-select filter-select"
          >
            <option value="all">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="alarm">Alarm</option>
          </select>
        </div>

        {/* Type Filter */}
        <div className="filter-group">
          <select
            value={filters.type}
            onChange={(e) => onFilterChange('type', e.target.value)}
            className="form-select filter-select"
          >
            <option value="all">All Types</option>
            <option value="detector">Detectors</option>
            <option value="admin">Admin Console</option>
          </select>
        </div>
      </div>

      {/* Device Count */}
      <div className="device-count">
        Showing {devices.length} device{devices.length !== 1 ? 's' : ''}
      </div>

      {/* Device List */}
      <div className="device-list-items">
        {devices.length === 0 ? (
          <div className="no-devices">
            <div className="no-devices-icon">📡</div>
            <p>No devices found</p>
            <small>Try adjusting your filters</small>
          </div>
        ) : (
          devices.map((device) => (
            <div
              key={device.id}
              className={`device-item ${selectedDevice?.id === device.id ? 'selected' : ''} ${device.status}`}
              onClick={() => onDeviceSelect(device)}
            >
              <div className="device-item-header">
                <div className="device-info">
                  <span className="device-icon">{getTypeIcon(device.type)}</span>
                  <div className="device-details">
                    <h4 className="device-name">{device.name}</h4>
                    <p className="device-location">
                      {device.location.building} • {device.location.room}
                    </p>
                  </div>
                </div>
                <div className="device-status">
                  <span className={`status-indicator ${device.status}`}>
                    {getStatusIcon(device.status)}
                  </span>
                </div>
              </div>

              <div className="device-item-body">
                <div className="device-meta">
                  <div className="meta-item">
                    <span className="meta-label">Type:</span>
                    <span className="meta-value">
                      {device.type === 'admin' ? 'Admin Console' : 'Vape Detector'}
                    </span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Last Seen:</span>
                    <span className="meta-value">{formatLastSeen(device.lastSeen)}</span>
                  </div>
                  {device.sensorData && (
                    <div className="meta-item">
                      <span className="meta-label">Confidence:</span>
                      <span className="meta-value">{device.sensorData.confidence}%</span>
                    </div>
                  )}
                </div>

                {/* Quick Status Indicators */}
                <div className="quick-indicators">
                  {device.status === 'alarm' && (
                    <span className="indicator alarm">🚨 ALERT</span>
                  )}
                  {device.status === 'offline' && (
                    <span className="indicator offline">⚠️ OFFLINE</span>
                  )}
                  {device.type === 'admin' && (
                    <span className="indicator admin">👑 ADMIN</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        .device-list {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .device-filters {
          padding: 16px;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .filter-group {
          margin-bottom: 12px;
        }

        .filter-group:last-child {
          margin-bottom: 0;
        }

        .search-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .search-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .filter-select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          background: white;
        }

        .filter-select:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .device-count {
          padding: 12px 16px;
          font-size: 12px;
          color: #6b7280;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }

        .device-list-items {
          flex: 1;
          overflow-y: auto;
        }

        .no-devices {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          text-align: center;
          color: #6b7280;
        }

        .no-devices-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .device-item {
          padding: 16px;
          border-bottom: 1px solid #e5e7eb;
          cursor: pointer;
          transition: all 0.2s ease;
          background: white;
        }

        .device-item:hover {
          background: #f9fafb;
        }

        .device-item.selected {
          background: #eff6ff;
          border-left: 4px solid #3b82f6;
        }

        .device-item.alarm {
          border-left: 4px solid #ef4444;
        }

        .device-item-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .device-info {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .device-icon {
          font-size: 20px;
          margin-top: 2px;
        }

        .device-details {
          flex: 1;
        }

        .device-name {
          margin: 0 0 4px 0;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
        }

        .device-location {
          margin: 0;
          font-size: 12px;
          color: #6b7280;
        }

        .device-status {
          display: flex;
          align-items: center;
        }

        .status-indicator {
          font-size: 16px;
        }

        .device-item-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .device-meta {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .meta-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }

        .meta-label {
          color: #6b7280;
          font-weight: 500;
        }

        .meta-value {
          color: #111827;
          font-weight: 600;
        }

        .quick-indicators {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .indicator {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .indicator.alarm {
          background: #fef2f2;
          color: #dc2626;
        }

        .indicator.offline {
          background: #f3f4f6;
          color: #6b7280;
        }

        .indicator.admin {
          background: #f0f9ff;
          color: #0369a1;
        }

        @media (max-width: 768px) {
          .device-filters {
            padding: 12px;
          }

          .device-item {
            padding: 12px;
          }

          .device-name {
            font-size: 14px;
          }

          .device-location {
            font-size: 11px;
          }
        }
      `}</style>
    </div>
  );
};

export default DeviceList;