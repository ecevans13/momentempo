"""Rate-limit-aware Strava API client with activity fetching and conversion."""

import asyncio
import json
import logging
import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx

from ..models import Activity

logger = logging.getLogger(__name__)

STRAVA_API_BASE = "https://www.strava.com/api/v3"
ACTIVITIES_PER_PAGE = 200
MAX_429_RETRIES = 2


@dataclass
class RateLimitState:
    """Tracks Strava rate limit budgets from response headers.

    Strava sends two headers:
        X-ReadRateLimit-Limit: 100,1000   (15-min limit, daily limit)
        X-ReadRateLimit-Usage: 42,567     (15-min usage, daily usage)
    """

    short_limit: int = 100
    short_usage: int = 0
    daily_limit: int = 1000
    daily_usage: int = 0
    last_updated: float = field(default_factory=time.time)

    @classmethod
    def from_headers(cls, headers: httpx.Headers) -> "RateLimitState":
        """Parse rate limit state from Strava response headers."""
        state = cls()
        limit_header = headers.get("X-ReadRateLimit-Limit", "")
        usage_header = headers.get("X-ReadRateLimit-Usage", "")

        if limit_header:
            parts = [p.strip() for p in limit_header.split(",")]
            if len(parts) >= 2:
                state.short_limit = int(parts[0])
                state.daily_limit = int(parts[1])

        if usage_header:
            parts = [p.strip() for p in usage_header.split(",")]
            if len(parts) >= 2:
                state.short_usage = int(parts[0])
                state.daily_usage = int(parts[1])

        state.last_updated = time.time()
        return state

    @property
    def short_remaining(self) -> int:
        return max(0, self.short_limit - self.short_usage)

    @property
    def daily_remaining(self) -> int:
        return max(0, self.daily_limit - self.daily_usage)

    def seconds_until_short_reset(self) -> float:
        """Calculate seconds until the next 15-minute UTC boundary.

        Strava resets at :00, :15, :30, :45 UTC.
        """
        now = time.time()
        dt = datetime.fromtimestamp(now, tz=timezone.utc)
        current_minute = dt.minute
        # Next boundary: round up to next multiple of 15
        next_boundary_minute = (math.ceil((current_minute + 1) / 15)) * 15
        seconds_past_boundary = dt.second + dt.microsecond / 1_000_000
        seconds_to_wait = (next_boundary_minute - current_minute) * 60 - seconds_past_boundary
        # Ensure at least 1 second wait
        return max(1.0, seconds_to_wait)

    def should_pause(self) -> bool:
        """Return True if we're close to hitting rate limits."""
        return self.short_remaining <= 2 or self.daily_remaining <= 5


async def strava_get(
    client: httpx.AsyncClient,
    path: str,
    access_token: str,
    params: dict | None = None,
    rate_limit: RateLimitState | None = None,
) -> tuple[httpx.Response, RateLimitState]:
    """Rate-limit-aware GET request to the Strava API.

    Returns (response, updated_rate_limit_state).
    On 429, sleeps until the next 15-min reset boundary and retries (max 2 retries).
    """
    if rate_limit is None:
        rate_limit = RateLimitState()

    url = f"{STRAVA_API_BASE}{path}"
    headers = {"Authorization": f"Bearer {access_token}"}

    for attempt in range(1 + MAX_429_RETRIES):
        # Pre-flight: if rate limit is nearly exhausted, pause
        if attempt > 0 or rate_limit.should_pause():
            sleep_time = rate_limit.seconds_until_short_reset()
            logger.info(
                "Rate limit pause: sleeping %.1fs (short: %d/%d, daily: %d/%d)",
                sleep_time,
                rate_limit.short_usage,
                rate_limit.short_limit,
                rate_limit.daily_usage,
                rate_limit.daily_limit,
            )
            await asyncio.sleep(sleep_time)

        response = await client.get(url, headers=headers, params=params)
        rate_limit = RateLimitState.from_headers(response.headers)

        if response.status_code != 429:
            return response, rate_limit

        # 429 Too Many Requests
        logger.warning(
            "Strava 429 (attempt %d/%d) — will retry after reset",
            attempt + 1,
            1 + MAX_429_RETRIES,
        )

    # Exhausted retries — return the 429 response
    return response, rate_limit


