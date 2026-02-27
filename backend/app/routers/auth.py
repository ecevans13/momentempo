import logging

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlmodel import Session, select

from ..config import Settings, get_settings
from ..models import Token
from ..services.strava_auth import build_auth_url, exchange_code_for_tokens

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def get_db_session(request: Request):
    """Dependency that obtains a DB session from the engine stored on app.state."""
    engine = request.app.state.engine
    with Session(engine) as session:
        yield session


def render_success_page(athlete: dict) -> str:
    """Return a polished dark-themed success HTML page showing athlete info."""
    avatar_url = athlete.get("profile", "")
    firstname = athlete.get("firstname", "")
    lastname = athlete.get("lastname", "")
    athlete_name = f"{firstname} {lastname}".strip() or "Athlete"

    if avatar_url:
        avatar_html = (
            f'<img src="{avatar_url}" alt="Avatar" '
            'style="width:80px;height:80px;border-radius:50%;object-fit:cover;'
            'border:3px solid #fc4c02;" />'
        )
    else:
        initials = "".join(
            part[0].upper() for part in [firstname, lastname] if part
        )[:2] or "?"
        avatar_html = (
            f'<div style="width:80px;height:80px;border-radius:50%;background:#fc4c02;'
            f'display:flex;align-items:center;justify-content:center;'
            f'font-size:2rem;font-weight:bold;color:#fff;">{initials}</div>'
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>StravaViz — Connected</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: #1a1a2e;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }}
    .card {{
      background: #16213e;
      border-radius: 16px;
      padding: 48px 40px;
      text-align: center;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }}
    .check {{
      font-size: 3rem;
      margin-bottom: 16px;
    }}
    .avatar-wrap {{
      margin: 0 auto 20px;
      width: 80px;
      height: 80px;
    }}
    h1 {{
      font-size: 1.4rem;
      font-weight: 600;
      margin-bottom: 8px;
      color: #fff;
    }}
    .subtitle {{
      font-size: 0.95rem;
      color: #a0a0b8;
      margin-bottom: 24px;
    }}
    .close-hint {{
      font-size: 0.8rem;
      color: #606080;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="check">&#10003;</div>
    <div class="avatar-wrap">{avatar_html}</div>
    <h1>Connected as {athlete_name}</h1>
    <p class="subtitle">StravaViz is now connected to your Strava account.</p>
    <p class="close-hint">You can close this tab.</p>
  </div>
</body>
</html>"""


def render_error_page(error_message: str) -> str:
    """Return a polished dark-themed error HTML page with a Try Again link."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>StravaViz — Authorization Error</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: #1a1a2e;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }}
    .card {{
      background: #16213e;
      border-radius: 16px;
      padding: 48px 40px;
      text-align: center;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }}
    .icon {{
      font-size: 3rem;
      margin-bottom: 16px;
    }}
    h1 {{
      font-size: 1.4rem;
      font-weight: 600;
      margin-bottom: 12px;
      color: #fff;
    }}
    .message {{
      font-size: 0.95rem;
      color: #a0a0b8;
      margin-bottom: 28px;
      word-break: break-word;
    }}
    .btn {{
      display: inline-block;
      background: #fc4c02;
      color: #fff;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.95rem;
      transition: background 0.2s;
    }}
    .btn:hover {{ background: #e04400; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#9888;</div>
    <h1>Authorization Failed</h1>
    <p class="message">{error_message}</p>
    <a href="/auth/login" class="btn">Try Again</a>
  </div>
</body>
</html>"""


@router.get("/login")
async def login(settings: Settings = Depends(get_settings)):
    """Redirect to Strava OAuth consent page."""
    auth_url = build_auth_url(settings)
    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def callback(
    request: Request,
    code: str | None = None,
    error: str | None = None,
    scope: str | None = None,
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
):
    """Handle OAuth redirect from Strava after user authorizes (or denies)."""
    # --- Error or no code ---
    if error or not code:
        message = error or "Authorization was denied"
        return HTMLResponse(content=render_error_page(message), status_code=400)

    # --- Scope verification ---
    granted_scopes = set(scope.split(",")) if scope else set()
    if "activity:read_all" not in granted_scopes:
        missing = "activity:read_all"
        scope_html = render_error_page(
            f"Required scope '{missing}' was not granted. "
            "Please reconnect and allow all requested permissions."
        )
        # Replace the "Try Again" button text to say "Connect Again"
        scope_html = scope_html.replace(">Try Again<", ">Connect Again<")
        return HTMLResponse(content=scope_html, status_code=403)

    # --- Token exchange ---
    try:
        token_data = await exchange_code_for_tokens(code, settings)
    except httpx.HTTPError as exc:
        logger.error("Token exchange failed: %s", exc)
        return HTMLResponse(
            content=render_error_page(f"Token exchange failed: {exc}"),
            status_code=400,
        )

    # --- Persist token (upsert on singleton id=1) ---
    athlete = token_data.get("athlete", {})
    athlete_name = (
        f"{athlete.get('firstname', '')} {athlete.get('lastname', '')}".strip()
    )

    existing_token = session.exec(select(Token).where(Token.id == 1)).first()
    if existing_token:
        existing_token.access_token = token_data["access_token"]
        existing_token.refresh_token = token_data["refresh_token"]
        existing_token.expires_at = token_data["expires_at"]
        existing_token.scope = scope or ""
        existing_token.athlete_id = athlete.get("id")
        existing_token.athlete_name = athlete_name or None
        existing_token.athlete_avatar_url = athlete.get("profile")
        session.add(existing_token)
    else:
        new_token = Token(
            id=1,
            access_token=token_data["access_token"],
            refresh_token=token_data["refresh_token"],
            expires_at=token_data["expires_at"],
            scope=scope or "",
            athlete_id=athlete.get("id"),
            athlete_name=athlete_name or None,
            athlete_avatar_url=athlete.get("profile"),
        )
        session.add(new_token)

    session.commit()

    return HTMLResponse(content=render_success_page(athlete), status_code=200)
