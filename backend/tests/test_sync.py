"""Integration tests for sync orchestrator and HTTP endpoints."""

import asyncio
import time

import pytest
import respx
from httpx import Response
from sqlmodel import Session, select

from backend.app.config import Settings
from backend.app.models import Activity, SyncState, Token
from backend.app.services.strava_sync import TTL_SECONDS, get_sync_state, run_sync

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

STRAVA_API_BASE = "https://www.strava.com/api/v3"
STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token"

RATE_LIMIT_HEADERS = {
    "X-ReadRateLimit-Limit": "100,1000",
    "X-ReadRateLimit-Usage": "1,1",
}


def _make_test_settings() -> Settings:
    return Settings(
        strava_client_id=12345,
        strava_client_secret="test_secret",
        strava_redirect_uri="http://localhost:8000/auth/callback",
        database_url="sqlite:///:memory:",
    )


def _insert_valid_token(session: Session) -> Token:
    """Insert a valid (non-expired) token for testing."""
    token = Token(
        id=1,
        access_token="test_access_token",
        refresh_token="test_refresh_token",
        expires_at=int(time.time()) + 86400,  # 24h from now
    )
    session.add(token)
    session.commit()
    return token


def _make_strava_activity(activity_id: int, start_date: str = "2024-06-15T08:30:00Z") -> dict:
    return {
        "id": activity_id,
        "name": f"Activity {activity_id}",
        "sport_type": "Run",
        "type": "Run",
        "start_date": start_date,
        "start_date_local": "2024-06-15T10:30:00",
        "distance": 10000.0,
        "moving_time": 3000,
        "elapsed_time": 3200,
        "total_elevation_gain": 100.0,
        "average_speed": 3.33,
        "max_speed": 5.0,
        "has_heartrate": False,
        "map": {"id": "a1", "summary_polyline": "enc"},
    }


# ---------------------------------------------------------------------------
# get_sync_state tests
# ---------------------------------------------------------------------------


def test_get_sync_state_creates_singleton(session: Session):
    """get_sync_state creates the singleton row if it doesn't exist."""
    state = get_sync_state(session)
    assert state.id == 1
    assert state.is_initial_backfill_done is False


def test_get_sync_state_returns_existing(session: Session):
    """get_sync_state returns existing row without creating a duplicate."""
    state = SyncState(id=1, activities_synced=42)
    session.add(state)
    session.commit()

    result = get_sync_state(session)
    assert result.activities_synced == 42


# ---------------------------------------------------------------------------
# run_sync orchestrator tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@respx.mock
async def test_sync_full_backfill(session: Session):
    """First sync does a full backfill and marks backfill done."""
    _insert_valid_token(session)
    settings = _make_test_settings()

    activities = [_make_strava_activity(i) for i in range(5)]
    respx.get(f"{STRAVA_API_BASE}/athlete/activities").side_effect = [
        Response(200, json=activities, headers=RATE_LIMIT_HEADERS),
        Response(200, json=[], headers=RATE_LIMIT_HEADERS),
    ]

    result = await run_sync(session, settings)

    assert result["status"] == "completed"
    assert result["fetched"] == 5
    assert result["total"] == 5

    state = get_sync_state(session)
    assert state.is_initial_backfill_done is True
    assert state.activities_synced == 5


@pytest.mark.asyncio
@respx.mock
async def test_sync_incremental(session: Session):
    """After backfill, sync uses incremental mode with after param."""
    _insert_valid_token(session)
    settings = _make_test_settings()

    # Pre-populate: mark backfill done with existing activity
    state = SyncState(id=1, is_initial_backfill_done=True, last_sync_completed_at=0.0)
    session.add(state)
    existing = Activity(
        id=100,
        name="Old Run",
        sport_type="Run",
        activity_type="Run",
        start_date="2024-01-01T00:00:00Z",
        start_date_epoch=1704067200,
    )
    session.add(existing)
    session.commit()

    new_activities = [_make_strava_activity(200 + i, "2024-06-20T08:00:00Z") for i in range(3)]
    route = respx.get(f"{STRAVA_API_BASE}/athlete/activities")
    route.side_effect = [
        Response(200, json=new_activities, headers=RATE_LIMIT_HEADERS),
        Response(200, json=[], headers=RATE_LIMIT_HEADERS),
    ]

    result = await run_sync(session, settings)

    assert result["status"] == "completed"
    assert result["fetched"] == 3
    assert result["total"] == 4  # 1 existing + 3 new

    # Verify after param was used (should be max_epoch - 86400)
    request = respx.calls[0].request
    assert "after=" in str(request.url)


