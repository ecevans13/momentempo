"""Tests for insights endpoints (heatmap, race predictions, what's working)."""

import time

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.app.models import Activity


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


# --- Heatmap tests ---

def test_heatmap_empty_db(client: TestClient):
    response = client.get("/api/insights/heatmap")
    assert response.status_code == 200
    data = response.json()
    assert data["days"] == []
    assert data["max_load"] == 0


def test_heatmap_groups_by_day(client: TestClient, session: Session):
    epoch = int(time.time())
    _make_activity(session, id=1, start_date_epoch=epoch,
                   start_date_local="2026-01-15T08:00:00",
                   moving_time=1800, has_heartrate=False)
    _make_activity(session, id=2, start_date_epoch=epoch + 3600,
                   start_date_local="2026-01-15T18:00:00",
                   moving_time=1200, has_heartrate=False)

    response = client.get("/api/insights/heatmap?months=12")
    data = response.json()
    # Both activities should be on same day
    day_entries = [d for d in data["days"] if d["date"] == "2026-01-15"]
    assert len(day_entries) == 1
    # Load = (1800/60 + 1200/60) * 1.0 = 50
    assert day_entries[0]["load"] == 50.0


def test_heatmap_hr_intensity(client: TestClient, session: Session):
    epoch = int(time.time())
    _make_activity(session, id=1, start_date_epoch=epoch,
                   start_date_local="2026-02-01T08:00:00",
                   moving_time=3600, has_heartrate=True, average_heartrate=168.0)

    response = client.get("/api/insights/heatmap")
    data = response.json()
    day = data["days"][0]
    # Load = (3600/60) * (168/140) = 60 * 1.2 = 72
    assert day["load"] == 72.0


# --- Race Predictions tests ---

def test_race_predictions_empty_db(client: TestClient):
    response = client.get("/api/insights/race-predictions")
    assert response.status_code == 200
    data = response.json()
    assert data["anchor_efforts"] == []
    assert data["predictions"] == []
    assert data["vdot_estimate"] is None


def test_race_predictions_with_anchor(client: TestClient, session: Session):
    _make_activity(session, id=1, distance=5100, moving_time=1200,
                   sport_type="Run", name="Fast 5K")

    response = client.get("/api/insights/race-predictions")
    data = response.json()

    assert len(data["anchor_efforts"]) == 1
    assert data["anchor_efforts"][0]["distance_name"] == "5K"
    assert data["anchor_efforts"][0]["time_seconds"] == 1200

    assert len(data["predictions"]) == 5
    pred_names = [p["distance_name"] for p in data["predictions"]]
    assert "5K" in pred_names
    assert "Marathon" in pred_names

    # VDOT should be computed
    assert data["vdot_estimate"] is not None
    assert data["vdot_estimate"] > 0


def test_race_predictions_ignores_non_runs(client: TestClient, session: Session):
    _make_activity(session, id=1, distance=5100, moving_time=1200, sport_type="Ride")

    response = client.get("/api/insights/race-predictions")
    data = response.json()
    assert data["anchor_efforts"] == []


def test_race_predictions_confidence_levels(client: TestClient, session: Session):
    # Add 1 Mile anchor — nearby distances get higher confidence, far distances get lower
    _make_activity(session, id=1, distance=1650, moving_time=360,
                   sport_type="Run", name="Mile TT")

    response = client.get("/api/insights/race-predictions")
    data = response.json()

    preds = {p["distance_name"]: p for p in data["predictions"]}
    # 5K/1mi ratio ~3.1 = medium, Marathon/1mi ratio ~26 = low
    assert preds["5K"]["confidence"] == "medium"
    assert preds["Marathon"]["confidence"] == "low"


# --- What's Working tests ---

def test_whats_working_insufficient_data(client: TestClient):
    response = client.get("/api/insights/whats-working")
    assert response.status_code == 200
    data = response.json()
    assert data["insufficient_data"] is True
    assert data["insights"] == []


def test_whats_working_with_enough_data(client: TestClient, session: Session):
    now = int(time.time())
    # Create 15 activities spread across weeks
    for i in range(15):
        _make_activity(
            session,
            id=100 + i,
            start_date_epoch=now - i * 3 * 86400,  # Every 3 days
            start_date_local=f"2026-01-{15 - i:02d}T08:00:00",
            distance=5000 + i * 100,
            moving_time=1500 + i * 10,
            sport_type="Run",
        )

    response = client.get("/api/insights/whats-working")
    data = response.json()

    assert data["insufficient_data"] is False
    assert data["weeks_analyzed"] > 0
    # May or may not find insights depending on the artificial data pattern
    assert isinstance(data["insights"], list)


def test_whats_working_ignores_non_runs(client: TestClient, session: Session):
    now = int(time.time())
    for i in range(15):
        _make_activity(
            session,
            id=200 + i,
            start_date_epoch=now - i * 2 * 86400,
            start_date_local=f"2026-01-{15 - i:02d}T08:00:00",
            distance=10000,
            moving_time=1800,
            sport_type="Ride",
        )

    response = client.get("/api/insights/whats-working")
    data = response.json()
    assert data["insufficient_data"] is True
