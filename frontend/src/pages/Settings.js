import React, { useState, useCallback, useRef } from 'react';
import TestAlertButton from '../components/TestAlertButton';
import SchoolNotificationSystem from '../components/SchoolNotificationSystem';

const Settings = () => {
  const [events, setEvents] = useState([]);
  const [notificationSettings, setNotificationSettings] = useState({
    soundEnabled: true,
    browserNotifications: true,
    emailAlerts: false,
    smsAlerts: false,
    alertThreshold: 70
  });
  const notificationSystemRef = useRef(null);

  // Handle test alerts for demonstration
  const handleTestAlert = useCallback((testEvent) => {
    console.log('Test alert triggered:', testEvent);
    // Add the test event to the events list for display
    setEvents(prevEvents => [testEvent, ...prevEvents.slice(0, 4)]); // Keep only 5 test events
  }, []);

  // Handle direct alert notifications (bypassing events array)
  const handleDirectAlert = useCallback((testEvent) => {
    console.log('Direct alert triggered:', testEvent);
    if (notificationSystemRef.current) {
      notificationSystemRef.current.triggerAlert(testEvent);
    }
  }, []);

  const handleSettingChange = (setting, value) => {
    setNotificationSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  const clearTestEvents = () => {
    setEvents([]);
  };

  return (
    <div className="settings-page">
      {/* School Notification System for testing */}
      <SchoolNotificationSystem 
        ref={notificationSystemRef}
        events={events} 
        isConnected={true} 
      />
      
      <div className="container">
        <div className="settings-header">
          <h1>Settings</h1>
          <p className="settings-subtitle">Configure system preferences and test notifications</p>
        </div>

        <div className="row">
          {/* Notification Settings */}
          <div className="col-md-6">
            <div className="card">
              <div className="card-header">
                <h2>Notification Settings</h2>
                <span className="card-subtitle">Configure alert preferences</span>
              </div>
              <div className="card-body">
                <div className="setting-group">
                  <label className="setting-item">
                    <input
                      type="checkbox"
                      checked={notificationSettings.soundEnabled}
                      onChange={(e) => handleSettingChange('soundEnabled', e.target.checked)}
                    />
                    <span>🔊 Sound Alerts</span>
                  </label>
                  
                  <label className="setting-item">
                    <input
                      type="checkbox"
                      checked={notificationSettings.browserNotifications}
                      onChange={(e) => handleSettingChange('browserNotifications', e.target.checked)}
                    />
                    <span>📱 Browser Notifications</span>
                  </label>
                  
                  <label className="setting-item">
                    <input
                      type="checkbox"
                      checked={notificationSettings.emailAlerts}
                      onChange={(e) => handleSettingChange('emailAlerts', e.target.checked)}
                    />
                    <span>📧 Email Alerts</span>
                  </label>
                  
                  <label className="setting-item">
                    <input
                      type="checkbox"
                      checked={notificationSettings.smsAlerts}
                      onChange={(e) => handleSettingChange('smsAlerts', e.target.checked)}
                    />
                    <span>📱 SMS Alerts</span>
                  </label>
                </div>
                
                <div className="setting-group">
                  <label className="setting-label">
                    Alert Confidence Threshold: {notificationSettings.alertThreshold}%
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    value={notificationSettings.alertThreshold}
                    onChange={(e) => handleSettingChange('alertThreshold', parseInt(e.target.value))}
                    className="threshold-slider"
                  />
                  <div className="threshold-labels">
                    <span>50%</span>
                    <span>95%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Test Controls */}
          <div className="col-md-6">
            <div className="card">
              <div className="card-header">
                <h2>System Testing</h2>
                <span className="card-subtitle">Test notification system</span>
              </div>
              <div className="card-body">
                <TestAlertButton 
                  onTestAlert={handleTestAlert} 
                  onDirectAlert={handleDirectAlert}
                />
                
                {events.length > 0 && (
                  <div className="test-events-section">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h4>Recent Test Events</h4>
                      <button 
                        className="btn btn-sm btn-outline-secondary"
                        onClick={clearTestEvents}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="test-events-list">
                      {events.map((event) => (
                        <div key={event.id} className={`test-event-item ${event.type}`}>
                          <div className="event-info">
                            <span className="event-type">
                              {event.type === 'vape' ? '💨' : '🔥'} {event.type.toUpperCase()}
                            </span>
                            <span className="event-location">{event.location}</span>
                            <span className="event-confidence">{event.confidence}%</span>
                          </div>
                          <div className="event-time">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* System Information */}
        <div className="row mt-4">
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h2>System Information</h2>
                <span className="card-subtitle">Current system status and configuration</span>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-4">
                    <div className="info-item">
                      <label>System Version:</label>
                      <span>VapeGuard v2.1.0</span>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="info-item">
                      <label>Last Updated:</label>
                      <span>{new Date().toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="info-item">
                      <label>Active Devices:</label>
                      <span>6 devices</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;