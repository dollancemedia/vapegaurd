import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

const SchoolNotificationSystem = forwardRef(({ events, isConnected }, ref) => {
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastEventId, setLastEventId] = useState(null);
  const audioRef = useRef(null);
  const alertTimeoutRef = useRef({});

  // Initialize audio
  useEffect(() => {
    // Create audio context for alert sounds
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
  }, []);

  // Expose triggerSchoolAlert function to parent components
  useImperativeHandle(ref, () => ({
    triggerAlert: triggerSchoolAlert
  }), []);

  // Monitor for new vape/fire events (only from real-time socket events, not test events)
  useEffect(() => {
    if (!events || events.length === 0) return;

    const latestEvent = events[0];
    
    // Skip test events to avoid duplicate notifications
    if (latestEvent.id && latestEvent.id.startsWith('test-')) {
      return;
    }
    
    // Check if this is a new high-confidence vape or fire event
    // Use a more reliable way to track if we've processed this event
    const eventIdentifier = latestEvent.id || latestEvent.timestamp;
    
    // Check if we've already processed this event
    const alreadyProcessed = activeAlerts.some(alert => {
      const alertEventId = alert.event.id || alert.event.timestamp;
      return alertEventId === eventIdentifier && alert.event.type === latestEvent.type;
    });
    
    if (!alreadyProcessed && 
        eventIdentifier !== lastEventId && 
        (latestEvent.type === 'vape' || latestEvent.type === 'fire') &&
        latestEvent.confidence >= 70) {
      
      triggerSchoolAlert(latestEvent);
      setLastEventId(eventIdentifier);
    }
  }, [events, lastEventId, activeAlerts]);

  const triggerSchoolAlert = (event) => {
    // More robust duplicate detection
    const eventIdentifier = event.id || event.timestamp;
    
    // Check if we already have an alert for this event to prevent duplicates
    const existingAlertIndex = activeAlerts.findIndex(alert => {
      const alertEventId = alert.event.id || alert.event.timestamp;
      return alertEventId === eventIdentifier && alert.event.type === event.type;
    });
    
    // If this event already has an alert, don't create a new one
    if (existingAlertIndex >= 0) {
      console.log('Alert already exists for this event, not creating duplicate');
      return;
    }
    
    // Also check if this is the same as lastEventId to prevent duplicates
    if (eventIdentifier === lastEventId) {
      console.log('This event was just processed, not creating duplicate');
      return;
    }
    
    const alertId = `alert-${Date.now()}`;
    const newAlert = {
      id: alertId,
      event,
      timestamp: new Date(),
      acknowledged: false
    };

    setActiveAlerts(prev => [newAlert, ...prev.slice(0, 4)]); // Keep max 5 alerts

    // Play alert sound
    if (soundEnabled) {
      playAlertSound(event.type);
    }

    // Auto-dismiss after 30 seconds if not acknowledged
    alertTimeoutRef.current[alertId] = setTimeout(() => {
      dismissAlert(alertId);
    }, 30000);
  };

  const playAlertSound = (eventType) => {
    // Create different alert tones for different event types
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Different frequencies for different alert types
    const frequency = eventType === 'fire' ? 800 : 600;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'square';

    // Create pulsing effect
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    for (let i = 0; i < 3; i++) {
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + i * 0.5);
      gainNode.gain.setValueAtTime(0, audioContext.currentTime + i * 0.5 + 0.2);
    }

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 1.5);
  };

  const acknowledgeAlert = (alertId) => {
    setActiveAlerts(prev => 
      prev.map(alert => 
        alert.id === alertId ? { ...alert, acknowledged: true } : alert
      )
    );
    
    // Clear auto-dismiss timeout
    if (alertTimeoutRef.current[alertId]) {
      clearTimeout(alertTimeoutRef.current[alertId]);
      delete alertTimeoutRef.current[alertId];
    }
    
    // Set a timeout to automatically dismiss the acknowledged alert after 5 seconds
    alertTimeoutRef.current[alertId] = setTimeout(() => {
      dismissAlert(alertId);
    }, 5000);
  };

  const dismissAlert = (alertId) => {
    // Find the alert we're dismissing to get its event info
    const alertToDismiss = activeAlerts.find(alert => alert.id === alertId);
    
    // Remove the alert from state
    setActiveAlerts(prev => prev.filter(alert => alert.id !== alertId));
    
    // Clear timeout if exists
    if (alertTimeoutRef.current[alertId]) {
      clearTimeout(alertTimeoutRef.current[alertId]);
      delete alertTimeoutRef.current[alertId];
    }
    
    // If this was the last alert for this event, reset lastEventId to allow new alerts for this event
    if (alertToDismiss && alertToDismiss.event && alertToDismiss.event.id === lastEventId) {
      // Check if there are no other alerts for this event
      const otherAlertsForSameEvent = activeAlerts.filter(alert => 
        alert.id !== alertId && 
        alert.event.id === alertToDismiss.event.id
      );
      
      if (otherAlertsForSameEvent.length === 0) {
        // Reset lastEventId to allow new alerts for this event
        setLastEventId(null);
      }
    }
  };

  // No longer needed since we're only using in-app notifications

  const getAlertIcon = (eventType) => {
    switch (eventType) {
      case 'vape': return '💨';
      case 'fire': return '🔥';
      default: return '⚠️';
    }
  };

  const getAlertColor = (eventType) => {
    switch (eventType) {
      case 'vape': return '#f59e0b';
      case 'fire': return '#ef4444';
      default: return '#3b82f6';
    }
  };

  return (
    <>
      {/* Notification Settings */}
      <div className="notification-settings">
        <div className="settings-row">
          <label className="setting-item">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
            />
            <span>🔊 Sound Alerts</span>
          </label>
        </div>
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div className="school-alerts-container">
          {activeAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`school-alert ${alert.event.type}-alert ${alert.acknowledged ? 'acknowledged' : 'active'}`}
              style={{
                borderLeftColor: getAlertColor(alert.event.type),
                backgroundColor: alert.acknowledged ? '#f9fafb' : '#ffffff',
                zIndex: alert.acknowledged ? 1 : 2 // Ensure unacknowledged alerts appear on top
              }}
            >
              <div className="alert-header">
                <div className="alert-title">
                  <span className="alert-icon">{getAlertIcon(alert.event.type)}</span>
                  <strong>SCHOOL ALERT: {alert.event.type.toUpperCase()} DETECTED</strong>
                  {!alert.acknowledged && <span className="urgent-badge">URGENT</span>}
                </div>
                <div className="alert-actions">
                  {!alert.acknowledged && (
                    <button
                      className="btn-acknowledge"
                      onClick={(e) => {
                        e.stopPropagation(); // Stop event propagation
                        acknowledgeAlert(alert.id);
                      }}
                      style={{ position: 'relative', zIndex: 10 }} // Ensure button is clickable
                    >
                      ✓ Acknowledge
                    </button>
                  )}
                  <button
                    className="btn-dismiss"
                    onClick={(e) => {
                      e.stopPropagation(); // Stop event propagation
                      dismissAlert(alert.id);
                    }}
                    style={{ position: 'relative', zIndex: 10 }} // Ensure button is clickable
                  >
                    ✕
                  </button>
                </div>
              </div>
              
              <div className="alert-details">
                <div className="detail-row">
                  <span className="detail-label">📍 Location:</span>
                  <span className="detail-value">{alert.event.location}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">🎯 Confidence:</span>
                  <span className="detail-value">{alert.event.confidence}%</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">🕐 Time:</span>
                  <span className="detail-value">{alert.timestamp.toLocaleTimeString()}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">📱 Device:</span>
                  <span className="detail-value">{alert.event.device_id}</span>
                </div>
              </div>

              <div className="alert-instructions">
                <strong>Immediate Actions Required:</strong>
                <ul>
                  {alert.event.type === 'vape' ? (
                    <>
                      <li>🏃 Dispatch staff to {alert.event.location} immediately</li>
                      <li>📋 Document the incident for disciplinary action</li>
                      <li>👥 Check for additional students in the area</li>
                      <li>📞 Contact parents/guardians if student identified</li>
                    </>
                  ) : (
                    <>
                      <li>🚨 Initiate fire safety protocol immediately</li>
                      <li>🏃 Evacuate {alert.event.location} area</li>
                      <li>📞 Contact emergency services (911)</li>
                      <li>🔥 Activate fire suppression systems if available</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connection Status Warning */}
      {!isConnected && (
        <div className="connection-warning">
          <span className="warning-icon">⚠️</span>
          <strong>Warning:</strong> Real-time monitoring is offline. Alerts may be delayed.
        </div>
      )}
    </>  );
});

export default SchoolNotificationSystem;