/**
 * Controller for device management
 */

const deviceModel = require('../models/deviceModel');
const logger = require('../utils/logger');

/**
 * Get all devices
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getDevices = async (req, res) => {
  try {
    const devices = await deviceModel.getAllDevices();
    res.status(200).json(devices);
  } catch (error) {
    logger.error('Error fetching devices:', error);
    res.status(500).json({ message: 'Error fetching devices', error: error.message });
  }
};

/**
 * Get device by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getDeviceById = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const device = await deviceModel.getDeviceById(deviceId);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    res.status(200).json(device);
  } catch (error) {
    logger.error(`Error fetching device ${req.params.deviceId}:`, error);
    res.status(500).json({ message: 'Error fetching device', error: error.message });
  }
};

/**
 * Register a new device or update existing device
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const registerDevice = async (req, res) => {
  try {
    const { device_id, name, location, firmware_version } = req.body;
    
    // Validate required fields
    if (!device_id || !name) {
      return res.status(400).json({ message: 'Device ID and name are required' });
    }
    
    const device = await deviceModel.registerDevice({
      device_id,
      name,
      location,
      firmware_version
    });
    
    res.status(200).json(device);
  } catch (error) {
    logger.error('Error registering device:', error);
    res.status(500).json({ message: 'Error registering device', error: error.message });
  }
};

/**
 * Update device status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateDeviceStatus = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { status } = req.body;
    
    // Validate status
    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }
    
    const device = await deviceModel.updateDeviceStatus(deviceId, status);
    res.status(200).json(device);
  } catch (error) {
    logger.error(`Error updating device ${req.params.deviceId} status:`, error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      message: 'Error updating device status',
      error: error.message
    });
  }
};

/**
 * Delete a device
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    await deviceModel.deleteDevice(deviceId);
    res.status(200).json({ message: 'Device deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting device ${req.params.deviceId}:`, error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      message: 'Error deleting device',
      error: error.message
    });
  }
};

/**
 * Get device statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getDeviceStats = async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Check if device exists
    const device = await deviceModel.getDeviceById(deviceId);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    // Get event counts by type
    const eventCountsQuery = `
      SELECT type, COUNT(*) as count
      FROM events
      WHERE device_id = $1
      GROUP BY type
    `;
    
    const eventCountsResult = await require('../config/database').query(eventCountsQuery, [deviceId]);
    
    // Get recent events
    const recentEventsQuery = `
      SELECT *
      FROM events
      WHERE device_id = $1
      ORDER BY timestamp DESC
      LIMIT 5
    `;
    
    const recentEventsResult = await require('../config/database').query(recentEventsQuery, [deviceId]);
    
    // Get sensor stats
    const sensorStats = await require('../models/sensorModel').getSensorStats(deviceId);
    
    res.status(200).json({
      device,
      event_counts: eventCountsResult.rows,
      recent_events: recentEventsResult.rows,
      sensor_stats: sensorStats
    });
  } catch (error) {
    logger.error(`Error fetching device stats for ${req.params.deviceId}:`, error);
    res.status(500).json({ message: 'Error fetching device statistics', error: error.message });
  }
};

module.exports = {
  getDevices,
  getDeviceById,
  registerDevice,
  updateDeviceStatus,
  deleteDevice,
  getDeviceStats
};