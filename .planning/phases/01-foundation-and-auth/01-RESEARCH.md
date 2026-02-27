# Phase 1: Foundation and Auth - Research

**Researched:** 2026-02-27
**Domain:** FastAPI project scaffold + Strava OAuth 2.0 + SQLite token persistence
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**First-Run Experience**
- Auto-open the default browser to Strava's OAuth consent page when no tokens are stored
- OAuth redirect page shows the user's Strava name/avatar with a success confirmation message (not just a plain text success)
- On subsequent starts with valid tokens, auth is completely silent — no console messages, no status indicators, just works

**Project Structure**
- Monorepo layout: `/backend` and `/frontend` at the top level, shared config at root
- `.env.example` committed to repo with placeholder values documenting required variables

**Dev Workflow**
- Strava API credentials (client ID, client secret) managed via `.env` file at project root, gitignored
- pytest set up from the start with basic test structure — each phase adds tests for its features

**Auth Error Handling**
- OAuth failure (user denies consent, error during flow): show an error page in the browser with a clear message and a "Try again" link to restart the flow
- Strava API unreachable (network down, outage): graceful degradation — app still starts, shows cached data if available, auth-dependent features show a "Strava unavailable" message
- Auth errors logged to both console and a log file (e.g., `logs/stravviz.log`)

### Claude's Discretion

- Health check endpoint (`/api/health`) content — whether to include auth status or just server status
- Backend module organization — domain-based vs layer-based, whatever fits FastAPI conventions best
- SQLite database file location — project data directory vs user config directory
- Dev server approach — uvicorn with reload, Makefile, or whatever is simplest
- Database interaction layer — SQLAlchemy vs raw SQL, based on project complexity
- Token revocation handling — auto-restart OAuth vs show error with manual re-auth

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | App authenticates with Strava via OAuth and persists tokens to SQLite | Strava OAuth 2.0 authorization code flow documented; FastAPI callback route + SQLModel/SQLite persistence pattern identified |
| DATA-02 | App silently refreshes expired access tokens using stored refresh token | Strava token refresh endpoint documented (same POST /oauth/token, grant_type=refresh_token); tokens expire exactly 6 hours after issuance; refresh produces new refresh token that must be persisted |
</phase_requirements>

---

## Summary

Phase 1 establishes the complete FastAPI backend scaffold plus Strava OAuth 2.0 authorization code flow with SQLite token persistence. The technical domain is well-understood: FastAPI is stable, the Strava OAuth API is unchanged in 2025, and SQLite persistence with SQLModel is the officially recommended pattern for FastAPI SQL databases. Confidence in the full stack is HIGH.

The primary architectural insight is that this is a **single-user desktop-companion app** (v1), not a multi-user web service. That distinction matters: there is no session management, no user table, and no auth middleware protecting routes. There is exactly one token record. The OAuth flow is bootstrapped at startup by checking whether that record exists and is valid, then opening the browser if not. All subsequent API calls use the stored token, refreshing silently when it is within 3,600 seconds of expiry.

The one decision delegated to Claude's discretion with meaningful complexity is the database layer. For a single token record, raw `sqlite3` is technically sufficient, but **SQLModel** (FastAPI's officially endorsed ORM, built on SQLAlchemy + Pydantic) is strongly preferred: future phases add activity and gear tables, so establishing the ORM pattern now avoids a rewrite. The performance penalty over raw sqlite3 is irrelevant at this scale.

