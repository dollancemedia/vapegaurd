import React from 'react';

const LatestReading = ({ latestReading, isLoading }) => {
  // Helper function to determine alert class based on event type
  const getAlertClass = (type) => {
    switch (type) {
      case 'vape':
        return 'alert-warning';
      case 'fire':
        return 'alert-danger';
      default:
        return 'alert-info';
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
                <div className="reading-icon volume-icon">🔊</div>
                <div className="reading-name">Volume Spike</div>
                <div className="reading-data">{latestReading.volume_spike} dB</div>
              </div>
            </div>
            
            {latestReading.prediction && (
              <div className={`prediction-alert ${getAlertClass(latestReading.prediction.type)}`}>
                <div className="prediction-type">
                  {latestReading.prediction.type === 'vape' && '💨'}
                  {latestReading.prediction.type === 'fire' && '🔥'}
                  {latestReading.prediction.type === 'normal' && '✓'}
                  <span>{latestReading.prediction.type.toUpperCase()}</span>
                </div>
                <div className="prediction-confidence">
                  <div className="confidence-bar">
                    <div 
                      className="confidence-fill" 
                      style={{width: `${latestReading.prediction.confidence}%`}}
                    ></div>
                  </div>
                  <span>{latestReading.prediction.confidence}% confidence</span>
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