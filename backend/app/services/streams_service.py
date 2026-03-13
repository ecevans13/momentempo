"""Lazy-fetch-and-cache service for Strava GPS stream data."""

import logging
import time

import httpx
from fastapi import HTTPException
from sqlmodel import Session

from ..config import Settings
from ..models import ActivityStream
from .strava_auth import ensure_valid_token
from .strava_client import strava_get

logger = logging.getLogger(__name__)


def _extract_stream_data(data: dict, key: str) -> list | None:
    """Safely extract a stream's data array from Strava's key_by_type=true response.

    Strava omits unavailable streams entirely (does NOT null them), so we use .get()
    with a fallback empty dict to handle missing streams gracefully.
    """
    return data.get(key, {}).get("data")


async def fetch_and_cache_streams(
    activity_id: int,
    session: Session,
    settings: Settings,
) -> ActivityStream | None:
    """Fetch GPS stream data from Strava on first call; return cached data on subsequent calls.

    Cache hit: if ActivityStream row exists with fetched_at non-null, return immediately.
    Cache miss: call Strava API, store result (or sentinel for no-GPS activities), return row.
    404: store sentinel row (fetched_at set, all arrays null) — never re-fetch.
    """
    # Cache hit check
    existing = session.get(ActivityStream, activity_id)
    if existing is not None and existing.fetched_at is not None:
        logger.debug("Stream cache hit for activity %d", activity_id)
        return existing

    # Auth
    token = await ensure_valid_token(session, settings)
    if token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    logger.info("Fetching streams from Strava for activity %d", activity_id)

    async with httpx.AsyncClient(timeout=30.0, verify=settings.ssl_verify) as client:
        response, _ = await strava_get(
            client,
            f"/activities/{activity_id}/streams",
            token.access_token,
            params={
                "keys": "latlng,altitude,heartrate,velocity_smooth,time,distance",
                "key_by_type": "true",
            },
            rate_limit=None,
        )

    # 404: activity has no streams — store sentinel, never re-fetch
    if response.status_code == 404:
        logger.info("Activity %d returned 404 for streams — storing sentinel", activity_id)
        streams = ActivityStream(activity_id=activity_id, fetched_at=time.time())
        merged = session.merge(streams)
        session.commit()
        session.refresh(merged)
        return merged

    response.raise_for_status()
    data = response.json()

    streams = ActivityStream(
        activity_id=activity_id,
        latlng=_extract_stream_data(data, "latlng"),
        altitude=_extract_stream_data(data, "altitude"),
        heartrate=_extract_stream_data(data, "heartrate"),
        velocity_smooth=_extract_stream_data(data, "velocity_smooth"),
        time=_extract_stream_data(data, "time"),
        distance=_extract_stream_data(data, "distance"),
        fetched_at=time.time(),
    )

    merged = session.merge(streams)
    session.commit()
    session.refresh(merged)
    return merged
