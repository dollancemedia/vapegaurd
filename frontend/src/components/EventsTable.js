import React from 'react';
import axios from 'axios';

const EventsTable = ({ events, isLoading, onEventUpdate }) => {
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
  
  // Handle verification checkbox change
  const handleVerificationChange = async (event, verified) => {
    try {
      // If we have an _id, this is from the backend
      if (event._id) {
        const response = await axios.put(`http://localhost:8000/api/events/${event._id}/verify`, {
          verified: verified
        });
        
        // If we have an onEventUpdate callback, call it with the updated event
        if (onEventUpdate && response.data) {
          onEventUpdate(response.data);
        }
      } else {
        // For sample data or events without an ID, just update the local state
        const updatedEvent = { ...event, verified };
        if (onEventUpdate) {
          onEventUpdate(updatedEvent);
        }
      }
    } catch (error) {
      console.error('Error updating event verification:', error);
      alert('Failed to update verification status. Please try again.');
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
                  <th>Verified</th>
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
                    <td>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`verified-${event._id || event.id || event.timestamp}`}
                          checked={event.verified || false}
                          onChange={(e) => handleVerificationChange(event, e.target.checked)}
                        />
                        <label 
                          className="form-check-label" 
                          htmlFor={`verified-${event._id || event.id || event.timestamp}`}
                        >
                          {event.verified ? 'Verified' : 'Not verified'}
                        </label>
                      </div>
                    </td>
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