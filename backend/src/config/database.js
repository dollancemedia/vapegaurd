const { Pool } = require('pg');
const logger = require('../utils/logger');

// Create a new Pool instance with connection details from environment variables
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'vape_detection',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

// Function to connect to the database
const connectToDatabase = async () => {
  try {
    // Test the connection
    const client = await pool.connect();
    logger.info('Connected to PostgreSQL database');
    client.release();
    
    // Initialize database tables if they don't exist
    await initializeTables();
    
    return pool;
  } catch (error) {
    logger.error('Error connecting to PostgreSQL database:', error);
    logger.warn('Continuing without database connection - some features will not work');
    // Return a mock pool that won't crash the application
    return {
      query: () => Promise.resolve({ rows: [] }),
      connect: () => Promise.resolve({ release: () => {} })
    };
  }
};

// Function to initialize database tables
const initializeTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create users table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'viewer')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create events table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        location VARCHAR(100),
        type VARCHAR(20) CHECK (type IN ('fire', 'vape', 'normal')),
        confidence NUMERIC(5,2) CHECK (confidence >= 0 AND confidence <= 100),
        humidity NUMERIC(5,2),
        pm25 NUMERIC(8,2),
        particle_size NUMERIC(8,2),
        volume_spike NUMERIC(8,2),
        device_id VARCHAR(50),
        firmware_version VARCHAR(20),
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create devices table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        location VARCHAR(100),
        firmware_version VARCHAR(50),
        last_seen TIMESTAMP WITH TIME ZONE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create sensor_data table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS sensor_data (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(50) NOT NULL,
        humidity NUMERIC(5,2) NOT NULL,
        pm25 NUMERIC(8,2) NOT NULL,
        particle_size NUMERIC(8,2) NOT NULL,
        volume_spike NUMERIC(8,2) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for efficient querying
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events (type);
      CREATE INDEX IF NOT EXISTS idx_events_confidence ON events (confidence);
      CREATE INDEX IF NOT EXISTS idx_events_device_id ON events (device_id);
      CREATE INDEX IF NOT EXISTS idx_sensor_data_device_id ON sensor_data (device_id);
      CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON sensor_data (timestamp);
    `);
    
    await client.query('COMMIT');
    logger.info('Database tables initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error initializing database tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Export the pool and connection function
module.exports = {
  pool,
  connectToDatabase,
  initializeTables,
  query: (text, params) => pool.query(text, params),
};