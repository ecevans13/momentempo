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

    assert len(data["predictions"]) == 4
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


# --- Fitness Model tests ---

def test_fitness_empty_db(client: TestClient):
    response = client.get("/api/insights/fitness")
    assert response.status_code == 200
    data = response.json()
    assert data["data"] == []
    assert data["lthr_used"] is None


def test_fitness_auto_lthr(client: TestClient, session: Session):
    now = int(time.time())
    _make_activity(
        session, id=301,
        start_date_epoch=now - 86400,
        start_date_local="2026-02-28T08:00:00",
        moving_time=3600, distance=10000,
        has_heartrate=True, average_heartrate=150.0, max_heartrate=185.0,
        sport_type="Run",
    )
    response = client.get("/api/insights/fitness?months=6")
    data = response.json()
    assert data["lthr_source"] == "auto"
    # 85% of 185 = 157
    assert data["lthr_used"] == 157
    assert len(data["data"]) >= 1


def test_fitness_user_lthr(client: TestClient, session: Session):
    now = int(time.time())
    _make_activity(
        session, id=302,
        start_date_epoch=now - 86400,
        start_date_local="2026-02-28T08:00:00",
        moving_time=3600, distance=10000,
        has_heartrate=True, average_heartrate=150.0, max_heartrate=185.0,
        sport_type="Run",
    )
    response = client.get("/api/insights/fitness?months=6&lthr=165")
    data = response.json()
    assert data["lthr_source"] == "user"
    assert data["lthr_used"] == 165


def test_fitness_tss_calculation(client: TestClient, session: Session):
    now = int(time.time())
    _make_activity(
        session, id=303,
        start_date_epoch=now - 86400,
        start_date_local="2026-02-28T08:00:00",
        moving_time=3600, distance=10000,
        has_heartrate=True, average_heartrate=160.0, max_heartrate=185.0,
        sport_type="Run",
    )
    response = client.get("/api/insights/fitness?months=6&lthr=160")
    data = response.json()
    # hrTSS = (3600 * 160 * 1.0) / (160 * 3600) * 100 = 100
    day_data = [d for d in data["data"] if d["tss"] > 0]
    assert len(day_data) == 1
    assert day_data[0]["tss"] == 100.0


def test_fitness_ignores_no_hr(client: TestClient, session: Session):
    now = int(time.time())
    _make_activity(
        session, id=304,
        start_date_epoch=now - 86400,
        start_date_local="2026-02-28T08:00:00",
        moving_time=3600, distance=10000,
        has_heartrate=False, average_heartrate=None,
        sport_type="Run",
    )
    response = client.get("/api/insights/fitness")
    data = response.json()
    assert data["data"] == []


def test_fitness_ema_convergence(client: TestClient, session: Session):
    """With consistent daily training, CTL should grow toward the daily TSS value."""
    now = int(time.time())
    for i in range(60):
        _make_activity(
            session, id=400 + i,
            start_date_epoch=now - (60 - i) * 86400,
            start_date_local=f"2026-{1 + (i // 28):02d}-{1 + (i % 28):02d}T08:00:00",
            moving_time=3600, distance=10000,
            has_heartrate=True, average_heartrate=160.0, max_heartrate=185.0,
            sport_type="Run",
        )
    response = client.get("/api/insights/fitness?months=6&lthr=160")
    data = response.json()
    # After 60 days of consistent training, CTL should be approaching daily TSS (100)
    last_point = data["data"][-1]
    assert last_point["ctl"] > 50  # should be converging toward 100


# --- Weekly Report tests ---

def test_weekly_report_empty_db(client: TestClient):
    response = client.get("/api/insights/weekly-report")
    assert response.status_code == 200
    data = response.json()
    assert data["has_data"] is False
    assert "No activities" in data["summary_text"]


def test_weekly_report_basic_stats(client: TestClient, session: Session):
    now = int(time.time())
    _make_activity(
        session, id=501,
        start_date_epoch=now - 3600,  # 1 hour ago = this week
        start_date_local="2026-03-02T08:00:00",
        distance=5000, moving_time=1500,
        sport_type="Run",
    )
    response = client.get("/api/insights/weekly-report")
    data = response.json()
    assert data["has_data"] is True
    assert data["stats"]["run_count"] == 1
    assert data["stats"]["total_distance"] == 5000


def test_weekly_report_comparison(client: TestClient, session: Session):
    now = int(time.time())
    # This week activity
    _make_activity(
        session, id=601,
        start_date_epoch=now - 3600,
        start_date_local="2026-03-02T08:00:00",
        distance=10000, moving_time=3000,
        sport_type="Run",
    )
    # Last week activity
    _make_activity(
        session, id=602,
        start_date_epoch=now - 7 * 86400,
        start_date_local="2026-02-23T08:00:00",
        distance=5000, moving_time=1500,
        sport_type="Run",
    )
    response = client.get("/api/insights/weekly-report")
    data = response.json()
    # This week = 10km, last week = 5km -> +100%
    assert data["vs_last_week"]["total_distance"] == 100.0


def test_weekly_report_zone_distribution(client: TestClient, session: Session):
    now = int(time.time())
    _make_activity(
        session, id=701,
        start_date_epoch=now - 3600,
        start_date_local="2026-03-02T08:00:00",
        distance=5000, moving_time=1500,
        sport_type="Run",
        has_heartrate=True, average_heartrate=155.0, max_heartrate=185.0,
    )
    response = client.get("/api/insights/weekly-report")
    data = response.json()
    assert "zone_distribution" in data
    total_pct = sum(data["zone_distribution"].values())
    # Should sum to ~100%
    assert 99 <= total_pct <= 101
