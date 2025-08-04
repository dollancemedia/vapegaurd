import React, { useState } from 'react';
import axios from 'axios';

const EventFeedback = ({ event, onFeedbackSubmitted }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('false_positive');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Only proceed if we have a valid event ID
      if (!event || !event._id) {
        throw new Error('Invalid event data');
      }

      const response = await axios.post(
        `http://localhost:8000/api/events/${event._id}/feedback`,
        { feedback_type: feedbackType, notes }
      );

      // Reset form and close modal
      setNotes('');
      setFeedbackType('false_positive');
      setIsOpen(false);

      // Notify parent component
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted(response.data);
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button 
        className="btn btn-sm btn-outline-secondary" 
        onClick={() => setIsOpen(true)}
        disabled={!event || !event._id}
      >
        Add Feedback
      </button>

      {isOpen && (
        <div className="modal d-block" tabIndex="-1" role="dialog" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Submit Feedback for Event</h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => setIsOpen(false)}
                  disabled={isSubmitting}
                ></button>
              </div>
              <div className="modal-body">
                {error && (
                  <div className="alert alert-danger" role="alert">
                    {error}
                  </div>
                )}
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label htmlFor="feedbackType" className="form-label">Feedback Type</label>
                    <select 
                      id="feedbackType" 
                      className="form-select" 
                      value={feedbackType}
                      onChange={(e) => setFeedbackType(e.target.value)}
                      disabled={isSubmitting}
                    >
                      <option value="false_positive">False Positive</option>
                      <option value="false_negative">False Negative</option>
                      <option value="correct_detection">Correct Detection</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label htmlFor="notes" className="form-label">Notes</label>
                    <textarea 
                      id="notes" 
                      className="form-control" 
                      rows="3"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Please provide any additional details about this event..."
                      disabled={isSubmitting}
                    ></textarea>
                  </div>
                  <div className="d-flex justify-content-end">
                    <button 
                      type="button" 
                      className="btn btn-secondary me-2" 
                      onClick={() => setIsOpen(false)}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Submitting...
                        </>
                      ) : 'Submit Feedback'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EventFeedback;