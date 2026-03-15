"""Trophy case endpoints: PRs from activity data and custom milestones."""

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, col, func, select

from ..models import Activity, BestEffort, Milestone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/trophies", tags=["trophies"])

RUN_SPORT_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill"}

# Maps display names to Strava best_efforts names for each standard distance.
# Strava names are lowercase as returned by their API.
PR_DISTANCES = [
    {"name": "1 Mile", "target": 1609, "strava_names": ["1 mile"]},
    {"name": "5K", "target": 5000, "strava_names": ["5k"]},
    {"name": "10K", "target": 10000, "strava_names": ["10k"]},
    {"name": "Half Marathon", "target": 21097, "strava_names": ["half-marathon", "half marathon"]},
    {"name": "Marathon", "target": 42195, "strava_names": ["marathon"]},
]

# No-data placeholder for a PR slot
_EMPTY_PR = {
    "activity_id": None,
    "activity_name": None,
    "moving_time": None,
    "distance": None,
    "start_date": None,
    "average_heartrate": None,
}


def _get_session(request: Request) -> Session:
    return Session(request.app.state.engine)


@router.get("/prs")
def get_prs(request: Request):
    """Get PRs for standard distances from Strava best-effort data.

    Uses the BestEffort table (populated by /api/sync/best-efforts) which
    contains sub-activity best efforts at standard distances. Falls back
    to total-activity-distance matching if no best efforts are synced yet.
    """
    with _get_session(request) as session:
        # Check if we have any best effort data
        has_best_efforts = session.exec(
            select(func.count(BestEffort.id)).where(BestEffort.id.isnot(None))  # type: ignore[union-attr]
        ).one() > 0

        prs = []
        for dist in PR_DISTANCES:
            pr_data = {
                "distance_name": dist["name"],
                "distance_target_m": dist["target"],
                **_EMPTY_PR,
            }

            if has_best_efforts:
                # Primary: query BestEffort table for the fastest effort at this distance
                names_lower = dist["strava_names"]
                stmt = (
                    select(BestEffort)
                    .where(func.lower(BestEffort.name).in_(names_lower))
                    .where(col(BestEffort.moving_time) > 0)
                    .order_by(col(BestEffort.moving_time).asc())
                    .limit(1)
                )
                effort = session.exec(stmt).first()

                if effort:
                    # Look up the activity for heartrate data
                    activity = session.get(Activity, effort.activity_id)
                    pr_data.update({
                        "activity_id": effort.activity_id,
                        "activity_name": effort.activity_name,
                        "moving_time": effort.moving_time,
                        "distance": effort.distance,
                        "start_date": effort.start_date or (activity.start_date if activity else None),
                        "average_heartrate": activity.average_heartrate if activity else None,
                    })
            else:
                # Fallback: match by total activity distance (legacy behavior)
                # This is less accurate but works before best efforts are synced
                FALLBACK_RANGES = {
                    "1 Mile": (1500, 1800),
                    "5K": (4800, 5500),
                    "10K": (9500, 11000),
                    "Half Marathon": (20500, 22000),
                    "Marathon": (41500, 43000),
                }
                dist_range = FALLBACK_RANGES.get(dist["name"])
                if dist_range:
                    stmt = (
                        select(Activity)
                        .where(col(Activity.sport_type).in_(RUN_SPORT_TYPES))
                        .where(col(Activity.distance) >= dist_range[0])
                        .where(col(Activity.distance) <= dist_range[1])
                        .where(col(Activity.moving_time) > 0)
                        .order_by(col(Activity.moving_time).asc())
                        .limit(1)
                    )
                    activity = session.exec(stmt).first()
                    if activity:
                        pr_data.update({
                            "activity_id": activity.id,
                            "activity_name": activity.name,
                            "moving_time": activity.moving_time,
                            "distance": activity.distance,
                            "start_date": activity.start_date,
                            "average_heartrate": activity.average_heartrate,
                        })

            prs.append(pr_data)

        return {"prs": prs, "source": "best_efforts" if has_best_efforts else "activity_distance"}


class MilestoneCreate(BaseModel):
    title: str
    description: str = ""
    achieved_at: str | None = None


@router.get("/milestones")
def list_milestones(request: Request):
    """List all custom milestones."""
    with _get_session(request) as session:
        stmt = select(Milestone).order_by(col(Milestone.created_at).desc())
        milestones = session.exec(stmt).all()
        return {
            "milestones": [
                {
                    "id": m.id,
                    "title": m.title,
                    "description": m.description,
                    "achieved_at": m.achieved_at,
                    "created_at": m.created_at,
                }
                for m in milestones
            ]
        }


