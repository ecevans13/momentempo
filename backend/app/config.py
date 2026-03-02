from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env from the project root (parent of backend/)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    environment: str = "development"
    strava_client_id: int
    strava_client_secret: str
    strava_redirect_uri: str = "http://localhost:8000/auth/callback"
    database_url: str = "sqlite:///backend/data/stravviz.db"
    ssl_verify: bool = True
    anthropic_api_key: str | None = None

    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
