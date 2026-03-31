import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, useOrganization } from '@clerk/clerk-react';
import { useWebSocket } from '../hooks/useWebSocket';
import SchoolNotificationSystem from './SchoolNotificationSystem';
import deviceService from '../services/deviceService';

const NotificationController = () => {
  const { getToken } = useAuth();
  const { organization } = useOrganization();
  const [token, setToken] = useState(null);
  const [events, setEvents] = useState([]);
  const [allowedDevices, setAllowedDevices] = useState(null);
  
  // Notification Settings
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('notificationSettings');
      return saved ? JSON.parse(saved) : {
        criticalAlerts: true,
        warningAlerts: true,
        onlineStatus: true
      };
    } catch (e) {
      return { criticalAlerts: true, warningAlerts: true, onlineStatus: true };
    }
  });

  // Listen for settings changes
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const saved = localStorage.getItem('notificationSettings');
        if (saved) {
          setSettings(JSON.parse(saved));
        }
      } catch (e) { console.error(e); }
    };
    window.addEventListener('notificationSettingsChanged', handleStorageChange);
    return () => window.removeEventListener('notificationSettingsChanged', handleStorageChange);
  }, []);

  // Use ref for tracking time to avoid re-creating the WebSocket handler (which causes reconnects)
  const lastNotificationTimeRef = useRef({});

  // Determine school ID
  const school = (organization?.name === 'Admin' || organization?.slug === 'admin') 
    ? 'admin' 
    : organization?.id;

  // Fetch allowed devices for filtering WebSocket events
  useEffect(() => {
    const fetchAllowedDevices = async () => {
        try {
            if (!school) return;
            // Fetch devices using the same logic as Devices page
            const devices = await deviceService.getAllDevices(school);
            const ids = new Set(devices.map(d => d.id));
            setAllowedDevices(ids);
        } catch (err) {
            console.error("Error fetching allowed devices for notifications:", err);
        }
    };
    
    fetchAllowedDevices();
    // Poll for device list updates every 30s to catch new devices
    const interval = setInterval(fetchAllowedDevices, 30000);
    return () => clearInterval(interval);
  }, [school]);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const t = await getToken();
        setToken(t);
      } catch (error) {
        console.error("Error fetching Clerk token for notifications:", error);
      }
    };
    fetchToken();
  }, [getToken]);

  const processAlert = useCallback((deviceId, predictedClass, confidence, locationStr, timestamp) => {
      // Filter based on settings
      if (predictedClass === 'offline' && !settings.onlineStatus) return;
      
      const isCritical = ['vape', 'fire', 'alarm', 'tamper'].includes(predictedClass);
      const isWarning = ['suspected', 'CONFIRMING', 'calibrating', 'CALIBRATING'].includes(predictedClass);
      
      if (isCritical && !settings.criticalAlerts) return;
      if (isWarning && !settings.warningAlerts) return;

      const now = Date.now();
      const lastTime = lastNotificationTimeRef.current[deviceId] || 0;
          
      // Simple cooldown to prevent flood (10 seconds)
      if (now - lastTime < 10000) {
          return;
      }

      const newEvent = {
        id: `${deviceId}-${now}`, // Unique ID for this event instance
        type: predictedClass,
        location: locationStr,
        confidence: confidence,
        timestamp: timestamp || new Date().toISOString(),
        device_id: deviceId
      };

      // Update last notification time
      lastNotificationTimeRef.current[deviceId] = now;

      // Update events state (SchoolNotificationSystem watches this)
      setEvents([newEvent]);
  }, [settings]);

  const handleWebSocketMessage = useCallback((message) => {
    if (!message) return;

    // Check for sensor data updates
    if (message.type === 'sensor_data' || message.type === 'newSensorData') {
      const payload = message.data || message;
      const reading = payload.sensor_data || payload;
      const deviceId = payload.device_id || (payload.sensor_data && payload.sensor_data.device_id);
      
      // Filter out devices not belonging to this organization
      // Exception: If allowedDevices is null, we might be loading, or it might be admin.
      // But for safety, if we have a set and the device isn't in it, ignore.
      if (allowedDevices && !allowedDevices.has(deviceId)) {
          return;
      }

      const predictedClass = reading.predicted_class || (reading.prediction ? reading.prediction.type : 'normal');
      
      // Check for vape or fire detection
      if (predictedClass === 'vape' || predictedClass === 'fire') {
        // Fallback for deviceId to ensure muting always works
        const finalDeviceId = deviceId || 'unknown-device-' + (payload.location ? `${payload.location.building}-${payload.location.room}` : 'no-loc');

        const confidence = reading.confidence || (reading.prediction && reading.prediction.confidence) || 0;

        // Format location string
        let locationStr = 'Unknown Location';
        if (reading.location) {
            locationStr = `Building: ${reading.location.building || '?'}, Room: ${reading.location.room || '?'}`;
        } else if (payload.location) {
             locationStr = `Building: ${payload.location.building || '?'}, Room: ${payload.location.room || '?'}`;
        }

        processAlert(finalDeviceId, predictedClass, confidence, locationStr, reading.timestamp);
      }
    }

    // Handle confirmed events broadcast (B1 fix: event_update type)
    if (message.type === 'event_update') {
      const payload = message.data || message;
      const deviceId = payload.device_id;
      if (allowedDevices && !allowedDevices.has(deviceId)) return;
      const predictedClass = payload.top_class;
      if (predictedClass === 'vape' || predictedClass === 'fire') {
        const confidence = (payload.top_prob ?? 0) * 100;
        const loc = payload.location || {};
        const locationStr = loc.building
          ? `Building: ${loc.building}, Room: ${loc.room || '?'}`
          : 'Unknown Location';
        processAlert(deviceId, predictedClass, confidence, locationStr, payload.timestamp);
      }
    }

    // Handle tamper alerts from MSA311 accelerometer
    if (message.type === 'tamper_alert') {
      const data = message.data || message;
      const tamperDeviceId = data.device_id;

      if (allowedDevices && !allowedDevices.has(tamperDeviceId)) return;

      processAlert(
        tamperDeviceId,
        'tamper',
        100,
        data.message || `Tamper detected on device ${tamperDeviceId}`,
        data.timestamp || new Date().toISOString()
      );
    }
  }, [processAlert, allowedDevices]);

  // Listen for demo alert events from Devices page
  useEffect(() => {
    const handleDemoAlert = (e) => {
      const event = e.detail;
      setEvents([event]);
    };
    window.addEventListener('demoVapeAlert', handleDemoAlert);
    return () => window.removeEventListener('demoVapeAlert', handleDemoAlert);
  }, []);

  const { isConnected } = useWebSocket('/ws/events', {
    onMessage: handleWebSocketMessage,
    queryParams: { token }
  });

  return (
    <SchoolNotificationSystem 
      events={events} 
      isConnected={isConnected} 
    />
  );
};

export default NotificationController;
