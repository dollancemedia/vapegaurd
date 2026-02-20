"""
JWT token validation for Clerk-issued tokens.

Clerk issues RS256-signed JWTs.  This module fetches the public keys from
Clerk's JWKS endpoint (configured via CLERK_JWKS_URL) and validates every
incoming token.  The JWKS response is cached in-process and refreshed
whenever a matching key-ID cannot be found (key rotation support).

Required env vars:
    CLERK_JWKS_URL  – e.g. https://<your-clerk-frontend-api>/.well-known/jwks.json

If CLERK_JWKS_URL is not set the module falls back to a permissive stub so
that the app can still start in development without Clerk configured.
"""

import logging
import time
from typing import Any, Dict, Optional

import httpx
import jwt
from fastapi import HTTPException, status
from jwt.algorithms import RSAAlgorithm

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-process JWKS cache
# ---------------------------------------------------------------------------
_jwks_cache: Dict[str, Any] = {}   # kid -> public key object
_jwks_fetched_at: float = 0.0
_JWKS_TTL = 3600  # seconds – refresh keys at most once per hour


async def _fetch_jwks() -> None:
    """Download JWKS from Clerk and populate the in-process cache."""
    global _jwks_cache, _jwks_fetched_at

    jwks_url = getattr(settings, "CLERK_JWKS_URL", None)
    if not jwks_url:
        logger.warning("CLERK_JWKS_URL not configured – JWT validation disabled")
        return

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(jwks_url)
            resp.raise_for_status()
            data = resp.json()

        new_cache: Dict[str, Any] = {}
        for key_data in data.get("keys", []):
            kid = key_data.get("kid")
            if kid:
                public_key = RSAAlgorithm.from_jwk(key_data)
                new_cache[kid] = public_key

        _jwks_cache = new_cache
        _jwks_fetched_at = time.monotonic()
        logger.info(f"JWKS refreshed – {len(_jwks_cache)} key(s) loaded")
    except Exception as exc:
        logger.error(f"Failed to fetch JWKS from {jwks_url}: {exc}")


async def _get_public_key(kid: str) -> Optional[Any]:
    """Return the public key for *kid*, refreshing the cache if needed."""
    now = time.monotonic()
    if now - _jwks_fetched_at > _JWKS_TTL or kid not in _jwks_cache:
        await _fetch_jwks()
    return _jwks_cache.get(kid)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def validate_token(token: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Validate a Clerk JWT and return the decoded claims, or *None* on failure.

    Usage (FastAPI dependency):
        from fastapi import Depends
        from app.auth import validate_token

        @router.get("/protected")
        async def protected(user = Depends(validate_token)):
            if not user:
                raise HTTPException(status_code=401, detail="Unauthorized")
            ...
    """
    if not token:
        return None

    jwks_url = getattr(settings, "CLERK_JWKS_URL", None)
    if not jwks_url:
        # Development fallback – accept any non-empty token
        logger.debug("CLERK_JWKS_URL not set; skipping JWT validation (dev mode)")
        return {"user_id": "dev_user", "dev_mode": True}

    try:
        # Decode header without verification to extract key-id
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            logger.warning("JWT missing 'kid' header field")
            return None

        public_key = await _get_public_key(kid)
        if public_key is None:
            logger.warning(f"No public key found for kid={kid}")
            return None

        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"require": ["sub", "exp", "iat"]},
        )

        # Normalize to a consistent user context dict
        return {
            "user_id": payload.get("sub"),
            "claims": payload,
        }

    except jwt.ExpiredSignatureError:
        logger.info("JWT validation failed: token expired")
        return None
    except jwt.InvalidTokenError as exc:
        logger.info(f"JWT validation failed: {exc}")
        return None
    except Exception as exc:
        logger.error(f"Unexpected error during JWT validation: {exc}")
        return None


async def require_token(token: Optional[str] = None) -> Dict[str, Any]:
    """
    Strict variant – raises HTTP 401 if the token is missing or invalid.

    Use this as a dependency on endpoints that must be authenticated.
    """
    user = await validate_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