**Primary recommendation:** Use FastAPI + SQLModel + pydantic-settings + httpx. Implement the OAuth callback as a native FastAPI route. Use Python's `webbrowser` module to open the browser. Store credentials in a `data/` directory at the project root.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastapi | >=0.115 | ASGI web framework, OAuth callback route, health endpoint | Official FastAPI; modern lifespan API; excellent typing |
| uvicorn[standard] | >=0.30 | ASGI server with `--reload` for dev | Standard FastAPI dev server; `[standard]` includes watchfiles for reload |
| sqlmodel | >=0.0.21 | ORM over SQLAlchemy + Pydantic for SQLite token table | FastAPI official recommendation; same models for DB + API validation |
| pydantic-settings | >=2.0 | Load `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` from `.env` | FastAPI official recommendation; type-validated env config |
| httpx | >=0.27 | Async HTTP client for Strava token exchange and refresh | Modern replacement for requests; native async; used inside FastAPI |
| python-dotenv | >=1.0 | Load `.env` at process start (used by pydantic-settings) | pydantic-settings dependency; standard pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest | >=8.0 | Test framework | Phase sets up; each phase adds tests |
| pytest-asyncio | >=0.23 | Async test support | Required for async FastAPI endpoint tests |
| httpx (TestClient) | same as above | FastAPI test transport | httpx is already in stack; TestClient is based on it |
| respx | >=0.21 | Mock httpx calls in tests | Mock Strava token exchange in unit tests |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQLModel | Raw sqlite3 | sqlite3 is zero-dependency but blocks async event loop; no ORM means manual SQL for all future phases |
| SQLModel | SQLAlchemy directly | SQLAlchemy is SQLModel's engine; using SQLModel is strictly less code for the same result |
| httpx | requests | requests is sync-only; in an async FastAPI handler, a blocking requests call stalls the event loop |
| httpx | stravalib | stravalib is a higher-level client that abstracts Strava's API; useful for later phases but adds complexity in Phase 1 where only OAuth is needed |
| pydantic-settings | python-decouple / environs | pydantic-settings is the official FastAPI pattern; validates types at startup |

**Installation:**
```bash
# Backend dependencies
pip install fastapi uvicorn[standard] sqlmodel pydantic-settings httpx python-dotenv

# Dev/test dependencies
pip install pytest pytest-asyncio respx
```

---

## Architecture Patterns

### Recommended Project Structure

```
/                          # Monorepo root
├── .env                   # Gitignored — real credentials
├── .env.example           # Committed — placeholder values
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py        # FastAPI app, lifespan, router includes
│   │   ├── config.py      # pydantic-settings Settings class
│   │   ├── database.py    # SQLModel engine, session factory
│   │   ├── models.py      # SQLModel table models (Token)
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py    # /auth/login, /auth/callback, /auth/status
│   │   │   └── health.py  # /api/health
│   │   └── services/
│   │       ├── __init__.py
│   │       └── strava_auth.py  # Token exchange, refresh, persistence logic
│   ├── tests/
│   │   ├── conftest.py    # Shared fixtures: test app, test db, settings override
│   │   └── test_auth.py   # OAuth flow, token storage, refresh tests
│   ├── logs/              # Gitignored — runtime logs
│   ├── data/              # Gitignored — stravviz.db lives here
│   └── requirements.txt
└── frontend/              # Addressed in later phases
```

**Database file location decision:** Use `backend/data/stravviz.db`. This keeps it inside the backend working directory, close to the code, easy to gitignore, and does not pollute the system user config directory. Add `backend/data/` to `.gitignore`.

**Module organization decision:** Use domain-based (`auth`, `health`) — fits FastAPI's `APIRouter` model naturally. For a 6-phase project that grows a `sync`, `activities`, `gear`, and `trophies` domain, feature-based organization scales better than layer-based.

### Pattern 1: FastAPI Lifespan — Startup Auth Check

**What:** Run the OAuth bootstrap check once at startup using the modern `lifespan` context manager. Code before `yield` runs on startup; code after runs on shutdown.

**When to use:** Any per-process initialization (DB table creation, startup checks). The old `@app.on_event("startup")` is deprecated as of FastAPI 0.95+ and will be removed.

```python
# Source: https://fastapi.tiangolo.com/advanced/events/
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create DB tables, check token, open browser if needed
    create_db_and_tables()
    await bootstrap_auth()   # checks DB; opens browser if no valid token
    yield
    # Shutdown: nothing needed for Phase 1

app = FastAPI(lifespan=lifespan)
```

### Pattern 2: pydantic-settings — Environment Configuration

**What:** Define a `Settings` class that reads from `.env` and validates types at startup. Use `@lru_cache` so the `.env` file is read exactly once. Inject via `Depends(get_settings)`.

```python
# Source: https://fastapi.tiangolo.com/advanced/settings/
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    strava_client_id: int
    strava_client_secret: str
    strava_redirect_uri: str = "http://localhost:8000/auth/callback"
    database_url: str = "sqlite:///./data/stravviz.db"

    model_config = SettingsConfigDict(env_file=".env")

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

### Pattern 3: SQLModel Token Table

**What:** Define the token record as a SQLModel table. There is exactly one row. Use `id=1` as a singleton or query for the first (and only) record.

```python
# Source: https://fastapi.tiangolo.com/tutorial/sql-databases/
from sqlmodel import Field, SQLModel, create_engine, Session, select
from datetime import datetime

