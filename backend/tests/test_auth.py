"""Comprehensive tests for Strava OAuth flow and auth service functions."""
import time
from unittest.mock import patch

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response
from sqlmodel import Session, select

from backend.app.models import Token
from backend.app.services.strava_auth import (
    build_auth_url,
    ensure_valid_token,
    token_needs_refresh,
)
from backend.app.config import Settings

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

MOCK_TOKEN_RESPONSE = {
    "access_token": "new_access_token",
    "refresh_token": "new_refresh_token",
    "expires_at": 9_999_999_999,
    "expires_in": 21600,
    "token_type": "Bearer",
    "athlete": {
        "id": 123,
        "firstname": "John",
        "lastname": "Doe",
        "profile": "https://example.com/avatar.jpg",
    },
}

STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token"


def _make_test_settings() -> Settings:
    return Settings(
        strava_client_id=12345,
        strava_client_secret="test_secret",
        strava_redirect_uri="http://localhost:8000/auth/callback",
        database_url="sqlite:///:memory:",
    )


# ---------------------------------------------------------------------------
# token_needs_refresh unit tests (synchronous, no DB)
# ---------------------------------------------------------------------------


def test_token_needs_refresh_expired():
    """token_needs_refresh returns True when expires_at is in the past."""
    past = int(time.time()) - 100
    assert token_needs_refresh(past) is True


def test_token_needs_refresh_valid():
    """token_needs_refresh returns False when expires_at is far in the future."""
    future = int(time.time()) + 86400  # 24 hours from now
    assert token_needs_refresh(future) is False


def test_token_needs_refresh_within_buffer():
    """token_needs_refresh returns True when expires_at is within 1-hour buffer."""
    within_buffer = int(time.time()) + 1800  # 30 minutes from now (< 1-hour buffer)
    assert token_needs_refresh(within_buffer) is True


# ---------------------------------------------------------------------------
# build_auth_url unit test (synchronous, no DB)
# ---------------------------------------------------------------------------


def test_build_auth_url():
    """build_auth_url produces a correctly-structured Strava consent URL."""
    settings = _make_test_settings()
    url = build_auth_url(settings)

    assert url.startswith("https://www.strava.com/oauth/authorize")
    assert "client_id=12345" in url
    assert "scope=activity%3Aread_all%2Cprofile%3Aread_all" in url or "scope=activity:read_all" in url
    assert "redirect_uri=" in url
    assert "localhost" in url  # the redirect_uri contains localhost


# ---------------------------------------------------------------------------
# Login redirect test (HTTP endpoint)
# ---------------------------------------------------------------------------


def test_login_redirects(client: TestClient):
    """GET /auth/login returns a 307 redirect to strava.com."""
    response = client.get("/auth/login", follow_redirects=False)
    assert response.status_code in (307, 302)
    assert "strava.com/oauth/authorize" in response.headers["location"]


# ---------------------------------------------------------------------------
# Callback endpoint tests (HTTP endpoint, Strava mocked with respx)
# ---------------------------------------------------------------------------


@respx.mock
def test_callback_success(client: TestClient, session: Session):
    """Successful OAuth callback stores token + athlete info, shows success page."""
    respx.post(STRAVA_TOKEN_URL).mock(
        return_value=Response(200, json=MOCK_TOKEN_RESPONSE)
    )

    response = client.get(
        "/auth/callback",
        params={"code": "test_code", "scope": "activity:read_all,profile:read_all"},
    )

    assert response.status_code == 200
    assert "John Doe" in response.text

    token = session.exec(select(Token).where(Token.id == 1)).first()
    assert token is not None
    assert token.access_token == "new_access_token"
    assert token.refresh_token == "new_refresh_token"
    assert token.expires_at == 9_999_999_999
    assert token.athlete_name == "John Doe"
    assert token.athlete_avatar_url == "https://example.com/avatar.jpg"


def test_callback_error_denied(client: TestClient):
    """GET /auth/callback?error=access_denied returns 400 with error page."""
    response = client.get("/auth/callback", params={"error": "access_denied"})

    assert response.status_code == 400
    assert "access_denied" in response.text
    assert "Try Again" in response.text


