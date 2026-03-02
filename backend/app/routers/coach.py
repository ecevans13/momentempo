"""AI Training Coach: personalized advice using Claude API."""

import logging
import time as _time

import anthropic
from fastapi import APIRouter, HTTPException, Request
from sqlmodel import Session, col, func, select

from ..config import get_settings
from ..models import Activity, HealthMetric

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/coach", tags=["coach"])

RUN_SPORT_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill"}

# Simple in-memory cache with TTL
_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL = 3600  # 1 hour


def _get_session(request: Request) -> Session:
    return Session(request.app.state.engine)


def _build_training_summary(session: Session) -> str:
    """Build a training context string from recent activity data."""
    cutoff_8w = int(_time.time() - 8 * 7 * 86400)

    activities = session.exec(
        select(Activity)
        .where(col(Activity.start_date_epoch) >= cutoff_8w)
        .order_by(col(Activity.start_date_epoch).asc())
    ).all()

    if not activities:
        return "No recent training data available."

    # Weekly aggregates
    from datetime import datetime, timezone
    weeks: dict[str, dict] = {}
    for a in activities:
        dt = datetime.fromtimestamp(a.start_date_epoch, tz=timezone.utc)
        wk = dt.strftime("%G-W%V")
        if wk not in weeks:
            weeks[wk] = {"runs": 0, "other": 0, "run_dist": 0, "run_time": 0,
                         "total_dist": 0, "total_time": 0, "hr_sum": 0, "hr_count": 0}
        w = weeks[wk]
        w["total_dist"] += a.distance
        w["total_time"] += a.moving_time
        if a.sport_type in RUN_SPORT_TYPES:
            w["runs"] += 1
            w["run_dist"] += a.distance
            w["run_time"] += a.moving_time
        else:
            w["other"] += 1
        if a.has_heartrate and a.average_heartrate:
            w["hr_sum"] += a.average_heartrate
            w["hr_count"] += 1

    lines = ["## Recent Training (last 8 weeks)"]
    for wk in sorted(weeks.keys()):
        w = weeks[wk]
        avg_hr = round(w["hr_sum"] / w["hr_count"]) if w["hr_count"] > 0 else None
        pace = round(w["run_time"] / w["run_dist"] * 1000, 1) if w["run_dist"] > 0 else None
        lines.append(
            f"- {wk}: {w['runs']} runs ({w['run_dist']/1000:.1f}km), "
            f"{w['other']} other, "
            f"avg pace {pace}s/km, avg HR {avg_hr}"
        )

    # CTL/ATL/TSB current values
    hr_activities = [a for a in activities if a.has_heartrate and a.average_heartrate]
    if hr_activities:
        max_hr = max(a.max_heartrate or a.average_heartrate or 0 for a in hr_activities)
        lthr = int(max_hr * 0.85) if max_hr > 0 else 160
        from collections import defaultdict
        from datetime import timedelta
        daily_tss: dict[str, float] = defaultdict(float)
        for a in hr_activities:
            ds = a.start_date_local[:10] if a.start_date_local else a.start_date[:10]
            avg_hr = a.average_heartrate or 0
            if avg_hr > 0 and lthr > 0:
                iff = avg_hr / lthr
                daily_tss[ds] += (a.moving_time * avg_hr * iff) / (lthr * 3600) * 100

        if daily_tss:
            sorted_dates = sorted(daily_tss.keys())
            start = datetime.strptime(sorted_dates[0], "%Y-%m-%d").date()
            end = datetime.strptime(sorted_dates[-1], "%Y-%m-%d").date()
            ctl = atl = 0.0
            current = start
            while current <= end:
                tss = daily_tss.get(current.strftime("%Y-%m-%d"), 0.0)
                ctl += (tss - ctl) / 42.0
                atl += (tss - atl) / 7.0
                current += timedelta(days=1)
            tsb = ctl - atl
            lines.append(f"\n## Current Fitness State")
            lines.append(f"- CTL (Fitness): {ctl:.1f}")
            lines.append(f"- ATL (Fatigue): {atl:.1f}")
            lines.append(f"- TSB (Form): {tsb:.1f}")

    # Health metrics if available
    try:
        health_types = session.exec(
            select(HealthMetric.metric_type).distinct()
        ).all()
        if health_types:
            lines.append(f"\n## Health Metrics")
            for mt in health_types:
                latest = session.exec(
                    select(HealthMetric)
                    .where(col(HealthMetric.metric_type) == mt)
                    .order_by(col(HealthMetric.date).desc())
                    .limit(1)
                ).first()
                if latest:
                    lines.append(f"- {mt}: {latest.value} {latest.unit} (as of {latest.date})")
    except Exception:
        pass  # HealthMetric table may not exist yet

    return "\n".join(lines)


@router.get("/advice")
def get_coaching_advice(request: Request):
    """Get personalized training advice from Claude AI."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="AI coach not configured. Set ANTHROPIC_API_KEY in your environment.",
        )

    # Check cache
    cache_key = "coach_advice"
    if cache_key in _cache:
        cached, cached_at = _cache[cache_key]
        if _time.time() - cached_at < _CACHE_TTL:
            return cached

    with _get_session(request) as session:
        training_summary = _build_training_summary(session)
        weeks_count = training_summary.count("- 20")  # rough count of week lines

    system_prompt = """You are a knowledgeable running coach and general fitness advisor. \
Your athlete is focused on running (primarily) and strength training. \
Their race targets are: sub-23 minute 5K, sub-1:00 10K, sub-2:00 half marathon. \
They want to get faster and more efficient at running while improving overall health.

Analyze the training data provided and give actionable, personalized advice. Consider:
- Training load progression and recovery
- HR zone distribution and efficiency
- Strength training's impact on running performance
- Body composition trends if health data is available
- Injury prevention and recovery balance

Be specific and reference their actual data. Keep advice concise (3-5 key points). \
Be encouraging but honest about areas for improvement."""

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=system_prompt,
            messages=[
                {"role": "user", "content": f"Here is my recent training data:\n\n{training_summary}\n\nPlease analyze and give me coaching advice."}
            ],
        )
        advice_text = message.content[0].text
    except anthropic.APIError as e:
        logger.error("Claude API error: %s", e)
        raise HTTPException(status_code=502, detail="AI coach temporarily unavailable.")
    except Exception as e:
        logger.error("Coach error: %s", e)
        raise HTTPException(status_code=502, detail="AI coach temporarily unavailable.")

    result = {
        "advice": advice_text,
        "generated_at": _time.time(),
        "weeks_analyzed": weeks_count,
    }
    _cache[cache_key] = (result, _time.time())
    return result
