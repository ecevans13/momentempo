"""Tests for Apple HealthKit import endpoints."""

import io
import time
import zipfile

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.app.models import HealthMetric


def _make_health_export_zip(records_xml: str) -> bytes:
    """Create a ZIP file containing export.xml with the given records."""
    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<HealthData>
{records_xml}
</HealthData>"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("apple_health_export/export.xml", xml_content)
    return buf.getvalue()


def test_health_import_requires_zip(client: TestClient):
    response = client.post(
        "/api/health/import",
        files={"file": ("data.txt", b"not a zip", "text/plain")},
    )
    assert response.status_code == 400


def test_health_import_requires_export_xml(client: TestClient):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("other.txt", "no export.xml here")
    response = client.post(
        "/api/health/import",
        files={"file": ("export.zip", buf.getvalue(), "application/zip")},
    )
    assert response.status_code == 400
    assert "No export.xml" in response.json()["detail"]


def test_health_import_parses_records(client: TestClient, session: Session):
    records = """
    <Record type="HKQuantityTypeIdentifierBodyMass" value="75.5"
            startDate="2026-01-15 08:00:00 -0500" sourceName="Apple Watch" />
    <Record type="HKQuantityTypeIdentifierRestingHeartRate" value="52"
            startDate="2026-01-15 08:00:00 -0500" sourceName="Apple Watch" />
    <Record type="HKQuantityTypeIdentifierVO2Max" value="48.3"
            startDate="2026-01-15 08:00:00 -0500" sourceName="Apple Watch" />
    """
    zip_data = _make_health_export_zip(records)

    response = client.post(
        "/api/health/import",
        files={"file": ("export.zip", zip_data, "application/zip")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["records_imported"] == 3
    assert "BodyMass" in data["metric_types_found"]
    assert "RestingHeartRate" in data["metric_types_found"]
    assert "VO2Max" in data["metric_types_found"]


def test_health_import_deduplicates(client: TestClient, session: Session):
    records = """
    <Record type="HKQuantityTypeIdentifierBodyMass" value="75.5"
            startDate="2026-01-15 08:00:00 -0500" sourceName="Apple Watch" />
    """
    zip_data = _make_health_export_zip(records)

    # Import twice
    client.post("/api/health/import", files={"file": ("export.zip", zip_data, "application/zip")})
    client.post("/api/health/import", files={"file": ("export.zip", zip_data, "application/zip")})

    # Should still be just 1 record
    metrics = session.exec(
        __import__("sqlmodel").select(HealthMetric)
    ).all()
    body_mass = [m for m in metrics if m.metric_type == "BodyMass"]
    assert len(body_mass) == 1


def test_health_import_body_fat_conversion(client: TestClient, session: Session):
    """Body fat percentage stored as 0-1 should be converted to 0-100."""
    records = """
    <Record type="HKQuantityTypeIdentifierBodyFatPercentage" value="0.185"
            startDate="2026-01-15 08:00:00 -0500" sourceName="Scale" />
    """
    zip_data = _make_health_export_zip(records)
    client.post("/api/health/import", files={"file": ("export.zip", zip_data, "application/zip")})

    metric = session.exec(
        __import__("sqlmodel").select(HealthMetric).where(HealthMetric.metric_type == "BodyFatPercentage")
    ).first()
    assert metric is not None
    assert 18 <= metric.value <= 19  # 0.185 * 100 = 18.5


def test_health_summary_empty(client: TestClient):
    response = client.get("/api/health/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["has_data"] is False


def test_health_summary_with_data(client: TestClient, session: Session):
    for i in range(10):
        session.add(HealthMetric(
            metric_type="BodyMass",
            value=75.0 - i * 0.1,
            unit="kg",
            date=f"2026-01-{15 - i:02d}",
            source="Scale",
        ))
    session.commit()

    response = client.get("/api/health/summary")
    data = response.json()
    assert data["has_data"] is True
    assert len(data["metrics"]) == 1
    assert data["metrics"][0]["metric_type"] == "BodyMass"
    assert data["metrics"][0]["latest_value"] == 75.0