def test_callback_missing_code(client: TestClient):
    """GET /auth/callback with no code and no error returns 400 error page."""
    response = client.get("/auth/callback")

    assert response.status_code == 400
    assert "Try Again" in response.text


def test_callback_missing_required_scope(client: TestClient):
    """Callback without activity:read_all scope returns 403 with explanation."""
    response = client.get(
        "/auth/callback",
        params={"code": "test_code", "scope": "profile:read_all"},
    )

    assert response.status_code == 403
    assert "activity:read_all" in response.text


@respx.mock
def test_callback_strava_exchange_fails(client: TestClient):
    """When Strava token exchange returns 400, callback returns error page."""
    respx.post(STRAVA_TOKEN_URL).mock(return_value=Response(400, json={"error": "bad_request"}))

    response = client.get(
        "/auth/callback",
        params={"code": "bad_code", "scope": "activity:read_all"},
    )

    assert response.status_code in (400, 500)
    # Should show an error page (HTML)
    assert "Try Again" in response.text or "Failed" in response.text or "Error" in response.text


@respx.mock
def test_callback_upsert_existing_token(client: TestClient, session: Session):
    """Callback with an existing token record upserts rather than inserting a duplicate."""
    # Pre-insert an existing token
    existing = Token(
        id=1,
        access_token="old_access",
        refresh_token="old_refresh",
        expires_at=int(time.time()) - 3600,
    )
    session.add(existing)
    session.commit()

    respx.post(STRAVA_TOKEN_URL).mock(
        return_value=Response(200, json=MOCK_TOKEN_RESPONSE)
    )

    response = client.get(
        "/auth/callback",
        params={"code": "test_code", "scope": "activity:read_all,profile:read_all"},
    )

    assert response.status_code == 200

    # Must still be exactly one token record
    session.expire_all()
    tokens = session.exec(select(Token)).all()
    assert len(tokens) == 1

    token = tokens[0]
    assert token.access_token == "new_access_token"
    assert token.refresh_token == "new_refresh_token"


# ---------------------------------------------------------------------------
# ensure_valid_token async service tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@respx.mock
async def test_ensure_valid_token_refreshes_expired(session: Session):
    """ensure_valid_token refreshes an expired token and persists the new tokens."""
    expired_token = Token(
        id=1,
        access_token="old_access",
        refresh_token="old_refresh",
        expires_at=int(time.time()) - 3600,  # expired
    )
    session.add(expired_token)
    session.commit()

    respx.post(STRAVA_TOKEN_URL).mock(
        return_value=Response(
            200,
            json={
                "access_token": "refreshed_access",
                "refresh_token": "refreshed_refresh",
                "expires_at": 9_999_999_999,
                "expires_in": 21600,
            },
        )
    )

    settings = _make_test_settings()
    result = await ensure_valid_token(session, settings)

    assert result is not None
    assert result.access_token == "refreshed_access"
    assert result.refresh_token == "refreshed_refresh"
    assert result.expires_at == 9_999_999_999

    session.expire_all()
    persisted = session.exec(select(Token).where(Token.id == 1)).first()
    assert persisted is not None
    assert persisted.access_token == "refreshed_access"
    assert persisted.refresh_token == "refreshed_refresh"


@pytest.mark.asyncio
@respx.mock
async def test_ensure_valid_token_network_error(session: Session, caplog):
    """ensure_valid_token handles a network error gracefully (no raise, logs warning)."""
    import httpx as _httpx

    expired_token = Token(
        id=1,
        access_token="old_access",
        refresh_token="old_refresh",
        expires_at=int(time.time()) - 3600,
    )
    session.add(expired_token)
    session.commit()

    respx.post(STRAVA_TOKEN_URL).mock(side_effect=_httpx.ConnectError("unreachable"))

    settings = _make_test_settings()

    import logging
    with caplog.at_level(logging.WARNING, logger="backend.app.services.strava_auth"):
        result = await ensure_valid_token(session, settings)

    # Must not raise — returns the existing (expired) token
    assert result is not None
    assert result.access_token == "old_access"

    # Error must have been logged
    assert any("refresh failed" in record.message.lower() for record in caplog.records)
