"""Trophy case endpoints: PRs from activity data and custom milestones."""

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, col, func, select

from ..models import Activity, Milestone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/trophies", tags=["trophies"])

RUN_SPORT_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill"}

# Standard PR distances with tolerance ranges (meters)
PR_DISTANCES = [
    {"name": "1 Mile", "target": 1609, "min": 1500, "max": 1800},
    {"name": "5K", "target": 5000, "min": 4800, "max": 5500},
    {"name": "10K", "target": 10000, "min": 9500, "max": 11000},
    {"name": "Half Marathon", "target": 21097, "min": 20500, "max": 22000},
    {"name": "Marathon", "target": 42195, "min": 41500, "max": 43000},
]


def _get_session(request: Request) -> Session:
    return Session(request.app.state.engine)


@router.get("/prs")
def get_prs(request: Request):
    """Compute PRs for standard distances from stored activity data."""
    with _get_session(request) as session:
        prs = []
        for dist in PR_DISTANCES:
            # Find the fastest run-like activity within the distance range
            stmt = (
                select(Activity)
                .where(col(Activity.sport_type).in_(RUN_SPORT_TYPES))
                .where(col(Activity.distance) >= dist["min"])
                .where(col(Activity.distance) <= dist["max"])
                .where(col(Activity.moving_time) > 0)
                .order_by(col(Activity.moving_time).asc())
                .limit(1)
            )
            activity = session.exec(stmt).first()

            if activity:
                prs.append({
                    "distance_name": dist["name"],
                    "distance_target_m": dist["target"],
                    "activity_id": activity.id,
                    "activity_name": activity.name,
                    "moving_time": activity.moving_time,
                    "distance": activity.distance,
                    "start_date": activity.start_date,
                    "average_heartrate": activity.average_heartrate,
                })
            else:
                prs.append({
                    "distance_name": dist["name"],
                    "distance_target_m": dist["target"],
                    "activity_id": None,
                    "activity_name": None,
                    "moving_time": None,
                    "distance": None,
                    "start_date": None,
                    "average_heartrate": None,
                })

        return {"prs": prs}


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


@router.get("/timeline")
def get_timeline(request: Request):
    """Combined timeline of PRs and milestones, sorted chronologically."""
    with _get_session(request) as session:
        events = []

        # Add PRs as timeline events
        for dist in PR_DISTANCES:
            stmt = (
                select(Activity)
                .where(col(Activity.sport_type).in_(RUN_SPORT_TYPES))
                .where(col(Activity.distance) >= dist["min"])
                .where(col(Activity.distance) <= dist["max"])
                .where(col(Activity.moving_time) > 0)
                .order_by(col(Activity.moving_time).asc())
                .limit(1)
            )
            activity = session.exec(stmt).first()
            if activity:
                events.append({
                    "type": "pr",
                    "title": f"{dist['name']} PR",
                    "subtitle": activity.name,
                    "date": activity.start_date,
                    "moving_time": activity.moving_time,
                    "activity_id": activity.id,
                })

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
