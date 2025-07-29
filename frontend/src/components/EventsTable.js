import React from 'react';

const EventsTable = ({ events, isLoading }) => {
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

  // Helper function to get icon based on event type
  const getEventIcon = (type) => {
    switch (type) {
      case 'vape':
        return '💨';
      case 'fire':
        return '🔥';
      default:
        return '✓';
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Recent Events</h2>
        <span className="card-subtitle">Detection history</span>
      </div>
      <div className="card-body">
        {!isLoading && events.length > 0 ? (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Confidence</th>
                  <th>Location</th>
                  <th>Device ID</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id || event.timestamp} className={`event-row ${getAlertClass(event.type)}`}>
                    <td>{new Date(event.timestamp).toLocaleString()}</td>
                    <td>
                      <span className="event-type-badge">
                        {getEventIcon(event.type)}
                        {event.type}
                      </span>
                    </td>
                    <td>
                      <div className="confidence-mini-bar">
                        <div 
                          className="confidence-mini-fill" 
                          style={{width: `${event.confidence}%`}}
                        ></div>
                        <span>{event.confidence}%</span>
                      </div>
                    </td>
                    <td>{event.location}</td>
                    <td>{event.device_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-data-container">
            <p>{isLoading ? 'Loading events...' : 'No events recorded'}</p>
            {isLoading && <div className="loading-spinner"></div>}
          </div>
        )}
      </div>
    </div>
  );
};

export default EventsTable;