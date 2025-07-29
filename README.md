# Vape Detection System

A real-time vape and fire detection system using sensor data and machine learning.

## Project Overview

This system monitors sensor data from IoT devices to detect vaping and fire events in real-time. It uses an XGBoost machine learning model to analyze sensor readings and determine the likelihood of vape or fire events.

### Key Features

- Real-time sensor data processing
- Machine learning-based event detection
- Real-time notifications via WebSockets
- User authentication and authorization
- Event history and management
- Device management
- RESTful API for integration

## Project Structure

```
├── backend/                # Node.js Express backend
│   ├── src/
│   │   ├── config/         # Configuration files
│   │   ├── controllers/    # Request handlers
│   │   ├── middleware/     # Express middleware
│   │   ├── models/         # Data models
│   │   ├── routes/         # API routes
│   │   └── utils/          # Utility functions
│   └── tests/              # Backend tests
├── frontend/               # React frontend (to be implemented)
│   ├── public/
│   └── src/
│       ├── components/     # React components
│       ├── pages/          # Page components
│       ├── services/       # API services
│       ├── utils/          # Utility functions
│       ├── assets/         # Static assets
│       └── context/        # React context
└── xgboost-test.py         # Python ML model for vape/fire detection
```

## Technology Stack

### Backend
- Node.js
- Express.js
- PostgreSQL
- Socket.IO for real-time events
- JWT for authentication

### Frontend (to be implemented)
- React
- React Router
- Axios
- Socket.IO Client
- Chart.js for data visualization
- TailwindCSS for styling

### Machine Learning
- Python
- XGBoost
- scikit-learn

## Getting Started

### Prerequisites

- Node.js (v14+)
- PostgreSQL
- Python 3.7+ (for ML model)

### Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with the following variables:
   ```
   PORT=5000
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=vape_detection
   JWT_SECRET=your_jwt_secret
   NODE_ENV=development
   ```

4. Start the development server:
   ```
   npm run dev
   ```

### Simulating Sensor Data

Use the provided Python script to simulate sensor data:

```
python simulate_sensor.py
```

Options:
- `--api-url`: API endpoint URL (default: http://localhost:5000/api/sensors/data)
- `--interval`: Interval between data points in seconds (default: 5)
- `--device-id`: Device ID (default: random UUID)
- `--duration`: Duration of simulation in seconds (default: run indefinitely)
- `--event`: Force a specific event type (normal, vape, or fire)

Example:
```
python simulate_sensor.py --interval 2 --event vape --duration 60
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user (admin only)
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info
- `PUT /api/auth/change-password` - Change password

### Users
- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (admin only)

### Events
- `GET /api/events` - Get all events with optional filtering
- `GET /api/events/:id` - Get event by ID
- `POST /api/events` - Create a new event
- `PUT /api/events/:id` - Update event (e.g., add notes)
- `DELETE /api/events/:id` - Delete event (admin only)

### Sensors
- `POST /api/sensors/data` - Process incoming sensor data
- `GET /api/sensors/:deviceId/data` - Get recent sensor data for a device
- `GET /api/sensors/:deviceId/stats` - Get sensor statistics for a device
- `POST /api/sensors/test-prediction` - Test prediction model with sample data

### Devices
- `GET /api/devices` - Get all devices
- `GET /api/devices/:deviceId` - Get device by ID
- `POST /api/devices/register` - Register a new device or update existing device
- `PUT /api/devices/:deviceId/status` - Update device status
- `DELETE /api/devices/:deviceId` - Delete a device
- `GET /api/devices/:deviceId/stats` - Get device statistics

## WebSocket Events

### Client to Server
- `join-device` - Join device-specific room for targeted events
- `join-admin` - Join admin room for all events

### Server to Client
- `new-event` - New event notification
- `event-update` - Event update notification
- `sensor-data` - Sensor data update
- `alert` - High confidence event alert

## License

This project is licensed under the MIT License.