# Vape Detection System - Deployment Guide

## Architecture Overview

```
ESP32-C6 (WiFi) → MongoDB Atlas → FastAPI Backend (Vercel) → React Frontend (Vercel)
                     ↓
                 XGBoost ML Model
```

## Prerequisites

1. **MongoDB Atlas Account**: Create a free cluster at [mongodb.com](https://www.mongodb.com/cloud/atlas)
2. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
3. **GitHub Repository**: Push your code to GitHub for Vercel deployment

## Step 1: MongoDB Atlas Setup

1. Create a new cluster in MongoDB Atlas
2. Create a database user with read/write permissions
3. Whitelist your IP addresses (or use 0.0.0.0/0 for development)
4. Get your connection string (should look like: `mongodb+srv://username:password@cluster.mongodb.net/`)

## Step 2: Backend Deployment on Vercel

### 2.1 Environment Variables
In your Vercel dashboard, add these environment variables:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
DATABASE_NAME=vape-alert
```

### 2.2 Deploy Backend
1. Push your code to GitHub
2. Import the repository in Vercel
3. Set the root directory to `/` (since vercel.json is in the root)
4. Deploy

### 2.3 Test Backend
Once deployed, test your backend:
- Visit: `https://your-backend-app.vercel.app/`
- Check health: `https://your-backend-app.vercel.app/health`
- View docs: `https://your-backend-app.vercel.app/docs`

## Step 3: Frontend Deployment on Vercel

### 3.1 Environment Variables
In your Vercel dashboard for the frontend project, add:

```
REACT_APP_API_URL=https://your-backend-app.vercel.app/api
```

### 3.2 Deploy Frontend
1. Create a separate Vercel project for the frontend
2. Set the root directory to `/frontend`
3. Deploy

## Step 4: ESP32-C6 Configuration

### 4.1 Hardware Setup
- **MQ-2 Sensor**: Connect to analog pin A0
- **DHT22 Sensor**: Connect to digital pin 2
- **Air Quality Sensor**: Connect to analog pin A1
- **Status LED**: Connect to pin 8
- **Buzzer**: Connect to pin 9

### 4.2 Software Configuration
1. Install Arduino IDE with ESP32 support
2. Install required libraries:
   - `WiFi` (built-in)
   - `HTTPClient` (built-in)
   - `ArduinoJson`
   - `DHT sensor library`

3. Update the ESP32 code:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   const char* apiEndpoint = "https://your-backend-app.vercel.app/api/sensors/data";
   ```

4. Upload the code to your ESP32-C6

## Step 5: Testing the Complete System

### 5.1 ESP32 Testing
1. Open Serial Monitor (115200 baud)
2. Verify WiFi connection
3. Check sensor readings
4. Confirm data transmission to backend

### 5.2 Backend Testing
1. Monitor Vercel function logs
2. Check MongoDB Atlas for incoming data
3. Test ML predictions

### 5.3 Frontend Testing
1. Open your frontend URL
2. Verify real-time data display
3. Check event notifications
4. Test device management features

## Step 6: Production Considerations

### 6.1 Security
- Use environment variables for all sensitive data
- Implement proper CORS policies
- Add authentication if needed
- Use HTTPS for all communications

### 6.2 Monitoring
- Set up Vercel monitoring
- Configure MongoDB Atlas alerts
- Implement ESP32 watchdog timers
- Add logging and error tracking

### 6.3 Scaling
- Consider MongoDB connection pooling
- Implement rate limiting
- Add caching for frequently accessed data
- Use CDN for static assets

## Troubleshooting

### Common Issues

1. **ESP32 won't connect to WiFi**
   - Check SSID and password
   - Verify WiFi signal strength
   - Check firewall settings

2. **Backend deployment fails**
   - Verify all dependencies in requirements.txt
   - Check environment variables
   - Review Vercel build logs

3. **Frontend can't connect to backend**
   - Verify REACT_APP_API_URL is correct
   - Check CORS settings
   - Test backend endpoints directly

4. **MongoDB connection issues**
   - Verify connection string
   - Check IP whitelist
   - Confirm database user permissions

### Debug Commands

```bash
# Test backend locally
cd backend
python -m uvicorn app.main:app --reload

# Test frontend locally
cd frontend
npm start

# Check ESP32 serial output
# Use Arduino IDE Serial Monitor at 115200 baud
```

## Next Steps

1. **Zigbee Integration**: Add Zigbee mesh networking for better coverage
2. **Advanced ML**: Implement more sophisticated detection algorithms
3. **Mobile App**: Create companion mobile application
4. **Analytics Dashboard**: Add advanced analytics and reporting
5. **Multi-tenant Support**: Support multiple schools/organizations

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review Vercel and MongoDB Atlas documentation
3. Check ESP32-C6 hardware connections
4. Monitor system logs for error messages

---

**Note**: This system is designed for educational and safety purposes. Ensure compliance with local regulations and privacy laws when deploying in school environments.