@router.post("/milestones", status_code=201)
def create_milestone(request: Request, body: MilestoneCreate):
    """Create a new custom milestone."""
    with _get_session(request) as session:
        milestone = Milestone(
            title=body.title,
            description=body.description,
            achieved_at=body.achieved_at,
        )
        session.add(milestone)
        session.commit()
        session.refresh(milestone)
        return {
            "id": milestone.id,
            "title": milestone.title,
            "description": milestone.description,
            "achieved_at": milestone.achieved_at,
            "created_at": milestone.created_at,
        }


@router.delete("/milestones/{milestone_id}", status_code=204)
def delete_milestone(request: Request, milestone_id: int):
    """Delete a custom milestone."""
    with _get_session(request) as session:
        milestone = session.get(Milestone, milestone_id)
        if milestone is None:
            raise HTTPException(status_code=404, detail="Milestone not found")
        session.delete(milestone)
        session.commit()


@router.get("/best-efforts-progression")
def get_best_efforts_progression(request: Request):
    """Return all best efforts grouped by standard distance, for progression charting.

    Only distances with 2 or more qualifying efforts (moving_time > 0 and start_date set)
    are included. Results per distance are sorted chronologically ascending.
    """
    with _get_session(request) as session:
        progression: dict[str, list[dict]] = {}

        for dist in PR_DISTANCES:
            names_lower = dist["strava_names"]
            stmt = (
                select(BestEffort)
                .where(func.lower(BestEffort.name).in_(names_lower))
                .where(col(BestEffort.moving_time) > 0)
                .where(col(BestEffort.start_date) != "")
                .order_by(col(BestEffort.start_date).asc())
            )
            efforts = session.exec(stmt).all()

            if len(efforts) >= 2:
                progression[dist["name"]] = [
                    {
                        "date": e.start_date[:10],
                        "moving_time": e.moving_time,
                        "activity_id": e.activity_id,
                        "activity_name": e.activity_name,
                    }
                    for e in efforts
                ]

        return {"progression": progression}


@router.get("/timeline")
def get_timeline(request: Request):
    """Combined timeline of PRs and milestones, sorted chronologically."""
    with _get_session(request) as session:
        events = []

        has_best_efforts = session.exec(
            select(func.count(BestEffort.id)).where(BestEffort.id.isnot(None))  # type: ignore[union-attr]
        ).one() > 0

        # Add PRs as timeline events
        for dist in PR_DISTANCES:
            pr_event = None

            if has_best_efforts:
                names_lower = dist["strava_names"]
                stmt = (
                    select(BestEffort)
                    .where(func.lower(BestEffort.name).in_(names_lower))
                    .where(col(BestEffort.moving_time) > 0)
                    .order_by(col(BestEffort.moving_time).asc())
                    .limit(1)
                )
                effort = session.exec(stmt).first()
                if effort:
                    activity = session.get(Activity, effort.activity_id)
                    pr_event = {
                        "type": "pr",
                        "title": f"{dist['name']} PR",
                        "subtitle": effort.activity_name,
                        "date": effort.start_date or (activity.start_date if activity else ""),
                        "moving_time": effort.moving_time,
                        "activity_id": effort.activity_id,
                    }
            else:
                # Fallback: match by total activity distance
                FALLBACK_RANGES = {
                    "1 Mile": (1500, 1800),
                    "5K": (4800, 5500),
                    "10K": (9500, 11000),
                    "Half Marathon": (20500, 22000),
                    "Marathon": (41500, 43000),
                }
                dist_range = FALLBACK_RANGES.get(dist["name"])
                if dist_range:
                    stmt = (
                        select(Activity)
                        .where(col(Activity.sport_type).in_(RUN_SPORT_TYPES))
                        .where(col(Activity.distance) >= dist_range[0])
                        .where(col(Activity.distance) <= dist_range[1])
                        .where(col(Activity.moving_time) > 0)
                        .order_by(col(Activity.moving_time).asc())
                        .limit(1)
                    )
                    activity = session.exec(stmt).first()
                    if activity:
                        pr_event = {
                            "type": "pr",
                            "title": f"{dist['name']} PR",
                            "subtitle": activity.name,
                            "date": activity.start_date,
                            "moving_time": activity.moving_time,
                            "activity_id": activity.id,
                        }

            if pr_event:
                events.append(pr_event)

        # Add achieved milestones
        stmt = (
            select(Milestone)
            .where(col(Milestone.achieved_at).isnot(None))
            .order_by(col(Milestone.achieved_at).desc())
        )
        milestones = session.exec(stmt).all()
        for m in milestones:
            events.append({
                "type": "milestone",
                "title": m.title,
                "subtitle": m.description,
                "date": m.achieved_at,
                "milestone_id": m.id,
            })

        # Sort by date descending (most recent first)
        events.sort(key=lambda e: e.get("date", ""), reverse=True)

        return {"events": events}
