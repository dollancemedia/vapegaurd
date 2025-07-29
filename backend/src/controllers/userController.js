const db = require('../config/database');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

/**
 * Get all users (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getUsers = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, role, created_at, updated_at FROM users ORDER BY username'
    );
    
    res.status(200).json(result.rows);
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};

/**
 * Get user by ID (admin only or own profile)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is requesting their own profile or is an admin
    if (req.user.id !== parseInt(id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const result = await db.query(
      'SELECT id, username, role, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json(result.rows[0]);
  } catch (error) {
    logger.error(`Error fetching user with ID ${req.params.id}:`, error);
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
};

/**
 * Update user (admin only or own profile)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, role, password } = req.body;
    
    // Check if user is updating their own profile or is an admin
    if (req.user.id !== parseInt(id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Check if user exists
    const userCheck = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Only admins can change roles
    if (role && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only administrators can change user roles' });
    }
    
    // Build update query
    let query = 'UPDATE users SET ';
    const values = [];
    const updates = [];
    
    if (username) {
      // Check if username is already taken
      const usernameCheck = await db.query(
        'SELECT * FROM users WHERE username = $1 AND id != $2',
        [username, id]
      );
      
      if (usernameCheck.rows.length > 0) {
        return res.status(400).json({ message: 'Username already exists' });
      }
      
      updates.push(`username = $${values.length + 1}`);
      values.push(username);
    }
    
    if (role && ['admin', 'viewer'].includes(role)) {
      updates.push(`role = $${values.length + 1}`);
      values.push(role);
    }
    
    if (password) {
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      updates.push(`password = $${values.length + 1}`);
      values.push(hashedPassword);
    }
    
    // Add updated_at timestamp
    updates.push('updated_at = CURRENT_TIMESTAMP');
    
    // If no updates, return success
    if (updates.length === 1) { // Only updated_at
      return res.status(200).json({ message: 'No changes to update' });
    }
    
    // Complete query
    query += updates.join(', ');
    query += ` WHERE id = $${values.length + 1} RETURNING id, username, role, created_at, updated_at`;
    values.push(id);
    
    // Execute update
    const result = await db.query(query, values);
    
    res.status(200).json(result.rows[0]);
  } catch (error) {
    logger.error(`Error updating user with ID ${req.params.id}:`, error);
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
};

/**
 * Delete user (admin only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent deleting self
    if (req.user.id === parseInt(id)) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    
    // Check if user exists
    const userCheck = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Delete user
    await db.query('DELETE FROM users WHERE id = $1', [id]);
    
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting user with ID ${req.params.id}:`, error);
    res.status(500).json({ message: 'Error deleting user', error: error.message });
  }
};

module.exports = {
  getUsers,
  getUserById,
  updateUser,
  deleteUser
};