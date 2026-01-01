# Development Notes

## Legacy Code
- `landingpage/` directory appears to be a legacy Vite project. The active projects are `mistio-web` (Vite Landing Page), `frontend` (React Dashboard), and `backend` (Python API).
- `backend/app/routers/sensors.py` has a root-level include in `main.py` for legacy dashboard compatibility.

## Recent Fixes (2026-01-01)
- **Frontend API URL**: Updated API base URL to `https://vapegaurd-production.up.railway.app` (HTTPS) in `.env.production` and all service/component files. ensured no `http://` links are forced.
- **Frontend WebSocket Loop**: (Previous fix) Fixed an infinite loop in `useWebSocket.js`.

## Local Development Startup
- **Backend**: `cd backend` && `python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
- **Frontend**: `cd frontend` && `npm start` (Runs on port 3002)
- **Landing Page**: `cd mistio-web` && `npm run dev` (Runs on port 5173)

## Known Issues / Warnings
- **Backend ML Models**: Scikit-learn models (RandomForest, etc.) are raising `InconsistentVersionWarning` (saved with 1.3.2, loading with 1.7.2). They are falling back to rules, but models should be retrained or libraries downgraded for consistency.

## Production Readiness
- **Backend Auth**: `backend/app/auth.py` contains a STUB function `validate_token`. **Before production**, this must be replaced with actual JWT validation using Clerk's public key.
- **Environment Variables**:
  - `frontend`: Ensure `REACT_APP_WS_URL` and `REACT_APP_CLERK_PUBLISHABLE_KEY` are set in Vercel.
  - `mistio-web`: Ensure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set in Vercel.
  - `backend`: Ensure `CLERK_SECRET_KEY` (if needed for SDK) or JWKS URL is available.
- **API URL**: Frontend is configured to use `https://vapegaurd-production.up.railway.app` for production API calls.

## Deployment
- **Frontend**: Deploy `frontend/` to Vercel. Use `vercel.json` for rewrite rules.
- **Landing Page**: Deploy `mistio-web/` to Vercel.
- **Backend**: Deploy `backend/` to Railway. `Procfile` is ready. User prefers Railway to avoid Render's cold starts.
