const db = require('../config/database');
const logger = require('../utils/logger');
const socketHandler = require('../utils/socketHandler');

/**
 * Get all events with optional filtering by time range
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getEvents = async (req, res) => {
  try {
    const { since, type, confidence, limit = 100, offset = 0 } = req.query;
    
    // Build query with optional filters
    let query = 'SELECT * FROM events WHERE 1=1';
    const params = [];
    
    // Add time filter if provided
    if (since) {
      query += ' AND timestamp >= $' + (params.length + 1);
      params.push(new Date(since));
    }
    
    // Add type filter if provided
    if (type) {
      query += ' AND type = $' + (params.length + 1);
      params.push(type);
    }
    
    // Add confidence filter if provided
    if (confidence) {
      query += ' AND confidence >= $' + (params.length + 1);
      params.push(parseFloat(confidence));
    }
    
    // Add order, limit and offset
    query += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));
    
    // Execute query
    const result = await db.query(query, params);
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM events WHERE 1=1';
    const countParams = [];
    
    if (since) {
      countQuery += ' AND timestamp >= $' + (countParams.length + 1);
      countParams.push(new Date(since));
    }
    
    if (type) {
      countQuery += ' AND type = $' + (countParams.length + 1);
      countParams.push(type);
    }
    
    if (confidence) {
      countQuery += ' AND confidence >= $' + (countParams.length + 1);
      countParams.push(parseFloat(confidence));
    }
    
    const countResult = await db.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);
    
    res.status(200).json({
      events: result.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: totalCount > (parseInt(offset) + parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching events:', error);
    res.status(500).json({ message: 'Error fetching events', error: error.message });
  }
};

/**
 * Get a single event by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query('SELECT * FROM events WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    const updatedEvent = result.rows[0];
    
    // Emit event update via Socket.IO
    socketHandler.emitEventUpdate(updatedEvent);
    
    res.status(200).json(updatedEvent);
  } catch (error) {
    logger.error(`Error fetching event with ID ${req.params.id}:`, error);
    res.status(500).json({ message: 'Error fetching event', error: error.message });
  }
};

/**
 * Create a new event from sensor data and model prediction
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createEvent = async (req, res) => {
  try {
    const {
      timestamp = new Date(),
      location,
      type,
      confidence,
      humidity,
      pm25,
      particle_size,
      volume_spike,
      device_id,
      firmware_version,
      notes
    } = req.body;
    
    // Validate required fields
    if (!location || !type || confidence === undefined) {
      return res.status(400).json({ message: 'Missing required fields: location, type, and confidence are required' });
    }
    
    // Validate event type
    if (!['fire', 'vape', 'normal'].includes(type)) {
      return res.status(400).json({ message: 'Invalid event type. Must be one of: fire, vape, normal' });
    }
    
    // Insert new event
    const query = `
      INSERT INTO events (
        timestamp, location, type, confidence, humidity, pm25, 
        particle_size, volume_spike, device_id, firmware_version, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    
    const values = [
      timestamp,
      location,
      type,
      confidence,
      humidity,
      pm25,
      particle_size,
      volume_spike,
      device_id,
      firmware_version,
      notes,
      req.user.id // User ID from JWT token
    ];
    
    const result = await db.query(query, values);
    const newEvent = result.rows[0];
    
    // Emit event via Socket.IO if confidence is high
    if (confidence >= 70) {
      socketHandler.emitNewEvent(newEvent);
    }
    
    res.status(201).json(newEvent);
  } catch (error) {
    logger.error('Error creating event:', error);
    res.status(500).json({ message: 'Error creating event', error: error.message });
  }
};

/**
 * Update an event (e.g., add notes)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    // Check if event exists
    const checkResult = await db.query('SELECT * FROM events WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Update event
    const query = `
      UPDATE events
      SET notes = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [notes, id]);
    
    res.status(200).json(result.rows[0]);
  } catch (error) {
    logger.error(`Error updating event with ID ${req.params.id}:`, error);
    res.status(500).json({ message: 'Error updating event', error: error.message });
  }
};

/**
 * Delete an event
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if event exists
    const checkResult = await db.query('SELECT * FROM events WHERE id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Delete event
    await db.query('DELETE FROM events WHERE id = $1', [id]);
    
    res.status(200).json({ message: 'Event deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting event with ID ${req.params.id}:`, error);
    res.status(500).json({ message: 'Error deleting event', error: error.message });
  }
};

/**
 * Create a new event from sensor data
 * @param {Object} sensorData - Processed sensor data with prediction
 * @returns {Promise<Object>} - Created event
 */
const createEventFromSensor = async (sensorData) => {
  try {
    // Extract relevant data
    const {
      device_id,
      humidity,
      pm25,
      particle_size,
      volume_spike,
      timestamp,
      prediction
    } = sensorData;
    
    // Only create events for predictions with sufficient confidence
    if (prediction.confidence < 50) {
      logger.debug('Prediction confidence too low to create event');
      return null;
    }
    
    // Get device location from database (if available)
    let location = 'Unknown';
    try {
      if (device_id) {
        const deviceResult = await db.query(
          'SELECT location FROM devices WHERE device_id = $1',
          [device_id]
        );
        
        if (deviceResult.rows.length > 0) {
          location = deviceResult.rows[0].location;
        }
      }
    } catch (dbError) {
      logger.warn('Error getting device location, using default:', dbError);
      // Continue with default location
    }
    
    // Insert new event
    const query = `
      INSERT INTO events (
        timestamp, location, type, confidence, humidity, pm25, 
        particle_size, volume_spike, device_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const values = [
      timestamp || new Date(),
      location,
      prediction.type,
      prediction.confidence,
      humidity,
      pm25,
      particle_size,
      volume_spike,
      device_id,
      `Automatically generated from sensor data. Prediction: ${prediction.type} with ${prediction.confidence}% confidence.`
    ];
    
    let newEvent;
    try {
      const result = await db.query(query, values);
      newEvent = result.rows[0];
      
      // Emit event via Socket.IO
      socketHandler.emitNewEvent(newEvent);
    } catch (dbError) {
      logger.warn('Error storing event in database, using in-memory event:', dbError);
      // Create an in-memory event object when database is unavailable
      newEvent = {
        id: `temp-${Date.now()}`,
        timestamp: timestamp || new Date(),
        location,
        type: prediction.type,
        confidence: prediction.confidence,
        humidity,
        pm25,
        particle_size,
        volume_spike,
        device_id,
        notes: `Automatically generated from sensor data. Prediction: ${prediction.type} with ${prediction.confidence}% confidence.`
      };
      
      // Still emit the event via Socket.IO
      socketHandler.emitNewEvent(newEvent);
    }
    
    logger.info(`Created new ${prediction.type} event with ${prediction.confidence}% confidence`);
    return newEvent;
  } catch (error) {
    logger.error('Error creating event from sensor data:', error);
    throw error;
  }
};

module.exports = {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  createEventFromSensor
};