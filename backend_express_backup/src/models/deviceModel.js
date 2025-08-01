/**
 * This module handles device management
 */

const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Initialize the devices table if it doesn't exist
 */
const initializeDevicesTable = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        location VARCHAR(100),
        firmware_version VARCHAR(50),
        last_seen TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    logger.info('Devices table initialized');
  } catch (error) {
    logger.error('Error initializing devices table:', error);
    throw error;
  }
};

/**
 * Register a new device or update existing device
 * @param {Object} deviceInfo - Device information
 * @returns {Promise<Object>} - Registered device
 */
const registerDevice = async (deviceInfo) => {
  try {
    const { device_id, name, location, firmware_version } = deviceInfo;
    
    // Check if device already exists
    const existingDevice = await db.query(
      'SELECT * FROM devices WHERE device_id = $1',
      [device_id]
    );
    
    if (existingDevice.rows.length > 0) {
      // Update existing device
      const query = `
        UPDATE devices
        SET name = $1,
            location = $2,
            firmware_version = $3,
            last_seen = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE device_id = $4
        RETURNING *
      `;
      
      const result = await db.query(query, [name, location, firmware_version, device_id]);
      logger.info(`Updated device: ${device_id}`);
      return result.rows[0];
    } else {
      // Create new device
      const query = `
        INSERT INTO devices
        (device_id, name, location, firmware_version, last_seen)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      
      const result = await db.query(query, [device_id, name, location, firmware_version]);
      logger.info(`Registered new device: ${device_id}`);
      return result.rows[0];
    }
  } catch (error) {
    logger.error('Error registering device:', error);
    throw error;
  }
};

/**
 * Get all devices
 * @returns {Promise<Array>} - Array of devices
 */
const getAllDevices = async () => {
  try {
    const result = await db.query('SELECT * FROM devices ORDER BY name');
    return result.rows;
  } catch (error) {
    logger.error('Error fetching devices:', error);
    throw error;
  }
};

/**
 * Get device by ID
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object>} - Device information
 */
const getDeviceById = async (deviceId) => {
  try {
    const result = await db.query(
      'SELECT * FROM devices WHERE device_id = $1',
      [deviceId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } catch (error) {
    logger.error(`Error fetching device ${deviceId}:`, error);
    throw error;
  }
};

/**
 * Update device status
 * @param {string} deviceId - Device ID
 * @param {string} status - Device status (active, inactive, maintenance)
 * @returns {Promise<Object>} - Updated device
 */
const updateDeviceStatus = async (deviceId, status) => {
  try {
    // Validate status
    const validStatuses = ['active', 'inactive', 'maintenance'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }
    
    const query = `
      UPDATE devices
      SET status = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE device_id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [status, deviceId]);
    
    if (result.rows.length === 0) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    
    logger.info(`Updated device ${deviceId} status to ${status}`);
    return result.rows[0];
  } catch (error) {
    logger.error(`Error updating device ${deviceId} status:`, error);
    throw error;
  }
};

/**
 * Update device last seen timestamp
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object>} - Updated device
 */
const updateDeviceLastSeen = async (deviceId) => {
  try {
    const query = `
      UPDATE devices
      SET last_seen = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE device_id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [deviceId]);
    
    if (result.rows.length === 0) {
      // Device doesn't exist, create a placeholder
      const newDevice = await registerDevice({
        device_id: deviceId,
        name: `Device ${deviceId}`,
        location: 'Unknown',
        firmware_version: 'Unknown'
      });
      
      return newDevice;
    }
    
    return result.rows[0];
  } catch (error) {
    logger.error(`Error updating device ${deviceId} last seen:`, error);
    throw error;
  }
};

/**
 * Delete a device
 * @param {string} deviceId - Device ID
 * @returns {Promise<boolean>} - Success status
 */
const deleteDevice = async (deviceId) => {
  try {
    const result = await db.query(
      'DELETE FROM devices WHERE device_id = $1 RETURNING *',
      [deviceId]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    
    logger.info(`Deleted device: ${deviceId}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting device ${deviceId}:`, error);
    throw error;
  }
};

module.exports = {
  initializeDevicesTable,
  registerDevice,
  getAllDevices,
  getDeviceById,
  updateDeviceStatus,
  updateDeviceLastSeen,
  deleteDevice
};