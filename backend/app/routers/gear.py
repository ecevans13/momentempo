"""Gear gallery endpoint: fetch gear details from Strava."""

import logging

import httpx
from fastapi import APIRouter, HTTPException, Request
from sqlmodel import Session, col, select

from ..config import get_settings
from ..models import Activity, Token
from ..services.strava_auth import ensure_valid_token
from ..services.strava_client import strava_get

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gear", tags=["gear"])


def _get_session(request: Request) -> Session:
    return Session(request.app.state.engine)


@router.get("")
async def list_gear(request: Request):
    """Fetch all gear referenced by stored activities, with details from Strava."""
    with _get_session(request) as session:
        settings = get_settings()
        token = await ensure_valid_token(session, settings)
        if token is None:
            raise HTTPException(status_code=401, detail="Not authenticated")

        # Get unique gear IDs from activities
        stmt = (
            select(Activity.gear_id)
            .where(col(Activity.gear_id).isnot(None))
            .distinct()
        )
        gear_ids = [row for row in session.exec(stmt).all() if row]

        if not gear_ids:
            return {"gear": []}

        # Fetch each gear's details from Strava + compute distance from local data
        gear_list = []
        async with httpx.AsyncClient() as client:
            for gear_id in gear_ids:
                try:
                    response, _ = await strava_get(
                        client,
                        f"/gear/{gear_id}",
                        token.access_token,
                    )
                    if response.status_code != 200:
                        continue
                    data = response.json()

                    # Count activities and distance for this gear from local DB
                    activity_count_stmt = select(Activity).where(
                        Activity.gear_id == gear_id
                    )
                    activities = session.exec(activity_count_stmt).all()
                    local_distance = sum(a.distance for a in activities)
                    local_count = len(activities)

                    gear_list.append({
                        "id": data.get("id", gear_id),
                        "name": data.get("name", "Unknown"),
                        "brand_name": data.get("brand_name", ""),
                        "model_name": data.get("model_name", ""),
                        "distance": data.get("distance", local_distance),
                        "activity_count": local_count,
                        "type": data.get("resource_state", ""),
                        "retired": data.get("retired", False),
                    })
                except Exception as exc:
                    logger.warning("Failed to fetch gear %s: %s", gear_id, exc)
                    continue

        return {"gear": gear_list}
