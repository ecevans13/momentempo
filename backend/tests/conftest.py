import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from backend.app.config import Settings, get_settings
from backend.app.main import app


def get_test_settings() -> Settings:
    """Return test settings with dummy Strava credentials."""
    return Settings(
        strava_client_id=12345,
        strava_client_secret="test_secret",
        strava_redirect_uri="http://localhost:8000/auth/callback",
        database_url="sqlite:///:memory:",
    )


@pytest.fixture(name="session")
def session_fixture():
    """Provide an in-memory SQLite session with all tables created."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(name="client")
def client_fixture(session: Session):
    """Provide a TestClient with dependency overrides for session and settings."""

    def override_get_session():
        yield session

    def override_get_settings():
        return get_test_settings()

    app.dependency_overrides[get_settings] = override_get_settings

    with TestClient(app) as client:
        # Store session on app state for use in routes that access app.state.engine
        app.state.engine = session.get_bind()
        yield client

    # Clean up overrides after each test
    app.dependency_overrides.clear()
