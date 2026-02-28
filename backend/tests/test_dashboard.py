"""Tests for dashboard API endpoints."""

import time

import pytest
from sqlmodel import Session

from backend.app.models import Activity


def _make_activity(
    id: int,
    name: str = "Test Activity",
    sport_type: str = "Run",
    distance: float = 10000.0,
    moving_time: int = 3000,
    total_elevation_gain: float = 100.0,
    average_speed: float = 3.33,
    has_heartrate: bool = True,
    average_heartrate: float | None = 155.0,
    start_date_epoch: int | None = None,
    start_date: str = "2024-06-15T08:00:00Z",
    start_date_local: str = "2024-06-15T10:00:00",
    suffer_score: float | None = 50.0,
    kudos_count: int = 3,
) -> Activity:
    if start_date_epoch is None:
        start_date_epoch = int(time.time()) - 86400  # yesterday
    return Activity(
        id=id,
        name=name,
        sport_type=sport_type,
        activity_type=sport_type,
        start_date=start_date,
        start_date_local=start_date_local,
        start_date_epoch=start_date_epoch,
        distance=distance,
        moving_time=moving_time,
        total_elevation_gain=total_elevation_gain,
        average_speed=average_speed,
        has_heartrate=has_heartrate,
        average_heartrate=average_heartrate,
        suffer_score=suffer_score,
        kudos_count=kudos_count,
    )


@pytest.fixture(name="seeded_session")
def seeded_session_fixture(session: Session):
    """Insert test activities covering various dates, sport types, and metrics."""
    now = int(time.time())

    activities = [
        # Recent runs (within last week)
        _make_activity(1, "Morning Run", "Run", 5000, 1500, 50, 3.33, True, 150.0,
                       start_date_epoch=now - 86400),
        _make_activity(2, "Evening Run", "Run", 8000, 2400, 80, 3.33, True, 160.0,
                       start_date_epoch=now - 2 * 86400),
        # Recent ride (within last week)
        _make_activity(3, "Bike Commute", "Ride", 15000, 2700, 30, 5.56, False, None,
                       start_date_epoch=now - 3 * 86400),
        # Trail run 2 weeks ago (within month, outside week)
        _make_activity(4, "Trail Run", "TrailRun", 12000, 4800, 300, 2.5, True, 165.0,
                       start_date_epoch=now - 14 * 86400),
        # Run 2 months ago (within year, outside month)
        _make_activity(5, "Long Run", "Run", 20000, 6000, 120, 3.33, True, 145.0,
                       start_date_epoch=now - 60 * 86400),
        # Ride 3 months ago
        _make_activity(6, "Century Ride", "Ride", 160000, 18000, 1500, 8.89, True, 140.0,
                       start_date_epoch=now - 90 * 86400),
        # Very old activities (over 1 year ago)
        _make_activity(7, "Old Run", "Run", 10000, 3000, 100, 3.33, True, 152.0,
                       start_date_epoch=now - 400 * 86400),
        _make_activity(8, "Old Hike", "Hike", 8000, 7200, 500, 1.11, False, None,
                       start_date_epoch=now - 500 * 86400),
    ]
    for a in activities:
        session.add(a)
    session.commit()
    return session


# --- /api/dashboard/summary tests ---


def test_summary_empty_db(client):
    """Returns zeros when no activities exist."""
    resp = client.get("/api/dashboard/summary?period=month")
    assert resp.status_code == 200
    data = resp.json()
    assert data["activity_count"] == 0
    assert data["total_distance_m"] == 0.0
    assert data["total_moving_time_s"] == 0
    assert data["total_elevation_gain_m"] == 0.0
    assert data["avg_pace_s_per_km"] is None
    assert data["avg_heartrate"] is None
    assert data["period"] == "month"


def test_summary_week_period(client, seeded_session):
    """Week period captures only the 3 activities from last 7 days."""
    resp = client.get("/api/dashboard/summary?period=week")
    assert resp.status_code == 200
    data = resp.json()
    assert data["period"] == "week"
    assert data["activity_count"] == 3  # IDs 1, 2, 3
    assert data["total_distance_m"] == 5000 + 8000 + 15000


def test_summary_month_period(client, seeded_session):
    """Month period captures 4 activities (3 from week + trail run at 14 days)."""
    resp = client.get("/api/dashboard/summary?period=month")
    assert resp.status_code == 200
    data = resp.json()
    assert data["period"] == "month"
    assert data["activity_count"] == 4  # IDs 1, 2, 3, 4


