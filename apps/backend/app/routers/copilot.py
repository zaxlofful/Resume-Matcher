"""GitHub Copilot OAuth device flow endpoints.

WARNING: This implementation uses in-memory storage for device codes, which means:
1. Tokens are lost on server restart
2. Not suitable for multi-instance deployments
3. For production use, implement persistent storage (Redis, database)

This is acceptable for single-user, local deployments.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException

from app.schemas import (
    CopilotBearerTokenResponse,
    CopilotDeviceCodeResponse,
    CopilotTokenPollRequest,
    CopilotTokenPollResponse,
)
from app.llm import COPILOT_TOKEN_CACHE_EXPIRY_HOURS

router = APIRouter(prefix="/config/copilot", tags=["GitHub Copilot OAuth"])

logger = logging.getLogger(__name__)

# GitHub OAuth endpoints
GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token"

# GitHub Copilot OAuth App Client ID (public, used by various Copilot integrations)
# This is the same client ID used by copilot.vim and other CLI tools
COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98"

# Scope required for Copilot access
COPILOT_SCOPE = "read:user"

# In-memory storage for device codes (in production, use Redis or database)
# Maps device_code -> {"access_token": str, "expires_at": datetime}
_token_cache: dict[str, dict] = {}


@router.post("/device-code", response_model=CopilotDeviceCodeResponse)
async def initiate_device_flow() -> CopilotDeviceCodeResponse:
    """Initiate GitHub OAuth device flow for Copilot authentication.
    
    Returns device code and user code that the user must enter at the verification URL.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GITHUB_DEVICE_CODE_URL,
                headers={
                    "Accept": "application/json",
                },
                json={
                    "client_id": COPILOT_CLIENT_ID,
                    "scope": COPILOT_SCOPE,
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            
            return CopilotDeviceCodeResponse(
                device_code=data["device_code"],
                user_code=data["user_code"],
                verification_uri=data["verification_uri"],
                expires_in=data["expires_in"],
                interval=data["interval"],
            )
    except httpx.HTTPError as e:
        logger.error(f"Failed to initiate device flow: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to initiate GitHub authentication. Please try again.",
        )


@router.post("/token", response_model=CopilotTokenPollResponse)
async def poll_for_token(request: CopilotTokenPollRequest) -> CopilotTokenPollResponse:
    """Poll for OAuth access token after user authorization.
    
    Client should poll this endpoint at the interval specified in the device code response.
    Returns status: "pending" while waiting, "success" with token when authorized.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GITHUB_TOKEN_URL,
                headers={
                    "Accept": "application/json",
                },
                json={
                    "client_id": COPILOT_CLIENT_ID,
                    "device_code": request.device_code,
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                },
                timeout=30.0,
            )
            
            data = response.json()
            
            # Check for errors
            if "error" in data:
                error = data["error"]
                if error == "authorization_pending":
                    return CopilotTokenPollResponse(status="pending")
                elif error == "expired_token":
                    return CopilotTokenPollResponse(status="expired", error="Device code has expired")
                elif error == "access_denied":
                    return CopilotTokenPollResponse(status="error", error="User denied access")
                else:
                    return CopilotTokenPollResponse(status="error", error=f"Authorization failed: {error}")
            
            # Success - got the access token
            if "access_token" in data:
                access_token = data["access_token"]
                
                # Cache the token for bearer token exchange
                _token_cache[request.device_code] = {
                    "access_token": access_token,
                    "expires_at": datetime.now(timezone.utc) + timedelta(hours=COPILOT_TOKEN_CACHE_EXPIRY_HOURS),
                }
                
                return CopilotTokenPollResponse(
                    status="success",
                    access_token=access_token,
                )
            
            return CopilotTokenPollResponse(status="error", error="Unexpected response from GitHub")
            
    except httpx.HTTPError as e:
        logger.error(f"Failed to poll for token: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to check authorization status. Please try again.",
        )


@router.post("/bearer-token", response_model=CopilotBearerTokenResponse)
async def exchange_for_bearer_token(request: CopilotTokenPollRequest) -> CopilotBearerTokenResponse:
    """Exchange GitHub OAuth token for Copilot-specific bearer token.
    
    This token is used to authenticate with the GitHub Copilot API.
    """
    # Get access token from cache
    cached = _token_cache.get(request.device_code)
    if not cached:
        raise HTTPException(
            status_code=400,
            detail="No access token found. Please complete the authorization flow first.",
        )
    
    access_token = cached["access_token"]
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                GITHUB_COPILOT_TOKEN_URL,
                headers={
                    "Authorization": f"token {access_token}",
                    "Accept": "application/json",
                    # Spoof editor headers as required by Copilot API
                    "Editor-Version": "vscode/1.95.0",
                    "Editor-Plugin-Version": "copilot/1.155.0",
                    "User-Agent": "GithubCopilot/1.155.0",
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            
            # Clean up cache after successful exchange
            if request.device_code in _token_cache:
                del _token_cache[request.device_code]
            
            return CopilotBearerTokenResponse(
                token=data["token"],
                expires_at=data.get("expires_at"),
            )
    except httpx.HTTPError as e:
        logger.error(f"Failed to exchange for bearer token: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to obtain Copilot token. Please ensure you have an active GitHub Copilot subscription.",
        )
