"""Insights endpoints: training heatmap, race predictions, and what's working analysis."""

import logging
import math
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request
from sqlmodel import Session, col, select

from ..models import Activity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/insights", tags=["insights"])

RUN_SPORT_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill"}

# Standard race distances for predictions (meters)
PREDICTION_DISTANCES = [
    {"name": "5K", "meters": 5000},
    {"name": "10K", "meters": 10000},
    {"name": "Half Marathon", "meters": 21097},
    {"name": "Marathon", "meters": 42195},
    {"name": "50K", "meters": 50000},
]

# Anchor distances with tolerance ranges (reuse pattern from trophies)
ANCHOR_DISTANCES = [
    {"name": "1 Mile", "target": 1609, "min": 1500, "max": 1800},
    {"name": "5K", "target": 5000, "min": 4800, "max": 5500},
    {"name": "10K", "target": 10000, "min": 9500, "max": 11000},
    {"name": "Half Marathon", "target": 21097, "min": 20500, "max": 22000},
    {"name": "Marathon", "target": 42195, "min": 41500, "max": 43000},
]


def _get_session(request: Request) -> Session:
    return Session(request.app.state.engine)


def _pearson_r(xs: list[float], ys: list[float]) -> float | None:
    """Compute Pearson correlation coefficient. Returns None if insufficient variance."""
    n = len(xs)
    if n < 3:
        return None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den_x = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    if den_x == 0 or den_y == 0:
        return None
    return num / (den_x * den_y)


@router.get("/heatmap")
def training_heatmap(
    request: Request,
    months: int = Query(12, ge=1, le=24),
):
    """Training load heatmap data grouped by calendar day."""
    cutoff = int(time.time() - months * 30 * 86400)

    with _get_session(request) as session:
        stmt = (
            select(Activity)
            .where(col(Activity.start_date_epoch) >= cutoff)
            .order_by(col(Activity.start_date_epoch).asc())
        )
        activities = session.exec(stmt).all()

    # Group by calendar day and compute composite training load
    day_loads: dict[str, float] = {}
    for a in activities:
        date_str = a.start_date_local[:10] if a.start_date_local else a.start_date[:10]
        intensity = (a.average_heartrate / 140.0) if (a.has_heartrate and a.average_heartrate) else 1.0
        load = (a.moving_time / 60.0) * intensity
        day_loads[date_str] = day_loads.get(date_str, 0) + load

    days = [{"date": d, "load": round(load, 1)} for d, load in sorted(day_loads.items())]
    max_load = max((d["load"] for d in days), default=0)

    return {
        "months": months,
        "days": days,
        "max_load": round(max_load, 1),
    }