def test_summary_year_period(client, seeded_session):
    """Year period captures 6 activities (excludes 2 old ones >365 days)."""
    resp = client.get("/api/dashboard/summary?period=year")
    assert resp.status_code == 200
    data = resp.json()
    assert data["period"] == "year"
    assert data["activity_count"] == 6  # IDs 1-6


def test_summary_all_period(client, seeded_session):
    """All period aggregates everything."""
    resp = client.get("/api/dashboard/summary?period=all")
    assert resp.status_code == 200
    data = resp.json()
    assert data["period"] == "all"
    assert data["activity_count"] == 8
    assert data["period_start"] is None


def test_summary_avg_pace_runs_only(client, seeded_session):
    """Pace computation only includes run-like sport types."""
    resp = client.get("/api/dashboard/summary?period=week")
    data = resp.json()
    # Week has runs (IDs 1, 2) and a ride (ID 3)
    # Run 1: 5000m in 1500s → 300 s/km
    # Run 2: 8000m in 2400s → 300 s/km
    # Combined: (1500+2400)/(5000+8000)*1000 = 3900/13000*1000 = 300
    assert data["avg_pace_s_per_km"] == 300.0
    # Ride is excluded from pace calc


# --- /api/dashboard/trends tests ---


def test_trends_weekly_distance(client, seeded_session):
    """Weekly distance grouping returns correct buckets."""
    resp = client.get("/api/dashboard/trends?metric=distance&granularity=weekly&months=2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["metric"] == "distance"
    assert data["granularity"] == "weekly"
    assert isinstance(data["data"], list)
    # Should have multiple weeks with data
    assert len(data["data"]) > 0
    # Each entry has period and value
    for entry in data["data"]:
        assert "period" in entry
        assert "value" in entry
        assert entry["value"] >= 0


def test_trends_monthly_distance(client, seeded_session):
    """Monthly grouping produces YYYY-MM keys."""
    resp = client.get("/api/dashboard/trends?metric=distance&granularity=monthly&months=12")
    assert resp.status_code == 200
    data = resp.json()
    assert data["granularity"] == "monthly"
    for entry in data["data"]:
        # YYYY-MM format
        assert len(entry["period"]) == 7
        assert entry["period"][4] == "-"


def test_trends_sport_type_filter(client, seeded_session):
    """sport_type filter only includes matching activities."""
    resp_all = client.get("/api/dashboard/trends?metric=count&granularity=monthly&months=12")
    resp_run = client.get(
        "/api/dashboard/trends?metric=count&granularity=monthly&months=12&sport_type=Run"
    )
    all_data = resp_all.json()["data"]
    run_data = resp_run.json()["data"]
    total_all = sum(e["value"] for e in all_data)
    total_run = sum(e["value"] for e in run_data)
    # Runs are a subset of all
    assert total_run < total_all
    assert total_run > 0


# --- /api/activities tests ---


def test_activities_pagination(client, seeded_session):
    """Pagination returns correct page sizes and metadata."""
    resp = client.get("/api/activities?page=1&per_page=3")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["activities"]) == 3
    assert data["page"] == 1
    assert data["per_page"] == 3
    assert data["total"] == 8
    assert data["total_pages"] == 3  # ceil(8/3)

    # Page 2
    resp2 = client.get("/api/activities?page=2&per_page=3")
    data2 = resp2.json()
    assert len(data2["activities"]) == 3
    assert data2["page"] == 2

    # Page 3 (last, partial)
    resp3 = client.get("/api/activities?page=3&per_page=3")
    data3 = resp3.json()
    assert len(data3["activities"]) == 2


def test_activities_order_desc(client, seeded_session):
    """Activities are ordered most-recent first."""
    resp = client.get("/api/activities?per_page=100")
    data = resp.json()
    activities = data["activities"]
    # First activity should be the most recent (ID 1, yesterday)
    assert activities[0]["id"] == 1
    # Last should be the oldest (ID 8, 500 days ago)
    assert activities[-1]["id"] == 8


def test_activities_sport_type_filter(client, seeded_session):
    """sport_type filter returns only matching activities."""
    resp = client.get("/api/activities?sport_type=Ride")
    data = resp.json()
    assert data["total"] == 2  # IDs 3, 6
    for a in data["activities"]:
        assert a["sport_type"] == "Ride"


def test_activities_response_shape(client, seeded_session):
    """Each activity in the response has the expected fields."""
    resp = client.get("/api/activities?per_page=1")
    data = resp.json()
    a = data["activities"][0]
    expected_keys = {
        "id", "name", "sport_type", "start_date", "start_date_local",
        "distance", "moving_time", "total_elevation_gain", "average_speed",
        "has_heartrate", "average_heartrate", "suffer_score", "kudos_count",
    }
    assert set(a.keys()) == expected_keys
