import React from 'react';

const TestAlertButton = ({ onTestAlert, onDirectAlert }) => {
  const triggerTestVapeAlert = () => {
    const testEvent = {
      id: `test-vape-${Date.now()}`,
      device_id: 'test-device-01',
      type: 'vape',
      confidence: 85,
      location: 'School Bathroom - 2nd Floor',
      timestamp: new Date().toISOString()
    };
    
    // Add to events list for display in table
    onTestAlert(testEvent);
    
    // Trigger direct alert notification (if available)
    if (onDirectAlert) {
      onDirectAlert(testEvent);
    }
  };

  const triggerTestFireAlert = () => {
    const testEvent = {
      id: `test-fire-${Date.now()}`,
      device_id: 'test-device-02',
      type: 'fire',
      confidence: 92,
      location: 'Chemistry Lab',
      timestamp: new Date().toISOString()
    };
    
    // Add to events list for display in table
    onTestAlert(testEvent);
    
    // Trigger direct alert notification (if available)
    if (onDirectAlert) {
      onDirectAlert(testEvent);
    }
  };

  return (
    <div className="test-alert-controls">
      <h4>🧪 Test Alert System</h4>
      <p className="test-description">Use these buttons to test the school notification system:</p>
      <div className="test-buttons">
        <button 
          className="test-btn vape-test"
          onClick={triggerTestVapeAlert}
        >
          💨 Test Vape Alert
        </button>
        <button 
          className="test-btn fire-test"
          onClick={triggerTestFireAlert}
        >
          🔥 Test Fire Alert
        </button>
      </div>
      <p className="test-note">
        <strong>Note:</strong> These are test alerts for demonstration purposes only.
      </p>
    </div>
  );
};

export default TestAlertButton;