async def fetch_all_activities(
    client: httpx.AsyncClient,
    access_token: str,
    after: int | None = None,
    rate_limit: RateLimitState | None = None,
) -> tuple[list[dict], RateLimitState]:
    """Fetch all activities via paginated GET /athlete/activities.

    Terminates ONLY on an empty page (Strava docs warn that short pages are normal).
    Optional `after` epoch param for incremental sync.
    """
    if rate_limit is None:
        rate_limit = RateLimitState()

    all_activities: list[dict] = []
    page = 1

    while True:
        params: dict = {"per_page": ACTIVITIES_PER_PAGE, "page": page}
        if after is not None:
            params["after"] = after

        response, rate_limit = await strava_get(
            client, "/athlete/activities", access_token, params=params, rate_limit=rate_limit
        )
        response.raise_for_status()

        activities = response.json()
        if not activities:
            # Empty page = no more activities
            break

        all_activities.extend(activities)
        logger.info("Fetched page %d: %d activities (total so far: %d)", page, len(activities), len(all_activities))
        page += 1

    return all_activities, rate_limit


def strava_activity_to_model(data: dict) -> Activity:
    """Convert a Strava SummaryActivity JSON dict to an Activity model instance."""
    # Parse ISO 8601 start_date to epoch
    start_date_str = data.get("start_date", "")
    try:
        dt = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
        start_date_epoch = int(dt.timestamp())
    except (ValueError, AttributeError):
        start_date_epoch = 0

    # Serialize latlng arrays to JSON strings
    start_latlng = data.get("start_latlng")
    end_latlng = data.get("end_latlng")

    # Extract summary_polyline from nested map object
    map_data = data.get("map") or {}
    summary_polyline = map_data.get("summary_polyline")

    return Activity(
        id=data["id"],
        name=data.get("name", ""),
        sport_type=data.get("sport_type", data.get("type", "")),
        activity_type=data.get("type", data.get("sport_type", "")),
        start_date=start_date_str,
        start_date_local=data.get("start_date_local", ""),
        start_date_epoch=start_date_epoch,
        timezone=data.get("timezone", ""),
        moving_time=data.get("moving_time", 0),
        elapsed_time=data.get("elapsed_time", 0),
        distance=data.get("distance", 0.0),
        total_elevation_gain=data.get("total_elevation_gain", 0.0),
        elev_high=data.get("elev_high"),
        elev_low=data.get("elev_low"),
        average_speed=data.get("average_speed", 0.0),
        max_speed=data.get("max_speed", 0.0),
        has_heartrate=data.get("has_heartrate", False),
        average_heartrate=data.get("average_heartrate"),
        max_heartrate=data.get("max_heartrate"),
        average_watts=data.get("average_watts"),
        max_watts=data.get("max_watts"),
        weighted_average_watts=data.get("weighted_average_watts"),
        kilojoules=data.get("kilojoules"),
        device_watts=data.get("device_watts"),
        average_cadence=data.get("average_cadence"),
        average_temp=data.get("average_temp"),
        kudos_count=data.get("kudos_count", 0),
        comment_count=data.get("comment_count", 0),
        achievement_count=data.get("achievement_count", 0),
        pr_count=data.get("pr_count", 0),
        suffer_score=data.get("suffer_score"),
        athlete_count=data.get("athlete_count", 1),
        gear_id=data.get("gear_id"),
        start_latlng=json.dumps(start_latlng) if start_latlng else None,
        end_latlng=json.dumps(end_latlng) if end_latlng else None,
        summary_polyline=summary_polyline,
        trainer=data.get("trainer", False),
        commute=data.get("commute", False),
        manual=data.get("manual", False),
        private=data.get("private", False),
        flagged=data.get("flagged", False),
        workout_type=data.get("workout_type"),
        total_photo_count=data.get("total_photo_count", 0),
    )
