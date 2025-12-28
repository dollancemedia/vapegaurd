# Stub for future backend auth validation
# Install clerk-sdk-python or use pyjwt to validate tokens
# pip install clerk-sdk-python

# Usage:
# from fastapi import Depends, HTTPException
# from app.auth import validate_token

# @app.get("/api/devices")
# async def get_devices(user = Depends(validate_token)):
#     ...

async def validate_token(token: str = None):
    if not token:
        return None

    # TODO: Implement token validation logic
    # 1. Decode JWT using Clerk's public key
    # 2. Extract user_id
    # 3. Return user context
    return {"user_id": "mock_user_id"}
