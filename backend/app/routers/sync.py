"""Sync endpoints: trigger sync and check status."""

import logging
import time

from fastapi import APIRouter, BackgroundTasks, Request
from sqlmodel import Session, func, select

from ..config import get_settings
from ..models import Activity, SyncState
from ..services.strava_auth import ensure_valid_token
from ..services.strava_sync import TTL_SECONDS, get_sync_state, run_sync

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["sync"])


def _get_session(request: Request) -> Session:
    """Create a new session from the engine on app.state."""
    return Session(request.app.state.engine)


@router.post("/sync", status_code=202)
async def trigger_sync(request: Request, background_tasks: BackgroundTasks):
    """Trigger a background sync of Strava activities.

    Pre-checks TTL gate and token before dispatching to background.
    Returns 202 Accepted if sync is dispatched.
    """
    engine = request.app.state.engine
    settings = get_settings()

    # Pre-check: TTL gate and token validity
    with Session(engine) as session:
        sync_state = get_sync_state(session)
        elapsed = time.time() - sync_state.last_sync_completed_at
        if elapsed < TTL_SECONDS:
            remaining = TTL_SECONDS - elapsed
            return {
                "status": "skipped",
                "reason": "ttl_gate",
                "retry_after_seconds": remaining,
            }

        token = await ensure_valid_token(session, settings)
        if token is None:
            return {"status": "skipped", "reason": "no_token"}

    # Dispatch background sync — background task creates its own session
    async def _run_sync_background():
        with Session(engine) as bg_session:
            result = await run_sync(bg_session, settings)
            logger.info("Background sync result: %s", result)

    background_tasks.add_task(_run_sync_background)

    return {"status": "accepted", "message": "Sync started in background"}


@router.get("/sync/status")
def sync_status(request: Request):
    """Return current sync state: last sync time, counts, TTL info."""
    engine = request.app.state.engine

    with Session(engine) as session:
        state = session.exec(select(SyncState).where(SyncState.id == 1)).first()
        total_activities = session.exec(select(func.count(Activity.id))).one()

    if state is None:
        return {
            "last_sync_completed_at": None,
            "is_initial_backfill_done": False,
            "activities_synced": 0,
            "total_activities_in_db": total_activities,
            "last_sync_activities_fetched": 0,
            "ttl_remaining_seconds": 0,
        }

    elapsed = time.time() - state.last_sync_completed_at
    ttl_remaining = max(0, TTL_SECONDS - elapsed)

    return {
        "last_sync_completed_at": state.last_sync_completed_at,
        "is_initial_backfill_done": state.is_initial_backfill_done,
        "activities_synced": state.activities_synced,
        "total_activities_in_db": total_activities,
        "last_sync_activities_fetched": state.last_sync_activities_fetched,
        "ttl_remaining_seconds": ttl_remaining,
    }
