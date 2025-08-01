const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const { setupRoutes } = require('./routes');
const { setupMiddleware } = require('./middleware');
const { connectToDatabase } = require('./config/database');
const logger = require('./utils/logger');
const socketHandler = require('./utils/socketHandler');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const server = http.createServer(app);

// Setup CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Setup middleware
setupMiddleware(app);

// Setup routes
setupRoutes(app);

// Initialize Socket.IO for real-time events
const io = socketHandler.initialize(server);

// Make io accessible to other modules
app.set('io', io);

// Connect to database
connectToDatabase()
  .then(() => {
    logger.info('Database connection established or mock connection created');
  })
  .catch(err => {
    logger.error('Failed to connect to database', err);
    logger.warn('Continuing without database connection - some features will not work');
  })
  .finally(() => {
    // Start server regardless of database connection status
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  // Don't crash the server
});

module.exports = { app, server };