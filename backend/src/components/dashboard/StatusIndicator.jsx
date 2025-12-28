import React from 'react';

const StatusIndicator = ({ isConnected, isLoading, hasApiData }) => {
  let statusText = '';
  let statusClass = '';

  if (isLoading) {
    statusText = 'Connecting...';
    statusClass = 'status-connecting';
  } else if (isConnected) {
    statusText = 'Connected';
    statusClass = 'status-connected';
  } else if (hasApiData) {
    statusText = 'Connected (API)';
    statusClass = 'status-api';
  } else {
    statusText = 'Disconnected';
    statusClass = 'status-disconnected';
  }

  return (
    <div className={`status-indicator ${statusClass}`}>
      <span className="status-dot" />
      <span className="status-text">{statusText}</span>
    </div>
  );
};

export default StatusIndicator;