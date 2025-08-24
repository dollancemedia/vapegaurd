import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import io from 'socket.io-client';

// Import components
import SensorReadings from '../components/SensorReadings';
import LatestReading from '../components/LatestReading';
import EventsTable from '../components/EventsTable';
import StatusIndicator from '../components/StatusIndicator';
import ConnectionErrorMessage from '../components/ConnectionErrorMessage';
import DataSourceIndicator from '../components/DataSourceIndicator';
import RefreshButton from '../components/RefreshButton';
// import SchoolNotificationSystem from '../components/SchoolNotificationSystem'; // DISABLED - removed popup notifications


// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const Dashboard = () => {
  const [events, setEvents] = useState([]);
  const [sensorData, setSensorData] = useState([]);
  const [latestReading, setLatestReading] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isUsingSampleData, setIsUsingSampleData] = useState(false);
  // const notificationSystemRef = useRef(null); // DISABLED - removed popup notifications

  // Function to initialize Socket.IO connection
  const initializeSocket = useCallback(() => {
    // Close existing socket if it exists
    if (socket) {
      socket.close();
    }
    
    const newSocket = io(process.env.REACT_APP_WS_URL || 'http://localhost:8000', {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 5000,
      transports: ['websocket', 'polling']
    });
    
    newSocket.on('connect', () => {
      // console.log('Connected to Socket.IO server');
      setIsConnected(true);
    });
    
    newSocket.on('connect_error', (err) => {
      // console.error('Socket.IO connection error:', err);
      setIsConnected(false);
    });
    
    newSocket.on('disconnect', () => {
      // console.log('Disconnected from Socket.IO server');
      setIsConnected(false);
    });
    
    setSocket(newSocket);
    return newSocket;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Connect to Socket.IO server
  useEffect(() => {
    const newSocket = initializeSocket();

    // Clean up on unmount
    return () => newSocket.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for real-time events
  useEffect(() => {
    if (!socket) return;

    socket.on('newEvent', (event) => {
      setEvents((prevEvents) => [event, ...prevEvents]);
    });

    socket.on('newSensorData', (data) => {
      setSensorData((prevData) => {
        // Keep only the last 20 readings for the chart
        const newData = [data, ...prevData];
        if (newData.length > 20) {
          return newData.slice(0, 20);
        }
        return newData;
      });
      setLatestReading(data);
    });

    return () => {
      socket.off('newEvent');
      socket.off('newSensorData');
    };
  }, [socket]);

  // Function to fetch data from the backend
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    
    // Sample data for when backend is not available
    const sampleSensorData = [
      {
        device_id: 'sample-device-01',
        humidity: 45.5,
        pm25: 26.9,
        particle_size: 282.5,
        volume_spike: 46.9,
        timestamp: new Date().toISOString(),
        prediction: { type: 'normal', confidence: 55 }
      },
      {
        device_id: 'sample-device-01',
        humidity: 48.2,
        pm25: 28.4,
        particle_size: 290.1,
        volume_spike: 48.3,
        timestamp: new Date(Date.now() - 5000).toISOString(),
        prediction: { type: 'normal', confidence: 60 }
      },
      {
        device_id: 'sample-device-01',
        humidity: 52.7,
        pm25: 35.6,
        particle_size: 310.8,
        volume_spike: 55.2,
        timestamp: new Date(Date.now() - 10000).toISOString(),
        prediction: { type: 'vape', confidence: 75 }
      },
      {
        device_id: 'sample-device-01',
        humidity: 50.1,
        pm25: 32.3,
        particle_size: 300.5,
        volume_spike: 52.1,
        timestamp: new Date(Date.now() - 15000).toISOString(),
        prediction: { type: 'fire', confidence: 85 }
      },
      {
        device_id: 'sample-device-01',
        humidity: 47.8,
        pm25: 27.5,
        particle_size: 285.3,
        volume_spike: 47.5,
        timestamp: new Date(Date.now() - 20000).toISOString(),
        prediction: { type: 'normal', confidence: 58 }
      }
    ];

    const sampleEvents = [
      {
        id: 'sample-event-01',
        device_id: 'sample-device-01',
        type: 'vape',
        confidence: 75,
        location: 'Bathroom',
        timestamp: new Date(Date.now() - 10000).toISOString()
      },
      {
        id: 'sample-event-02',
        device_id: 'sample-device-01',
        type: 'fire',
        confidence: 85,
        location: 'Kitchen',
        timestamp: new Date(Date.now() - 15000).toISOString()
      }
    ];
    
    try {
      // console.log('Fetching data from backend...');
      
      // Fetch recent events
      // console.log('Fetching events from http://localhost:8000/api/events?limit=10');
      const eventsResponse = await axios.get('http://localhost:8000/api/events?limit=10');
      // console.log('Events response:', eventsResponse.data);
      setEvents(eventsResponse.data);

      // Fetch recent sensor data
      // console.log('Fetching sensor data from http://localhost:8000/api/sensor-data');
      const sensorResponse = await axios.get('http://localhost:8000/api/sensor-data');
      // console.log('Sensor data response:', sensorResponse.data);
      
      if (sensorResponse.data && Array.isArray(sensorResponse.data)) {
        setSensorData(sensorResponse.data.reverse());
        if (sensorResponse.data.length > 0) {
          setLatestReading(sensorResponse.data[0]);
        }
        setIsUsingSampleData(false);
      } else {
        // console.error('Invalid sensor data format:', sensorResponse.data);
        throw new Error('Invalid sensor data format');
      }
      
      // console.log('Data fetched successfully');
      return true; // Successful fetch
    } catch (error) {
      // console.error('Error fetching data:', error);
      // console.log('Using sample data instead');
      // Use sample data if backend is not available
      setSensorData(sampleSensorData);
      setLatestReading(sampleSensorData[0]);
      setEvents(sampleEvents);
      setIsUsingSampleData(true);
      return false; // Failed fetch
    } finally {
      setIsLoading(false);
    }
  }, []); // No external dependencies needed



  // Fetch initial data
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chart data removed - was unused

  // Chart options and alert class helper removed - were unused

  // Loading state for UI components
  const [isLoading, setIsLoading] = useState(true);
  
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
      {/* School Notification System - DISABLED to remove popup notifications */}
      {/* <SchoolNotificationSystem 
        ref={notificationSystemRef}
        events={events} 
        isConnected={isConnected} 
      /> */}
      
      <div className="container">
        <div className="dashboard-header">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h1>Vape Detection Dashboard</h1>
              <p className="dashboard-subtitle">Real-time monitoring and detection system for school safety</p>
            </div>
            <div className="d-flex align-items-center">
              <div className="dashboard-indicators">
                <DataSourceIndicator isUsingSampleData={isUsingSampleData} />
                <StatusIndicator isConnected={isConnected} isLoading={isLoading} />
              </div>
              <RefreshButton onRefresh={fetchData} />
            </div>
          </div>
          

        </div>
        
        <div className="row">
            <div className="col-md-12">
              <ConnectionErrorMessage isConnected={isConnected} retryConnection={initializeSocket} />
            </div>
          </div>
         
          <div className="row mt-4">
            <div className="col-md-8">
            <SensorReadings sensorData={sensorData} isLoading={isLoading} />
          </div>
          <div className="col-md-4">
            <LatestReading latestReading={latestReading} isLoading={isLoading} />
          </div>
        </div>
        
        <div className="row mt-4">
          <div className="col-12">
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