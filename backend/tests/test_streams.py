"""Tests for ActivityStream model and fetch_and_cache_streams service (Phase 7, Plan 01)."""

import time

import pytest
import respx
from httpx import Response
from sqlmodel import Session, select

from backend.app.models import ActivityStream, Token
from backend.app.services.streams_service import _extract_stream_data, fetch_and_cache_streams
from backend.tests.conftest import get_test_settings

STRAVA_API = "https://www.strava.com/api/v3"

SAMPLE_STREAMS_RESPONSE = {
    "latlng": {"data": [[38.5, -122.8], [38.51, -122.81]], "series_type": "distance", "original_size": 2, "resolution": "high"},
    "altitude": {"data": [100.0, 102.5], "series_type": "distance", "original_size": 2, "resolution": "high"},
    "heartrate": {"data": [145, 150], "series_type": "distance", "original_size": 2, "resolution": "high"},
    "velocity_smooth": {"data": [3.2, 3.4], "series_type": "distance", "original_size": 2, "resolution": "high"},
    "time": {"data": [0, 5], "series_type": "distance", "original_size": 2, "resolution": "high"},
    "distance": {"data": [0.0, 15.5], "series_type": "distance", "original_size": 2, "resolution": "high"},
}


@pytest.fixture
def token_in_db(session: Session) -> Token:
    """Insert a valid token into the DB."""
    token = Token(
        id=1,
        access_token="test_access_token",
        refresh_token="test_refresh_token",
        expires_at=int(time.time()) + 3600,
        athlete_name="Test User",
    )
    session.add(token)
    session.commit()
    session.refresh(token)
    return token


# ── Model tests ──────────────────────────────────────────────────────────────


def test_activity_stream_create_with_data(session: Session):
    """ActivityStream with all fields populated survives a JSON round-trip."""
    stream = ActivityStream(
        activity_id=100,
        latlng=[[38.5, -122.8], [38.51, -122.81]],
        altitude=[100.0, 102.5],
        heartrate=[145, 150],
        velocity_smooth=[3.2, 3.4],
        time=[0, 5],
        distance=[0.0, 15.5],
        fetched_at=time.time(),
    )
    session.add(stream)
    session.commit()

    fetched = session.get(ActivityStream, 100)
    assert fetched is not None
    assert fetched.latlng == [[38.5, -122.8], [38.51, -122.81]]
    assert fetched.altitude == [100.0, 102.5]
    assert fetched.heartrate == [145, 150]
    assert fetched.velocity_smooth == [3.2, 3.4]
    assert fetched.time == [0, 5]
    assert fetched.distance == [0.0, 15.5]
    assert fetched.fetched_at is not None


def test_activity_stream_create_no_gps(session: Session):
    """ActivityStream with only activity_id and fetched_at (sentinel) stores without error."""
    stream = ActivityStream(activity_id=200, fetched_at=time.time())
    session.add(stream)
    session.commit()

    fetched = session.get(ActivityStream, 200)
    assert fetched is not None
    assert fetched.latlng is None
    assert fetched.altitude is None
    assert fetched.heartrate is None
    assert fetched.velocity_smooth is None
    assert fetched.time is None
    assert fetched.distance is None
    assert fetched.fetched_at is not None


def test_activity_stream_merge_upsert(session: Session):
    """session.merge() updates an existing row and leaves only one row."""
    original = ActivityStream(activity_id=300, latlng=[[1.0, 2.0]], fetched_at=1000.0)
    session.add(original)
    session.commit()

    updated = ActivityStream(activity_id=300, latlng=[[9.0, 8.0]], fetched_at=2000.0)
    merged = session.merge(updated)
    session.commit()
    session.refresh(merged)

    rows = session.exec(select(ActivityStream).where(ActivityStream.activity_id == 300)).all()
    assert len(rows) == 1
    assert rows[0].latlng == [[9.0, 8.0]]
    assert rows[0].fetched_at == 2000.0


# ── Service tests ─────────────────────────────────────────────────────────────


@respx.mock
async def test_fetch_and_cache_streams_cache_miss(session: Session, token_in_db: Token):
    """Cache miss: fetches from Strava, stores result with fetched_at set."""
    activity_id = 999
    respx.get(f"{STRAVA_API}/activities/{activity_id}/streams").mock(
        return_value=Response(200, json=SAMPLE_STREAMS_RESPONSE)
    )

    result = await fetch_and_cache_streams(activity_id, session, get_test_settings())

    assert result is not None
    assert result.activity_id == activity_id
    assert result.fetched_at is not None
    assert result.latlng == [[38.5, -122.8], [38.51, -122.81]]
    assert result.altitude == [100.0, 102.5]
    assert result.heartrate == [145, 150]
    assert respx.calls.call_count == 1


@respx.mock
async def test_fetch_and_cache_streams_cache_hit(session: Session, token_in_db: Token):
    """Cache hit: returns existing row without making any HTTP call."""
    activity_id = 888
    cached = ActivityStream(
        activity_id=activity_id,
        latlng=[[10.0, 20.0]],
        fetched_at=time.time(),
    )
    session.add(cached)
    session.commit()

    result = await fetch_and_cache_streams(activity_id, session, get_test_settings())

    assert result is not None
    assert result.activity_id == activity_id
    assert result.latlng == [[10.0, 20.0]]
    assert respx.calls.call_count == 0


@respx.mock
async def test_fetch_and_cache_streams_no_gps_activity(session: Session, token_in_db: Token):
    """Empty response stores sentinel; second call returns cached sentinel without API call."""
    activity_id = 777
    respx.get(f"{STRAVA_API}/activities/{activity_id}/streams").mock(
        return_value=Response(200, json={})
    )

    result = await fetch_and_cache_streams(activity_id, session, get_test_settings())

    assert result is not None
    assert result.fetched_at is not None
    assert result.latlng is None
    assert result.altitude is None
    assert respx.calls.call_count == 1

    # Second call — should hit cache, no new API call
    result2 = await fetch_and_cache_streams(activity_id, session, get_test_settings())
    assert result2 is not None
    assert respx.calls.call_count == 1  # Still 1, no new call


@respx.mock
async def test_fetch_and_cache_streams_404(session: Session, token_in_db: Token):
    """404 from Strava stores sentinel row; no exception raised."""
    activity_id = 666
    respx.get(f"{STRAVA_API}/activities/{activity_id}/streams").mock(
        return_value=Response(404, json={"message": "Not Found"})
    )

    result = await fetch_and_cache_streams(activity_id, session, get_test_settings())

    assert result is not None
    assert result.activity_id == activity_id
    assert result.fetched_at is not None
    assert result.latlng is None


@respx.mock
async def test_fetch_and_cache_streams_no_token(session: Session):
    """Missing token raises HTTPException 401."""
    from fastapi import HTTPException

    activity_id = 555
    with pytest.raises(HTTPException) as exc_info:
        await fetch_and_cache_streams(activity_id, session, get_test_settings())

    assert exc_info.value.status_code == 401
