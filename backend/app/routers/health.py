from fastapi import APIRouter, Request
from sqlmodel import Session, select

from ..models import Token
from ..services.strava_auth import token_needs_refresh

router = APIRouter(prefix="/api", tags=["system"])


def get_db_session(request: Request):
    """Dependency that obtains a DB session from the engine stored on app.state."""
    engine = request.app.state.engine
    with Session(engine) as session:
        yield session


@router.get("/health")
def health(request: Request):
    """Return server health and auth status."""
    engine = request.app.state.engine
    with Session(engine) as session:
        token = session.exec(select(Token).where(Token.id == 1)).first()

    if token is None:
        auth_status = "not_authenticated"
    elif token_needs_refresh(token.expires_at):
        auth_status = "token_expired"
    else:
        auth_status = "authenticated"

    return {
        "status": "ok",
        "auth_status": auth_status,
        "version": "0.1.0",
    }