@router.get("/heatmap/day")
def heatmap_day(
    request: Request,
    date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    """Return activities for a specific calendar day (for heatmap drilldown)."""
    with _get_session(request) as session:
        stmt = (
            select(Activity)
            .where(col(Activity.start_date_local).startswith(date))
            .order_by(col(Activity.start_date_epoch).asc())
        )
        activities = session.exec(stmt).all()

    return {
        "date": date,
        "activities": [
            {
                "id": a.id,
                "name": a.name,
                "sport_type": a.sport_type,
                "distance": a.distance,
                "moving_time": a.moving_time,
                "total_elevation_gain": a.total_elevation_gain,
                "average_heartrate": a.average_heartrate,
                "has_heartrate": a.has_heartrate,
            }
            for a in activities
        ],
    }


@router.get("/race-predictions")
def race_predictions(request: Request):
    """Predict race times using Riegel formula based on PR anchor efforts."""
    with _get_session(request) as session:
        anchor_efforts = []
        for dist in ANCHOR_DISTANCES:
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
                anchor_efforts.append({
                    "distance_name": dist["name"],
                    "distance_m": dist["target"],
                    "time_seconds": activity.moving_time,
                    "activity_id": activity.id,
                    "activity_name": activity.name,
                    "start_date": activity.start_date,
                })

    if not anchor_efforts:
        return {
            "anchor_efforts": [],
            "predictions": [],
            "vdot_estimate": None,
        }

    # Generate predictions for each target distance
    predictions = []
    for target in PREDICTION_DISTANCES:
        # Find closest anchor for most accurate extrapolation
        best_anchor = min(
            anchor_efforts,
            key=lambda a: abs(a["distance_m"] - target["meters"]),
        )
        ratio = target["meters"] / best_anchor["distance_m"]

        # Riegel formula: T2 = T1 * (D2/D1)^1.06
        predicted_time = best_anchor["time_seconds"] * (ratio ** 1.06)

        # Confidence based on extrapolation ratio
        abs_ratio = max(ratio, 1 / ratio) if ratio != 0 else 10
        if abs_ratio < 3:
            confidence = "high"
        elif abs_ratio < 6:
            confidence = "medium"
        else:
            confidence = "low"

        predictions.append({
            "distance_name": target["name"],
            "distance_m": target["meters"],
            "predicted_seconds": round(predicted_time),
            "confidence": confidence,
            "based_on": best_anchor["distance_name"],
        })

    # VDOT estimate using Daniels approximation (based on best 5K-equivalent effort)
    vdot = None
    # Use closest anchor to 5K for VDOT, or any anchor
    best_for_vdot = min(anchor_efforts, key=lambda a: abs(a["distance_m"] - 5000))
    d_km = best_for_vdot["distance_m"] / 1000.0
    t_min = best_for_vdot["time_seconds"] / 60.0
    if t_min > 0 and d_km > 0:
        # Simplified Daniels VDOT approximation
        speed = d_km / t_min  # km/min
        vo2 = -4.6 + 0.182258 * (speed * 1000) + 0.000104 * (speed * 1000) ** 2
        pct_max = 0.8 + 0.1894393 * math.exp(-0.012778 * t_min) + 0.2989558 * math.exp(-0.1932605 * t_min)
        if pct_max > 0:
            vdot = round(vo2 / pct_max, 1)

    return {
        "anchor_efforts": anchor_efforts,
        "predictions": predictions,
        "vdot_estimate": vdot,
    }


@router.get("/whats-working")
def whats_working(request: Request):
    """Correlation analysis of training patterns vs performance over recent months."""
    cutoff = int(time.time() - 6 * 30 * 86400)

    with _get_session(request) as session:
        stmt = (
            select(Activity)
            .where(col(Activity.sport_type).in_(RUN_SPORT_TYPES))
            .where(col(Activity.start_date_epoch) >= cutoff)
            .order_by(col(Activity.start_date_epoch).asc())
        )
        activities = session.exec(stmt).all()

    if len(activities) < 10:
        return {
            "insights": [],
            "weeks_analyzed": 0,
            "insufficient_data": True,
        }

    # Compute median pace for "easy run" threshold
    paces = [
        (a.moving_time / a.distance) * 1000
        for a in activities
        if a.distance > 0
    ]
    paces.sort()
    median_pace = paces[len(paces) // 2] if paces else 0

    # Build weekly aggregates
    weeks: dict[str, dict] = {}
    for a in activities:
        dt = datetime.fromtimestamp(a.start_date_epoch, tz=timezone.utc)
        week_key = dt.strftime("%G-W%V")
        if week_key not in weeks:
            weeks[week_key] = {
                "volume_m": 0,
                "run_count": 0,
                "easy_count": 0,
                "total_time": 0,
                "total_dist": 0,
                "active_days": set(),
            }
        w = weeks[week_key]
        w["volume_m"] += a.distance
        w["run_count"] += 1
        w["total_time"] += a.moving_time
        w["total_dist"] += a.distance
        w["active_days"].add(dt.strftime("%Y-%m-%d"))

        # Determine if "easy" run
        is_easy = False
        if a.has_heartrate and a.average_heartrate and a.average_heartrate < 150:
            is_easy = True
        elif a.distance > 0:
            pace = (a.moving_time / a.distance) * 1000
            if pace > median_pace * 1.1:
                is_easy = True
        if is_easy:
            w["easy_count"] += 1

    # Convert to sorted list with computed metrics
    sorted_keys = sorted(weeks.keys())
    week_data = []
    for k in sorted_keys:
        w = weeks[k]
        avg_pace = (w["total_time"] / w["total_dist"]) * 1000 if w["total_dist"] > 0 else 0
        week_data.append({
            "week": k,
            "volume_km": w["volume_m"] / 1000,
            "run_count": w["run_count"],
            "easy_count": w["easy_count"],
            "avg_pace": avg_pace,
            "rest_days": 7 - len(w["active_days"]),
            "consistency": len(w["active_days"]) / 7.0,
        })

    insights = []

    # 1. Volume (week N) vs pace (week N+2) — adaptation lag
    if len(week_data) > 4:
        xs = [week_data[i]["volume_km"] for i in range(len(week_data) - 2)]
        ys = [week_data[i + 2]["avg_pace"] for i in range(len(week_data) - 2)]
        valid = [(x, y) for x, y in zip(xs, ys) if y > 0]
        if len(valid) >= 6:
            r = _pearson_r([v[0] for v in valid], [v[1] for v in valid])
            if r is not None and abs(r) > 0.3:
                direction = "faster" if r < 0 else "slower"
                insights.append({
                    "type": "volume_vs_pace",
                    "title": f"More volume = {direction} pace",
                    "description": f"Weeks with higher training volume tend to produce {direction} paces two weeks later.",
                    "correlation": round(r, 2),
                    "data_points": len(valid),
                })

    # 2. Easy run count vs next-week pace improvement
    if len(week_data) > 2:
        xs = [week_data[i]["easy_count"] for i in range(len(week_data) - 1)]
        ys = [week_data[i + 1]["avg_pace"] for i in range(len(week_data) - 1)]
        valid = [(x, y) for x, y in zip(xs, ys) if y > 0]
        if len(valid) >= 6:
            r = _pearson_r([v[0] for v in valid], [v[1] for v in valid])
            if r is not None and abs(r) > 0.3:
                effect = "improves" if r < 0 else "hurts"
                insights.append({
                    "type": "easy_runs",
                    "title": f"Easy runs {effect} next-week pace",
                    "description": f"More easy runs in a week correlate with {'faster' if r < 0 else 'slower'} pace the following week.",
                    "correlation": round(r, 2),
                    "data_points": len(valid),
                })

    # 3. Rest days vs next-week performance
    if len(week_data) > 2:
        xs = [week_data[i]["rest_days"] for i in range(len(week_data) - 1)]
        ys = [week_data[i + 1]["avg_pace"] for i in range(len(week_data) - 1)]
        valid = [(x, y) for x, y in zip(xs, ys) if y > 0]
        if len(valid) >= 6:
            r = _pearson_r([v[0] for v in valid], [v[1] for v in valid])
            if r is not None and abs(r) > 0.3:
                effect = "helps" if r < 0 else "hurts"
                insights.append({
                    "type": "rest_days",
                    "title": f"More rest {effect} performance",
                    "description": f"Taking more rest days correlates with {'faster' if r < 0 else 'slower'} pace the next week.",
                    "correlation": round(r, 2),
                    "data_points": len(valid),
                })

    # 4. Consistency vs pace trend
    if len(week_data) > 2:
        xs = [week_data[i]["consistency"] for i in range(len(week_data) - 1)]
        ys = [week_data[i + 1]["avg_pace"] for i in range(len(week_data) - 1)]
        valid = [(x, y) for x, y in zip(xs, ys) if y > 0]
        if len(valid) >= 6:
            r = _pearson_r([v[0] for v in valid], [v[1] for v in valid])
            if r is not None and abs(r) > 0.3:
                effect = "improves" if r < 0 else "hurts"
                insights.append({
                    "type": "consistency",
                    "title": f"Consistency {effect} pace",
                    "description": f"Training more consistently (more active days per week) correlates with {'faster' if r < 0 else 'slower'} paces.",
                    "correlation": round(r, 2),
                    "data_points": len(valid),
                })

    return {
        "insights": insights,
        "weeks_analyzed": len(week_data),
        "insufficient_data": False,
    }
