# 🚀 Deploy Vape Detection System to Vercel

## Quick Deployment Guide

### Step 1: Prepare for Deployment
1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```
   Choose your preferred login method (GitHub, Google, etc.)

### Step 2: Deploy the Project
1. **Navigate to project directory**:
   ```bash
   cd "C:\Users\mrjra\OneDrive - MSFT\Vape Project"
   ```

2. **Deploy to Vercel**:
   ```bash
   vercel --prod
   ```
   
   During deployment, Vercel will ask:
   - **Project name**: Accept default or choose a custom name
   - **Directory**: Press Enter (use current directory)
   - **Settings**: Accept defaults

### Step 3: Configure Environment Variables
After deployment, set up environment variables in Vercel Dashboard:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your deployed project
3. Go to **Settings** → **Environment Variables**
4. Add these variables:

   | Variable Name | Value | Environment |
   |---------------|-------|-------------|
   | `MONGODB_URI` | Your MongoDB Atlas connection string | Production |
   | `DATABASE_NAME` | `vape_detection` (or your preferred name) | Production |

### Step 4: Redeploy with Environment Variables
```bash
vercel --prod
```

### Step 5: Update ESP32 Configuration
After successful deployment, update your ESP32 code:

```cpp
// Replace this line in your ESP32 code:
const char* serverURL = "https://YOUR-PROJECT-NAME.vercel.app/api/sensors/data";
```

## 🔗 Your Deployed URLs
After deployment, you'll have:
- **Frontend**: `https://YOUR-PROJECT-NAME.vercel.app`
- **Backend API**: `https://YOUR-PROJECT-NAME.vercel.app/api`
- **WebSocket**: `wss://YOUR-PROJECT-NAME.vercel.app`

## 📋 MongoDB Atlas Setup
If you haven't set up MongoDB Atlas yet:

1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Create a free cluster
3. Create a database user
4. Whitelist all IPs (0.0.0.0/0) for Vercel
5. Get your connection string

## ✅ Verification Steps
1. Visit your frontend URL
2. Check if the dashboard loads
3. Verify API endpoints work: `https://YOUR-PROJECT-NAME.vercel.app/api/health`
4. Test with ESP32 sensor data

## 🔧 Troubleshooting

### Common Issues:
1. **Build Failures**: Check build logs in Vercel dashboard
2. **API Errors**: Verify environment variables are set correctly
3. **Database Connection**: Ensure MongoDB Atlas allows Vercel IPs
4. **CORS Issues**: Already configured in the FastAPI backend

### Debug Commands:
```bash
# Check deployment status
vercel ls

# View logs
vercel logs YOUR-PROJECT-NAME

# Check environment variables
vercel env ls
```

## 🎯 Next Steps
1. Deploy the project following steps above
2. Configure your ESP32 with the new URL
3. Test the complete system
4. Monitor through Vercel dashboard

---

**Ready to deploy?** Run `vercel --prod` in your project directory!