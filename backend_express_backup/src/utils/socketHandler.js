/**
 * Socket.IO handler for real-time events
 */

const logger = require('./logger');

let io;

/**
 * Initialize Socket.IO with the HTTP server
 * @param {Object} server - HTTP server instance
 */
const initialize = (server) => {
  io = require('socket.io')(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST']
    }
  });
  
  io.on('connection', (socket) => {
    logger.info(`New client connected: ${socket.id}`);
    
    // Join device-specific room for targeted events
    socket.on('join-device', (deviceId) => {
      if (deviceId) {
        socket.join(`device-${deviceId}`);
        logger.info(`Client ${socket.id} joined room for device ${deviceId}`);
      }
    });
    
    // Join admin room for all events
    socket.on('join-admin', () => {
      socket.join('admin');
      logger.info(`Client ${socket.id} joined admin room`);
    });
    
    // Handle client disconnect
    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });
  
  logger.info('Socket.IO initialized');
  return io;
};

/**
 * Emit an event to all connected clients
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const emitToAll = (event, data) => {
  if (!io) {
    logger.error('Socket.IO not initialized');
    return;
  }
  
  io.emit(event, data);
  logger.debug(`Emitted ${event} to all clients`);
};

/**
 * Emit an event to clients in the admin room
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const emitToAdmin = (event, data) => {
  if (!io) {
    logger.error('Socket.IO not initialized');
    return;
  }
  
  io.to('admin').emit(event, data);
  logger.debug(`Emitted ${event} to admin room`);
};

/**
 * Emit an event to clients in a specific device room
 * @param {string} deviceId - Device ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const emitToDevice = (deviceId, event, data) => {
  if (!io) {
    logger.error('Socket.IO not initialized');
    return;
  }
  
  io.to(`device-${deviceId}`).emit(event, data);
  logger.debug(`Emitted ${event} to device ${deviceId}`);
};

/**
 * Emit a new event notification
 * @param {Object} event - Event object
 */
const emitNewEvent = (event) => {
  // Emit to admin room
  emitToAdmin('new-event', event);
  
  // Emit to specific device room if device_id is present
  if (event.device_id) {
    emitToDevice(event.device_id, 'new-event', event);
  }
  
  // Emit alert for high confidence events
  if (event.confidence > 75) {
    emitToAll('alert', {
      message: `High confidence ${event.type} event detected`,
      event_id: event.id,
      type: event.type,
      confidence: event.confidence,
      timestamp: event.timestamp
    });
  }
};

/**
 * Emit an event update notification
 * @param {Object} event - Updated event object
 */
const emitEventUpdate = (event) => {
  // Emit to admin room
  emitToAdmin('event-update', event);
  
  // Emit to specific device room if device_id is present
  if (event.device_id) {
    emitToDevice(event.device_id, 'event-update', event);
  }
};

/**
 * Emit sensor data update
 * @param {Object} sensorData - Sensor data object
 */
const emitSensorData = (sensorData) => {
  // Emit to admin room
  emitToAdmin('sensor-data', sensorData);
  
  // Emit to specific device room
  if (sensorData.device_id) {
    emitToDevice(sensorData.device_id, 'sensor-data', sensorData);
  }
};

module.exports = {
  initialize,
  emitToAll,
  emitToAdmin,
  emitToDevice,
  emitNewEvent,
  emitEventUpdate,
  emitSensorData
};