class Token(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    access_token: str
    refresh_token: str
    expires_at: int          # Unix epoch timestamp from Strava
    token_type: str = "Bearer"
    scope: str = ""
    athlete_id: int | None = None
    athlete_name: str | None = None
    athlete_avatar_url: str | None = None  # For the success page

def create_db_and_tables(engine):
    SQLModel.metadata.create_all(engine)

def get_session(engine):
    with Session(engine) as session:
        yield session
```

**Note on `check_same_thread`:** SQLite requires `connect_args={"check_same_thread": False}` when used with FastAPI, because FastAPI may run a single request across multiple threads. This is mandatory.

```python
# Source: https://fastapi.tiangolo.com/tutorial/sql-databases/
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False}
)
```

### Pattern 4: Strava OAuth Flow — Authorization Code

**What:** The complete Strava OAuth 2.0 authorization code flow.

```
Step 1 — Redirect user to Strava consent:
  GET https://www.strava.com/oauth/authorize
      ?client_id={CLIENT_ID}
      &redirect_uri=http://localhost:8000/auth/callback
      &response_type=code
      &approval_prompt=auto
      &scope=activity:read_all,profile:read_all

Step 2 — User consents; Strava redirects to:
  GET http://localhost:8000/auth/callback?code={CODE}&scope={GRANTED_SCOPE}&state=...

Step 3 — Backend exchanges code for tokens:
  POST https://www.strava.com/api/v3/oauth/token
  {
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "code": CODE,
    "grant_type": "authorization_code"
  }

  Response: {
    "access_token": "...",
    "refresh_token": "...",
    "expires_at": 1734567890,   # Unix epoch
    "expires_in": 21600,        # 6 hours in seconds
    "athlete": { "id": ..., "firstname": ..., "lastname": ..., "profile": "..." }
  }
```

```python
# Source: https://developers.strava.com/docs/authentication/
import httpx
import webbrowser

STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token"

def build_auth_url(settings: Settings) -> str:
    params = {
        "client_id": settings.strava_client_id,
        "redirect_uri": settings.strava_redirect_uri,
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": "activity:read_all,profile:read_all",
    }
    from urllib.parse import urlencode
    return f"{STRAVA_AUTH_URL}?{urlencode(params)}"

async def exchange_code_for_tokens(code: str, settings: Settings) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(STRAVA_TOKEN_URL, data={
            "client_id": settings.strava_client_id,
            "client_secret": settings.strava_client_secret,
            "code": code,
            "grant_type": "authorization_code",
        })
        response.raise_for_status()
        return response.json()
```

### Pattern 5: Token Refresh

**What:** Strava access tokens expire exactly 6 hours after issuance. Before each API call (in later phases), check `expires_at` vs `time.time()`. Refresh when within 3,600 seconds of expiry (Strava may return a new token early in this window).

```python
# Source: https://developers.strava.com/docs/authentication/
import time

def token_needs_refresh(expires_at: int) -> bool:
    return time.time() >= (expires_at - 3600)

async def refresh_access_token(refresh_token: str, settings: Settings) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(STRAVA_TOKEN_URL, data={
            "client_id": settings.strava_client_id,
            "client_secret": settings.strava_client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        })
        response.raise_for_status()
        return response.json()
    # IMPORTANT: Persist the NEW refresh_token from the response.
    # The old refresh_token becomes invalid after a new one is issued.
    # Strava provides both old and new tokens for ~1 hour during transition,
    # but always save the newest one.
```

### Pattern 6: Open Browser at Startup

**What:** Use Python's built-in `webbrowser` module to open the Strava consent URL. No extra dependency.

```python
import webbrowser

# Called during lifespan startup if no valid token found in DB
webbrowser.open(build_auth_url(settings))
```

### Pattern 7: CORS for Frontend Dev Server

**What:** The React frontend (future phases) runs on a different port. Configure CORS in FastAPI now to avoid issues later.

```python
# Source: https://fastapi.tiangolo.com/tutorial/cors/
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Pattern 8: Logging Setup

**What:** Log to both console and rotating file per user decision. Set up at module level in `main.py` or a `logging_config.py`.

