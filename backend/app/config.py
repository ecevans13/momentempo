from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    strava_client_id: int
    strava_client_secret: str
    strava_redirect_uri: str = "http://localhost:8000/auth/callback"
    database_url: str = "sqlite:///backend/data/stravviz.db"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
