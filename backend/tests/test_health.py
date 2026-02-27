"""Tests for the /api/health endpoint."""
import time

from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.app.models import Token


def test_health_no_token(client: TestClient):
    """Health endpoint with empty DB returns not_authenticated."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data == {
        "status": "ok",
        "auth_status": "not_authenticated",
        "version": "0.1.0",
    }


def test_health_with_valid_token(client: TestClient, session: Session):
    """Health endpoint with a non-expiring token returns authenticated."""
    token = Token(
        id=1,
        access_token="valid_access",
        refresh_token="valid_refresh",
        expires_at=int(time.time()) + 86400 * 30,  # 30 days from now
    )
    session.add(token)
    session.commit()

    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["auth_status"] == "authenticated"
    assert data["version"] == "0.1.0"


def test_health_with_expired_token(client: TestClient, session: Session):
    """Health endpoint with an expired token returns token_expired."""
    token = Token(
        id=1,
        access_token="expired_access",
        refresh_token="expired_refresh",
        expires_at=int(time.time()) - 3600,  # 1 hour ago
    )
    session.add(token)
    session.commit()

    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["auth_status"] == "token_expired"
    assert data["version"] == "0.1.0"