```python
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

def configure_logging():
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)

    handlers = [
        logging.StreamHandler(),
        RotatingFileHandler(
            log_dir / "stravviz.log",
            maxBytes=5 * 1024 * 1024,  # 5 MB
            backupCount=3,
        ),
    ]
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        handlers=handlers,
    )

logger = logging.getLogger(__name__)
```

### Anti-Patterns to Avoid

- **Using `@app.on_event("startup")`:** Deprecated since FastAPI 0.95. Silently fails when a `lifespan` is also defined. Use `@asynccontextmanager` lifespan instead.
- **`requests` library in async handlers:** Blocks the event loop. Use `httpx.AsyncClient`.
- **Storing tokens as environment variables or in-memory only:** Tokens must survive process restarts. SQLite is the correct persistence layer.
- **Omitting `check_same_thread=False`:** Will crash with SQLite threading errors under FastAPI's thread pool.
- **Scope creep in Phase 1:** Only request `activity:read_all,profile:read_all` in Phase 1. Do not request `activity:write`. Request only what is needed for the current phase.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client for token exchange | Custom urllib/requests wrapper | `httpx.AsyncClient` | Async, connection pooling, automatic encoding |
| Environment variable loading | Manual `os.environ.get()` with type casting | `pydantic-settings BaseSettings` | Type validation, missing-var errors at startup not runtime, testable |
| ORM / SQL abstraction | Raw `sqlite3` cursor code | `SQLModel` | Future phases add tables; SQL by hand across 6 phases is error-prone; model reuse for API schemas |
| OAuth URL construction | String formatting the auth URL | `urllib.parse.urlencode` | Proper encoding of special characters in redirect_uri |
| Browser opening | subprocess / os.system | `webbrowser.open()` | Standard library, cross-platform, no dependencies |

**Key insight:** The OAuth flow looks simple but has subtle requirements: state parameter for CSRF protection (optional for single-user but good practice), correct scope encoding, always persisting the new refresh token from refresh responses. Don't cut corners on persistence.

---

## Common Pitfalls

### Pitfall 1: Losing the New Refresh Token After Refresh

**What goes wrong:** Code refreshes the access token but only saves `access_token` and `expires_at`. The `refresh_token` in the response is a NEW token that replaces the old one. After ~1 hour of transition, the old refresh token stops working.
**Why it happens:** Developers assume the refresh token is static like a permanent credential.
**How to avoid:** Always extract and persist `refresh_token` from every token exchange response, including refresh responses.
**Warning signs:** 401 errors appearing roughly 7 hours after the last full OAuth flow.

### Pitfall 2: Strava App Callback Domain vs. Redirect URI

**What goes wrong:** The app is registered on Strava with `localhost` as the callback domain, but the actual redirect_uri in the request uses `http://127.0.0.1:8000/auth/callback`. Strava rejects this with "redirect_uri does not match".
**Why it happens:** `localhost` and `127.0.0.1` are technically different strings; Strava's matching may be strict.
**How to avoid:** Register `localhost` in the Strava app settings. Use `http://localhost:8000/auth/callback` consistently in both the app registration and the `STRAVA_REDIRECT_URI` env variable. Localhost (not 127.0.0.1) is explicitly whitelisted by Strava.
**Warning signs:** `{"message":"Bad Request","errors":[{"resource":"Application","field":"redirect_uri","code":"invalid"}]}`

### Pitfall 3: Browser Opens Before Server is Ready

**What goes wrong:** The lifespan function opens the browser immediately, but uvicorn hasn't finished binding to the port yet. The OAuth callback arrives at a server that isn't listening.
**Why it happens:** `webbrowser.open()` is called synchronously during lifespan startup before the ASGI server completes its startup sequence.
**How to avoid:** Use a small `asyncio.sleep(0.5)` before opening the browser in the lifespan startup, or use `BackgroundTasks` on a warm-up route. The most robust approach is a dedicated `/auth/login` redirect route that the browser is sent to; the user must trigger it after startup (clicking a link or making a GET request to it).
**Warning signs:** "connection refused" in the browser during the OAuth callback.

### Pitfall 4: Missing `check_same_thread=False`

