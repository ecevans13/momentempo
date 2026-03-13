"""Dashboard endpoints: summary metrics, trends, and activity feed."""

import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request
from sqlmodel import Session, col, func, select

from ..models import Activity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["dashboard"])

# Sport types considered "run-like" for pace calculations
RUN_SPORT_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill"}

PERIOD_SECONDS = {
    "week": 7 * 86400,
    "month": 30 * 86400,
    "year": 365 * 86400,
}


def _get_session(request: Request) -> Session:
    return Session(request.app.state.engine)


def _apply_sport_filter(stmt, sport_type: str | None):
    """Apply sport_type filter, supporting 'Run:indoor' / 'Run:outdoor' variants."""
    if not sport_type:
        return stmt
    if ":" in sport_type:
        base_sport, locality = sport_type.split(":", 1)
        stmt = stmt.where(Activity.sport_type == base_sport)
        if locality == "outdoor":
            stmt = stmt.where(
                col(Activity.summary_polyline).isnot(None),
                col(Activity.summary_polyline) != "",
            )
        elif locality == "indoor":
            stmt = stmt.where(
                (col(Activity.summary_polyline).is_(None))
                | (col(Activity.summary_polyline) == "")
            )
    else:
        stmt = stmt.where(Activity.sport_type == sport_type)
    return stmt


@router.get("/landing/recent")
def landing_recent(request: Request):
    """Landing page data: 10 most recent activities with polylines + lifetime stats."""
    with _get_session(request) as session:
        # Lifetime aggregate stats
        agg = select(
            func.count(Activity.id),
            func.sum(Activity.distance),
            func.sum(Activity.moving_time),
            func.sum(Activity.total_elevation_gain),
        )
        count, total_distance, total_moving_time, total_elevation = session.exec(agg).one()

        # 10 most recent activities with polyline
        stmt = (
            select(Activity)
            .order_by(col(Activity.start_date_epoch).desc())
            .limit(10)
        )
        activities = session.exec(stmt).all()

    return {
        "lifetime_stats": {
            "total_activities": count or 0,
            "total_distance_m": total_distance or 0.0,
            "total_moving_time_s": total_moving_time or 0,
            "total_elevation_gain_m": total_elevation or 0.0,
        },
        "recent_activities": [
            {
                "id": a.id,
                "name": a.name,
                "sport_type": a.sport_type,
                "start_date": a.start_date,
                "start_date_local": a.start_date_local,
                "distance": a.distance,
                "moving_time": a.moving_time,
                "total_elevation_gain": a.total_elevation_gain,
                "average_speed": a.average_speed,
                "has_heartrate": a.has_heartrate,
                "average_heartrate": a.average_heartrate,
                "suffer_score": a.suffer_score,
                "kudos_count": a.kudos_count,
                "summary_polyline": a.summary_polyline,
            }
            for a in activities
        ],
    }


@router.get("/dashboard/summary")
def dashboard_summary(
    request: Request,
    period: str = Query("month", pattern="^(week|month|year|all)$"),
):
    """Key metrics aggregated over a time period — uses SQL aggregates, no Python-side summing."""
    cutoff: int | None = None
    period_start: str | None = None
    if period != "all":
        cutoff = int(time.time() - PERIOD_SECONDS[period])
        period_start = datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat()

    with _get_session(request) as session:
        # Single query for all totals
        agg = select(
            func.count(Activity.id),
            func.sum(Activity.distance),
            func.sum(Activity.moving_time),
            func.sum(Activity.total_elevation_gain),
        )
        if cutoff is not None:
            agg = agg.where(col(Activity.start_date_epoch) >= cutoff)
        count, total_distance, total_moving_time, total_elevation = session.exec(agg).one()
        total_distance = total_distance or 0.0
        total_moving_time = total_moving_time or 0
        total_elevation = total_elevation or 0.0
        count = count or 0

        # Pace: aggregate only run-like activities with distance
        run_agg = select(
            func.sum(Activity.moving_time),
            func.sum(Activity.distance),
        ).where(
            col(Activity.sport_type).in_(RUN_SPORT_TYPES),
            col(Activity.distance) > 0,
        )
        if cutoff is not None:
            run_agg = run_agg.where(col(Activity.start_date_epoch) >= cutoff)
        run_time, run_dist = session.exec(run_agg).one()
        avg_pace = ((run_time / run_dist) * 1000) if (run_time and run_dist) else None

        # Average HR
        hr_agg = select(func.avg(Activity.average_heartrate)).where(
            col(Activity.has_heartrate) == True,  # noqa: E712
            col(Activity.average_heartrate).isnot(None),
        )
        if cutoff is not None:
            hr_agg = hr_agg.where(col(Activity.start_date_epoch) >= cutoff)
        avg_hr = session.exec(hr_agg).one()

    return {
        "period": period,
        "period_start": period_start,
        "total_distance_m": total_distance,
        "total_moving_time_s": total_moving_time,
        "total_elevation_gain_m": total_elevation,
        "activity_count": count,
        "avg_pace_s_per_km": round(avg_pace, 1) if avg_pace is not None else None,
        "avg_heartrate": round(avg_hr, 1) if avg_hr is not None else None,
    }


