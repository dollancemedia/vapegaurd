import React, { useState, useEffect, useRef } from 'react';

const DeviceMap = ({ devices, selectedDevice, onDeviceSelect }) => {
  const [mapDimensions, setMapDimensions] = useState({ width: 800, height: 600 });
  const [hoveredDevice, setHoveredDevice] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const mapContainerRef = useRef(null);
  const svgRef = useRef(null);

  // Hard-coded device coordinates (adjust these based on your campus map)
  // These coordinates are relative to the SVG viewBox
  const deviceCoordinates = {
    'detector-1': { x: 150, y: 200 }, // Building A, Floor 1
    'detector-2': { x: 300, y: 180 }, // Building A, Floor 2
    'detector-3': { x: 450, y: 220 }, // Building B, Floor 1
    'detector-4': { x: 600, y: 160 }, // Building B, Floor 2
    'detector-5': { x: 350, y: 350 }, // Building C, Floor 1
    'admin-console': { x: 400, y: 100 } // Admin Building
  };

  // Get device status color
  const getDeviceColor = (status) => {
    switch (status) {
      case 'online': return '#10B981'; // Green
      case 'offline': return '#6B7280'; // Gray
      case 'alarm': return '#EF4444'; // Red
      default: return '#6B7280';
    }
  };

  // Get device icon based on type
  const getDeviceIcon = (type) => {
    return type === 'admin' ? '🖥️' : '📡';
  };

  // Handle mouse move for tooltip positioning
  const handleMouseMove = (e) => {
    const rect = mapContainerRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  // Handle device marker click
  const handleDeviceClick = (device) => {
    onDeviceSelect(device);
  };

  // Handle device marker hover
  const handleDeviceHover = (device) => {
    setHoveredDevice(device);
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    setHoveredDevice(null);
  };

  // Update map dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (mapContainerRef.current) {
        const { width, height } = mapContainerRef.current.getBoundingClientRect();
        setMapDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  return (
    <div 
      className="device-map-container"
      ref={mapContainerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Campus Map SVG */}
      <div className="map-wrapper">
        <img 
          src="/campus_map.svg" 
          alt="Campus Map" 
          className="campus-map"
          style={{ width: '100%', height: 'auto' }}
        />
        
        {/* Device Markers Overlay */}
        <svg 
          ref={svgRef}
          className="device-markers-overlay"
          viewBox="0 0 800 600"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
        >
          {devices.map((device) => {
            const coords = deviceCoordinates[device.id];
            if (!coords) return null;

            const isSelected = selectedDevice?.id === device.id;
            const isHovered = hoveredDevice?.id === device.id;
            const color = getDeviceColor(device.status);

            return (
              <g key={device.id}>
                {/* Device marker circle */}
                <circle
                  cx={coords.x}
                  cy={coords.y}
                  r={isSelected ? 16 : isHovered ? 14 : 12}
                  fill={color}
                  stroke={isSelected ? '#1F2937' : '#FFFFFF'}
                  strokeWidth={isSelected ? 3 : 2}
                  className={`device-marker ${device.status} ${isSelected ? 'selected' : ''}`}
                  style={{
                    pointerEvents: 'all',
                    cursor: 'pointer',
                    filter: device.status === 'alarm' ? 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))' : 'none',
                    animation: device.status === 'alarm' ? 'pulse 2s infinite' : 'none'
                  }}
                  onClick={() => handleDeviceClick(device)}
                  onMouseEnter={() => handleDeviceHover(device)}
                />
                
                {/* Device icon */}
                <text
                  x={coords.x}
                  y={coords.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isSelected ? "10" : "8"}
                  fill="white"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {getDeviceIcon(device.type)}
                </text>
                
                {/* Pulse animation for alarm status */}
                {device.status === 'alarm' && (
                  <circle
                    cx={coords.x}
                    cy={coords.y}
                    r="20"
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    opacity="0.6"
                    style={{
                      animation: 'pulse-ring 2s infinite',
                      pointerEvents: 'none'
                    }}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Device Tooltip */}
      {hoveredDevice && (
        <div 
          className="device-tooltip"
          style={{
            position: 'absolute',
            left: mousePosition.x + 10,
            top: mousePosition.y - 10,
            transform: 'translateY(-100%)',
            zIndex: 1000
          }}
        >
          <div className="tooltip-content">
            <div className="tooltip-header">
              <span className="device-icon">{getDeviceIcon(hoveredDevice.type)}</span>
              <strong>{hoveredDevice.name}</strong>
              <span className={`status-badge ${hoveredDevice.status}`}>
                {hoveredDevice.status}
              </span>
            </div>
            <div className="tooltip-details">
              <div>📍 {hoveredDevice.location.building}, {hoveredDevice.location.room}</div>
              <div>🕒 Last seen: {new Date(hoveredDevice.lastSeen).toLocaleTimeString()}</div>
              {hoveredDevice.sensorData && (
                <div>📊 Confidence: {hoveredDevice.sensorData.confidence}%</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Map Legend */}
      <div className="map-legend">
        <h4>Device Status</h4>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#10B981' }}></div>
            <span>Online</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#EF4444' }}></div>
            <span>Alarm</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#6B7280' }}></div>
            <span>Offline</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .device-map-container {
          position: relative;
          width: 100%;
          height: 500px;
          background: #f8f9fa;
          border-radius: 8px;
          overflow: hidden;
        }

        .map-wrapper {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .campus-map {
          display: block;
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }

        .device-marker {
          transition: all 0.2s ease;
        }

        .device-marker:hover {
          transform: scale(1.1);
        }

        .device-tooltip {
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 12px;
          border-radius: 8px;
          font-size: 12px;
          max-width: 250px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          pointer-events: none;
        }

        .tooltip-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        .status-badge {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: bold;
          text-transform: uppercase;
        }

        .status-badge.online {
          background: #10B981;
          color: white;
        }

        .status-badge.alarm {
          background: #EF4444;
          color: white;
        }

        .status-badge.offline {
          background: #6B7280;
          color: white;
        }

        .tooltip-details div {
          margin: 4px 0;
        }

        .map-legend {
          position: absolute;
          bottom: 16px;
          right: 16px;
          background: rgba(255, 255, 255, 0.95);
          padding: 12px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          font-size: 12px;
        }

        .map-legend h4 {
          margin: 0 0 8px 0;
          font-size: 14px;
          font-weight: 600;
        }

        .legend-items {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes pulse-ring {
          0% {
            transform: scale(0.8);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default DeviceMap;