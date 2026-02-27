"""Sync orchestrator: TTL gate, backfill/incremental fetch, upsert to SQLite."""

import logging
import time

import httpx
from sqlmodel import Session, func, select

from ..config import Settings
from ..models import Activity, SyncState
from .strava_auth import ensure_valid_token
from .strava_client import (
    RateLimitState,
    fetch_all_activities,
    strava_activity_to_model,
)

logger = logging.getLogger(__name__)

TTL_SECONDS = 900  # 15-minute cooldown between syncs


def get_sync_state(session: Session) -> SyncState:
    """Get or create the singleton SyncState row."""
    state = session.exec(select(SyncState).where(SyncState.id == 1)).first()
    if state is None:
        state = SyncState(id=1)
        session.add(state)
        session.commit()
        session.refresh(state)
    return state


async def run_sync(session: Session, settings: Settings) -> dict:
    """Run a sync cycle: fetch activities from Strava and upsert into SQLite.

    Returns a dict describing the outcome:
        {status: "skipped", reason: ...}  — TTL gate or no token
        {status: "completed", fetched: N, total: N}
        {status: "error", reason: ...}
    """
    sync_state = get_sync_state(session)

    # 1. TTL gate
    elapsed = time.time() - sync_state.last_sync_completed_at
    if elapsed < TTL_SECONDS:
        remaining = TTL_SECONDS - elapsed
        logger.info("Sync skipped: TTL gate (%.0fs remaining)", remaining)
        return {"status": "skipped", "reason": "ttl_gate", "retry_after_seconds": remaining}

    # 2. Ensure valid token
    token = await ensure_valid_token(session, settings)
    if token is None:
        logger.warning("Sync skipped: no stored token")
        return {"status": "skipped", "reason": "no_token"}

    # 3. Determine mode: backfill vs incremental
    after: int | None = None
    if sync_state.is_initial_backfill_done:
        # Incremental: fetch activities after the most recent one, with 1-day buffer
        max_epoch = session.exec(select(func.max(Activity.start_date_epoch))).first()
        if max_epoch:
            after = max_epoch - 86400  # 1-day overlap buffer
            logger.info("Incremental sync: after=%d (max_epoch=%d)", after, max_epoch)
        else:
            logger.info("Incremental mode but no activities found — doing full fetch")
    else:
        logger.info("Initial backfill: fetching all activities")

    # 4. Fetch from Strava
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            rate_limit = RateLimitState()
            activities_data, rate_limit = await fetch_all_activities(
                client, token.access_token, after=after, rate_limit=rate_limit
            )
    except httpx.HTTPStatusError as exc:
        logger.error("Strava API error during sync: %s", exc)
        return {"status": "error", "reason": f"strava_api_error: {exc.response.status_code}"}
    except Exception as exc:
        logger.error("Unexpected error during sync fetch: %s", exc)
        return {"status": "error", "reason": str(exc)}

    # 5. Upsert activities via session.merge()
    fetched_count = len(activities_data)
    for data in activities_data:
        activity = strava_activity_to_model(data)
        session.merge(activity)

    # 6. Update sync state
    sync_state.last_sync_completed_at = time.time()
    sync_state.is_initial_backfill_done = True
    sync_state.last_sync_activities_fetched = fetched_count

    # Count total activities in DB
    total = session.exec(select(func.count(Activity.id))).one()
    sync_state.activities_synced = total

    session.add(sync_state)
    session.commit()

    logger.info("Sync completed: fetched %d, total in DB: %d", fetched_count, total)
    return {"status": "completed", "fetched": fetched_count, "total": total}
