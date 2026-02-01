import React from 'react';
import axios from 'axios';
import EventFeedback from './EventFeedback';

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
      case 'normal':
        return '✓';
      default:
        return '⚠️';
    }
  };
  
  // Handle verification checkbox change
  const handleVerificationChange = async (event, verified) => {
    try {
      // If we have an _id, this is from the backend
      if (event._id) {
        const apiUrl = process.env.REACT_APP_API_URL || '/api';
        const response = await axios.put(`${apiUrl}/events/${event._id}/verify`, {
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
      console.error('Failed to update verification status. Please try again.'); // Removed popup alert
    }
  };

  // Handle actual class labeling
  const handleActualClassChange = async (event, actualClass) => {
    try {
      // Optimistically update UI
      const optimistic = { ...event, actual_class: actualClass, verified: actualClass !== 'none' };
      if (onEventUpdate) {
        onEventUpdate(optimistic);
      }

      if (event._id) {
        const API_BASE = process.env.REACT_APP_API_URL || "https://vapegaurd-production.up.railway.app";
        const apiUrl = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;
        const response = await axios.put(`${apiUrl}/events/${event._id}/label`, {
          actual_class: actualClass
        });
        
        // If we have an onEventUpdate callback, call it with the updated event
        if (onEventUpdate && response.data) {
          onEventUpdate(response.data);
        }
      } else {
        // For sample data or events without an ID, we've already optimistically updated
      }
    } catch (error) {
      console.error('Error updating event label:', error);
      console.error('Failed to update event label. Please try again.');
    }
  };

  // Helper function to get actual class badge style
  const getActualClassBadge = (actualClass) => {
    switch (actualClass) {
      case 'vape':
        return 'badge bg-warning text-dark';
      case 'normal':
        return 'badge bg-success';
      case 'none':
      default:
        return 'badge bg-secondary';
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
                  <th>Actual Class</th>
                  <th>Location</th>
                  <th>Device ID</th>
                  <th>Verified</th>
                  <th>Actions</th>
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
                          style={{width: `${event.confidence}%`, backgroundColor: '#00C2CB'}}
                        ></div>
                        <span>{event.confidence}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="actual-class-selector">
                        <select
                          className="form-select form-select-sm"
                          value={event.actual_class || 'none'}
                          onChange={(e) => handleActualClassChange(event, e.target.value)}
                        >
                          <option value="none">None</option>
                          <option value="normal">Normal</option>
                          <option value="vape">Vape</option>
                        </select>
                        <span className={`${getActualClassBadge(event.actual_class || 'none')} ms-2`}>
                          {event.actual_class || 'none'}
                        </span>
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
                    <td>
                      <EventFeedback 
                        event={event} 
                        onFeedbackSubmitted={(feedback) => {
                          console.log('Feedback submitted:', feedback);
                          // You could update the event here if needed
                        }} 
                      />
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