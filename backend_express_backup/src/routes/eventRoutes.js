const express = require('express');
const { authenticate, isAdmin } = require('../middleware');
const eventController = require('../controllers/eventController');

const router = express.Router();

/**
 * @route   GET /api/events
 * @desc    Get all events with optional filtering by time range
 * @access  Private
 */
router.get('/', authenticate, eventController.getEvents);

/**
 * @route   GET /api/events/:id
 * @desc    Get a single event by ID
 * @access  Private
 */
router.get('/:id', authenticate, eventController.getEventById);

/**
 * @route   POST /api/events
 * @desc    Create a new event (from sensor data)
 * @access  Private
 */
router.post('/', authenticate, eventController.createEvent);

/**
 * @route   PUT /api/events/:id
 * @desc    Update an event (e.g., add notes)
 * @access  Private (Admin only)
 */
router.put('/:id', authenticate, isAdmin, eventController.updateEvent);

/**
 * @route   DELETE /api/events/:id
 * @desc    Delete an event
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, isAdmin, eventController.deleteEvent);

module.exports = router;