/**
 * Routes for sensor data
 */

const express = require('express');
const router = express.Router();
const sensorController = require('../controllers/sensorController');
const { authenticate, isAdmin } = require('../middleware');

// Process incoming sensor data
// POST /api/sensors/data
router.post('/data', sensorController.processSensorData);

// Get recent sensor data for a device
// GET /api/sensors/:deviceId/data
router.get('/:deviceId/data', authenticate, sensorController.getRecentSensorData);

// Get sensor statistics for a device
// GET /api/sensors/:deviceId/stats
router.get('/:deviceId/stats', authenticate, sensorController.getSensorStats);

// Test prediction model with sample data
// POST /api/sensors/test-prediction
router.post('/test-prediction', authenticate, isAdmin, sensorController.testPrediction);

module.exports = router;