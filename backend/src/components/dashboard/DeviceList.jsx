import React from 'react';

// Modern SVG Icons
const Icons = {
  Search: () => (
    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  Admin: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Detector: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
    </svg>
  ),
  Location: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Time: () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  StatusOnline: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  StatusOffline: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
  StatusAlarm: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  Empty: () => (
    <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
};

const DeviceList = ({ devices, selectedDevice, onDeviceSelect, filters, onFilterChange }) => {
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

  const statusTabs = [
    { id: 'all', label: 'All Devices' },
    { id: 'online', label: 'Online' },
    { id: 'offline', label: 'Offline' },
    { id: 'alarm', label: 'Alerts' }
  ];

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Filters Header */}
      <div className="p-4 border-b border-gray-100 bg-gray-50/50 space-y-4">
        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icons.Search />
          </div>
          <input
            type="text"
            placeholder="Search devices by name or location..."
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all duration-200"
          />
        </div>

        {/* Status Tabs */}
        <div className="flex p-1 space-x-1 bg-gray-100/80 rounded-lg">
          {statusTabs.map((tab) => {
            const isActive = filters.status === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onFilterChange('status', tab.id)}
                className={`
                  flex-1 py-1.5 text-sm font-medium rounded-md transition-all duration-200
                  ${isActive 
                    ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                  }
                `}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Device Count */}
      <div className="px-4 py-2 bg-gray-50/30 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wider">
        Showing {devices.length} device{devices.length !== 1 ? 's' : ''}
      </div>

      {/* Device List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/30">
        {devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Icons.Empty />
            <p className="text-gray-900 font-medium">No devices found</p>
            <p className="text-gray-500 text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          devices.map((device) => {
            const isSelected = selectedDevice?.id === device.id;
            const isAlarm = device.status === 'alarm';
            const isOffline = device.status === 'offline';
            const predictedClass = device.sensorData?.predictedClass;

            // Determine display properties based on state
            let statusColor = 'bg-emerald-500';
            let statusBg = 'bg-emerald-50 text-emerald-700 border-emerald-100';
            let statusLabel = 'Online';
            let statusIconColor = 'bg-emerald-500'; // For the dot inside badge
            
            if (isOffline) {
              statusColor = 'bg-gray-300';
              statusBg = 'bg-gray-50 text-gray-600 border-gray-100';
              statusLabel = 'Offline';
              statusIconColor = 'bg-gray-400';
            } else if (predictedClass === 'vape' || isAlarm) {
              statusColor = 'bg-red-500';
              statusBg = 'bg-red-50 text-red-700 border-red-100';
              statusLabel = 'Vape Detected';
              statusIconColor = 'bg-red-500 animate-pulse';
            } else if (predictedClass === 'suspected' || predictedClass === 'suspicious') {
              statusColor = 'bg-orange-500';
              statusBg = 'bg-orange-50 text-orange-700 border-orange-100';
              statusLabel = 'Suspicious';
              statusIconColor = 'bg-orange-500 animate-pulse';
            } else if (predictedClass === 'calibrating') {
              statusColor = 'bg-yellow-500';
              statusBg = 'bg-yellow-50 text-yellow-700 border-yellow-100';
              statusLabel = 'Calibrating';
              statusIconColor = 'bg-yellow-500 animate-pulse';
            }
            
            return (
              <div
                key={device.id}
                onClick={() => onDeviceSelect(device)}
                className={`
                  group relative p-4 rounded-xl border transition-all duration-200 cursor-pointer
                  ${isSelected 
                    ? 'bg-blue-50/50 border-blue-200 ring-1 ring-blue-200 shadow-sm' 
                    : 'bg-white border-gray-100 hover:border-gray-300 hover:shadow-md'
                  }
                  ${(isAlarm || predictedClass === 'vape') && !isSelected ? 'border-red-100 bg-red-50/30' : ''}
                `}
              >
                {/* Status Indicator Bar */}
                <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${statusColor}`} />

                <div className="pl-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center space-x-3">
                      <div className={`
                        p-2 rounded-lg 
                        ${(isAlarm || predictedClass === 'vape') ? 'bg-red-100 text-red-600' : (isOffline ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600')}
                      `}>
                        {device.type === 'admin' ? <Icons.Admin /> : <Icons.Detector />}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                          {device.name}
                        </h4>
                        <div className="flex items-center text-xs text-gray-500 mt-0.5">
                          <Icons.Location />
                          <span className="ml-1">
                            {device.location.building} • {device.location.room}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Status Badge */}
                    <div className={`
                      flex items-center px-2.5 py-1 rounded-full text-xs font-medium border
                      ${statusBg}
                    `}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${statusIconColor}`} />
                      {statusLabel}
                    </div>
                  </div>

                  {/* Metadata & Confidence */}
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <div className="flex items-center text-gray-400">
                      <Icons.Time />
                      <span className="ml-1">{formatLastSeen(device.lastSeen)}</span>
                    </div>

                    {device.sensorData && (
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-500 font-medium">Confidence</span>
                        <div className="flex items-center space-x-2 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                isOffline ? 'bg-gray-300' :
                                (device.sensorData.confidence > 80 ? 'bg-emerald-500' : 
                                (device.sensorData.confidence > 50 ? 'bg-yellow-500' : 'bg-gray-400'))
                              }`}
                              style={{ width: `${device.sensorData.confidence}%` }}
                            />
                          </div>
                          <span className="font-bold text-gray-700">{device.sensorData.confidence}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DeviceList;
