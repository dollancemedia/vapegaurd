/**
 * Controller for handling sensor data and events
 */

const sensorModel = require('../models/sensorModel');
const eventController = require('./eventController');
const logger = require('../utils/logger');

/**
 * Process incoming sensor data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const processSensorData = async (req, res) => {
  try {
    const sensorData = req.body;
    
    // Process sensor data
    const processedData = await sensorModel.processSensorData(sensorData);
    
    // Check if prediction indicates an event
    if (processedData.prediction.confidence > 50) {
      // Create event if confidence is high enough
      await eventController.createEventFromSensor(processedData);
    }
    
    res.status(200).json({
      message: 'Sensor data processed successfully',
      data: processedData
    });
  } catch (error) {
    logger.error('Error processing sensor data:', error);
    res.status(400).json({ message: 'Error processing sensor data', error: error.message });
  }
};

/**
 * Get recent sensor data for a device
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getRecentSensorData = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    
    const sensorData = await sensorModel.getRecentSensorData(deviceId, limit);
    
    res.status(200).json(sensorData);
  } catch (error) {
    logger.error(`Error fetching sensor data for device ${req.params.deviceId}:`, error);
    res.status(500).json({ message: 'Error fetching sensor data', error: error.message });
  }
};

/**
 * Get sensor statistics for a device
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getSensorStats = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { timeframe } = req.query;
    
    const stats = await sensorModel.getSensorStats(deviceId, timeframe);
    
    res.status(200).json(stats);
  } catch (error) {
    logger.error(`Error fetching sensor stats for device ${req.params.deviceId}:`, error);
    res.status(500).json({ message: 'Error fetching sensor statistics', error: error.message });
  }
};

/**
 * Test prediction model with sample data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const testPrediction = async (req, res) => {
  try {
    // Use provided test data or default test data
    const testData = req.body.sensorData || {
      humidity: 35,
      pm25: 25,
      particle_size: 300,
      volume_spike: 70,
      device_id: 'test-device'
    };
    
    // Get prediction without storing data
    const prediction = await sensorModel.normalizeSensorData(testData);
    const result = await require('../models/predictionModel').makePrediction(prediction);
    
    res.status(200).json({
      message: 'Prediction test successful',
      test_data: testData,
      prediction: result
    });
  } catch (error) {
    logger.error('Error testing prediction:', error);
    res.status(500).json({ message: 'Error testing prediction', error: error.message });
  }
};

module.exports = {
  processSensorData,
  getRecentSensorData,
  getSensorStats,
  testPrediction
};