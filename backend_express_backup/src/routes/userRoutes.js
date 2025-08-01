const express = require('express');
const { authenticate, isAdmin } = require('../middleware');
const userController = require('../controllers/userController');

const router = express.Router();

/**
 * @route   GET /api/users
 * @desc    Get all users (admin only)
 * @access  Private (Admin only)
 */
router.get('/', authenticate, isAdmin, userController.getUsers);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID (admin only or own profile)
 * @access  Private
 */
router.get('/:id', authenticate, userController.getUserById);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user (admin only or own profile)
 * @access  Private
 */
router.put('/:id', authenticate, userController.updateUser);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user (admin only)
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, isAdmin, userController.deleteUser);

module.exports = router;