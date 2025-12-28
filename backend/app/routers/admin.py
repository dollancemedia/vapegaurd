from fastapi import APIRouter, HTTPException, BackgroundTasks
import logging
import sys
import os

# Add the backend directory to sys.path so we can import train_model
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

import train_model
from .. import inference

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger(__name__)

@router.api_route("/retrain", methods=["GET", "POST"])
async def retrain_model():
    """
    Trigger a manual retraining of the XGBoost model using the latest data in MongoDB.
    This will:
    1. Fetch data from MongoDB
    2. Train a new XGBoost model
    3. Save it to disk (overwriting the old one)
    4. Reload the model in memory for immediate use
    """
    try:
        logger.info("Starting manual model retraining...")
        
        # 1. Train and save
        # We run this synchronously for now as it's a critical admin operation
        # and we want to confirm success before returning.
        # For very large datasets, this should be moved to a background task.
        result = train_model.train_and_save_model(save=True, skip_predict=True)
        
        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message"))
            
        # 2. Reload the model in inference.py
        inference.reload_model()
        
        logger.info("Manual retraining completed successfully.")
        
        return {
            "status": "success", 
            "message": "Model retrained and reloaded successfully.",
            "details": result
        }
        
    except Exception as e:
        logger.error(f"Error during manual retraining: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
