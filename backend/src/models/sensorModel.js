/**
 * This module handles sensor data processing and storage
 */

const db = require('../config/database');
const logger = require('../utils/logger');
const predictionModel = require('./predictionModel');

/**
 * Process and store incoming sensor data
 * @param {Object} sensorData - Object containing sensor readings
 * @returns {Promise<Object>} - Processed sensor data with prediction
 */
const processSensorData = async (sensorData) => {
  try {
    // Validate sensor data
    validateSensorData(sensorData);
    
    // Normalize sensor data (ensure all values are in expected ranges)
    const normalizedData = normalizeSensorData(sensorData);
    
    // Store raw sensor data
    await storeSensorData(normalizedData);
    
    // Get prediction from model
    const prediction = await predictionModel.makePrediction(normalizedData);
    
    // Return processed data with prediction
    return {
      ...normalizedData,
      prediction
    };
  } catch (error) {
    logger.error('Error processing sensor data:', error);
    throw error;
  }
};

/**
 * Validate sensor data structure and values
 * @param {Object} sensorData - Object containing sensor readings
 */
const validateSensorData = (sensorData) => {
  const requiredFields = ['humidity', 'pm25', 'particle_size', 'volume_spike', 'device_id'];
  
  // Check for required fields
  for (const field of requiredFields) {
    if (sensorData[field] === undefined) {
      throw new Error(`Missing required sensor data field: ${field}`);
    }
  }
  
  // Check data types
  if (typeof sensorData.humidity !== 'number' ||
      typeof sensorData.pm25 !== 'number' ||
      typeof sensorData.particle_size !== 'number' ||
      typeof sensorData.volume_spike !== 'number') {
    throw new Error('Sensor data fields must be numbers');
  }
  
  // Check value ranges
  if (sensorData.humidity < 0 || sensorData.humidity > 100) {
    throw new Error('Humidity must be between 0 and 100');
  }
  
  if (sensorData.pm25 < 0) {
    throw new Error('PM2.5 cannot be negative');
  }
  
  if (sensorData.particle_size < 0) {
    throw new Error('Particle size cannot be negative');
  }
  
  if (sensorData.volume_spike < 0) {
    throw new Error('Volume spike cannot be negative');
  }
};

/**
 * Normalize sensor data to ensure consistent ranges
 * @param {Object} sensorData - Object containing sensor readings
 * @returns {Object} - Normalized sensor data
 */
const normalizeSensorData = (sensorData) => {
  // Create a copy of the data
  const normalizedData = { ...sensorData };
  
  // Round values to 2 decimal places
  normalizedData.humidity = parseFloat(normalizedData.humidity.toFixed(2));
  normalizedData.pm25 = parseFloat(normalizedData.pm25.toFixed(2));
  normalizedData.particle_size = parseFloat(normalizedData.particle_size.toFixed(2));
  normalizedData.volume_spike = parseFloat(normalizedData.volume_spike.toFixed(2));
  
  // Add timestamp if not present
  if (!normalizedData.timestamp) {
    normalizedData.timestamp = new Date();
  }
  
  return normalizedData;
};

/**
 * Store sensor data in the database
 * @param {Object} sensorData - Object containing sensor readings
 * @returns {Promise<Object>} - Stored sensor data record
 */
const storeSensorData = async (sensorData) => {
  try {
    // Create sensor_data table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS sensor_data (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(50) NOT NULL,
        humidity NUMERIC(5,2) NOT NULL,
        pm25 NUMERIC(8,2) NOT NULL,
        particle_size NUMERIC(8,2) NOT NULL,
        volume_spike NUMERIC(8,2) NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert sensor data
    const result = await db.query(
      `INSERT INTO sensor_data 
       (device_id, humidity, pm25, particle_size, volume_spike, timestamp) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [
        sensorData.device_id,
        sensorData.humidity,
        sensorData.pm25,
        sensorData.particle_size,
        sensorData.volume_spike,
        sensorData.timestamp
      ]
    );
    
    logger.debug(`Stored sensor data for device ${sensorData.device_id}`);
    return result.rows[0];
  } catch (error) {
    logger.warn('Error storing sensor data (continuing without storage):', error);
    // Continue without throwing error to allow the application to work without database
    return sensorData;
  }
};

/**
 * Get recent sensor data for a device
 * @param {string} deviceId - Device ID to get data for
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} - Array of sensor data records
 */
const getRecentSensorData = async (deviceId, limit = 100) => {
  try {
    const result = await db.query(
      `SELECT * FROM sensor_data 
       WHERE device_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [deviceId, limit]
    );
    
    return result.rows;
  } catch (error) {
    logger.error(`Error fetching recent sensor data for device ${deviceId}:`, error);
    throw error;
  }
};

/**
 * Get sensor data statistics for a device
 * @param {string} deviceId - Device ID to get stats for
 * @param {string} timeframe - Timeframe for stats (day, week, month)
 * @returns {Promise<Object>} - Sensor data statistics
 */
const getSensorStats = async (deviceId, timeframe = 'day') => {
  try {
    let timeInterval;
    
    // Determine time interval based on timeframe
    switch (timeframe.toLowerCase()) {
      case 'day':
        timeInterval = '1 day';
        break;
      case 'week':
        timeInterval = '7 days';
        break;
      case 'month':
        timeInterval = '30 days';
        break;
      default:
        timeInterval = '1 day';
    }
    
    // Get statistics
    const result = await db.query(
      `SELECT 
        AVG(humidity) as avg_humidity,
        MIN(humidity) as min_humidity,
        MAX(humidity) as max_humidity,
        AVG(pm25) as avg_pm25,
        MIN(pm25) as min_pm25,
        MAX(pm25) as max_pm25,
        AVG(particle_size) as avg_particle_size,
        MIN(particle_size) as min_particle_size,
        MAX(particle_size) as max_particle_size,
        AVG(volume_spike) as avg_volume_spike,
        MIN(volume_spike) as min_volume_spike,
        MAX(volume_spike) as max_volume_spike,
        COUNT(*) as total_readings
      FROM sensor_data 
      WHERE device_id = $1 AND timestamp > NOW() - INTERVAL $2`,
      [deviceId, timeInterval]
    );
    
    return result.rows[0];
  } catch (error) {
    logger.error(`Error fetching sensor stats for device ${deviceId}:`, error);
    throw error;
  }
};

module.exports = {
  processSensorData,
  validateSensorData,
  normalizeSensorData,
  storeSensorData,
  getRecentSensorData,
  getSensorStats
};