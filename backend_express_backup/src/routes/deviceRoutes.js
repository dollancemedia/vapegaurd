/**
 * Routes for device management
 */

const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const { authenticate, isAdmin } = require('../middleware');

// Get all devices
// GET /api/devices
router.get('/', authenticate, deviceController.getDevices);

// Get device by ID
// GET /api/devices/:deviceId
router.get('/:deviceId', authenticate, deviceController.getDeviceById);

// Register a new device or update existing device
// POST /api/devices/register
router.post('/register', authenticate, isAdmin, deviceController.registerDevice);

// Update device status
// PUT /api/devices/:deviceId/status
router.put('/:deviceId/status', authenticate, isAdmin, deviceController.updateDeviceStatus);

// Delete a device
// DELETE /api/devices/:deviceId
router.delete('/:deviceId', authenticate, isAdmin, deviceController.deleteDevice);

// Get device statistics
// GET /api/devices/:deviceId/stats
router.get('/:deviceId/stats', authenticate, deviceController.getDeviceStats);

module.exports = router;