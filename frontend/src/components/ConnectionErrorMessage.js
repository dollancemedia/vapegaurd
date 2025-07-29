import React from 'react';

const ConnectionErrorMessage = ({ isConnected, retryConnection }) => {
  if (isConnected) return null;
  
  return (
    <div className="connection-error-container">
      <div className="connection-error-message">
        <div className="connection-error-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <h3>Backend Connection Error</h3>
        <p>Unable to connect to the backend server. The dashboard is currently displaying sample data.</p>
        <div className="connection-error-details">
          <ul>
            <li>Check if the backend server is running on port 5000</li>
            <li>Verify network connectivity between frontend and backend</li>
            <li>Ensure CORS is properly configured on the backend</li>
          </ul>
        </div>
        <button className="retry-button" onClick={retryConnection}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          Retry Connection
        </button>
      </div>
    </div>
  );
};

export default ConnectionErrorMessage;