@router.get("/dashboard/trends")
def dashboard_trends(
    request: Request,
    metric: str = Query("distance", pattern="^(distance|duration|pace|elevation|count)$"),
    granularity: str = Query("weekly", pattern="^(weekly|monthly)$"),
    months: int = Query(12, ge=1, le=60),
    sport_type: str | None = Query(None),
):
    """Time-series data for trend charts."""
    with _get_session(request) as session:
        cutoff = int(time.time() - months * 30 * 86400)
        # Select only the columns needed for bucketing + aggregation
        stmt = select(
            Activity.start_date_epoch,
            Activity.distance,
            Activity.moving_time,
            Activity.total_elevation_gain,
            Activity.sport_type,
        ).where(col(Activity.start_date_epoch) >= cutoff)
        stmt = _apply_sport_filter(stmt, sport_type)
        activities = session.exec(stmt).all()

    # Group activities by period bucket (rows support attribute access)
    buckets: dict[str, list] = {}
    for a in activities:
        dt = datetime.fromtimestamp(a.start_date_epoch, tz=timezone.utc)
        if granularity == "weekly":
            key = dt.strftime("%G-W%V")
        else:
            key = dt.strftime("%Y-%m")
        buckets.setdefault(key, []).append(a)

    # Aggregate per bucket
    data = []
    for period_key in sorted(buckets.keys()):
        group = buckets[period_key]
        if metric == "distance":
            value = sum(a.distance for a in group)
        elif metric == "duration":
            value = sum(a.moving_time for a in group)
        elif metric == "elevation":
            value = sum(a.total_elevation_gain for a in group)
        elif metric == "count":
            value = len(group)
        elif metric == "pace":
            runs = [a for a in group if a.sport_type in RUN_SPORT_TYPES and a.distance > 0]
            if runs:
                total_time = sum(a.moving_time for a in runs)
                total_dist = sum(a.distance for a in runs)
                value = (total_time / total_dist) * 1000 if total_dist > 0 else 0
            else:
                value = 0
        else:
            value = 0
        data.append({"period": period_key, "value": round(value, 2)})

    return {
        "metric": metric,
        "granularity": granularity,
        "data": data,
    }


@router.get("/activities")
def list_activities(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    sport_type: str | None = Query(None),
):
    """Paginated activity feed."""
    with _get_session(request) as session:
        base = select(Activity)
        base = _apply_sport_filter(base, sport_type)

        # Total count
        count_stmt = select(func.count(Activity.id))
        count_stmt = _apply_sport_filter(count_stmt, sport_type)
        total = session.exec(count_stmt).one()

        # Page of activities
        stmt = (
            base
            .order_by(col(Activity.start_date_epoch).desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        activities = session.exec(stmt).all()

    total_pages = (total + per_page - 1) // per_page if total > 0 else 0

    return {
        "activities": [
            {
                "id": a.id,
                "name": a.name,
                "sport_type": a.sport_type,
                "start_date": a.start_date,
                "start_date_local": a.start_date_local,
                "distance": a.distance,
                "moving_time": a.moving_time,
                "total_elevation_gain": a.total_elevation_gain,
                "average_speed": a.average_speed,
                "has_heartrate": a.has_heartrate,
                "average_heartrate": a.average_heartrate,
                "suffer_score": a.suffer_score,
                "kudos_count": a.kudos_count,
            }
            for a in activities
        ],
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": total_pages,
    }