**What goes wrong:** `sqlite3.ProgrammingError: SQLite objects created in a thread can only be used in that same thread`.
**Why it happens:** FastAPI uses thread pools for synchronous operations; SQLite's default connection is thread-unsafe.
**How to avoid:** Always pass `connect_args={"check_same_thread": False}` to `create_engine`.
**Warning signs:** Intermittent threading errors on startup or under concurrent requests.

### Pitfall 5: Scope Not Granted by User

**What goes wrong:** The OAuth flow completes but the granted scope in the callback does not include `activity:read_all`. Later API calls return 403 Forbidden.
**Why it happens:** Strava shows the user a consent screen listing the requested scopes. The user can deselect scopes. The callback's `scope` parameter reflects what was actually granted.
**How to avoid:** Check the `scope` query parameter in the callback and verify it contains the required scopes. If not, redirect to an error page explaining what scopes are needed and offering a "Connect again" link.
**Warning signs:** Successful OAuth flow but 403 on activity endpoints.

### Pitfall 6: CORS Wildcard with Credentials

**What goes wrong:** Setting `allow_origins=["*"]` with `allow_credentials=True` is rejected by browsers.
**Why it happens:** CORS spec prohibits wildcard origins when credentials are included.
**How to avoid:** List specific origins: `["http://localhost:5173", "http://localhost:3000"]`. Use environment-based origin list for production later.
**Warning signs:** Browser console: "The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'."

---

## Code Examples

### Complete OAuth Callback Route

```python
# Source: https://developers.strava.com/docs/authentication/ + FastAPI routing patterns
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlmodel import Session

router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/callback")
async def oauth_callback(
    code: str | None = None,
    error: str | None = None,
    scope: str | None = None,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    if error or not code:
        # User denied consent or an error occurred
        return HTMLResponse(content=render_error_page(error), status_code=400)

    # Verify required scopes were granted
    granted = set(scope.split(",")) if scope else set()
    required = {"activity:read_all"}
    if not required.issubset(granted):
        return HTMLResponse(content=render_scope_error_page(granted), status_code=403)

    # Exchange code for tokens
    token_data = await exchange_code_for_tokens(code, settings)

    # Persist to SQLite (upsert pattern — only one row ever)
    existing = session.get(Token, 1)
    if existing:
        existing.access_token = token_data["access_token"]
        existing.refresh_token = token_data["refresh_token"]
        existing.expires_at = token_data["expires_at"]
        # ... update athlete fields
        session.add(existing)
    else:
        athlete = token_data.get("athlete", {})
        token = Token(
            id=1,
            access_token=token_data["access_token"],
            refresh_token=token_data["refresh_token"],
            expires_at=token_data["expires_at"],
            athlete_id=athlete.get("id"),
            athlete_name=f"{athlete.get('firstname', '')} {athlete.get('lastname', '')}".strip(),
            athlete_avatar_url=athlete.get("profile"),
        )
        session.add(token)
    session.commit()

    # Return polished success page with athlete name/avatar
    return HTMLResponse(content=render_success_page(token_data["athlete"]))
```

### Health Check Endpoint

```python
# /api/health — check server status + auth status (Claude's discretion)
from fastapi import APIRouter
from sqlmodel import Session, select

router = APIRouter(prefix="/api", tags=["system"])

@router.get("/health")
async def health_check(
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    # Check if a token record exists and is not expired
    token = session.exec(select(Token)).first()
    auth_status = "not_authenticated"
    if token:
        if token_needs_refresh(token.expires_at):
            auth_status = "token_expired"
        else:
            auth_status = "authenticated"

    return {
        "status": "ok",
        "auth_status": auth_status,
        "version": "0.1.0",
    }
```

### pytest conftest.py (Phase 1 baseline)

```python
# Source: https://fastapi.tiangolo.com/advanced/settings/ (dependency override pattern)
import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.pool import StaticPool

from app.main import app
from app.database import get_session
from app.config import get_settings, Settings

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",  # in-memory
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    def get_settings_override():
        return Settings(
            strava_client_id=12345,
            strava_client_secret="test_secret",
            strava_redirect_uri="http://localhost:8000/auth/callback",
            database_url="sqlite://",
        )

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_settings] = get_settings_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@app.on_event("startup")` | `@asynccontextmanager` lifespan | FastAPI 0.95 (2023) | Old approach deprecated; silently fails if mixed with lifespan |
| `requests` library | `httpx` | Broad ecosystem shift 2021-2023 | requests is sync-only; httpx is drop-in async replacement |
| SQLAlchemy direct | SQLModel | FastAPI officially endorsed SQLModel ~2022 | Less boilerplate; Pydantic integration; same capability |
| `pydantic v1` settings | `pydantic-settings` (separate package) | Pydantic v2 (2023) | `BaseSettings` moved to `pydantic-settings`; must install separately |

