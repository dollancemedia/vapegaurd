import sys
import os

# Add the parent directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the FastAPI app from the backend
from backend.app.main import app

# This is needed for Vercel serverless function
handler = app