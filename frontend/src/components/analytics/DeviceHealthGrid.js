import React, { useState, useEffect } from 'react';
import { mockDataService } from '../../services/mockDataService';
import { getStatusColor, formatTimestamp } from '../../utils/chartHelpers';

const DeviceHealthGrid = () => {
  const [deviceData, setDeviceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await mockDataService.getDeviceHealth();
        setDeviceData(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching device health data:', error);
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute

    return () => clearInterval(interval);
  }, []);

  const filteredDevices = deviceData?.devices.filter(device => {
    if (filter === 'all') return true;
    if (filter === 'online') return device.status === 'online';
    if (filter === 'offline') return device.status === 'offline';
    if (filter === 'warning') return device.batteryLevel < 30 || device.signalStrength < 50;
    return true;
  }) || [];

  const DeviceCard = ({ device }) => {
    const statusColor = getStatusColor(device.status);
    const batteryColor = device.batteryLevel > 50 ? 'bg-green-500' : 
                        device.batteryLevel > 20 ? 'bg-amber-500' : 'bg-red-500';
    const signalColor = device.signalStrength > 70 ? 'bg-green-500' : 
                        device.signalStrength > 40 ? 'bg-amber-500' : 'bg-red-500';

    return (
      <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-all duration-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: statusColor }}
              title={`Status: ${device.status}`}
            ></div>
            <h4 className="font-medium text-gray-900 text-sm truncate">{device.name}</h4>
          </div>
          <span className="text-xs text-gray-500">{device.deviceId}</span>
        </div>
        
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Battery</span>
              <span>{device.batteryLevel}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${batteryColor}`}
                style={{ width: `${device.batteryLevel}%` }}
              ></div>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Signal</span>
              <span>{device.signalStrength}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${signalColor}`}
                style={{ width: `${device.signalStrength}%` }}
              ></div>
            </div>
          </div>
          
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <div className="text-xs text-gray-500">
              {formatTimestamp(device.lastSeen)}
            </div>
            <div className="text-xs font-medium text-gray-700">
              Health: {device.healthScore}%
            </div>
          </div>
          
          <div className="text-xs text-gray-500 truncate" title={device.location}>
            {device.location}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Device Health</h3>
          <div className="h-8 w-24 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="p-4 rounded-lg border border-gray-200 animate-pulse">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                  <div className="h-4 bg-gray-300 rounded w-20"></div>
                </div>
                <div className="h-3 bg-gray-300 rounded w-12"></div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="h-3 bg-gray-300 rounded w-16 mb-1"></div>
                  <div className="w-full bg-gray-200 rounded-full h-2"></div>
                </div>
                <div>
                  <div className="h-3 bg-gray-300 rounded w-16 mb-1"></div>
                  <div className="w-full bg-gray-200 rounded-full h-2"></div>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <div className="h-3 bg-gray-300 rounded w-16"></div>
                  <div className="h-3 bg-gray-300 rounded w-12"></div>
                </div>
                <div className="h-3 bg-gray-300 rounded w-full"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!deviceData) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="text-center py-8 text-gray-500">
          <p>Unable to load device health data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 sm:mb-0">Device Health</h3>
        
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'all', label: 'All Devices' },
            { value: 'online', label: 'Online' },
            { value: 'offline', label: 'Offline' },
            { value: 'warning', label: 'Warnings' }
          ].map((filterOption) => (
            <button
              key={filterOption.value}
              onClick={() => setFilter(filterOption.value)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${
                filter === filterOption.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filterOption.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredDevices.map((device) => (
          <DeviceCard key={device.deviceId} device={device} />
        ))}
      </div>

      {filteredDevices.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No devices match the current filter</p>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500 text-center">
        Last updated: {formatTimestamp(deviceData.lastUpdate)}
      </div>
    </div>
  );
};

export default DeviceHealthGrid;