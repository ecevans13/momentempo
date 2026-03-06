"""Insights endpoints: training heatmap, race predictions, what's working, fitness model, weekly report."""

import logging
import math
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query, Request
from sqlmodel import Session, col, func, select

from ..models import Activity, BestEffort

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/insights", tags=["insights"])

RUN_SPORT_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill"}

# Standard race distances for predictions (meters)
PREDICTION_DISTANCES = [
    {"name": "5K", "meters": 5000},
    {"name": "10K", "meters": 10000},
    {"name": "Half Marathon", "meters": 21097},
    {"name": "Marathon", "meters": 42195},
]

# Anchor distances: Strava best_efforts names + fallback tolerance ranges
ANCHOR_DISTANCES = [
    {"name": "1 Mile", "target": 1609, "min": 1500, "max": 1800, "strava_names": ["1 mile"]},
    {"name": "5K", "target": 5000, "min": 4800, "max": 5500, "strava_names": ["5k"]},
    {"name": "10K", "target": 10000, "min": 9500, "max": 11000, "strava_names": ["10k"]},
    {"name": "Half Marathon", "target": 21097, "min": 20500, "max": 22000, "strava_names": ["half-marathon", "half marathon"]},
    {"name": "Marathon", "target": 42195, "min": 41500, "max": 43000, "strava_names": ["marathon"]},
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
            select(
                Activity.start_date_local,
                Activity.start_date,
                Activity.moving_time,
                Activity.has_heartrate,
                Activity.average_heartrate,
            )
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
        has_best_efforts = session.exec(
            select(func.count(BestEffort.id)).where(BestEffort.id.isnot(None))  # type: ignore[union-attr]
        ).one() > 0

        anchor_efforts = []
        for dist in ANCHOR_DISTANCES:
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
                    anchor_efforts.append({
                        "distance_name": dist["name"],
                        "distance_m": dist["target"],
                        "time_seconds": effort.moving_time,
                        "activity_id": effort.activity_id,
                        "activity_name": effort.activity_name,
                        "start_date": effort.start_date,
                    })
            else:
                # Fallback: match by total activity distance
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
    """Correlation analysis of training patterns vs performance over recent weeks."""
    cutoff = int(time.time() - 8 * 7 * 86400)  # ~8 weeks for more responsive insights

    with _get_session(request) as session:
        stmt = (
            select(
                Activity.start_date_epoch,
                Activity.distance,
                Activity.moving_time,
                Activity.sport_type,
                Activity.has_heartrate,
                Activity.average_heartrate,
            )
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


@router.get("/fitness")
def fitness_model(
    request: Request,
    months: int = Query(6, ge=1, le=24),
    lthr: int | None = Query(None, ge=100, le=220),
):
    """Fatigue & Freshness model: hrTSS, CTL (42d EMA), ATL (7d EMA), TSB."""
    cutoff = int(time.time() - months * 30 * 86400)

    with _get_session(request) as session:
        stmt = (
            select(
                Activity.start_date_local,
                Activity.start_date,
                Activity.moving_time,
                Activity.average_heartrate,
                Activity.max_heartrate,
            )
            .where(col(Activity.has_heartrate) == True)  # noqa: E712
            .where(col(Activity.average_heartrate).isnot(None))
            .where(col(Activity.start_date_epoch) >= cutoff)
            .order_by(col(Activity.start_date_epoch).asc())
        )
        activities = session.exec(stmt).all()

    if not activities:
        return {"lthr_used": None, "lthr_source": None, "data": []}

    # Determine LTHR
    max_hr = max(a.max_heartrate or a.average_heartrate or 0 for a in activities)
    if lthr:
        lthr_used = lthr
        lthr_source = "user"
    else:
        lthr_used = int(max_hr * 0.85) if max_hr > 0 else 160
        lthr_source = "auto"

    # Compute daily TSS from hrTSS formula
    daily_tss: dict[str, float] = defaultdict(float)
    for a in activities:
        date_str = a.start_date_local[:10] if a.start_date_local else a.start_date[:10]
        avg_hr = a.average_heartrate or 0
        if avg_hr <= 0 or lthr_used <= 0:
            continue
        intensity_factor = avg_hr / lthr_used
        hr_tss = (a.moving_time * avg_hr * intensity_factor) / (lthr_used * 3600) * 100
        daily_tss[date_str] += hr_tss

    if not daily_tss:
        return {"lthr_used": lthr_used, "lthr_source": lthr_source, "data": []}

    # Fill in date range (including zero days) for proper EMA
    sorted_dates = sorted(daily_tss.keys())
    start_date = datetime.strptime(sorted_dates[0], "%Y-%m-%d").date()
    end_date = datetime.strptime(sorted_dates[-1], "%Y-%m-%d").date()

    data = []
    ctl = 0.0
    atl = 0.0
    current = start_date
    while current <= end_date:
        ds = current.strftime("%Y-%m-%d")
        tss = daily_tss.get(ds, 0.0)
        # Exponential moving averages
        ctl = ctl + (tss - ctl) / 42.0
        atl = atl + (tss - atl) / 7.0
        tsb = ctl - atl
        data.append({
            "date": ds,
            "tss": round(tss, 1),
            "ctl": round(ctl, 1),
            "atl": round(atl, 1),
            "tsb": round(tsb, 1),
        })
        current += timedelta(days=1)

    return {
        "lthr_used": lthr_used,
        "lthr_source": lthr_source,
        "data": data,
    }


@router.get("/weekly-report")
def weekly_report(request: Request):
    """Weekly training report: this week vs last week comparison."""
    now = datetime.now(timezone.utc)
    # Start of this week (Monday)
    this_monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    last_monday = this_monday - timedelta(days=7)
    this_monday_epoch = int(this_monday.timestamp())
    last_monday_epoch = int(last_monday.timestamp())

    with _get_session(request) as session:
        stmt = (
            select(
                Activity.start_date_epoch,
                Activity.sport_type,
                Activity.distance,
                Activity.moving_time,
                Activity.has_heartrate,
                Activity.average_heartrate,
            )
            .where(col(Activity.start_date_epoch) >= last_monday_epoch)
            .order_by(col(Activity.start_date_epoch).asc())
        )
        activities = session.exec(stmt).all()

        # Get max HR for zone computation
        max_hr_result = session.exec(
            select(func.max(Activity.max_heartrate)).where(
                col(Activity.has_heartrate) == True  # noqa: E712
            )
        ).one()
        max_hr = max_hr_result or 190

    this_week = [a for a in activities if a.start_date_epoch >= this_monday_epoch]
    last_week = [
        a for a in activities
        if last_monday_epoch <= a.start_date_epoch < this_monday_epoch
    ]

    def _compute_stats(acts: list[Activity]) -> dict:
        runs = [a for a in acts if a.sport_type in RUN_SPORT_TYPES]
        total_dist = sum(a.distance for a in acts)
        total_time = sum(a.moving_time for a in acts)
        run_dist = sum(a.distance for a in runs)
        run_time = sum(a.moving_time for a in runs)
        longest_run = max((a.distance for a in runs), default=0)
        avg_pace = (run_time / run_dist * 1000) if run_dist > 0 else None
        return {
            "total_distance": round(total_dist),
            "total_duration": total_time,
            "run_count": len(runs),
            "activity_count": len(acts),
            "longest_run": round(longest_run),
            "avg_pace": round(avg_pace, 1) if avg_pace else None,
        }

    tw_stats = _compute_stats(this_week)
    lw_stats = _compute_stats(last_week)

    # Comparison (% change)
    vs_last_week = {}
    for key in ["total_distance", "total_duration", "run_count", "longest_run"]:
        lw_val = lw_stats[key]
        tw_val = tw_stats[key]
        if lw_val > 0:
            vs_last_week[key] = round((tw_val - lw_val) / lw_val * 100, 1)
        elif tw_val > 0:
            vs_last_week[key] = 100.0
        else:
            vs_last_week[key] = 0.0

    # Zone distribution from this week's HR data
    zones = {"Z1": 0, "Z2": 0, "Z3": 0, "Z4": 0, "Z5": 0}
    hr_activities = [a for a in this_week if a.has_heartrate and a.average_heartrate]
    for a in hr_activities:
        pct = (a.average_heartrate / max_hr) * 100
        if pct < 60:
            zones["Z1"] += a.moving_time
        elif pct < 70:
            zones["Z2"] += a.moving_time
        elif pct < 80:
            zones["Z3"] += a.moving_time
        elif pct < 90:
            zones["Z4"] += a.moving_time
        else:
            zones["Z5"] += a.moving_time

    total_zone_time = sum(zones.values())
    zone_pcts = {
        k: round(v / total_zone_time * 100, 1) if total_zone_time > 0 else 0
        for k, v in zones.items()
    }

    # Template summary
    has_data = tw_stats["activity_count"] > 0
    if has_data:
        dist_km = tw_stats["total_distance"] / 1000
        summary = f"This week you logged {tw_stats['activity_count']} activities covering {dist_km:.1f} km"
        if tw_stats["run_count"] > 0:
            summary += f" with {tw_stats['run_count']} runs"
        summary += "."
        if vs_last_week.get("total_distance", 0) > 0:
            summary += f" That's {vs_last_week['total_distance']:.0f}% more distance than last week."
        elif vs_last_week.get("total_distance", 0) < 0:
            summary += f" That's {abs(vs_last_week['total_distance']):.0f}% less distance than last week."
    else:
        summary = "No activities recorded this week yet. Get out there!"

    return {
        "summary_text": summary,
        "stats": tw_stats,
        "vs_last_week": vs_last_week,
        "zone_distribution": zone_pcts,
        "has_data": has_data,
    }
