"""Tests for AI Training Coach endpoint."""

import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.app.models import Activity
from backend.app.routers.coach import _cache


def _make_activity(session, **kwargs):
    defaults = {
        "name": "Run",
        "sport_type": "Run",
        "activity_type": "Run",
        "start_date": "2026-01-15T08:00:00Z",
        "start_date_local": "2026-01-15T08:00:00",
        "start_date_epoch": int(time.time()),
        "distance": 5000,
        "moving_time": 1500,
    }
    defaults.update(kwargs)
    a = Activity(**defaults)
    session.add(a)
    session.commit()
    return a


def test_coach_no_api_key(client: TestClient):
    """Should return 503 when ANTHROPIC_API_KEY is not set."""
    _cache.clear()
    response = client.get("/api/coach/advice")
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]


def test_coach_builds_summary(client: TestClient, session: Session):
    """Training summary should include weekly data."""
    from backend.app.routers.coach import _build_training_summary

    now = int(time.time())
    _make_activity(
        session, id=801,
        start_date_epoch=now - 86400,
        start_date_local="2026-03-01T08:00:00",
        distance=10000, moving_time=3000,
        has_heartrate=True, average_heartrate=155.0, max_heartrate=185.0,
    )
    summary = _build_training_summary(session)
    assert "Recent Training" in summary
    assert "10.0km" in summary


@patch("backend.app.routers.coach.get_settings")
@patch("backend.app.routers.coach.anthropic")
def test_coach_returns_advice(mock_anthropic, mock_settings, client: TestClient, session: Session):
    """With mocked API, should return structured advice."""
    _cache.clear()

    mock_settings.return_value = MagicMock(anthropic_api_key="test-key")

    now = int(time.time())
    _make_activity(
        session, id=802,
        start_date_epoch=now - 86400,
        start_date_local="2026-03-01T08:00:00",
        distance=10000, moving_time=3000,
        has_heartrate=True, average_heartrate=155.0, max_heartrate=185.0,
    )

    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="Great job! Keep up the training.")]
    mock_client = MagicMock()
    mock_anthropic.Anthropic.return_value = mock_client
    mock_client.messages.create.return_value = mock_message

    response = client.get("/api/coach/advice")

    assert response.status_code == 200
    data = response.json()
    assert "advice" in data
    assert data["advice"] == "Great job! Keep up the training."
    assert "generated_at" in data
    assert "weeks_analyzed" in data


def test_coach_response_structure(client: TestClient):
    """Cached response should have correct structure."""
    _cache.clear()
    _cache["coach_advice"] = (
        {"advice": "cached advice", "generated_at": time.time(), "weeks_analyzed": 4},
        time.time(),
    )

    # Cache check happens after API key check, so we need to mock settings
    with patch("backend.app.routers.coach.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(anthropic_api_key="test-key")
        response = client.get("/api/coach/advice")

    assert response.status_code == 200
    data = response.json()
    assert data["advice"] == "cached advice"
    assert data["weeks_analyzed"] == 4
    _cache.clear()
