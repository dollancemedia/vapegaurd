import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOrganization } from '@clerk/clerk-react';
import { useSharedWebSocket } from '../hooks/useSharedWebSocket';
import SchoolNotificationSystem from './SchoolNotificationSystem';
import deviceService from '../services/deviceService';

const NotificationController = () => {
  const { organization } = useOrganization();
  const [events, setEvents] = useState([]);
  const [allowedDevices, setAllowedDevices] = useState(null);

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

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const saved = localStorage.getItem('notificationSettings');
        if (saved) setSettings(JSON.parse(saved));
      } catch (e) { console.error(e); }
    };
    window.addEventListener('notificationSettingsChanged', handleStorageChange);
    return () => window.removeEventListener('notificationSettingsChanged', handleStorageChange);
  }, []);

  const lastNotificationTimeRef = useRef({});

  const school = (organization?.name === 'Admin' || organization?.slug === 'admin')
    ? 'admin'
    : organization?.id;

  useEffect(() => {
    const fetchAllowedDevices = async () => {
        try {
            if (!school) return;
            const devices = await deviceService.getAllDevices(school);
            const ids = new Set(devices.map(d => d.id));
            setAllowedDevices(ids);
        } catch (err) {
            console.error("Error fetching allowed devices for notifications:", err);
        }
    };
    fetchAllowedDevices();
    const interval = setInterval(fetchAllowedDevices, 30000);
    return () => clearInterval(interval);
  }, [school]);

  const processAlert = useCallback((deviceId, predictedClass, confidence, locationStr, timestamp) => {
      if (predictedClass === 'offline' && !settings.onlineStatus) return;

      const isCritical = ['vape', 'fire', 'alarm', 'tamper'].includes(predictedClass);
      const isWarning = ['suspected', 'CONFIRMING', 'calibrating', 'CALIBRATING'].includes(predictedClass);

      if (isCritical && !settings.criticalAlerts) return;
      if (isWarning && !settings.warningAlerts) return;

      const now = Date.now();
      const lastTime = lastNotificationTimeRef.current[deviceId] || 0;
      if (now - lastTime < 10000) return;

      const newEvent = {
        id: `${deviceId}-${now}`,
        type: predictedClass,
        location: locationStr,
        confidence: confidence,
        timestamp: timestamp || new Date().toISOString(),
        device_id: deviceId
      };

      lastNotificationTimeRef.current[deviceId] = now;
      setEvents([newEvent]);
  }, [settings]);

  const handleWebSocketMessage = useCallback((message) => {
    if (!message) return;

    if (message.type === 'sensor_data' || message.type === 'newSensorData') {
      const payload = message.data || message;
      const reading = payload.sensor_data || payload;
      const deviceId = payload.device_id || (payload.sensor_data && payload.sensor_data.device_id);

      if (allowedDevices && !allowedDevices.has(deviceId)) return;

      const predictedClass = reading.predicted_class || (reading.prediction ? reading.prediction.type : 'normal');

      if (predictedClass === 'vape' || predictedClass === 'fire') {
        const confidence = reading.confidence || (reading.prediction && reading.prediction.confidence) || 0;
        if (confidence < 40) return;

        const finalDeviceId = deviceId || 'unknown-device';
        let locationStr = 'Unknown Location';
        if (reading.location) {
            locationStr = `Building: ${reading.location.building || '?'}, Room: ${reading.location.room || '?'}`;
        } else if (payload.location) {
             locationStr = `Building: ${payload.location.building || '?'}, Room: ${payload.location.room || '?'}`;
        }
        processAlert(finalDeviceId, predictedClass, confidence, locationStr, reading.timestamp);
      }
    }

    if (message.type === 'event_update') {
      const payload = message.data || message;
      const deviceId = payload.device_id;
      if (allowedDevices && !allowedDevices.has(deviceId)) return;
      const predictedClass = payload.top_class;
      if (predictedClass === 'vape' || predictedClass === 'fire') {
        const confidence = (payload.top_prob ?? 0) * 100;
        if (confidence < 40) return;
        const loc = payload.location || {};
        const locationStr = loc.building
          ? `Building: ${loc.building}, Room: ${loc.room || '?'}`
          : 'Unknown Location';
        processAlert(deviceId, predictedClass, confidence, locationStr, payload.timestamp);
      }
    }

    if (message.type === 'tamper_alert') {
      const data = message.data || message;
      const tamperDeviceId = data.device_id;
      if (allowedDevices && !allowedDevices.has(tamperDeviceId)) return;
      processAlert(
        tamperDeviceId, 'tamper', 100,
        data.message || `Tamper detected on device ${tamperDeviceId}`,
        data.timestamp || new Date().toISOString()
      );
    }
  }, [processAlert, allowedDevices]);

  const { isConnected } = useSharedWebSocket(handleWebSocketMessage);

  useEffect(() => {
    const handleDemoAlert = (e) => setEvents([e.detail]);
    window.addEventListener('demoVapeAlert', handleDemoAlert);
    return () => window.removeEventListener('demoVapeAlert', handleDemoAlert);
  }, []);

  return (
    <SchoolNotificationSystem
      events={events}
      isConnected={isConnected}
    />
  );
};

export default NotificationController;
