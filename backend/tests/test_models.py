"""Unit tests for Activity and SyncState models."""

from sqlmodel import Session, select

from backend.app.models import Activity, SyncState


# ---------------------------------------------------------------------------
# Activity model tests
# ---------------------------------------------------------------------------


def test_activity_creation_required_fields(session: Session):
    """Activity can be created with only required fields; optionals default to None."""
    activity = Activity(
        id=123456,
        name="Morning Run",
        sport_type="Run",
        activity_type="Run",
        start_date="2024-01-15T08:00:00Z",
        start_date_epoch=1705305600,
    )
    session.add(activity)
    session.commit()

    result = session.exec(select(Activity).where(Activity.id == 123456)).first()
    assert result is not None
    assert result.name == "Morning Run"
    assert result.sport_type == "Run"
    assert result.start_date_epoch == 1705305600


def test_activity_nullable_defaults(session: Session):
    """All HR/power/optional fields default to None."""
    activity = Activity(
        id=100,
        name="Test",
        sport_type="Run",
        activity_type="Run",
        start_date="2024-01-01T00:00:00Z",
        start_date_epoch=1704067200,
    )
    session.add(activity)
    session.commit()
    session.refresh(activity)

    assert activity.average_heartrate is None
    assert activity.max_heartrate is None
    assert activity.average_watts is None
    assert activity.max_watts is None
    assert activity.gear_id is None
    assert activity.suffer_score is None
    assert activity.summary_polyline is None
    assert activity.workout_type is None


def test_activity_persistence_all_fields(session: Session):
    """Activity with all fields populated persists and round-trips correctly."""
    activity = Activity(
        id=789,
        name="Trail Run",
        sport_type="TrailRun",
        activity_type="Run",
        start_date="2024-06-01T06:30:00Z",
        start_date_local="2024-06-01T08:30:00",
        start_date_epoch=1717223400,
        timezone="(GMT+02:00) Europe/Berlin",
        moving_time=3600,
        elapsed_time=4000,
        distance=12345.6,
        total_elevation_gain=450.0,
        elev_high=800.0,
        elev_low=350.0,
        average_speed=3.43,
        max_speed=5.5,
        has_heartrate=True,
        average_heartrate=155.0,
        max_heartrate=185.0,
        average_watts=200.0,
        kudos_count=10,
        gear_id="g12345",
        start_latlng="[48.1, 11.5]",
        summary_polyline="abc123polyline",
        trainer=False,
        commute=False,
        manual=False,
    )
    session.add(activity)
    session.commit()

    result = session.exec(select(Activity).where(Activity.id == 789)).first()
    assert result is not None
    assert result.sport_type == "TrailRun"
    assert result.activity_type == "Run"
    assert result.distance == 12345.6
    assert result.average_heartrate == 155.0
    assert result.gear_id == "g12345"
    assert result.summary_polyline == "abc123polyline"


def test_activity_upsert_via_merge(session: Session):
    """session.merge() upserts: inserts new, updates existing without duplicates."""
    # Insert original
    original = Activity(
        id=555,
        name="Original Run",
        sport_type="Run",
        activity_type="Run",
        start_date="2024-01-01T00:00:00Z",
        start_date_epoch=1704067200,
        distance=5000.0,
    )
    session.merge(original)
    session.commit()

    # Upsert with updated data
    updated = Activity(
        id=555,
        name="Updated Run",
        sport_type="Run",
        activity_type="Run",
        start_date="2024-01-01T00:00:00Z",
        start_date_epoch=1704067200,
        distance=10000.0,
    )
    session.merge(updated)
    session.commit()

    # Should be exactly one record
    results = session.exec(select(Activity)).all()
    assert len(results) == 1
    assert results[0].name == "Updated Run"
    assert results[0].distance == 10000.0


# ---------------------------------------------------------------------------
# SyncState model tests
# ---------------------------------------------------------------------------


def test_sync_state_defaults(session: Session):
    """SyncState initializes with sensible defaults."""
    state = SyncState(id=1)
    session.add(state)
    session.commit()
    session.refresh(state)

    assert state.last_sync_completed_at == 0.0
    assert state.is_initial_backfill_done is False
    assert state.activities_synced == 0
    assert state.last_sync_activities_fetched == 0


def test_sync_state_singleton_update(session: Session):
    """SyncState singleton can be updated in place."""
    state = SyncState(id=1)
    session.add(state)
    session.commit()

    # Update
    state.last_sync_completed_at = 1700000000.0
    state.is_initial_backfill_done = True
    state.activities_synced = 42
    session.add(state)
    session.commit()

    result = session.exec(select(SyncState).where(SyncState.id == 1)).first()
    assert result is not None
    assert result.last_sync_completed_at == 1700000000.0
    assert result.is_initial_backfill_done is True
    assert result.activities_synced == 42
