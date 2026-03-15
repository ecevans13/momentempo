"""Tests for trophy case endpoints (Phase 5)."""

import time

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.app.models import Activity, BestEffort, Milestone


def _make_activity(session, **kwargs):
    defaults = {
        "name": "Run",
        "sport_type": "Run",
        "activity_type": "Run",
        "start_date": "2026-01-15T08:00:00Z",
        "start_date_epoch": int(time.time()),
        "distance": 5000,
        "moving_time": 1500,
    }
    defaults.update(kwargs)
    a = Activity(**defaults)
    session.add(a)
    session.commit()
    return a


def test_prs_empty_db(client: TestClient):
    response = client.get("/api/trophies/prs")
    assert response.status_code == 200
    data = response.json()
    assert len(data["prs"]) == 5
    assert all(pr["activity_id"] is None for pr in data["prs"])


def test_prs_finds_5k(client: TestClient, session: Session):
    _make_activity(session, id=1, distance=5100, moving_time=1200, name="Fast 5K")
    _make_activity(session, id=2, distance=5050, moving_time=1500, name="Slow 5K")

    response = client.get("/api/trophies/prs")
    data = response.json()
    five_k = next(pr for pr in data["prs"] if pr["distance_name"] == "5K")
    assert five_k["activity_id"] == 1
    assert five_k["moving_time"] == 1200
    assert five_k["activity_name"] == "Fast 5K"


def test_prs_ignores_non_runs(client: TestClient, session: Session):
    _make_activity(session, id=1, distance=5100, moving_time=1200, sport_type="Ride")

    response = client.get("/api/trophies/prs")
    data = response.json()
    five_k = next(pr for pr in data["prs"] if pr["distance_name"] == "5K")
    assert five_k["activity_id"] is None


