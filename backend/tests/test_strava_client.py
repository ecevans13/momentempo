"""Tests for Strava API client: rate limit parsing, activity converter, paginated fetch."""

import asyncio
import json

import httpx
import pytest
import respx
from httpx import Response

from backend.app.models import Activity
from backend.app.services.strava_client import (
    STRAVA_API_BASE,
    RateLimitState,
    fetch_all_activities,
    strava_activity_to_model,
    strava_get,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RATE_LIMIT_HEADERS = {
    "X-ReadRateLimit-Limit": "100,1000",
    "X-ReadRateLimit-Usage": "42,567",
}


def _make_strava_activity(
    activity_id: int = 1,
    name: str = "Morning Run",
    sport_type: str = "Run",
    activity_type: str = "Run",
    start_date: str = "2024-06-15T08:30:00Z",
    distance: float = 10000.0,
    **overrides,
) -> dict:
    """Build a minimal Strava SummaryActivity JSON dict."""
    base = {
        "id": activity_id,
        "name": name,
        "sport_type": sport_type,
        "type": activity_type,
        "start_date": start_date,
        "start_date_local": "2024-06-15T10:30:00",
        "timezone": "(GMT+02:00) Europe/Berlin",
        "distance": distance,
        "moving_time": 3000,
        "elapsed_time": 3200,
        "total_elevation_gain": 100.0,
        "average_speed": 3.33,
        "max_speed": 5.0,
        "has_heartrate": True,
        "average_heartrate": 150.0,
        "max_heartrate": 180.0,
        "kudos_count": 5,
        "map": {"id": "a123", "summary_polyline": "abc123"},
        "start_latlng": [48.1, 11.5],
        "end_latlng": [48.2, 11.6],
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# RateLimitState tests
# ---------------------------------------------------------------------------


def test_rate_limit_from_headers():
    """RateLimitState correctly parses Strava rate limit headers."""
    headers = httpx.Headers(RATE_LIMIT_HEADERS)
    state = RateLimitState.from_headers(headers)

    assert state.short_limit == 100
    assert state.daily_limit == 1000
    assert state.short_usage == 42
    assert state.daily_usage == 567


def test_rate_limit_from_empty_headers():
    """RateLimitState uses defaults when headers are missing."""
    headers = httpx.Headers({})
    state = RateLimitState.from_headers(headers)

    assert state.short_limit == 100
    assert state.daily_limit == 1000
    assert state.short_usage == 0
    assert state.daily_usage == 0


def test_rate_limit_remaining():
    """short_remaining and daily_remaining compute correctly."""
    state = RateLimitState(short_limit=100, short_usage=90, daily_limit=1000, daily_usage=950)
    assert state.short_remaining == 10
    assert state.daily_remaining == 50


def test_rate_limit_remaining_clamped_to_zero():
    """Remaining never goes negative when usage exceeds limit."""
    state = RateLimitState(short_limit=100, short_usage=110, daily_limit=1000, daily_usage=1100)
    assert state.short_remaining == 0
    assert state.daily_remaining == 0


def test_rate_limit_should_pause():
    """should_pause returns True when approaching limits."""
    # Near short limit
    state = RateLimitState(short_limit=100, short_usage=99, daily_limit=1000, daily_usage=0)
    assert state.should_pause() is True

    # Near daily limit
    state2 = RateLimitState(short_limit=100, short_usage=0, daily_limit=1000, daily_usage=996)
    assert state2.should_pause() is True

    # Plenty of budget
    state3 = RateLimitState(short_limit=100, short_usage=10, daily_limit=1000, daily_usage=100)
    assert state3.should_pause() is False


def test_seconds_until_short_reset():
    """seconds_until_short_reset returns a positive value."""
    state = RateLimitState()
    seconds = state.seconds_until_short_reset()
    assert seconds >= 1.0
    assert seconds <= 15 * 60  # max 15 minutes


# ---------------------------------------------------------------------------
# strava_activity_to_model converter tests
# ---------------------------------------------------------------------------


def test_converter_basic_fields():
    """Converter maps core Strava fields to Activity model."""
    data = _make_strava_activity(activity_id=42, name="Trail Run", sport_type="TrailRun")
    activity = strava_activity_to_model(data)

    assert isinstance(activity, Activity)
    assert activity.id == 42
    assert activity.name == "Trail Run"
    assert activity.sport_type == "TrailRun"
    assert activity.activity_type == "Run"
    assert activity.distance == 10000.0
    assert activity.has_heartrate is True
    assert activity.average_heartrate == 150.0


def test_converter_epoch_parsing():
    """Converter correctly parses ISO 8601 start_date to epoch."""
    data = _make_strava_activity(start_date="2024-06-15T08:30:00Z")
    activity = strava_activity_to_model(data)

    # 2024-06-15T08:30:00Z = 1718440200
    assert activity.start_date_epoch == 1718440200
    assert activity.start_date == "2024-06-15T08:30:00Z"


def test_converter_nullable_fields():
    """Converter sets optional fields to None when absent from Strava data."""
    data = _make_strava_activity()
    # Remove optional fields
    data.pop("average_heartrate", None)
    data["has_heartrate"] = False
    data.pop("max_heartrate", None)

    activity = strava_activity_to_model(data)
    assert activity.average_heartrate is None
    assert activity.max_heartrate is None
    assert activity.average_watts is None
    assert activity.gear_id is None


def test_converter_latlng_serialization():
    """Converter serializes latlng arrays to JSON strings."""
    data = _make_strava_activity()
    activity = strava_activity_to_model(data)

    assert activity.start_latlng == "[48.1, 11.5]"
    assert activity.end_latlng == "[48.2, 11.6]"

    # Verify round-trip
    parsed = json.loads(activity.start_latlng)
    assert parsed == [48.1, 11.5]


def test_converter_summary_polyline():
    """Converter extracts summary_polyline from nested map object."""
    data = _make_strava_activity()
    activity = strava_activity_to_model(data)
    assert activity.summary_polyline == "abc123"


def test_converter_no_map():
    """Converter handles missing map gracefully."""
    data = _make_strava_activity()
    data.pop("map")
    activity = strava_activity_to_model(data)
    assert activity.summary_polyline is None


def test_converter_invalid_start_date():
    """Converter defaults epoch to 0 for unparseable start_date."""
    data = _make_strava_activity(start_date="not-a-date")
    activity = strava_activity_to_model(data)
    assert activity.start_date_epoch == 0


# ---------------------------------------------------------------------------
# strava_get and fetch_all_activities tests (mocked HTTP)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@respx.mock
async def test_strava_get_success():
    """strava_get returns response and updated rate limit state."""
    respx.get(f"{STRAVA_API_BASE}/athlete/activities").mock(
        return_value=Response(200, json=[{"id": 1}], headers=RATE_LIMIT_HEADERS)
    )

    async with httpx.AsyncClient() as client:
        response, rate_limit = await strava_get(
            client, "/athlete/activities", "test_token"
        )

    assert response.status_code == 200
    assert rate_limit.short_usage == 42
    assert rate_limit.daily_usage == 567


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_activities_pagination():
    """fetch_all_activities paginates until an empty page is returned."""
    activities_page1 = [_make_strava_activity(activity_id=i) for i in range(200)]
    activities_page2 = [_make_strava_activity(activity_id=200 + i) for i in range(50)]

    route = respx.get(f"{STRAVA_API_BASE}/athlete/activities")
    route.side_effect = [
        Response(200, json=activities_page1, headers=RATE_LIMIT_HEADERS),
        Response(200, json=activities_page2, headers=RATE_LIMIT_HEADERS),
        Response(200, json=[], headers=RATE_LIMIT_HEADERS),  # Empty page = done
    ]

    async with httpx.AsyncClient() as client:
        activities, rate_limit = await fetch_all_activities(client, "test_token")

    assert len(activities) == 250


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_activities_short_page_continues():
    """Short pages (< 200) do NOT terminate pagination — only empty pages do."""
    activities_page1 = [_make_strava_activity(activity_id=i) for i in range(50)]  # Short page
    activities_page2 = [_make_strava_activity(activity_id=50 + i) for i in range(30)]

    route = respx.get(f"{STRAVA_API_BASE}/athlete/activities")
    route.side_effect = [
        Response(200, json=activities_page1, headers=RATE_LIMIT_HEADERS),
        Response(200, json=activities_page2, headers=RATE_LIMIT_HEADERS),
        Response(200, json=[], headers=RATE_LIMIT_HEADERS),
    ]

    async with httpx.AsyncClient() as client:
        activities, _ = await fetch_all_activities(client, "test_token")

    # Both short pages included — only empty page terminates
    assert len(activities) == 80


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_activities_with_after_param():
    """fetch_all_activities passes `after` param for incremental sync."""
    respx.get(f"{STRAVA_API_BASE}/athlete/activities").mock(
        return_value=Response(200, json=[], headers=RATE_LIMIT_HEADERS)
    )

    async with httpx.AsyncClient() as client:
        activities, _ = await fetch_all_activities(client, "test_token", after=1700000000)

    assert len(activities) == 0
    # Verify the after param was sent
    request = respx.calls.last.request
    assert "after=1700000000" in str(request.url)


@pytest.mark.asyncio
@respx.mock
async def test_strava_get_429_retry(monkeypatch):
    """strava_get retries on 429 after sleeping until reset."""
    # Patch asyncio.sleep to be instant
    async def instant_sleep(_):
        pass

    monkeypatch.setattr("backend.app.services.strava_client.asyncio.sleep", instant_sleep)

    route = respx.get(f"{STRAVA_API_BASE}/athlete/activities")
    route.side_effect = [
        Response(429, headers=RATE_LIMIT_HEADERS),
        Response(200, json=[{"id": 1}], headers=RATE_LIMIT_HEADERS),
    ]

    async with httpx.AsyncClient() as client:
        response, _ = await strava_get(
            client, "/athlete/activities", "test_token"
        )

    assert response.status_code == 200
