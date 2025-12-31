import React, { useState, useEffect } from 'react';
import { mockDataService } from '../../../services/mockDataService';
import { getSeverityColor, formatTimestamp } from '../../../utils/chartHelpers';

const AlertsPanel = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await mockDataService.getAlerts();
        setAlerts(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching alerts:', error);
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const handleAcknowledge = async (alertId) => {
    try {
      await mockDataService.acknowledgeAlert(alertId);
      setAlerts(prev => prev.map(alert => 
        alert.alertId === alertId 
          ? { ...alert, acknowledged: true }
          : alert
      ));
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    if (severityFilter !== 'all' && alert.severity !== severityFilter) return false;
    if (!showAcknowledged && alert.acknowledged) return false;
    return true;
  });

  const AlertCard = ({ alert }) => {
    const severityColor = getSeverityColor(alert.severity);

    return (
      <div 
        className={`p-4 rounded-lg border-l-4 bg-white shadow-sm hover:shadow-md transition-all duration-200 ${
          alert.acknowledged ? 'opacity-60' : ''
        }`}
        style={{ borderLeftColor: severityColor }}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-2">
              <span 
                className="px-2 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: severityColor }}
              >
                {alert.severity.toUpperCase()}
              </span>
              <span className="text-xs text-gray-500">
                {formatTimestamp(alert.timestamp)}
              </span>
            </div>
            
            <p className="text-sm text-gray-900 mb-2">{alert.message}</p>
            
            <div className="flex items-center space-x-4 text-xs text-gray-500">
              <span className="flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                {alert.deviceId}
              </span>
            </div>
          </div>
          
          {!alert.acknowledged && (
            <button
              onClick={() => handleAcknowledge(alert.alertId)}
              className="ml-3 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200"
            >
              Acknowledge
            </button>
          )}
        </div>
      </div>
    );
  };

  const severityOptions = [
    { value: 'all', label: 'All Severities' },
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' }
  ];

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Alerts</h3>
          <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 rounded-lg border-l-4 border-gray-300 bg-gray-50 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="h-5 w-12 bg-gray-300 rounded-full"></div>
                    <div className="h-3 bg-gray-300 rounded w-16"></div>
                  </div>
                  <div className="h-4 bg-gray-300 rounded w-full mb-2"></div>
                  <div className="h-3 bg-gray-300 rounded w-24"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 sm:mb-0">Alerts</h3>
        
        <div className="flex flex-wrap gap-3">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {severityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAcknowledged}
              onChange={(e) => setShowAcknowledged(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Show Acknowledged</span>
          </label>
        </div>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>No alerts to display</p>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <AlertCard key={alert.alertId} alert={alert} />
          ))
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500 text-center">
        {filteredAlerts.length} of {alerts.length} alerts shown
      </div>
    </div>
  );
};

export default AlertsPanel;