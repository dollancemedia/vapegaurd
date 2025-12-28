import React, { useState } from 'react';

const RefreshButton = ({ onRefresh }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const handleRefresh = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000); // Ensure button shows animation for at least 1 second
    }
  };
  
  return (
    <button 
      className={`refresh-button ${isRefreshing ? 'refreshing' : ''}`} 
      onClick={handleRefresh}
      disabled={isRefreshing}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
      </svg>
      <span>{isRefreshing ? 'Refreshing...' : 'Refresh Data'}</span>
    </button>
  );
};

export default RefreshButton;