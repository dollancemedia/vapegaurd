import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
// Socket.IO client removed; using native WebSocket via hook
import { useWebSocket } from '../hooks/useWebSocket';

// Import components
import SensorReadings from '../components/SensorReadings';
import DeviceMap from '../components/DeviceMap';
import LatestReading from '../components/LatestReading';
import EventsTable from '../components/EventsTable';
import StatusIndicator from '../components/StatusIndicator';
import ConnectionErrorMessage from '../components/ConnectionErrorMessage';
import DataSourceIndicator from '../components/DataSourceIndicator';
import RefreshButton from '../components/RefreshButton';
import BulkLabelingTool from '../components/BulkLabelingTool';
// import SchoolNotificationSystem from '../components/SchoolNotificationSystem'; // DISABLED - removed popup notifications


// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const Dashboard = () => {
  // Treat data as live only when it carries a server timestamp and is fresh
  const STALE_SECONDS = 300; // Increased to 5 minutes to tolerate latency/clock skew
  const isFresh = (ts) => {
    if (!ts) return false;
    const t = Date.parse(ts);
    if (Number.isNaN(t)) return false;
    const diff = Date.now() - t;
    // Allow data up to STALE_SECONDS old, and up to 60 seconds in the future (clock skew)
    return diff < STALE_SECONDS * 1000 && diff > -60000;
  };

  const [events, setEvents] = useState([]);
  const [sensorData, setSensorData] = useState([]);
  const [latestReading, setLatestReading] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null); // Add state for map selection
  const [isUsingSampleData, setIsUsingSampleData] = useState(false);
  const [lastLiveTs, setLastLiveTs] = useState(null);
  const [isPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);
  // const notificationSystemRef = useRef(null); // DISABLED - removed popup notifications

  // Get Clerk token
  const { getToken } = useAuth();
  const [token, setToken] = useState(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const t = await getToken();
        setToken(t);
      } catch (error) {
        console.error("Error fetching Clerk token:", error);
      }
    };
    fetchToken();
  }, [getToken]);

  // Connect to native WebSocket server via shared hook
  const { reconnect } = useWebSocket('/ws/events', {
    reconnectInterval: 3000,
    maxReconnectAttempts: 5,
    heartbeatInterval: 30000,
    queryParams: { token },
    onMessage: (data) => {
      if (pausedRef.current) return;
      // Handle legacy frontend types
      if (data && data.type === 'newEvent' && data.event) {
        setEvents((prevEvents) => [data.event, ...prevEvents].slice(0, 1));
        return;
      }

      // Handle backend FastAPI websocket messages: type "sensor_data"
      if (data && (data.type === 'sensor_data' || data.type === 'newSensorData')) {
        const payload = data.data || data;

        // Two possible shapes:
        // A) { device_id, sensor_data: { ...reading } }
        // B) { ...reading, predicted_class?, confidence?, prediction? }
        let reading = payload.sensor_data
          ? {
              ...payload.sensor_data,
              device_id: payload.device_id || payload.sensor_data.device_id,
              timestamp: payload.sensor_data.timestamp || payload.timestamp || null,
            }
          : {
              ...payload,
              timestamp: payload.timestamp || null,
            };

        // Only accept readings that carry a server-provided timestamp
        if (!reading.timestamp) {
          return;
        }

        // Ignore stale or replayed readings
        if (!isFresh(reading.timestamp)) {
          return;
        }

        // Normalize field names expected by UI components
        reading = {
          ...reading,
          volume_spike:
            reading.volume_spike ?? reading.sound_level ?? reading.volumeSpike ?? 0,
          particle_size:
            reading.particle_size ?? reading.particleSize ?? reading.particle_size_nm ?? 0,
        };

        // Map predicted_class/confidence into prediction object if present
        if (!reading.prediction && (payload.predicted_class || payload.confidence !== undefined)) {
          reading.prediction = {
            type: payload.predicted_class || 'normal',
            confidence: payload.confidence ?? 0,
          };
        }

        // Update sensor readings state
        setSensorData((prevData) => {
          const newData = [reading, ...prevData];
          return newData.length > 20 ? newData.slice(0, 20) : newData;
        });
        setLatestReading(reading);
        setLastLiveTs(Date.now());

        // Also surface an event row when classification is present
        const hasEventInfo =
          (payload.prediction && payload.prediction.type) || payload.predicted_class;
        if (hasEventInfo) {
          const event = {
            _id: payload._id || payload.id,
            timestamp: reading.timestamp,
            type: (payload.prediction && payload.prediction.type) || payload.predicted_class || 'normal',
            confidence:
              (payload.prediction && payload.prediction.confidence) ?? payload.confidence ?? 0,
            device_id: payload.device_id || reading.device_id,
            location: payload.location || reading.location || 'Unknown',
            verified: payload.verified ?? false,
          };
          setEvents((prevEvents) => [event, ...prevEvents].slice(0, 1));
        }
      }
    },
    onOpen: () => setIsConnected(true),
    onClose: () => setIsConnected(false),
    onError: () => setIsConnected(false)
  });

  // lastMessage is available if needed for debugging

  // Function to fetch data from the backend
  const fetchData = useCallback(async () => {
    if (pausedRef.current) return; // Do not fetch when paused
    setIsLoading(true);
    
    
    try {
      // console.log('Fetching data from backend...');
      
      // Fetch recent events
      // console.log('Fetching events from http://localhost:8000/api/events?limit=10');
      const apiBase = process.env.REACT_APP_API_URL || '/api';
      const eventsResponse = await axios.get(`${apiBase}/events?limit=10`);
      // Keep only the most recent event for display
      const eventsData = Array.isArray(eventsResponse.data) 
        ? eventsResponse.data
            .filter(e => e && e.timestamp && isFresh(e.timestamp))
            .map(e => ({
              ...e,
              type: e.predicted_class || 'normal',
              confidence: e.confidence ?? 0
            }))
            .slice(0, 1)
        : [];
      setEvents(eventsData);

      // Fetch recent sensor data
      // console.log('Fetching sensor data from http://localhost:8000/api/sensor-data');
      const sensorResponse = await axios.get(`${apiBase}/sensor-data`);
      // console.log('Sensor data response:', sensorResponse.data);
      
      if (sensorResponse.data && Array.isArray(sensorResponse.data)) {
        const withTimestamps = sensorResponse.data.filter(d => d && d.timestamp);
        const freshData = withTimestamps.filter(d => isFresh(d.timestamp)).reverse();
        setSensorData(freshData);
        setLatestReading(freshData.length > 0 ? freshData[0] : null);
        setIsUsingSampleData(false);
      } else {
        // console.error('Invalid sensor data format:', sensorResponse.data);
        throw new Error('Invalid sensor data format');
      }
      
      // console.log('Data fetched successfully');
      return true; // Successful fetch
    } catch (error) {
      // console.error('Error fetching data:', error);
      // Do not inject sample data; reflect empty state to prove live data
      setSensorData([]);
      setLatestReading(null);
      setEvents([]);
      setIsUsingSampleData(false);
      return false; // Failed fetch
    } finally {
      setIsLoading(false);
    }
  }, []); // No external dependencies needed

  // Polling disabled temporarily to prevent periodic refreshes



  // Fetch initial data
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chart data removed - was unused

  // Chart options and alert class helper removed - were unused

  // Loading state for UI components
  const [isLoading, setIsLoading] = useState(true);
  
  // derive API data availability from current state (only count fresh data)
  const hasFreshSensorData = Array.isArray(sensorData) && sensorData.some(d => isFresh(d.timestamp));
  const hasFreshEvents = Array.isArray(events) && events.some(e => isFresh(e.timestamp));
  const hasApiData = hasFreshSensorData || hasFreshEvents;
  const isLive = hasApiData || (lastLiveTs && (Date.now() - lastLiveTs) < STALE_SECONDS * 1000);
  
  // Handle event updates (like verification status changes)
  const handleEventUpdate = (updatedEvent) => {
    setEvents(prevEvents => {
      return prevEvents.map(event => {
        // Match by _id if available, otherwise by id or timestamp
        if ((event._id && event._id === updatedEvent._id) || 
            (event.id && event.id === updatedEvent.id) || 
            (event.timestamp === updatedEvent.timestamp)) {
          return updatedEvent;
        }
        return event;
      });
    });
  };

  return (
    <div className="dashboard">
      <SchoolNotificationSystem 
        ref={notificationSystemRef}
        events={events} 
        isConnected={isConnected} 
      />
      
      <div className="container">
        <div className="dashboard-header mb-8">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <img src="/logo-2.png" alt="Mistio Logo" className="h-12 w-auto" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900 m-0">Dashboard</h1>
                <p className="text-gray-500 text-sm mt-1">Real-time monitoring and detection system</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <DataSourceIndicator isUsingSampleData={isUsingSampleData} />
                <StatusIndicator isConnected={!!isLive} isLoading={isLoading} hasApiData={hasApiData} />
              </div>
              <RefreshButton onRefresh={fetchData} />
            </div>
          </div>
          

        </div>
        
        <div className="row">
            <div className="col-md-12">
              <ConnectionErrorMessage isConnected={!!isLive} hasApiData={hasApiData} retryConnection={reconnect} />
            </div>
          </div>
         
          <div className="row mt-4">
            <div className="col-md-8">
              <DeviceMap 
                devices={events.map(e => ({...e, id: e.device_id}))} 
                selectedDevice={selectedDevice}
                onDeviceSelect={setSelectedDevice}
                onRefresh={fetchData}
              />
              <SensorReadings sensorData={sensorData} isLoading={isLoading} />
            </div>
          <div className="col-md-4">
            <LatestReading latestReading={latestReading} isLoading={isLoading} />
          </div>
        </div>
        
        <div className="row mt-4">
          <div className="col-12">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3>Event Management</h3>
              <BulkLabelingTool 
                onLabelingComplete={(result) => {
                  console.log('Bulk labeling completed:', result);
                  // Refresh events to show updated labels
                  fetchData();
                }}
              />
            </div>
            <EventsTable 
              events={events} 
              isLoading={isLoading} 
              onEventUpdate={handleEventUpdate} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;