def test_milestones_crud(client: TestClient):
    # Create
    resp = client.post("/api/trophies/milestones", json={
        "title": "First 50-mile week",
        "description": "Ran 50 miles in a single week",
        "achieved_at": "2026-02-01",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "First 50-mile week"
    mid = data["id"]

    # List
    resp = client.get("/api/trophies/milestones")
    assert resp.status_code == 200
    assert len(resp.json()["milestones"]) == 1

    # Delete
    resp = client.delete(f"/api/trophies/milestones/{mid}")
    assert resp.status_code == 204

    # Verify deleted
    resp = client.get("/api/trophies/milestones")
    assert len(resp.json()["milestones"]) == 0


def test_delete_milestone_not_found(client: TestClient):
    resp = client.delete("/api/trophies/milestones/999")
    assert resp.status_code == 404


def test_prs_from_best_efforts(client: TestClient, session: Session):
    """PRs should come from BestEffort table when available, even if
    the parent activity's total distance doesn't match the PR distance."""
    # Activity is a 5K race — total distance ~5077m
    _make_activity(session, id=100, distance=5077, moving_time=1499,
                   name="Run for Love 2025",
                   start_date="2025-05-31T13:00:02Z")

    # But the best 1-mile segment within that race was 446s (7:26)
    be = BestEffort(
        activity_id=100,
        activity_name="Run for Love 2025",
        name="1 mile",
        distance=1609.0,
        moving_time=446,
        elapsed_time=450,
        start_date="2025-05-31T13:02:00Z",
        pr_rank=1,
    )
    session.add(be)
    session.commit()

    response = client.get("/api/trophies/prs")
    data = response.json()

    mile_pr = next(pr for pr in data["prs"] if pr["distance_name"] == "1 Mile")
    assert mile_pr["activity_id"] == 100
    assert mile_pr["moving_time"] == 446
    assert mile_pr["activity_name"] == "Run for Love 2025"
    assert data["source"] == "best_efforts"


def test_prs_best_effort_picks_fastest(client: TestClient, session: Session):
    """When multiple best efforts exist, the fastest is returned."""
    _make_activity(session, id=1, distance=5000, moving_time=1500, name="Run A")
    _make_activity(session, id=2, distance=8000, moving_time=2500, name="Run B")

    # Two 1-mile best efforts — the second is faster
    session.add(BestEffort(activity_id=1, activity_name="Run A",
                           name="1 mile", distance=1609, moving_time=500,
                           start_date="2026-01-10T08:00:00Z"))
    session.add(BestEffort(activity_id=2, activity_name="Run B",
                           name="1 mile", distance=1609, moving_time=440,
                           start_date="2026-01-15T08:00:00Z"))
    session.commit()

    response = client.get("/api/trophies/prs")
    data = response.json()
    mile_pr = next(pr for pr in data["prs"] if pr["distance_name"] == "1 Mile")
    assert mile_pr["moving_time"] == 440
    assert mile_pr["activity_name"] == "Run B"


def test_prs_fallback_without_best_efforts(client: TestClient, session: Session):
    """Without BestEffort data, PRs fall back to total activity distance matching."""
    _make_activity(session, id=1, distance=1650, moving_time=480,
                   sport_type="Run", name="Mile TT")

    response = client.get("/api/trophies/prs")
    data = response.json()
    mile_pr = next(pr for pr in data["prs"] if pr["distance_name"] == "1 Mile")
    assert mile_pr["activity_id"] == 1
    assert mile_pr["moving_time"] == 480
    assert data["source"] == "activity_distance"


def test_timeline_with_best_efforts(client: TestClient, session: Session):
    """Timeline should use BestEffort data when available."""
    _make_activity(session, id=100, distance=5077, moving_time=1499,
                   name="Fast 5K Race",
                   start_date="2026-02-10T08:00:00Z")

    session.add(BestEffort(activity_id=100, activity_name="Fast 5K Race",
                           name="5k", distance=5000, moving_time=1200,
                           start_date="2026-02-10T08:00:00Z"))
    session.commit()

    resp = client.get("/api/trophies/timeline")
    events = resp.json()["events"]
    pr_events = [e for e in events if e["type"] == "pr"]
    assert len(pr_events) >= 1
    five_k_pr = next(e for e in pr_events if "5K" in e["title"])
    assert five_k_pr["activity_id"] == 100
    assert five_k_pr["moving_time"] == 1200


def test_best_efforts_progression_empty_db(client: TestClient):
    """With no BestEffort rows, progression should be empty dict."""
    response = client.get("/api/trophies/best-efforts-progression")
    assert response.status_code == 200
    data = response.json()
    assert data == {"progression": {}}


def test_best_efforts_progression_filters_single_effort(client: TestClient, session: Session):
    """A distance with only 1 effort should not appear (requires >= 2)."""
    _make_activity(session, id=1, distance=5000, moving_time=1500, name="5K Run")
    session.add(BestEffort(
        activity_id=1, activity_name="5K Run",
        name="5k", distance=5000, moving_time=1200,
        start_date="2026-01-10T08:00:00Z",
    ))
    session.commit()

    response = client.get("/api/trophies/best-efforts-progression")
    data = response.json()
    assert data["progression"] == {}


def test_best_efforts_progression_returns_multiple_efforts(client: TestClient, session: Session):
    """3 efforts for 5K should all appear, sorted by date ascending."""
    _make_activity(session, id=1, distance=5000, moving_time=1500, name="Run A",
                   start_date="2026-01-10T08:00:00Z")
    _make_activity(session, id=2, distance=5000, moving_time=1400, name="Run B",
                   start_date="2026-02-10T08:00:00Z")
    _make_activity(session, id=3, distance=5000, moving_time=1300, name="Run C",
                   start_date="2026-03-10T08:00:00Z")

    session.add(BestEffort(activity_id=1, activity_name="Run A", name="5k",
                           distance=5000, moving_time=1500,
                           start_date="2026-01-10T08:00:00Z"))
    session.add(BestEffort(activity_id=2, activity_name="Run B", name="5k",
                           distance=5000, moving_time=1400,
                           start_date="2026-02-10T08:00:00Z"))
    session.add(BestEffort(activity_id=3, activity_name="Run C", name="5k",
                           distance=5000, moving_time=1300,
                           start_date="2026-03-10T08:00:00Z"))
    session.commit()

    response = client.get("/api/trophies/best-efforts-progression")
    data = response.json()
    assert "5K" in data["progression"]
    efforts = data["progression"]["5K"]
    assert len(efforts) == 3
    # Should be sorted by date ascending
    assert efforts[0]["date"] == "2026-01-10"
    assert efforts[1]["date"] == "2026-02-10"
    assert efforts[2]["date"] == "2026-03-10"
    assert efforts[2]["moving_time"] == 1300


def test_best_efforts_progression_excludes_no_efforts_markers(client: TestClient, session: Session):
    """_no_efforts marker rows (moving_time=0) must not appear in results."""
    _make_activity(session, id=1, distance=5000, moving_time=1500, name="Run A",
                   start_date="2026-01-10T08:00:00Z")
    _make_activity(session, id=2, distance=5000, moving_time=1400, name="Run B",
                   start_date="2026-02-10T08:00:00Z")
    _make_activity(session, id=3, distance=3000, moving_time=900, name="Short Run",
                   start_date="2025-12-01T08:00:00Z")

    session.add(BestEffort(activity_id=1, activity_name="Run A", name="5k",
                           distance=5000, moving_time=1500,
                           start_date="2026-01-10T08:00:00Z"))
    session.add(BestEffort(activity_id=2, activity_name="Run B", name="5k",
                           distance=5000, moving_time=1400,
                           start_date="2026-02-10T08:00:00Z"))
    # Marker row — should be excluded by moving_time > 0 filter
    session.add(BestEffort(activity_id=3, activity_name="Short Run", name="_no_efforts",
                           distance=0, moving_time=0,
                           start_date="2025-12-01T08:00:00Z"))
    session.commit()

    response = client.get("/api/trophies/best-efforts-progression")
    data = response.json()
    assert "5K" in data["progression"]
    assert len(data["progression"]["5K"]) == 2
    # The marker distance should not appear
    assert "_no_efforts" not in data["progression"]


def test_best_efforts_progression_multiple_distances(client: TestClient, session: Session):
    """Both 5K and 1 Mile with 2+ efforts each should appear."""
    _make_activity(session, id=1, distance=5000, moving_time=1500, name="5K Run 1",
                   start_date="2026-01-10T08:00:00Z")
    _make_activity(session, id=2, distance=5000, moving_time=1400, name="5K Run 2",
                   start_date="2026-02-10T08:00:00Z")
    _make_activity(session, id=3, distance=1700, moving_time=460, name="Mile Run 1",
                   start_date="2026-01-20T08:00:00Z")
    _make_activity(session, id=4, distance=1700, moving_time=440, name="Mile Run 2",
                   start_date="2026-02-20T08:00:00Z")

    session.add(BestEffort(activity_id=1, activity_name="5K Run 1", name="5k",
                           distance=5000, moving_time=1500, start_date="2026-01-10T08:00:00Z"))
    session.add(BestEffort(activity_id=2, activity_name="5K Run 2", name="5k",
                           distance=5000, moving_time=1400, start_date="2026-02-10T08:00:00Z"))
    session.add(BestEffort(activity_id=3, activity_name="Mile Run 1", name="1 mile",
                           distance=1609, moving_time=460, start_date="2026-01-20T08:00:00Z"))
    session.add(BestEffort(activity_id=4, activity_name="Mile Run 2", name="1 mile",
                           distance=1609, moving_time=440, start_date="2026-02-20T08:00:00Z"))
    session.commit()

    response = client.get("/api/trophies/best-efforts-progression")
    data = response.json()
    assert "5K" in data["progression"]
    assert "1 Mile" in data["progression"]
    assert len(data["progression"]["5K"]) == 2
    assert len(data["progression"]["1 Mile"]) == 2


def test_best_efforts_progression_excludes_empty_start_date(client: TestClient, session: Session):
    """Efforts with empty start_date must be excluded; distance with < 2 valid rows omitted."""
    _make_activity(session, id=1, distance=5000, moving_time=1500, name="5K Run A",
                   start_date="2026-01-10T08:00:00Z")
    _make_activity(session, id=2, distance=5000, moving_time=1400, name="5K Run B",
                   start_date="2026-02-10T08:00:00Z")

    # One valid effort, one with empty start_date
    session.add(BestEffort(activity_id=1, activity_name="5K Run A", name="5k",
                           distance=5000, moving_time=1500, start_date="2026-01-10T08:00:00Z"))
    session.add(BestEffort(activity_id=2, activity_name="5K Run B", name="5k",
                           distance=5000, moving_time=1400, start_date=""))
    session.commit()

    response = client.get("/api/trophies/best-efforts-progression")
    data = response.json()
    # Only 1 valid effort for 5K, so it should not appear
    assert data["progression"] == {}


def test_timeline_combined(client: TestClient, session: Session):
    _make_activity(session, id=1, distance=5100, moving_time=1200,
                   start_date="2026-02-10T08:00:00Z", name="5K PR")

    milestone = Milestone(title="100 runs", achieved_at="2026-02-15")
    session.add(milestone)
    session.commit()

    resp = client.get("/api/trophies/timeline")
    assert resp.status_code == 200
    events = resp.json()["events"]
    assert len(events) == 2
    # Most recent first
    assert events[0]["type"] == "milestone"
    assert events[1]["type"] == "pr"