@pytest.mark.asyncio
async def test_sync_ttl_gate_skip(session: Session):
    """Sync is skipped when TTL gate hasn't expired."""
    _insert_valid_token(session)
    settings = _make_test_settings()

    # Set last sync to just now
    state = SyncState(id=1, last_sync_completed_at=time.time())
    session.add(state)
    session.commit()

    result = await run_sync(session, settings)

    assert result["status"] == "skipped"
    assert result["reason"] == "ttl_gate"
    assert "retry_after_seconds" in result


@pytest.mark.asyncio
@respx.mock
async def test_sync_ttl_gate_allows_after_expiry(session: Session):
    """Sync proceeds when TTL gate has expired."""
    _insert_valid_token(session)
    settings = _make_test_settings()

    # Set last sync to well before TTL
    state = SyncState(id=1, last_sync_completed_at=time.time() - TTL_SECONDS - 10)
    session.add(state)
    session.commit()

    respx.get(f"{STRAVA_API_BASE}/athlete/activities").mock(
        return_value=Response(200, json=[], headers=RATE_LIMIT_HEADERS)
    )

    result = await run_sync(session, settings)
    assert result["status"] == "completed"


@pytest.mark.asyncio
async def test_sync_no_token(session: Session):
    """Sync returns error when no token is stored."""
    settings = _make_test_settings()

    result = await run_sync(session, settings)

    assert result["status"] == "skipped"
    assert result["reason"] == "no_token"


@pytest.mark.asyncio
@respx.mock
async def test_sync_upsert_dedup(session: Session):
    """Running sync twice with overlapping data produces no duplicates."""
    _insert_valid_token(session)
    settings = _make_test_settings()

    activities = [_make_strava_activity(i) for i in range(3)]

    # First sync
    respx.get(f"{STRAVA_API_BASE}/athlete/activities").side_effect = [
        Response(200, json=activities, headers=RATE_LIMIT_HEADERS),
        Response(200, json=[], headers=RATE_LIMIT_HEADERS),
    ]
    result1 = await run_sync(session, settings)
    assert result1["total"] == 3

    # Reset TTL for second sync
    state = get_sync_state(session)
    state.last_sync_completed_at = 0.0
    session.add(state)
    session.commit()

    # Second sync with same activities (overlap)
    respx.get(f"{STRAVA_API_BASE}/athlete/activities").side_effect = [
        Response(200, json=activities, headers=RATE_LIMIT_HEADERS),
        Response(200, json=[], headers=RATE_LIMIT_HEADERS),
    ]
    result2 = await run_sync(session, settings)

    # Still only 3 activities total — no duplicates
    assert result2["total"] == 3


@pytest.mark.asyncio
@respx.mock
async def test_sync_strava_api_error(session: Session):
    """Sync returns error status on Strava API failure."""
    _insert_valid_token(session)
    settings = _make_test_settings()

    respx.get(f"{STRAVA_API_BASE}/athlete/activities").mock(
        return_value=Response(500, json={"error": "server_error"}, headers=RATE_LIMIT_HEADERS)
    )

    result = await run_sync(session, settings)
    assert result["status"] == "error"
    assert "500" in result["reason"]


# ---------------------------------------------------------------------------
# HTTP endpoint tests
# ---------------------------------------------------------------------------


def test_sync_status_endpoint_empty(client):
    """GET /api/sync/status returns defaults when no sync has run."""
    response = client.get("/api/sync/status")
    assert response.status_code == 200

    data = response.json()
    assert data["is_initial_backfill_done"] is False
    assert data["total_activities_in_db"] == 0


def test_sync_status_endpoint_after_state(client, session: Session):
    """GET /api/sync/status reflects stored SyncState."""
    state = SyncState(
        id=1,
        last_sync_completed_at=time.time() - 60,
        is_initial_backfill_done=True,
        activities_synced=100,
        last_sync_activities_fetched=10,
    )
    session.add(state)
    session.commit()

    response = client.get("/api/sync/status")
    assert response.status_code == 200

    data = response.json()
    assert data["is_initial_backfill_done"] is True
    assert data["activities_synced"] == 100
    assert data["ttl_remaining_seconds"] > 0


@respx.mock
def test_trigger_sync_no_token(client):
    """POST /api/sync returns skipped when no token exists."""
    response = client.post("/api/sync")
    assert response.status_code == 202

    data = response.json()
    assert data["status"] == "skipped"
    assert data["reason"] == "no_token"


@respx.mock
def test_trigger_sync_ttl_gate(client, session: Session):
    """POST /api/sync returns skipped when TTL gate is active."""
    _insert_valid_token(session)

    state = SyncState(id=1, last_sync_completed_at=time.time())
    session.add(state)
    session.commit()

    response = client.post("/api/sync")
    assert response.status_code == 202

    data = response.json()
    assert data["status"] == "skipped"
    assert data["reason"] == "ttl_gate"
