import React from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatLastSeen = (timestamp) => {
  if (!timestamp) return '—';
  const diffMs = Date.now() - new Date(timestamp);
  const m = Math.floor(diffMs / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
};

const getStatusClass = (device) => {
  const { status, sensorData, isOnline } = device;
  if (sensorData?.predictedClass === 'vape' || status === 'alarm') return 'alarm';
  if (status === 'CONFIRMING' || sensorData?.predictedClass === 'suspected') return 'warning';
  if (status === 'WARMUP' || status === 'CALIBRATING') return 'warning';
  if (status === 'COOLDOWN') return 'cooldown';
  if (status === 'offline' || isOnline === false) return 'offline';
  return 'online';
};

const getStatusLabel = (device) => {
  const cls = getStatusClass(device);
  const map = {
    alarm:    'Alert',
    warning:  device.status === 'CONFIRMING' ? 'Suspected' : 'Warmup',
    cooldown: 'Cooldown',
    offline:  'Offline',
    online:   'Online',
  };
  return map[cls] || 'Online';
};

// ── Filter chip config ────────────────────────────────────────────────────────
const STATUS_FILTERS = [
  { key: 'all',     label: 'All',       dot: null       },
  { key: 'online',  label: 'Online',    dot: '#22c55e'  },
  { key: 'alarm',   label: 'Alert',     dot: '#ef4444'  },
  { key: 'warning', label: 'Suspected', dot: '#f59e0b'  },
  { key: 'offline', label: 'Offline',   dot: '#6b7280'  },
];

// ── Mistio puck icon ──────────────────────────────────────────────────────────
const DeviceCircle = () => (
  <div className="mistio-device-circle">
    <div className="mistio-puck-ring">
      <div className="mistio-puck-dot" />
    </div>
    <span className="mistio-puck-label">MISTIO</span>
  </div>
);

// ── Battery icon ──────────────────────────────────────────────────────────────
const BatteryIcon = ({ isOffline }) => (
  <div className="mistio-battery">
    <div className="mistio-battery-bar">
      <div className={`mistio-battery-fill${isOffline ? ' offline' : ''}`} />
    </div>
  </div>
);

// ── Reusable device row ───────────────────────────────────────────────────────
const DeviceRow = ({ device, isSelected, isDemo, onDeviceSelect }) => {
  const statusCls = getStatusClass(device);
  const isOffline = statusCls === 'offline';
  return (
    <div
      className={`mistio-device-item${isSelected ? ' selected' : ''}${isDemo ? ' demo' : ''}`}
      onClick={() => onDeviceSelect(device)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onDeviceSelect(device)}
    >
      {/* Circular device icon + status dot */}
      <div className="mistio-icon-wrap">
        <DeviceCircle />
        <div className={`mistio-status-dot ${statusCls}`} aria-label={getStatusLabel(device)} />
      </div>

      {/* Name + location */}
      <div className="mistio-device-info">
        <p className="mistio-device-name">
          {device.name}
          {isDemo && (
            <span style={{
              marginLeft: 6,
              fontSize: '0.58rem',
              fontWeight: 600,
              color: '#00C2CB',
              background: 'rgba(0,194,203,0.1)',
              border: '1px solid rgba(0,194,203,0.25)',
              borderRadius: 4,
              padding: '1px 5px',
              verticalAlign: 'middle',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              UI Test
            </span>
          )}
        </p>
        <p className="mistio-device-location">
          {device.location?.building
            ? `${device.location.building}${device.location.room ? ` · ${device.location.room}` : ''}`
            : formatLastSeen(device.lastSeen)}
        </p>
      </div>

      {/* Battery / signal */}
      <div className="mistio-device-right">
        <BatteryIcon isOffline={isOffline} />
      </div>
    </div>
  );
};

// ── DeviceList ────────────────────────────────────────────────────────────────
const DeviceList = ({
  devices,
  demoDevice,
  selectedDevice,
  onDeviceSelect,
  filters,
  onFilterChange,
  statusCounts,
}) => (
  <div className="mistio-device-list-wrap">
    {/* Search + filter chips */}
    <div className="mistio-list-header">
      <input
        type="text"
        className="mistio-search-input"
        placeholder="Search devices…"
        value={filters?.search ?? ''}
        onChange={e => onFilterChange?.('search', e.target.value)}
      />

      {/* Status filter chips */}
      <div className="mistio-filter-chips">
        {STATUS_FILTERS.map(f => {
          const count = statusCounts?.[f.key] ?? 0;
          const isActive = (filters?.status ?? 'all') === f.key;
          return (
            <button
              key={f.key}
              className={`mistio-filter-chip${isActive ? ' active' : ''}`}
              onClick={() => onFilterChange?.('status', f.key)}
              aria-pressed={isActive}
            >
              {f.dot && (
                <span
                  className="mistio-chip-dot"
                  style={{ background: f.dot }}
                />
              )}
              <span className="mistio-chip-label">{f.label}</span>
              <span className={`mistio-chip-count${isActive ? ' active' : ''}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>

    {/* List */}
    <div className="mistio-device-list-scroll">
      {devices.length === 0 && !demoDevice ? (
        <div className="mistio-empty-state">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
            stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <p>No devices found</p>
        </div>
      ) : (
        <>
          {devices.map(device => (
            <DeviceRow
              key={device.id}
              device={device}
              isSelected={selectedDevice?.id === device.id}
              isDemo={false}
              onDeviceSelect={onDeviceSelect}
            />
          ))}

          {/* Demo sensor — always shown at the bottom */}
          {demoDevice && (
            <DeviceRow
              key={demoDevice.id}
              device={demoDevice}
              isSelected={selectedDevice?.id === demoDevice.id}
              isDemo={true}
              onDeviceSelect={onDeviceSelect}
            />
          )}
        </>
      )}
    </div>
  </div>
);

export default DeviceList;
