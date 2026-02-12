import React from 'react';

const LatestReading = ({ latestReading, isLoading }) => {
  // Helper function to determine alert class based on event type
  const getAlertClass = (type) => {
    switch (type) {
      case 'vape':
        return 'alert-danger'; // Changed to danger for vape as it's critical
      case 'fire':
        return 'alert-danger';
      case 'suspected':
      case 'suspicious':
        return 'alert-warning';
      case 'calibrating':
        return 'alert-info'; // Or a custom class if needed, info is blue usually
      default:
        return 'alert-success';
    }
  };

  const getStatusColor = (type) => {
    switch (type) {
      case 'vape': return '#EF4444'; // Red
      case 'fire': return '#DC2626'; // Dark Red
      case 'suspected': 
      case 'suspicious': return '#F97316'; // Orange
      case 'calibrating': return '#EAB308'; // Yellow
      default: return '#10B981'; // Green
    }
  };

  const getStatusIcon = (type) => {
     switch (type) {
      case 'vape': return '💨';
      case 'fire': return '🔥';
      case 'suspected': 
      case 'suspicious': return '❓';
      case 'calibrating': return '⚙️';
      default: return '✅';
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Latest Reading</h2>
        <span className="card-subtitle">Most recent sensor data</span>
      </div>
      <div className="card-body">
        {!isLoading && latestReading ? (
          <div className="latest-reading">
            <div className="reading-time">
              <span className="reading-label">Time:</span>
              <span className="reading-value">{new Date(latestReading.timestamp).toLocaleString()}</span>
            </div>
            <div className="reading-device">
              <span className="reading-label">Device ID:</span>
              <span className="reading-value">{latestReading.device_id}</span>
            </div>
            
            <div className="readings-grid">
              <div className="reading-item">
                <div className="reading-icon humidity-icon">💧</div>
                <div className="reading-name">Humidity</div>
                <div className="reading-data">{latestReading.humidity}%</div>
              </div>
              
              <div className="reading-item">
                <div className="reading-icon pm25-icon">🌫️</div>
                <div className="reading-name">PM2.5</div>
                <div className="reading-data">{latestReading.pm25} μg/m³</div>
              </div>
              
              <div className="reading-item">
                <div className="reading-icon particle-icon">⚛️</div>
                <div className="reading-name">Particle Size</div>
                <div className="reading-data">{latestReading.particle_size} nm</div>
              </div>
              
              <div className="reading-item">
                <div className="reading-icon status-icon">
                  {getStatusIcon(latestReading.prediction?.type)}
                </div>
                <div className="reading-name">Status</div>
                <div className="reading-data" style={{
                  color: getStatusColor(latestReading.prediction?.type),
                  textTransform: 'uppercase',
                  fontWeight: 'bold',
                  fontSize: '0.9rem'
                }}>
                  {latestReading.prediction?.type || 'NORMAL'}
                </div>
              </div>
            </div>
            
            {latestReading.prediction && (
              <div className={`prediction-alert ${getAlertClass(latestReading.prediction.type)}`}>
                <div className="prediction-type">
                  {getStatusIcon(latestReading.prediction.type)}
                  <span>{latestReading.prediction.type?.toUpperCase() || 'UNKNOWN'}</span>
                </div>
                <div className="prediction-confidence">
                  <div className="confidence-bar">
                    <div 
                      className="confidence-fill" 
                      style={{width: `${latestReading.prediction.confidence || 0}%`}}
                    ></div>
                  </div>
                  <span>{latestReading.prediction.confidence || 0}% confidence</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="loading-container">
            <p>No data available</p>
            {isLoading && <div className="loading-spinner"></div>}
          </div>
        )}
      </div>
    </div>
  );
};

export default LatestReading;