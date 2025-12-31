# Project Tasks & Review

## Review - 2025-12-30

### Completed Actions
- **Verified MongoDB**: Confirmed MongoDB service is running on default port 27017.
- **Started Backend**: Started FastAPI backend on `http://0.0.0.0:8000`.
- **Started Frontend**: Verified React frontend running on `http://localhost:3002`.
- **Started Landing Page**: Started `mistio-web` (Vite) on `http://localhost:5173`.
- **Updated Documentation**: Added "Local Development Startup" section to `dev.md` and noted known issues.

### Security & Code Quality Checks
- **Sensitive Data**: Checked backend logs; no sensitive PII or credentials observed in sensor data payloads.
- **Vulnerabilities**: 
  - Backend ML models (`.joblib` files) are raising `InconsistentVersionWarning`. While currently falling back to rules, this version mismatch (saved with 1.3.2, loading with 1.7.2) could lead to instability.
  - Frontend was proxying to port 8000 which was initially closed, causing `ECONNREFUSED`. This is resolved now that backend is up.
- **Production Readiness**:
  - `dev.md` updated with reminder to replace STUB auth function before production.
  - Ensure debug modes (`--reload`) are disabled in production.

### Next Steps
- Retrain ML models with current scikit-learn version to resolve warnings.
- Implement proper JWT validation in `backend/app/auth.py`.
