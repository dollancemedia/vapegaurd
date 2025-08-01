const eventRoutes = require('./eventRoutes');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const sensorRoutes = require('./sensorRoutes');
const deviceRoutes = require('./deviceRoutes');

// Setup all routes
const setupRoutes = (app) => {
  // API routes
  app.use('/api/events', eventRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/sensors', sensorRoutes);
  app.use('/api/devices', deviceRoutes);
  
  // Health check route
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  
  // Handle 404 - Route not found
  app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });
};

module.exports = { setupRoutes };