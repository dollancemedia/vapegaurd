import React, { useState, useRef, useEffect } from 'react';
import { useOrganization } from "@clerk/clerk-react";
import deviceService from '../services/deviceService';

// Icons
const Icons = {
  Edit: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Drag: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
    </svg>
  ),
  Info: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
};

const DeviceMap = ({ devices, selectedDevice, onDeviceSelect, onRefresh, isEditingExternal }) => {
  const { organization } = useOrganization();
  const [hoveredDevice, setHoveredDevice] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // Sync internal editing state with external prop if provided
  useEffect(() => {
    if (isEditingExternal !== undefined) {
      setIsEditing(isEditingExternal);
    }
  }, [isEditingExternal]);
  
  // Dragging State
  const [draggingId, setDraggingId] = useState(null);
  const [localLocations, setLocalLocations] = useState({}); // Stores temporary positions while dragging/editing
  const svgRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // For tooltip
  const [bgFallback, setBgFallback] = useState(false);

  // Fallback coordinates
  const defaultCoordinates = {
    'detector-1': { x: 150, y: 200 }, 
    'ESP32_C6_001': { x: 150, y: 200 }, 
    'detector-2': { x: 350, y: 180 }, 
    'ESP32_C6_002': { x: 350, y: 180 }, 
    'detector-3': { x: 200, y: 350 }, 
    'detector-4': { x: 400, y: 320 }, 
    'detector-5': { x: 100, y: 100 }, 
  };

  // Sync local locations with props when not editing
  useEffect(() => {
    if (!isEditing) {
      const initialLocs = {};
      devices.forEach(d => {
        initialLocs[d.id] = d.mapLocation || defaultCoordinates[d.id] || { x: 50, y: 50 };
      });
      setLocalLocations(initialLocs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, isEditing]);

  // Get device visual props
  const getDeviceVisuals = (device) => {
    // Prioritize offline status
    if (device.status === 'offline') return { color: '#9CA3AF', pulse: false, icon: '💤' }; // Gray

    const status = device.status || 'monitoring'; // Backend sends "CALIBRATING", "CONFIRMING", "IDLE" (monitoring)
    const predictedClass = device.sensorData?.predictedClass;

    if (predictedClass === 'vape' || predictedClass === 'fire') return { color: '#EF4444', pulse: true, icon: '⚠️' }; // Red
    if (status === 'alarm') return { color: '#EF4444', pulse: false, icon: '🚨' }; // Red
    
    // New States
    if (status === 'WARMUP' || predictedClass === 'warmup') return { color: '#EAB308', pulse: false, icon: '⏳' }; // Yellow
    if (status === 'CALIBRATING') return { color: '#EAB308', pulse: false, icon: '⚙️' }; // Yellow
    if (status === 'CONFIRMING' || predictedClass === 'suspected') return { color: '#F97316', pulse: false, icon: '👀' }; // Orange
    if (status === 'COOLDOWN') return { color: '#3B82F6', pulse: false, icon: '🧊' }; // Blue
    
    if (status === 'online' || status === 'monitoring' || status === 'IDLE') return { color: '#10B981', pulse: false, icon: '📡' }; // Green
    
    return { color: '#9CA3AF', pulse: false, icon: '?' };
  };

  // Convert client coordinates to SVG viewBox coordinates
  const getSVGPoint = (clientX, clientY) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
  };

  const handleMouseDown = (e, deviceId) => {
    if (!isEditing) return;
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection
    setDraggingId(deviceId);
  };

  const handleTouchStart = (e, deviceId) => {
    if (!isEditing) return;
    e.stopPropagation();
    setDraggingId(deviceId);
  };

  const handleMouseMove = (e) => {
    // Tooltip positioning
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    // Dragging Logic
    if (isEditing && draggingId) {
      e.preventDefault();
      const point = getSVGPoint(e.clientX, e.clientY);
      
      // Constrain to map bounds (0-800, 0-600)
      const x = Math.max(20, Math.min(780, point.x));
      const y = Math.max(20, Math.min(580, point.y));

      setLocalLocations(prev => ({
        ...prev,
        [draggingId]: { x, y }
      }));
    }
  };

  const handleTouchMove = (e) => {
    if (!isEditing) return;
    if (e.touches && e.touches.length > 0) {
      const touch = e.touches[0];
      const rect = e.currentTarget.getBoundingClientRect();
      setMousePos({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
      if (draggingId) {
        const point = getSVGPoint(touch.clientX, touch.clientY);
        const x = Math.max(20, Math.min(780, point.x));
        const y = Math.max(20, Math.min(580, point.y));
        setLocalLocations(prev => ({
          ...prev,
          [draggingId]: { x, y }
        }));
      }
    }
  };

  const handleMouseUp = async () => {
    if (draggingId) {
      // Save the new location
      const { x, y } = localLocations[draggingId];
      try {
        await deviceService.updateDeviceLocation(draggingId, Math.round(x), Math.round(y));
        if (onRefresh) onRefresh();
      } catch (error) {
        console.error("Failed to update location:", error);
        // Optionally revert local state here
      }
      setDraggingId(null);
    }
  };

  const handleTouchEnd = () => {
    handleMouseUp();
  };
  // Handle entering/exiting edit mode
  const toggleEditMode = () => {
    if (isEditing) {
      // Exiting edit mode
      setIsEditing(false);
      setDraggingId(null);
    } else {
      // Entering edit mode
      setIsEditing(true);
      // Initialize local state just in case
      const initialLocs = {};
      devices.forEach(d => {
        initialLocs[d.id] = d.mapLocation || defaultCoordinates[d.id] || { x: 50, y: 50 };
      });
      setLocalLocations(initialLocs);
      // Close side panel
      if (onDeviceSelect) onDeviceSelect(null);
    }
  };

  const name = organization?.name;

  // Map image path state with preload + fallback handling
  const [mapImage, setMapImage] = useState('/default.svg');

  useEffect(() => {
    let candidate = '/default.svg';
    if (name) candidate = `/schools/${name.toLowerCase()}.svg`;

    // Try to preload the image; if it fails, keep default
    const img = new Image();
    img.onload = () => setMapImage(candidate);
    img.onerror = () => setMapImage('/default.svg');
    img.src = candidate;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [name]);

  return (
    <div className="relative w-full h-full bg-white overflow-hidden group">
      
      {/* Controls Bar - Hidden if controlled externally */}
      {isEditingExternal === undefined && (
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
          <button
            onClick={toggleEditMode}
            className={`
              flex items-center space-x-2 px-4 py-2 rounded-full font-medium text-sm shadow-sm transition-all duration-200
              ${isEditing 
                ? 'bg-[#00C2CB] text-white hover:bg-[#009FA6] ring-2 ring-[#00C2CB]/30' 
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }
            `}
          >
            {isEditing ? <><Icons.Check /><span>Done Editing</span></> : <><Icons.Edit /><span>Edit Map</span></>}
          </button>
        </div>
      )}

      {/* Editing Instructions Toast */}
      {isEditing && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-gray-900/80 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-fade-in-down flex items-center space-x-2 pointer-events-none">
          <Icons.Info />
          <span>Drag devices to reposition them</span>
        </div>
      )}

      {/* Map Container */}
      <div 
        className={`w-full h-full relative overflow-hidden transition-cursor duration-200 ${isEditing ? (draggingId ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseLeave={() => {
          setHoveredDevice(null);
          handleMouseUp();
        }}
      >
        <svg 
          ref={svgRef}
          viewBox="0 0 800 600" 
          className="w-full h-full"
          preserveAspectRatio="xMidYMin meet"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          style={bgFallback ? { backgroundImage: `url(${mapImage})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'top left' } : undefined}
        >
          {/* Background Map Image - Embedded for perfect coordinate alignment */}
          <image 
            href={mapImage}
            xlinkHref={mapImage}
            width="800" 
            height="600" 
            className="opacity-90"
            crossOrigin="anonymous"
            onError={() => setBgFallback(true)}
          />

          {/* Device Markers */}
          {devices.map((device) => {
            const coords = isEditing 
              ? (localLocations[device.id] || { x: 0, y: 0 }) 
              : (device.mapLocation || defaultCoordinates[device.id] || { x: 50, y: 50 });
            
            const visuals = getDeviceVisuals(device);
            const isSelected = selectedDevice?.id === device.id;
            const isHovered = hoveredDevice?.id === device.id;
            const isDragging = draggingId === device.id;

            return (
              <g 
                key={device.id}
                transform={`translate(${coords.x}, ${coords.y})`}
                onMouseDown={(e) => handleMouseDown(e, device.id)}
                onTouchStart={(e) => handleTouchStart(e, device.id)}
                onClick={(e) => {
                  if (!isEditing && onDeviceSelect) {
                    e.stopPropagation();
                    onDeviceSelect(device);
                  }
                }}
                onMouseEnter={() => setHoveredDevice(device)}
                onMouseLeave={() => setHoveredDevice(null)}
                className={`transition-opacity duration-200 ${isEditing && draggingId && !isDragging ? 'opacity-50' : 'opacity-100'}`}
                style={{ cursor: isEditing ? 'grab' : 'pointer' }}
              >
                {/* Interaction Area (Invisible) */}
                <circle r="30" fill="transparent" />

                {/* Pulse Animation Ring */}
                {visuals.pulse && (
                  <circle r="25" fill="none" stroke={visuals.color} strokeWidth="2" className="animate-ping opacity-75" />
                )}

                {/* Outer Ring (Selection/Hover Highlight) */}
                <circle 
                  r={isSelected || isHovered || isDragging ? "18" : "0"} 
                  fill={visuals.color} 
                  opacity="0.2"
                  className="transition-all duration-300"
                />

                {/* Main Marker */}
                <circle 
                  r={isDragging ? "14" : "12"} 
                  fill={visuals.color} 
                  stroke="white" 
                  strokeWidth="2.5"
                  className="filter drop-shadow-md transition-all duration-200"
                />

                {/* Device Type Icon inside marker (Optional, might be too small) */}
                {/* <text y="4" textAnchor="middle" fontSize="10" fill="white">📡</text> */}

                {/* Label Tooltip (Always visible when selected or dragging, or hovered) */}
                {(isSelected || isHovered || isDragging) && (
                  <g transform="translate(0, -25)">
                    <rect 
                      x="-60" y="-24" width="120" height="24" rx="12" 
                      fill="white" 
                      stroke="#E5E7EB"
                      strokeWidth="1"
                      className="filter drop-shadow-sm"
                    />
                    <text 
                      y="-8" 
                      textAnchor="middle" 
                      fontSize="11" 
                      fontWeight="600" 
                      fill="#374151"
                      dominantBaseline="middle"
                    >
                      {device.name}
                    </text>
                    {/* Little triangle pointer */}
                    <path d="M-4 0 L0 4 L4 0 Z" fill="white" stroke="#E5E7EB" strokeWidth="0" />
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip (Only in View Mode) */}
        {hoveredDevice && !isEditing && !draggingId && (
          <div 
            className="absolute z-50 pointer-events-none"
            style={{ 
              left: mousePos.x, 
              top: mousePos.y, 
              transform: 'translate(-50%, -100%)',
              marginTop: '-40px'
            }}
          >
            <div className="bg-white rounded-lg shadow-xl border border-gray-100 p-3 w-64 animate-in fade-in zoom-in duration-200">
              <div className="flex items-start justify-between mb-2 pb-2 border-b border-gray-100">
                <div>
                  <h4 className="font-bold text-gray-900 text-sm">{hoveredDevice.name}</h4>
                  <p className="text-xs text-gray-500">{hoveredDevice.type === 'admin' ? 'Admin Console' : 'Vape Detector'}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                  hoveredDevice.status === 'online' || hoveredDevice.status === 'IDLE' ? 'bg-green-100 text-green-700' :
                  hoveredDevice.status === 'alarm' ? 'bg-red-100 text-red-700' :
                  hoveredDevice.status === 'COOLDOWN' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {hoveredDevice.status}
                </span>
              </div>
              <div className="space-y-1 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>Location:</span>
                  <span className="font-medium text-gray-900">{hoveredDevice.location.room}</span>
                </div>
                {hoveredDevice.sensorData && (
                  <>
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className={`font-medium ${
                        hoveredDevice.status === 'offline' ? 'text-gray-500' :
                        hoveredDevice.sensorData.predictedClass === 'vape' ? 'text-red-600' : 'text-[#00C2CB]'
                      }`}>
                        {hoveredDevice.sensorData.predictedClass === 'vape' ? '⚠️ Vape Detected' : '✅ Normal'}
                      </span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-50 grid grid-cols-2 gap-2">
                      <div className="bg-gray-50 p-1.5 rounded text-center">
                        <span className="block text-[10px] text-gray-400 uppercase">Humidity</span>
                        <span className="font-semibold">{hoveredDevice.sensorData.humidity}%</span>
                      </div>
                      <div className="bg-gray-50 p-1.5 rounded text-center">
                        <span className="block text-[10px] text-gray-400 uppercase">PM2.5</span>
                        <span className="font-semibold">{hoveredDevice.sensorData.pm25}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            {/* Arrow */}
            <div className="w-3 h-3 bg-white border-r border-b border-gray-100 transform rotate-45 absolute left-1/2 -ml-1.5 -bottom-1.5"></div>
          </div>
        )}
      </div>

      <style jsx>{`
        .animate-fade-in-down {
          animation: fadeInDown 0.3s ease-out;
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translate(-50%, -10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
};

export default DeviceMap;
