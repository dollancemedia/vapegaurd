import React from 'react';

const StatusIndicator = ({ isConnected, isLoading }) => {
  let statusText = 'Disconnected';
  let statusClass = 'status-disconnected';
  
  if (isLoading) {
    statusText = 'Connecting...';
    statusClass = 'status-connecting';
  } else if (isConnected) {
    statusText = 'Connected';
    statusClass = 'status-connected';
  }
  
  return (
    <div className={`status-indicator ${statusClass}`}>
      <div className="status-dot"></div>
      <span className="status-text">{statusText}</span>
    </div>
  );
};

export default StatusIndicator;