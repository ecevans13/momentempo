"""Tests for trophy case endpoints (Phase 5)."""

import time

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.app.models import Activity, Milestone


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
