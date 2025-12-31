import React, { useState } from 'react';
import axios from 'axios';

const BulkLabelingTool = ({ onLabelingComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [insideLabel, setInsideLabel] = useState('vape');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const apiUrl = process.env.REACT_APP_API_URL || '/api';
      // Convert local datetime inputs to full ISO strings with timezone (Z)
      const startISO = new Date(startTime).toISOString();
      const endISO = new Date(endTime).toISOString();

      const response = await axios.post(`${apiUrl}/events/label-by-time`, {
        start_time: startISO,
        end_time: endISO,
        inside_label: insideLabel
      });

      const insideCount = (response.data && (response.data.inside_count ?? response.data.inside_range?.modified)) || 0;
      setSuccess(`Successfully labeled ${insideCount} events as "${insideLabel}" in the selected range.`);
      
      // Reset form
      setStartTime('');
      setEndTime('');
      setInsideLabel('vape');
      
      // Notify parent component
      if (onLabelingComplete) {
        onLabelingComplete(response.data);
      }
      
      // Auto-close after success
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(null);
      }, 3000);
      
    } catch (error) {
      console.error('Error bulk labeling events:', error);
      setError(error.response?.data?.detail || 'Failed to label events. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format a Date to 'YYYY-MM-DDTHH:mm:ss' in local time for datetime-local input
  const formatDateTimeLocal = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  };

  const setTimeRange = (minutes) => {
    const now = new Date();
    const start = new Date(now.getTime() - minutes * 60000);

    // Use local time values without manual timezone offset hacks
    setStartTime(formatDateTimeLocal(start));
    setEndTime(formatDateTimeLocal(now));
  };

  return (
    <div className="bulk-labeling-tool">
      <button 
        className="btn btn-primary btn-sm"
        onClick={() => setIsOpen(!isOpen)}
      >
        🏷️ Bulk Label Events
      </button>

      {isOpen && (
        <div className="bulk-labeling-modal">
          <div className="modal-backdrop" onClick={() => setIsOpen(false)} />
          <div className="modal-content">
            <div className="modal-header">
              <h5>Bulk Label Events by Time Range</h5>
              <button 
                type="button" 
                className="btn-close" 
                onClick={() => setIsOpen(false)}
              />
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && (
                  <div className="alert alert-danger">
                    {error}
                  </div>
                )}
                
                {success && (
                  <div className="alert alert-success">
                    {success}
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label">Quick Time Ranges:</label>
                  <div className="btn-group" role="group">
                    <button 
                      type="button" 
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setTimeRange(15)}
                    >
                      Last 15min
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setTimeRange(30)}
                    >
                      Last 30min
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setTimeRange(60)}
                    >
                      Last 1hr
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setTimeRange(240)}
                    >
                      Last 4hr
                    </button>
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-6">
                    <div className="mb-3">
                      <label htmlFor="startTime" className="form-label">Start Time</label>
                      <input
                        type="datetime-local"
                        step="1"
                        className="form-control"
                        id="startTime"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="mb-3">
                      <label htmlFor="endTime" className="form-label">End Time</label>
                      <input
                        type="datetime-local"
                        step="1"
                        className="form-control"
                        id="endTime"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-6">
                    <div className="mb-3">
                      <label htmlFor="insideLabel" className="form-label">
                        Label for events INSIDE time range
                      </label>
                      <select
                        className="form-select"
                        id="insideLabel"
                        value={insideLabel}
                        onChange={(e) => setInsideLabel(e.target.value)}
                      >
                        <option value="vape">Vape</option>
                        <option value="normal">Normal</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="alert alert-info">
                  <strong>Note:</strong> This will label events between {startTime && new Date(startTime).toLocaleString()} and {endTime && new Date(endTime).toLocaleString()} as "{insideLabel}".
                </div>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isSubmitting || !startTime || !endTime}
                >
                  {isSubmitting ? 'Labeling...' : 'Apply Labels'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkLabelingTool;