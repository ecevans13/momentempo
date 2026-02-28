import asyncio
import logging
import time
import urllib.parse
import webbrowser

import httpx
from sqlmodel import Session, select

from ..config import Settings
from ..models import Token

logger = logging.getLogger(__name__)

STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token"
REQUIRED_SCOPES = {"activity:read_all"}
REFRESH_BUFFER_SECONDS = 3600  # Refresh when within 1 hour of expiry


def build_auth_url(settings: Settings) -> str:
    """Build the Strava OAuth consent URL."""
    params = {
        "client_id": settings.strava_client_id,
        "redirect_uri": settings.strava_redirect_uri,
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": "activity:read_all,profile:read_all",
    }
    return f"{STRAVA_AUTH_URL}?{urllib.parse.urlencode(params)}"


def token_needs_refresh(expires_at: int) -> bool:
    """Return True if the token is expired or within the refresh buffer window."""
    return time.time() >= (expires_at - REFRESH_BUFFER_SECONDS)


async def exchange_code_for_tokens(code: str, settings: Settings) -> dict:
    """Exchange an OAuth authorization code for access and refresh tokens."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            STRAVA_TOKEN_URL,
            data={
                "client_id": settings.strava_client_id,
                "client_secret": settings.strava_client_secret,
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        response.raise_for_status()
        return response.json()


async def refresh_access_token(refresh_token: str, settings: Settings) -> dict:
    """Refresh an expired access token using the stored refresh token.

    CRITICAL: The response contains a NEW refresh_token that MUST be persisted.
    The old refresh_token becomes invalid after approximately 1 hour.
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            STRAVA_TOKEN_URL,
            data={
                "client_id": settings.strava_client_id,
                "client_secret": settings.strava_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        response.raise_for_status()
        return response.json()


async def ensure_valid_token(session: Session, settings: Settings) -> Token | None:
    """Ensure the stored token is valid, refreshing it if necessary.

    Returns the (possibly refreshed) Token, or None if no token exists.
    Network errors during refresh are logged but do not raise — the existing
    token is returned so the caller can handle any resulting 401.
    """
    token = session.exec(select(Token).where(Token.id == 1)).first()

    if token is None:
        return None

    if not token_needs_refresh(token.expires_at):
        return token

    # Token is expired or within the refresh buffer — attempt silent refresh
    try:
        token_data = await refresh_access_token(token.refresh_token, settings)
        token.access_token = token_data["access_token"]
        token.refresh_token = token_data["refresh_token"]
        token.expires_at = token_data["expires_at"]
        session.add(token)
        session.commit()
        session.refresh(token)
        return token
    except Exception as exc:
        logger.warning("Token refresh failed: %s — continuing with existing token", exc)
        return token


async def bootstrap_auth(engine, settings: Settings) -> None:
    """Called during lifespan startup to bootstrap authentication.

    - No stored token: opens browser to Strava consent page.
    - Expired/near-expiry token: silently refreshes.
    - Valid token: completely silent (no log output).
    """
    with Session(engine) as session:
        token = session.exec(select(Token).where(Token.id == 1)).first()

        if token is None:
            auth_url = build_auth_url(settings)
            if settings.environment == "production":
                logger.info(
                    "No stored tokens — visit this URL to authorize: %s", auth_url
                )
            else:
                logger.info(
                    "No stored tokens found — opening browser for Strava authorization"
                )
                # Give the server a moment to finish binding to the port before
                # the browser fires the callback request.
                await asyncio.sleep(1.0)
                webbrowser.open(auth_url)
        elif token_needs_refresh(token.expires_at):
            logger.info("Refreshing expired token")
            await ensure_valid_token(session, settings)
        # If token is valid: stay silent — no log, no browser, no prompts
