from sqlmodel import Field, SQLModel


class Token(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    access_token: str
    refresh_token: str
    expires_at: int  # Unix epoch timestamp from Strava
    token_type: str = "Bearer"
    scope: str = ""
    athlete_id: int | None = None
    athlete_name: str | None = None
    athlete_avatar_url: str | None = None
