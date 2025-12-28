# Development Notes

## Legacy Code
- `landingpage/` directory appears to be a legacy Vite project. The active projects are `mistio-web` (Next.js Landing Page), `frontend` (React Dashboard), and `backend` (Python API).
- `backend/app/routers/sensors.py` has a root-level include in `main.py` for legacy dashboard compatibility.

## Production Readiness
- **Backend Auth**: `backend/app/auth.py` contains a STUB function `validate_token`. **Before production**, this must be replaced with actual JWT validation using Clerk's public key (e.g., using `clerk-sdk-python` or `pyjwt` with JWKS).
- **Environment Variables**:
  - `frontend`: Ensure `REACT_APP_WS_URL` and `REACT_APP_CLERK_PUBLISHABLE_KEY` are set in Vercel.
  - `mistio-web`: Ensure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set in Vercel.
  - `backend`: Ensure `CLERK_SECRET_KEY` (if needed for SDK) or JWKS URL is available.

## Deployment
- **Frontend**: Deploy `frontend/` to Vercel. Use `vercel.json` for rewrite rules.
- **Landing Page**: Deploy `mistio-web/` to Vercel.
- **Backend**: Deploy `backend/` to Railway. `Procfile` is ready. User prefers Railway to avoid Render's cold starts.
