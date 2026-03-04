"""Sync orchestrator: TTL gate, backfill/incremental fetch, upsert to SQLite."""

import logging
import time

import httpx
from sqlmodel import Session, func, select

from ..config import Settings
from ..models import Activity, BestEffort, SyncState
from .strava_auth import ensure_valid_token
from .strava_client import (
    RateLimitState,
    fetch_all_activities,
    strava_activity_to_model,
    strava_get,
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
        async with httpx.AsyncClient(timeout=30.0, verify=settings.ssl_verify) as client:
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


RUN_SPORT_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill"}

# Max activities to process per best-efforts sync call (stay within rate limits)
BEST_EFFORTS_BATCH_SIZE = 80


async def sync_best_efforts(
    session: Session,
    settings: Settings,
    activity_ids: list[int] | None = None,
) -> dict:
    """Fetch detailed activity data from Strava and store best efforts.

    If activity_ids is provided, only process those activities.
    Otherwise, find all running activities missing best efforts and process them.

    Returns {status, processed, remaining, errors}.
    """
    token = await ensure_valid_token(session, settings)
    if token is None:
        return {"status": "error", "reason": "no_token"}

    if activity_ids is not None:
        to_process = activity_ids
    else:
        # Find running activities that don't have best efforts yet
        existing = session.exec(
            select(BestEffort.activity_id).distinct()
        ).all()
        existing_set = set(existing)

        all_run_ids = session.exec(
            select(Activity.id).where(
                Activity.sport_type.in_(RUN_SPORT_TYPES),  # type: ignore[attr-defined]
                Activity.distance > 0,
            )
        ).all()
        to_process = [aid for aid in all_run_ids if aid not in existing_set]

    remaining = max(0, len(to_process) - BEST_EFFORTS_BATCH_SIZE)
    batch = to_process[:BEST_EFFORTS_BATCH_SIZE]

    processed = 0
    errors = 0

    async with httpx.AsyncClient(timeout=30.0, verify=settings.ssl_verify) as client:
        rate_limit = RateLimitState()

        for activity_id in batch:
            try:
                response, rate_limit = await strava_get(
                    client,
                    f"/activities/{activity_id}",
                    token.access_token,
                    rate_limit=rate_limit,
                )

                if response.status_code == 404:
                    logger.warning("Activity %d not found on Strava, skipping", activity_id)
                    errors += 1
                    continue

                response.raise_for_status()
                data = response.json()

                # Get the activity name for denormalization
                activity_name = data.get("name", "")

                # Extract best_efforts
                best_efforts = data.get("best_efforts", [])
                if best_efforts:
                    for effort in best_efforts:
                        be = BestEffort(
                            activity_id=activity_id,
                            activity_name=activity_name,
                            name=effort.get("name", ""),
                            distance=effort.get("distance", 0.0),
                            moving_time=effort.get("moving_time", 0),
                            elapsed_time=effort.get("elapsed_time", 0),
                            start_date=effort.get("start_date", ""),
                            pr_rank=effort.get("pr_rank"),
                        )
                        session.add(be)
                else:
                    # Insert a marker so we don't re-fetch this activity
                    marker = BestEffort(
                        activity_id=activity_id,
                        activity_name=activity_name,
                        name="_no_efforts",
                        distance=0,
                        moving_time=0,
                    )
                    session.add(marker)

                processed += 1

            except Exception as exc:
                logger.error("Error fetching best efforts for activity %d: %s", activity_id, exc)
                errors += 1

    session.commit()
    logger.info(
        "Best efforts sync: processed %d activities, %d errors, %d remaining",
        processed, errors, remaining,
    )
    return {
        "status": "completed",
        "processed": processed,
        "errors": errors,
        "remaining": remaining,
    }