**Deprecated/outdated:**
- `@app.on_event("startup")` / `@app.on_event("shutdown")`: Deprecated. Use lifespan.
- `from pydantic import BaseSettings`: Removed in Pydantic v2. Import from `pydantic_settings` instead.
- `orm_mode = True` in Pydantic config: Replaced by `model_config = ConfigDict(from_attributes=True)` in Pydantic v2.

---

## Open Questions

1. **Token revocation handling (Claude's discretion)**
   - What we know: If a user revokes access in the Strava app, all tokens become invalid and return 401. Strava docs say re-auth is needed.
   - What's unclear: Should the app auto-restart the full OAuth flow (open browser again) or show an error page requiring user action?
   - Recommendation: Show an error page with a "Reconnect to Strava" button. Auto-opening the browser on a 401 from a background operation is surprising UX. The reconnect link navigates to `/auth/login` which restarts the flow.

2. **Strava app registration — "Authorization Callback Domain" field**
   - What we know: Strava requires a registered callback domain. `localhost` is whitelisted and accepted. The field is set in the Strava API settings page at `https://www.strava.com/settings/api`.
   - What's unclear: Whether `localhost` without a port suffix covers any port or only port 80.
   - Recommendation: In `.env.example` documentation, instruct the developer to set "Authorization Callback Domain" to `localhost` in their Strava app settings. Use `http://localhost:8000/auth/callback` as the redirect_uri consistently.

3. **Async vs sync SQLModel sessions**
   - What we know: FastAPI's official SQLModel docs use synchronous sessions. SQLAlchemy + aiosqlite supports async, with ~3-5x throughput improvement under load.
   - What's unclear: Whether async sessions are worth the setup complexity for this single-user tool.
   - Recommendation: Use **synchronous** SQLModel sessions. Async SQLite is optimized for concurrent multi-user workloads. This is a single-user tool; the complexity cost of async sessions exceeds any benefit. Consistent with the official FastAPI tutorial recommendation.

---

## Sources

### Primary (HIGH confidence)
- `https://developers.strava.com/docs/authentication/` — Full OAuth flow, token endpoints, scopes, expiry behavior, refresh semantics
- `https://fastapi.tiangolo.com/advanced/events/` — Lifespan context manager pattern, deprecation of on_event
- `https://fastapi.tiangolo.com/advanced/settings/` — pydantic-settings BaseSettings, lru_cache pattern
- `https://fastapi.tiangolo.com/tutorial/sql-databases/` — SQLModel recommendation, check_same_thread requirement, session dependency pattern
- `https://fastapi.tiangolo.com/tutorial/bigger-applications/` — APIRouter structure, router-level prefix/tags

### Secondary (MEDIUM confidence)
- `https://fastapi.tiangolo.com/tutorial/cors/` — CORS middleware configuration for React frontend
- WebSearch: pytest-asyncio, httpx TestClient, respx for mock patterns — multiple sources agree on same pattern
- WebSearch: Python `webbrowser` module for browser opening — standard library, well-established
- WebSearch: `RotatingFileHandler` for log file pattern — standard library, well-established

### Tertiary (LOW confidence)
- WebSearch: stravalib actively maintained (June 2025 release) — not verified against GitHub directly; decision to use raw httpx instead of stravalib is based on project complexity fit, not a stravalib deficiency

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against official FastAPI docs and Strava API docs
- Architecture: HIGH — follows FastAPI official patterns directly
- Strava OAuth specifics: HIGH — sourced directly from Strava developer documentation
- Pitfalls: MEDIUM-HIGH — localhost/redirect pitfall verified via Strava community; threading pitfall verified via FastAPI docs; refresh token rotation verified via Strava docs
- Test setup: MEDIUM — confirmed general pattern from FastAPI docs; specific conftest.py pattern from training knowledge cross-referenced with search results

**Research date:** 2026-02-27
**Valid until:** 2026-03-29 (FastAPI/SQLModel are stable; Strava OAuth API is stable; 30-day window is conservative)
