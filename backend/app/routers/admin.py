from fastapi import APIRouter, HTTPException, BackgroundTasks
import logging
import sys
import os

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

        # Lazy import — train_model.py is a local script not available in production
        backend_dir = os.path.join(os.path.dirname(__file__), "..", "..")
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)
        try:
            import train_model
        except ImportError:
            raise HTTPException(
                status_code=501,
                detail="train_model module is not available in this deployment. Retrain locally and redeploy the model files."
            )

        # 1. Train and save
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
