import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { deviceService } from '../services/deviceService';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Icons Component
const Icons = {
  Close: () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Edit: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  ),
  Admin: () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Detector: () => (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
    </svg>
  ),
  Humidity: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  PM25: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  ),
  Temp: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Gas: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  Building: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  Floor: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  Room: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  Ping: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
    </svg>
  ),
  Log: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  Check: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Warning: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  Trash: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
};

const DeviceDetailPanel = ({ device, isOpen, onClose, onPingDevice, history = [] }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', building: '', floor: '', room: '' });

  // Initialize edit form when device changes
  useEffect(() => {
    if (device) {
      setEditForm({
        name: device.name || '',
        building: device.location?.building || '',
        floor: device.location?.floor || '',
        room: device.location?.room || ''
      });
    }
  }, [device]);

  if (!device) return null;

  // Convert Celsius to Fahrenheit
  const toFahrenheit = (celsius) => {
    if (celsius === undefined || celsius === null) return 0;
    return ((celsius * 9/5) + 32).toFixed(1);
  };

  // Prepare chart data
  const chartData = {
    labels: history.slice(0, 20).reverse().map(h => new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
    datasets: [
      {
        label: 'Humidity (%)',
        data: history.slice(0, 20).reverse().map(h => h.humidity),
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        yAxisID: 'y',
        tension: 0.3
      },
      {
        label: 'PM2.5 (µg/m³)',
        data: history.slice(0, 20).reverse().map(h => h.pm25),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        yAxisID: 'y1',
        tension: 0.3
      },
      {
        label: 'Temperature (°F)',
        data: history.slice(0, 20).reverse().map(h => toFahrenheit(h.temperature)),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        yAxisID: 'y',
        tension: 0.3
      },
      {
        label: 'Gas Res (kΩ)',
        data: history.slice(0, 20).reverse().map(h => {
          const val = Number(h.gasResistance || 0);
          return val > 1000 ? val / 1000 : val;
        }),
        borderColor: 'rgb(153, 102, 255)',
        backgroundColor: 'rgba(153, 102, 255, 0.5)',
        yAxisID: 'y2',
        tension: 0.3
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    interaction: {
      mode: 'index',
      intersect: false,
    },
    stacked: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 10, usePointStyle: true }
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        grid: { borderDash: [2, 4] }
      },
      y1: {
        type: 'linear',
        display: false, // Hide duplicate axes for cleaner look, just use tooltips
        position: 'right',
        grid: { drawOnChartArea: false },
      },
      y2: {
        type: 'linear',
        display: false,
        position: 'right',
        grid: { drawOnChartArea: false },
      },
    },
  };
  
  // Handle save edit
  const handleSaveEdit = async () => {
    try {
      await deviceService.updateDeviceInfo(device.id, {
        name: editForm.name,
        location: {
          building: editForm.building,
          floor: editForm.floor,
          room: editForm.room
        }
      });
      setIsEditing(false);
      if (onPingDevice) onPingDevice(device.id); 
    } catch (error) {
      console.error('Failed to save device info:', error);
      alert('Failed to save changes');
    }
  };

  // Format gas resistance
  const formatGasResistance = (val) => {
    const num = Number(val);
    if (num > 1000) {
      return (num / 1000).toFixed(2) + " kΩ";
    }
    return num.toFixed(2) + " kΩ";
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div className={`
        fixed top-[60px] right-0 h-[calc(100%-60px)] w-full sm:w-[480px] bg-white shadow-2xl z-[900] transform transition-transform duration-300 ease-in-out overflow-y-auto
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {/* Panel Header */}
        <div className="bg-white/95 backdrop-blur border-b border-gray-100 px-6 py-5 flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className={`
              p-3 rounded-xl shadow-sm
              ${device.type === 'admin' ? 'bg-[#00C2CB]/10 text-[#00C2CB]' : 'bg-indigo-50 text-indigo-600'}
            `}>
              {device.type === 'admin' ? <Icons.Admin /> : <Icons.Detector />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-gray-900">{device.name}</h2>
                <button 
                  onClick={() => setIsEditing(true)}
                  className="p-1 text-gray-400 hover:text-[#00C2CB] hover:bg-[#00C2CB]/10 rounded-full transition-colors"
                >
                  <Icons.Edit />
                </button>
              </div>
              <p className="text-sm text-gray-500 font-medium mt-0.5">
                {device.location ? `${device.location.building || ''} ${device.location.room ? '• ' + device.location.room : ''}` : ''}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Icons.Close />
          </button>
        </div>

        {/* Panel Content */}
        <div className="p-6 space-y-8">
           {/* Vape Prediction Section - Modernized */}
           {device.sensorData && (
            <div className={`
              relative overflow-hidden rounded-2xl p-5 border
              ${device.status === 'offline'
                ? 'bg-gray-50 border-gray-200 ring-1 ring-gray-300'
                : device.sensorData.predictedClass === 'vape' 
                  ? 'bg-red-50 border-red-100 ring-1 ring-red-200'
                  : device.sensorData.predictedClass === 'calibrating'
                    ? 'bg-blue-50 border-blue-100 ring-1 ring-blue-200'
                    : device.sensorData.predictedClass === 'suspected'
                      ? 'bg-orange-50 border-orange-100 ring-1 ring-orange-200'
                      : 'bg-[#00C2CB]/5 border-[#00C2CB]/20 ring-1 ring-[#00C2CB]/20'
              }
            `}>
              <div className="flex justify-between items-center relative z-10">
                <div className="flex items-center space-x-3">
                  <div className={`
                    p-2 rounded-full
                    ${device.status === 'offline' ? 'bg-gray-200 text-gray-500' :
                      device.sensorData.predictedClass === 'vape' ? 'bg-red-100 text-red-600' :
                      device.sensorData.predictedClass === 'calibrating' ? 'bg-blue-100 text-blue-600' :
                      device.sensorData.predictedClass === 'suspected' ? 'bg-orange-100 text-orange-600' :
                      'bg-[#00C2CB]/10 text-[#00C2CB]'}
                  `}>
                    {device.status === 'offline' ? <Icons.Close /> :
                     device.sensorData.predictedClass === 'vape' ? <Icons.Warning /> :
                     device.sensorData.predictedClass === 'calibrating' ? <span className="text-xl">⚙️</span> :
                     device.sensorData.predictedClass === 'suspected' ? <span className="text-xl">⚠️</span> :
                     <Icons.Check />}
                  </div>
                  <div>
                    <h3 className={`text-sm font-semibold uppercase tracking-wide
                      ${device.status === 'offline' ? 'text-gray-600' :
                        device.sensorData.predictedClass === 'vape' ? 'text-red-800' :
                        device.sensorData.predictedClass === 'calibrating' ? 'text-blue-800' :
                        device.sensorData.predictedClass === 'suspected' ? 'text-orange-800' :
                        'text-[#00C2CB]'}
                    `}>
                      Current Status
                    </h3>
                    <p className={`text-lg font-bold
                      ${device.status === 'offline' ? 'text-gray-700' :
                        device.sensorData.predictedClass === 'vape' ? 'text-red-700' :
                        device.sensorData.predictedClass === 'calibrating' ? 'text-blue-700' :
                        device.sensorData.predictedClass === 'suspected' ? 'text-orange-700' :
                        'text-[#00C2CB]'}
                    `}>
                      {device.status === 'offline' ? 'Device Offline' :
                       device.sensorData.predictedClass === 'vape' ? 'Vape Detected' :
                       device.sensorData.predictedClass === 'calibrating' ? 'Calibrating...' :
                       device.sensorData.predictedClass === 'suspected' ? 'Suspected Activity' :
                       'Normal Atmosphere'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-xs font-medium text-gray-500 uppercase">Confidence</span>
                  <span className={`text-2xl font-bold
                    ${device.status === 'offline' ? 'text-gray-400' :
                      device.sensorData.predictedClass === 'vape' ? 'text-red-700' :
                      device.sensorData.predictedClass === 'calibrating' ? 'text-blue-700' :
                      device.sensorData.predictedClass === 'suspected' ? 'text-orange-700' :
                      'text-emerald-700'}
                  `}>
                    {device.sensorData.confidence}%
                  </span>
                </div>
              </div>
              
              {/* Animated Background for Alarm */}
              {device.status !== 'offline' && device.sensorData.predictedClass === 'vape' && (
                <div className="absolute inset-0 bg-red-400/5 animate-pulse" />
              )}
            </div>
          )}

          {/* Sensor Readings Section - Grid Cards */}
          {device.sensorData && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Live Readings</h3>
                <span className="text-xs text-gray-500">
                  Updated: {new Date(device.sensorData.timestamp).toLocaleTimeString()}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Humidity</span>
                    <span className="text-blue-500"><Icons.Humidity /></span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{Number(device.sensorData.humidity).toFixed(2)}<span className="text-sm font-normal text-gray-500 ml-1">%</span></div>
                </div>
                
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-purple-200 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">PM2.5</span>
                    <span className="text-purple-500"><Icons.PM25 /></span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{device.sensorData.pm25}<span className="text-sm font-normal text-gray-500 ml-1">μg/m³</span></div>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-orange-200 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Temp</span>
                    <span className="text-orange-500"><Icons.Temp /></span>
                  </div>
                  <div className="flex items-baseline">
                    <span className="text-2xl font-bold text-gray-900">{toFahrenheit(device.sensorData.temperature) || '--'}</span>
                    <span className="text-sm font-normal text-gray-500 ml-1">°F</span>
                    {device.sensorData.temperature !== undefined && (
                      <span className="text-xs text-gray-400 ml-2 font-medium">
                        ({Number(device.sensorData.temperature).toFixed(1)}°C)
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-green-200 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">Gas Res</span>
                    <span className="text-green-500"><Icons.Gas /></span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatGasResistance(device.sensorData.gasResistance).split(' ')[0]}
                    <span className="text-sm font-normal text-gray-500 ml-1">kΩ</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Graph Section */}
          {history.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Sensor Trends</h3>
              <div className="h-64 bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <Line options={chartOptions} data={chartData} />
              </div>
            </div>
          )}

          {/* Location & Metadata Section */}
          <div>
             <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Location & Meta</h3>
                <button onClick={() => setIsEditing(true)} className="text-xs text-blue-600 font-medium hover:underline">Edit</button>
              </div>
              
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                <div className="flex items-center p-4">
                  <div className="w-8 text-gray-400"><Icons.Building /></div>
                  <div className="flex-1">
                    <span className="block text-xs text-gray-500">Building</span>
                    <span className="block text-sm font-semibold text-gray-900">{device.location.building}</span>
                  </div>
                </div>
                <div className="flex items-center p-4">
                  <div className="w-8 text-gray-400"><Icons.Floor /></div>
                  <div className="flex-1">
                    <span className="block text-xs text-gray-500">Floor</span>
                    <span className="block text-sm font-semibold text-gray-900">{device.location.floor}</span>
                  </div>
                </div>
                <div className="flex items-center p-4">
                  <div className="w-8 text-gray-400"><Icons.Room /></div>
                  <div className="flex-1">
                    <span className="block text-xs text-gray-500">Room</span>
                    <span className="block text-sm font-semibold text-gray-900">{device.location.room}</span>
                  </div>
                </div>
                <div className="flex items-center p-4 bg-gray-50/50">
                  <div className="w-8"></div>
                  <div className="flex-1 grid grid-cols-2 gap-4">
                     <div>
                        <span className="block text-xs text-gray-500">Last Seen</span>
                        <span className="block text-sm font-medium text-gray-900">{formatTimestamp(device.lastSeen)}</span>
                     </div>
                     <div>
                        <span className="block text-xs text-gray-500">Uptime</span>
                        <span className="block text-sm font-medium text-gray-900">{device.uptime || '99.9%'}</span>
                     </div>
                  </div>
                </div>
              </div>
          </div>

          {/* Actions Section */}
          <div className="pb-8">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Historical Logs</h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {history.map((reading, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                    <div className="flex items-center space-x-3">
                      <div className={`
                        w-2 h-2 rounded-full
                        ${reading.predictedClass === 'vape' ? 'bg-red-500' :
                          reading.predictedClass === 'calibrating' ? 'bg-blue-500' :
                          reading.predictedClass === 'suspected' ? 'bg-orange-500' :
                          'bg-green-500'}
                      `}></div>
                      <div>
                        <span className="block text-xs text-gray-500 font-medium">
                          {new Date(reading.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="block text-sm text-gray-700">
                          Hum: {Number(reading.humidity).toFixed(1)}% • PM2.5: {reading.pm25}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className={`
                        inline-flex items-center px-2 py-1 rounded text-xs font-medium
                        ${reading.predictedClass === 'vape' ? 'bg-red-100 text-red-700' :
                          reading.predictedClass === 'calibrating' ? 'bg-blue-100 text-blue-700' :
                          reading.predictedClass === 'suspected' ? 'bg-orange-100 text-orange-700' :
                          'bg-green-100 text-green-700'}
                      `}>
                        {reading.predictedClass === 'vape' ? 'Vape Detected' :
                         reading.predictedClass === 'calibrating' ? 'Calibrating' :
                         reading.predictedClass === 'suspected' ? 'Suspected' :
                         'Normal'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Edit Modal - Modernized */}
      {isEditing && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Edit Device</h3>
              <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-600">
                <Icons.Close />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Device Name</label>
                <input 
                  type="text" 
                  value={editForm.name} 
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00C2CB] focus:border-[#00C2CB] outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Building</label>
                    <input 
                    type="text" 
                    value={editForm.building} 
                    onChange={(e) => setEditForm({...editForm, building: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00C2CB] focus:border-[#00C2CB] outline-none transition-all"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Floor</label>
                    <input 
                    type="text" 
                    value={editForm.floor} 
                    onChange={(e) => setEditForm({...editForm, floor: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
                    <input 
                    type="text" 
                    value={editForm.room} 
                    onChange={(e) => setEditForm({...editForm, room: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
              <button 
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>
              <button 
                className="px-4 py-2 text-sm font-medium text-white bg-[#00C2CB] rounded-lg hover:bg-[#009FA6] shadow-sm"
                onClick={handleSaveEdit}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DeviceDetailPanel;
