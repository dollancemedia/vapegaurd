import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

const SchoolNotificationSystem = forwardRef(({ events, isConnected }, ref) => {
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastEventId, setLastEventId] = useState(null);
  const hasNotifications = typeof window !== 'undefined' && 'Notification' in window;
  const [permissionStatus, setPermissionStatus] = useState(hasNotifications ? Notification.permission : 'unsupported');
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const [showManualInstruction, setShowManualInstruction] = useState(false);
  
  const audioRef = useRef(null);
  const alertTimeoutRef = useRef({});
  const mutedDevicesRef = useRef({}); // Map of deviceId -> timestamp (when mute expires)
  const globalMuteUntilRef = useRef(0); // Timestamp until which ALL alerts are muted

  const checkPermission = () => {
    if (!hasNotifications) {
      setPermissionStatus('unsupported');
      setShowPermissionBanner(false);
      return;
    }
    if (Notification.permission === 'granted') {
      setPermissionStatus('granted');
      setShowPermissionBanner(false);
    } else if (Notification.permission === 'denied') {
      setPermissionStatus('denied');
      setShowPermissionBanner(true);
    } else {
      setPermissionStatus('default');
      setShowPermissionBanner(true);
    }
  };

  // Initialize audio and request notification permission
  useEffect(() => {
    // Create audio context for alert sounds
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';

    // Check permission status
    if (hasNotifications) {
      checkPermission();
    } else {
      setPermissionStatus('unsupported');
      setShowPermissionBanner(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRequestPermission = () => {
    if (!hasNotifications) {
      setPermissionStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
        // If denied, we cannot programmatically request again. 
        // We must instruct the user to change settings manually.
        setShowManualInstruction(true);
        // Explicitly alert the user to look at the top of the screen/browser
        alert("Your browser has blocked notifications for this site.\n\nPlease click the lock icon 🔒 in your address bar and set 'Notifications' to 'Allow'.");
        return;
    }

    Notification.requestPermission().then(permission => {
      setPermissionStatus(permission);
      
      if (permission === 'granted') {
        setShowPermissionBanner(false);
        setShowManualInstruction(false);
        // Test notification
        if (hasNotifications) {
          new Notification("Notifications Enabled", {
              body: "You will now receive alerts for vape and fire detections.",
              icon: '/logo-2.png'
          });
        }
      } else if (permission === 'denied') {
          setShowPermissionBanner(true);
      }
    });
  };

  const handleIgnorePermission = () => {
    setShowPermissionBanner(false);
    setShowManualInstruction(false);
  };
  
  // Unused state check suppression
  useEffect(() => {
    // These are used in render but linter thinks unused
    if (permissionStatus === 'granted') {
      // no-op
    }
  }, [permissionStatus]);

  // Expose triggerSchoolAlert function to parent components
  useImperativeHandle(ref, () => ({
    triggerAlert: triggerSchoolAlert
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // Monitor for new vape/fire events (only from real-time socket events, not test events)
  useEffect(() => {
    if (!events || events.length === 0) return;

    const latestEvent = events[0];
    
    // Skip test events to avoid duplicate notifications
    if (latestEvent.id && latestEvent.id.startsWith('test-')) {
      return;
    }

    // Only trigger for new events we haven't seen yet
    if (latestEvent.id !== lastEventId) {
      setLastEventId(latestEvent.id);
      
      // Determine severity
      let severity = 'info';
      if (latestEvent.type === 'vape') severity = 'warning';
      if (latestEvent.type === 'fire') severity = 'critical';
      if (latestEvent.type === 'tamper') severity = 'critical';
      
      // Trigger alert if it's significant
      if (['vape', 'fire', 'tamper'].includes(latestEvent.type)) {
        triggerSchoolAlert({
          id: latestEvent.id,
          device_id: latestEvent.device_id,
          type: latestEvent.type,
          location: latestEvent.location,
          timestamp: latestEvent.timestamp,
          severity: severity
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]); // lastEventId is managed internally

  const triggerSchoolAlert = (event) => {
    // Check if device is muted - Top Level Check
    // This prevents ANY reaction (Sound, UI, Browser) if the device is muted
    if (event.device_id) {
        const muteUntil = mutedDevicesRef.current[event.device_id];
        if (muteUntil && Date.now() < muteUntil) {
            return;
        }
    }

    // More robust duplicate detection
    const eventIdentifier = event.id || event.timestamp;
    
    // Check if we already have an alert for this event to prevent duplicates
    const existingAlertIndex = activeAlerts.findIndex(alert => {
      const alertEventId = alert.event.id || alert.event.timestamp;
      return alertEventId === eventIdentifier && alert.event.type === event.type;
    });
    
    // If this event already has an alert, don't create a new one
    if (existingAlertIndex >= 0) {
      return;
    }
    
    // Also check if this is the same as lastEventId to prevent duplicates
    if (eventIdentifier === lastEventId) {
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
    if (soundEnabled && event.type !== 'offline') {
      playAlertSound(event.type);
    }

    // Trigger native browser notification
    if (hasNotifications && Notification.permission === "granted") {
      try {
        const n = new Notification(`SCHOOL ALERT: ${event.type.toUpperCase()} DETECTED`, {
          body: `Location: ${event.location}\nConfidence: ${event.confidence}%`,
          icon: '/logo-2.png',
          requireInteraction: true
        });
        n.onclick = () => { window.focus(); };
      } catch (e) {
        console.error("Native notification failed:", e);
      }
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
    // Find the alert to get the device ID
    const alert = activeAlerts.find(a => a.id === alertId);
    if (alert && alert.event && alert.event.device_id) {
        // Mute THIS device for 10 minutes (10 * 60 * 1000 ms)
        mutedDevicesRef.current[alert.event.device_id] = Date.now() + 600000;
    }

    // Start exit animation first
    setActiveAlerts(prev => 
      prev.map(alert => 
        alert.id === alertId ? { ...alert, isExiting: true } : alert
      )
    );

    // Clear auto-dismiss timeout
    if (alertTimeoutRef.current[alertId]) {
      clearTimeout(alertTimeoutRef.current[alertId]);
      delete alertTimeoutRef.current[alertId];
    }
    
    // Remove the alert after animation completes (e.g., 400ms)
    alertTimeoutRef.current[alertId] = setTimeout(() => {
      dismissAlert(alertId);
    }, 400); // Match animation duration
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
      {/* Permission Denied Banner */}
      {showPermissionBanner && (
        <div style={{
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            backgroundColor: '#ef4444',
            color: 'white',
            padding: '12px 24px',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>⚠️</span>
                <div>
                    <strong>Notifications Blocked</strong>
                    <span style={{ marginLeft: '8px', opacity: 0.9 }}>
                        {showManualInstruction 
                            ? "Browser has blocked notifications. Click the 🔒 icon in the URL bar to enable them."
                            : "Please allow browser notifications to receive real-time vape alerts."
                        }
                    </span>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
                {!showManualInstruction && (
                    <button 
                        onClick={handleRequestPermission}
                        style={{
                            backgroundColor: 'white',
                            color: '#ef4444',
                            border: 'none',
                            padding: '6px 16px',
                            borderRadius: '4px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        Allow Notifications
                    </button>
                )}
                <button 
                    onClick={handleIgnorePermission}
                    style={{
                        backgroundColor: 'transparent',
                        color: 'white',
                        border: '1px solid white',
                        padding: '6px 16px',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Ignore
                </button>
            </div>
        </div>
      )}

      {/* Notification Settings */}
      <div className="notification-settings" style={{ display: 'none' }}> {/* Hidden but functional if needed */}
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
              className={`school-alert ${alert.event.type}-alert ${alert.isExiting ? 'exiting' : 'active'}`}
            >
              <div className="alert-content-wrapper">
                <div className="alert-header">
                  <div className="alert-icon-wrapper">
                    <span className="alert-icon">{getAlertIcon(alert.event.type)}</span>
                  </div>
                  <div className="alert-title-section">
                    <div className="title-row">
                        <h3 className="alert-title">
                        {alert.event.type.toUpperCase()} DETECTED
                        </h3>
                        {!alert.acknowledged && <span className="urgent-badge">URGENT</span>}
                        <span className="alert-time">{alert.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div className="alert-details-compact">
                        <span className="detail-item">{alert.event.location}</span>
                        <span className="separator">•</span>
                        <span className="detail-item">{alert.event.device_id}</span>
                    </div>
                  </div>
                  <button
                    className="btn-dismiss-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissAlert(alert.id);
                    }}
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="alert-body">
                  <div className="confidence-bar-compact">
                    <div className="confidence-label">
                        <span>Confidence</span>
                        <span className="confidence-value">{alert.event.confidence}%</span>
                    </div>
                    <div className="progress-bg">
                        <div 
                            className="progress-fill" 
                            style={{ 
                                width: `${alert.event.confidence}%`,
                                backgroundColor: getAlertColor(alert.event.type)
                            }}
                        />
                    </div>
                  </div>

                  <div className="alert-actions-footer">
                    {!alert.acknowledged ? (
                        <button
                        className="btn-acknowledge-full"
                        onClick={(e) => {
                            e.stopPropagation();
                            acknowledgeAlert(alert.id);
                        }}
                        >
                        Acknowledge Alert
                        </button>
                    ) : (
                        <div className="acknowledged-status">
                            <span>✓ Acknowledged</span>
                        </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
});

export default SchoolNotificationSystem;
