"""Activity detail endpoints: splits, HR zones via Strava API proxy."""

import logging

import httpx
from fastapi import APIRouter, HTTPException, Request
from sqlmodel import Session, select

from ..config import get_settings
from ..models import Token
from ..services.strava_auth import ensure_valid_token
from ..services.strava_client import RateLimitState, strava_get

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/activity", tags=["activity-detail"])

RUN_SPORT_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill"}


def _get_session(request: Request) -> Session:
    return Session(request.app.state.engine)


async def _get_valid_token(session: Session) -> Token:
    """Get a valid access token or raise 401."""
    settings = get_settings()
    token = await ensure_valid_token(session, settings)
    if token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


@router.get("/{activity_id}")
async def get_activity_detail(request: Request, activity_id: int):
    """Fetch detailed activity from Strava including splits."""
    with _get_session(request) as session:
        token = await _get_valid_token(session)

        async with httpx.AsyncClient(verify=get_settings().ssl_verify) as client:
            response, _ = await strava_get(
                client,
                f"/activities/{activity_id}",
                token.access_token,
            )

        if response.status_code == 404:
            raise HTTPException(status_code=404, detail="Activity not found")
        response.raise_for_status()

        data = response.json()

        # Build splits response — prefer metric, fall back to standard
        splits_metric = data.get("splits_metric", [])
        splits_standard = data.get("splits_standard", [])

        splits = [
            {
                "split": s.get("split", i + 1),
                "distance": s.get("distance", 0),
                "moving_time": s.get("moving_time", 0),
                "elapsed_time": s.get("elapsed_time", 0),
                "elevation_difference": s.get("elevation_difference", 0),
                "average_speed": s.get("average_speed", 0),
                "average_heartrate": s.get("average_heartrate"),
                "pace_zone": s.get("pace_zone"),
            }
            for i, s in enumerate(splits_metric)
        ]

        splits_mi = [
            {
                "split": s.get("split", i + 1),
                "distance": s.get("distance", 0),
                "moving_time": s.get("moving_time", 0),
                "elapsed_time": s.get("elapsed_time", 0),
                "elevation_difference": s.get("elevation_difference", 0),
                "average_speed": s.get("average_speed", 0),
                "average_heartrate": s.get("average_heartrate"),
                "pace_zone": s.get("pace_zone"),
            }
            for i, s in enumerate(splits_standard)
        ]

        # Laps data
        laps = [
            {
                "name": lap.get("name", f"Lap {i + 1}"),
                "distance": lap.get("distance", 0),
                "moving_time": lap.get("moving_time", 0),
                "elapsed_time": lap.get("elapsed_time", 0),
                "average_speed": lap.get("average_speed", 0),
                "max_speed": lap.get("max_speed", 0),
                "average_heartrate": lap.get("average_heartrate"),
                "max_heartrate": lap.get("max_heartrate"),
                "total_elevation_gain": lap.get("total_elevation_gain", 0),
            }
            for i, lap in enumerate(data.get("laps", []))
        ]

        return {
            "id": data["id"],
            "name": data.get("name", ""),
            "sport_type": data.get("sport_type", data.get("type", "")),
            "start_date": data.get("start_date", ""),
            "start_date_local": data.get("start_date_local", ""),
            "distance": data.get("distance", 0),
            "moving_time": data.get("moving_time", 0),
            "elapsed_time": data.get("elapsed_time", 0),
            "total_elevation_gain": data.get("total_elevation_gain", 0),
            "average_speed": data.get("average_speed", 0),
            "max_speed": data.get("max_speed", 0),
            "has_heartrate": data.get("has_heartrate", False),
            "average_heartrate": data.get("average_heartrate"),
            "max_heartrate": data.get("max_heartrate"),
            "calories": data.get("calories", 0),
            "description": data.get("description", ""),
            "gear_id": data.get("gear_id"),
            "device_name": data.get("device_name"),
            "summary_polyline": (data.get("map") or {}).get("summary_polyline"),
            "splits_km": splits,
            "splits_mi": splits_mi,
            "laps": laps,
        }


@router.get("/{activity_id}/zones")
async def get_activity_zones(request: Request, activity_id: int):
    """Fetch HR zone breakdown for an activity from Strava."""
    with _get_session(request) as session:
        token = await _get_valid_token(session)

        async with httpx.AsyncClient(verify=get_settings().ssl_verify) as client:
            response, _ = await strava_get(
                client,
                f"/activities/{activity_id}/zones",
                token.access_token,
            )

        if response.status_code == 404:
            raise HTTPException(status_code=404, detail="Activity not found")
        response.raise_for_status()

        zones_data = response.json()

        # Find heartrate zone data
        hr_zones = None
        for zone_set in zones_data:
            if zone_set.get("type") == "heartrate":
                hr_zones = zone_set
                break

        if hr_zones is None:
            return {"has_zones": False, "zones": []}

        buckets = hr_zones.get("distribution_buckets", [])
        zone_labels = ["Zone 1", "Zone 2", "Zone 3", "Zone 4", "Zone 5"]

        zones = [
            {
                "zone": zone_labels[i] if i < len(zone_labels) else f"Zone {i + 1}",
                "min_hr": b.get("min", 0),
                "max_hr": b.get("max", 0),
                "time_seconds": b.get("time", 0),
            }
            for i, b in enumerate(buckets)
        ]

        total_time = sum(z["time_seconds"] for z in zones)

        return {
            "has_zones": True,
            "sensor_based": hr_zones.get("sensor_based", False),
            "total_time_seconds": total_time,
            "zones": zones,
        }
