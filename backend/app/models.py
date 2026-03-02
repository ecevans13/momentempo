import time

from sqlmodel import Field, SQLModel


class Token(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    access_token: str
    refresh_token: str
    expires_at: int  # Unix epoch timestamp from Strava
    token_type: str = "Bearer"
    scope: str = ""
    athlete_id: int | None = None
    athlete_name: str | None = None
    athlete_avatar_url: str | None = None


class Activity(SQLModel, table=True):
    # Strava activity ID — NOT auto-generated (enables session.merge() upsert)
    id: int = Field(primary_key=True)

    # Core identity
    name: str
    sport_type: str  # Granular: "TrailRun", "GravelRide", etc.
    activity_type: str  # Legacy/parent: "Run", "Ride", etc.

    # Timing
    start_date: str  # ISO 8601 UTC from Strava
    start_date_local: str = ""  # ISO 8601 local time
    start_date_epoch: int = Field(index=True)  # Pre-computed for fast MAX() queries
    timezone: str = ""
    moving_time: int = 0  # seconds
    elapsed_time: int = 0  # seconds

    # Distance & elevation
    distance: float = 0.0  # meters
    total_elevation_gain: float = 0.0  # meters
    elev_high: float | None = None
    elev_low: float | None = None

    # Speed
    average_speed: float = 0.0  # m/s
    max_speed: float = 0.0  # m/s

    # Heart rate
    has_heartrate: bool = False
    average_heartrate: float | None = None
    max_heartrate: float | None = None

    # Power (cycling)
    average_watts: float | None = None
    max_watts: int | None = None
    weighted_average_watts: int | None = None
    kilojoules: float | None = None
    device_watts: bool | None = None

    # Cadence
    average_cadence: float | None = None

    # Temperature
    average_temp: float | None = None

    # Social / metadata
    kudos_count: int = 0
    comment_count: int = 0
    achievement_count: int = 0
    pr_count: int = 0
    suffer_score: float | None = None
    athlete_count: int = 1

    # Gear
    gear_id: str | None = None

    # Location
    start_latlng: str | None = None  # JSON string "[lat, lng]"
    end_latlng: str | None = None  # JSON string "[lat, lng]"
    summary_polyline: str | None = None  # Encoded polyline from map

    # Flags
    trainer: bool = False
    commute: bool = False
    manual: bool = False
    private: bool = False
    flagged: bool = False

    # Workout classification
    workout_type: int | None = None

    # Photo count
    total_photo_count: int = 0


class SyncState(SQLModel, table=True):
    id: int = Field(default=1, primary_key=True)  # Singleton row
    last_sync_completed_at: float = 0.0  # Epoch for TTL gate
    is_initial_backfill_done: bool = False
    activities_synced: int = 0  # Total activities in DB after last sync
    last_sync_activities_fetched: int = 0  # Activities fetched in last sync run


class BestEffort(SQLModel, table=True):
    """Strava best effort at a standard distance within an activity."""
    id: int | None = Field(default=None, primary_key=True)
    activity_id: int = Field(index=True)  # Strava activity ID
    activity_name: str = ""
    name: str  # e.g. "1 mile", "5K" — as Strava returns it
    distance: float = 0.0  # meters
    moving_time: int = 0  # seconds
    elapsed_time: int = 0  # seconds
    start_date: str = ""  # ISO 8601 UTC
    pr_rank: int | None = None  # Strava PR rank (1 = all-time best, null = not a PR)


class Milestone(SQLModel, table=True):
    """User-defined custom milestone for the trophy case."""
    id: int | None = Field(default=None, primary_key=True)
    title: str  # e.g. "First 50-mile week"
    description: str = ""
    achieved_at: str | None = None  # ISO date string when achieved, null if not yet
    created_at: float = Field(default_factory=time.time)


class HealthMetric(SQLModel, table=True):
    """Apple HealthKit metric imported from export.xml."""
    id: int | None = Field(default=None, primary_key=True)
    metric_type: str = Field(index=True)  # e.g. "BodyMass", "RestingHeartRate"
    value: float
    unit: str  # e.g. "kg", "bpm", "%"
    date: str = Field(index=True)  # YYYY-MM-DD
    source: str = ""  # source device/app
