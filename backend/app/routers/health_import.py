"""Apple HealthKit import: upload export.zip, parse export.xml, upsert HealthMetric rows."""

import logging
import tempfile
import zipfile
from xml.etree.ElementTree import iterparse

from fastapi import APIRouter, HTTPException, Request, UploadFile
from sqlmodel import Session, col, func, select

from ..models import HealthMetric

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/health", tags=["health-import"])

# HealthKit record types we care about
METRIC_MAP = {
    "HKQuantityTypeIdentifierBodyMass": ("BodyMass", "kg"),
    "HKQuantityTypeIdentifierBodyFatPercentage": ("BodyFatPercentage", "%"),
    "HKQuantityTypeIdentifierRestingHeartRate": ("RestingHeartRate", "bpm"),
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN": ("HRV", "ms"),
    "HKQuantityTypeIdentifierVO2Max": ("VO2Max", "mL/kg/min"),
    "HKQuantityTypeIdentifierActiveEnergyBurned": ("ActiveEnergyBurned", "kcal"),
    "HKQuantityTypeIdentifierDietaryEnergyConsumed": ("DietaryEnergyConsumed", "kcal"),
    "HKQuantityTypeIdentifierDietaryProtein": ("DietaryProtein", "g"),
}

# Metrics where multiple records per day should be summed (not overwritten)
_SUMMED_METRICS = {"ActiveEnergyBurned", "DietaryEnergyConsumed", "DietaryProtein"}

# Unit conversions (Apple Health may export in lb, °F, etc.)
_LB_TO_KG = 0.453592


def _get_session(request: Request) -> Session:
    return Session(request.app.state.engine)


@router.post("/import")
async def import_health_data(request: Request, file: UploadFile):
    """Import Apple Health export ZIP. Expects a ZIP containing export.xml."""
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Please upload a .zip file")

    records_imported = 0
    metric_types_found: set[str] = set()

    with tempfile.NamedTemporaryFile(suffix=".zip") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp.flush()

        try:
            zf = zipfile.ZipFile(tmp.name)
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid ZIP file")

        # Find export.xml inside the zip
        xml_name = None
        for name in zf.namelist():
            if name.endswith("export.xml"):
                xml_name = name
                break

        if not xml_name:
            raise HTTPException(
                status_code=400, detail="No export.xml found in ZIP"
            )

        with _get_session(request) as session:
            batch: list[HealthMetric] = []

            with zf.open(xml_name) as xml_file:
                for event, elem in iterparse(xml_file, events=("end",)):
                    if elem.tag != "Record":
                        elem.clear()
                        continue

                    rec_type = elem.attrib.get("type", "")
                    if rec_type not in METRIC_MAP:
                        elem.clear()
                        continue

                    metric_name, unit = METRIC_MAP[rec_type]
                    try:
                        value = float(elem.attrib.get("value", "0"))
                    except (ValueError, TypeError):
                        elem.clear()
                        continue

                    # Date: "2024-01-15 08:30:00 -0500" -> "2024-01-15"
                    start_date = elem.attrib.get("startDate", "")[:10]
                    source = elem.attrib.get("sourceName", "")

                    if not start_date:
                        elem.clear()
                        continue

                    # Convert body fat from 0-1 to percentage
                    if metric_name == "BodyFatPercentage" and value < 1:
                        value = value * 100

                    # Handle lb -> kg conversion for body mass
                    rec_unit = elem.attrib.get("unit", "")
                    if metric_name == "BodyMass" and rec_unit == "lb":
                        value = value * _LB_TO_KG

                    batch.append(
                        HealthMetric(
                            metric_type=metric_name,
                            value=round(value, 2),
                            unit=unit,
                            date=start_date,
                            source=source,
                        )
                    )
                    metric_types_found.add(metric_name)

                    if len(batch) >= 500:
                        _upsert_batch(session, batch)
                        records_imported += len(batch)
                        batch = []

                    elem.clear()

            if batch:
                _upsert_batch(session, batch)
                records_imported += len(batch)

            session.commit()

    return {
        "status": "ok",
        "records_imported": records_imported,
        "metric_types_found": sorted(metric_types_found),
    }


def _upsert_batch(session: Session, batch: list[HealthMetric]) -> None:
    """Insert or update metrics, deduplicating by type+date.

    For summed metrics (calories, protein), accumulates the daily total.
    For point-in-time metrics (weight, HR), keeps the latest value.
    """
    for m in batch:
        existing = session.exec(
            select(HealthMetric)
            .where(col(HealthMetric.metric_type) == m.metric_type)
            .where(col(HealthMetric.date) == m.date)
        ).first()
        if existing:
            if m.metric_type in _SUMMED_METRICS:
                existing.value = round(existing.value + m.value, 2)
            else:
                existing.value = m.value
            existing.source = m.source
            session.add(existing)
        else:
            session.add(m)


@router.get("/summary")
def health_summary(request: Request):
    """Latest values + recent trends for each imported health metric type."""
    with _get_session(request) as session:
        # Get distinct metric types
        types = session.exec(
            select(HealthMetric.metric_type).distinct()
        ).all()

        if not types:
            return {"metrics": [], "has_data": False}

        metrics = []
        for mt in types:
            # Latest value
            latest = session.exec(
                select(HealthMetric)
                .where(col(HealthMetric.metric_type) == mt)
                .order_by(col(HealthMetric.date).desc())
                .limit(1)
            ).first()

            # 30-day trend (weekly averages)
            recent = session.exec(
                select(HealthMetric)
                .where(col(HealthMetric.metric_type) == mt)
                .order_by(col(HealthMetric.date).desc())
                .limit(30)
            ).all()

            trend = None
            if len(recent) >= 7:
                first_half = [r.value for r in recent[len(recent) // 2 :]]
                second_half = [r.value for r in recent[: len(recent) // 2]]
                avg_old = sum(first_half) / len(first_half)
                avg_new = sum(second_half) / len(second_half)
                if avg_old > 0:
                    trend = round((avg_new - avg_old) / avg_old * 100, 1)

            if latest:
                metrics.append({
                    "metric_type": mt,
                    "latest_value": latest.value,
                    "unit": latest.unit,
                    "latest_date": latest.date,
                    "trend_pct": trend,
                })

        return {"metrics": metrics, "has_data": True}
