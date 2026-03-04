"""Tests for activity detail endpoints (Phase 4)."""

import time

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response
from sqlmodel import Session

from backend.app.models import Token

STRAVA_API = "https://www.strava.com/api/v3"


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


SAMPLE_DETAIL = {
    "id": 12345,
    "name": "Morning Run",
    "sport_type": "Run",
    "type": "Run",
    "start_date": "2026-02-15T08:00:00Z",
    "start_date_local": "2026-02-15T03:00:00Z",
    "distance": 5000.0,
    "moving_time": 1500,
    "elapsed_time": 1600,
    "total_elevation_gain": 50.0,
    "average_speed": 3.33,
    "max_speed": 4.5,
    "has_heartrate": True,
    "average_heartrate": 155.0,
    "max_heartrate": 175,
    "calories": 450.0,
    "description": "Easy morning run",
    "gear_id": "g123",
    "device_name": "Garmin Forerunner",
    "splits_metric": [
        {
            "split": 1,
            "distance": 1000.0,
            "moving_time": 300,
            "elapsed_time": 310,
            "elevation_difference": 10.0,
            "average_speed": 3.33,
            "average_heartrate": 150.0,
            "pace_zone": 3,
        },
        {
            "split": 2,
            "distance": 1000.0,
            "moving_time": 295,
            "elapsed_time": 305,
            "elevation_difference": -5.0,
            "average_speed": 3.39,
            "average_heartrate": 155.0,
            "pace_zone": 3,
        },
    ],
    "splits_standard": [
        {
            "split": 1,
            "distance": 1609.34,
            "moving_time": 483,
            "elapsed_time": 500,
            "elevation_difference": 8.0,
            "average_speed": 3.33,
            "average_heartrate": 152.0,
            "pace_zone": 3,
        },
    ],
    "laps": [
        {
            "name": "Lap 1",
            "distance": 5000.0,
            "moving_time": 1500,
            "elapsed_time": 1600,
            "average_speed": 3.33,
            "max_speed": 4.5,
            "average_heartrate": 155.0,
            "max_heartrate": 175,
            "total_elevation_gain": 50.0,
        },
    ],
}

SAMPLE_ZONES = [
    {
        "type": "heartrate",
        "sensor_based": True,
        "score": 142,
        "distribution_buckets": [
            {"min": 0, "max": 115, "time": 60},
            {"min": 115, "max": 152, "time": 300},
            {"min": 152, "max": 170, "time": 600},
            {"min": 170, "max": 190, "time": 400},
            {"min": 190, "max": -1, "time": 50},
        ],
    },
]


@respx.mock
def test_activity_detail_success(client: TestClient, token_in_db: Token):
    """GET /api/activity/{id} returns splits and summary."""
    respx.get(f"{STRAVA_API}/activities/12345").mock(
        return_value=Response(200, json=SAMPLE_DETAIL)
    )

    response = client.get("/api/activity/12345")
    assert response.status_code == 200
    data = response.json()

    assert data["id"] == 12345
    assert data["name"] == "Morning Run"
    assert data["sport_type"] == "Run"
    assert data["distance"] == 5000.0
    assert data["has_heartrate"] is True
    assert data["average_heartrate"] == 155.0
    assert data["calories"] == 450.0
    assert data["description"] == "Easy morning run"

    # Splits
    assert len(data["splits_km"]) == 2
    assert data["splits_km"][0]["split"] == 1
    assert data["splits_km"][0]["average_heartrate"] == 150.0
    assert data["splits_km"][1]["elevation_difference"] == -5.0

    assert len(data["splits_mi"]) == 1
    assert data["splits_mi"][0]["distance"] == 1609.34

    # Laps
    assert len(data["laps"]) == 1
    assert data["laps"][0]["name"] == "Lap 1"


@respx.mock
def test_activity_detail_no_token(client: TestClient):
    """GET /api/activity/{id} returns 401 when no token."""
    response = client.get("/api/activity/12345")
    assert response.status_code == 401


@respx.mock
def test_activity_detail_not_found(client: TestClient, token_in_db: Token):
    """GET /api/activity/{id} returns 404 for unknown activity."""
    respx.get(f"{STRAVA_API}/activities/99999").mock(
        return_value=Response(404, json={"message": "Not Found"})
    )

    response = client.get("/api/activity/99999")
    assert response.status_code == 404


@respx.mock
def test_activity_detail_no_splits(client: TestClient, token_in_db: Token):
    """Strength training activity has no splits — should return empty arrays."""
    strength_activity = {
        "id": 99999,
        "name": "Upper Body Strength",
        "sport_type": "WeightTraining",
        "type": "WeightTraining",
        "start_date": "2026-02-15T08:00:00Z",
        "start_date_local": "2026-02-15T03:00:00Z",
        "distance": 0,
        "moving_time": 3600,
        "elapsed_time": 3900,
        "total_elevation_gain": 0,
        "average_speed": 0,
        "max_speed": 0,
        "has_heartrate": False,
        "calories": 300,
    }
    respx.get(f"{STRAVA_API}/activities/99999").mock(
        return_value=Response(200, json=strength_activity)
    )

    response = client.get("/api/activity/99999")
    assert response.status_code == 200
    data = response.json()

    assert data["name"] == "Upper Body Strength"
    assert data["splits_km"] == []
    assert data["splits_mi"] == []
    assert data["laps"] == []
    assert data["has_heartrate"] is False


@respx.mock
def test_zones_success(client: TestClient, token_in_db: Token):
    """GET /api/activity/{id}/zones returns HR zone breakdown."""
    respx.get(f"{STRAVA_API}/activities/12345/zones").mock(
        return_value=Response(200, json=SAMPLE_ZONES)
    )

    response = client.get("/api/activity/12345/zones")
    assert response.status_code == 200
    data = response.json()

    assert data["has_zones"] is True
    assert data["sensor_based"] is True
    assert len(data["zones"]) == 5
    assert data["zones"][0]["zone"] == "Zone 1"
    assert data["zones"][0]["time_seconds"] == 60
    assert data["zones"][2]["zone"] == "Zone 3"
    assert data["zones"][2]["time_seconds"] == 600
    assert data["total_time_seconds"] == 60 + 300 + 600 + 400 + 50


@respx.mock
def test_zones_no_hr_data(client: TestClient, token_in_db: Token):
    """Activity without HR data returns has_zones=false."""
    respx.get(f"{STRAVA_API}/activities/99999/zones").mock(
        return_value=Response(200, json=[])
    )

    response = client.get("/api/activity/99999/zones")
    assert response.status_code == 200
    data = response.json()

    assert data["has_zones"] is False
    assert data["zones"] == []


@respx.mock
def test_zones_no_token(client: TestClient):
    """GET /api/activity/{id}/zones returns 401 when no token."""
    response = client.get("/api/activity/12345/zones")
    assert response.status_code == 401
