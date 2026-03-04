---
phase: 01-foundation-and-auth
plan: 01
subsystem: infra
tags: [fastapi, sqlmodel, sqlite, pydantic-settings, pytest, uvicorn, uv]

# Dependency graph
requires: []
provides:
  - FastAPI application shell with asynccontextmanager lifespan
  - pydantic-settings config loading from .env with lru_cache
  - SQLModel Token table with athlete fields (access_token, refresh_token, expires_at, athlete_id, athlete_name, athlete_avatar_url)
  - SQLite engine factory with check_same_thread=False for FastAPI thread safety
  - Rotating file + console logging to backend/logs/stravviz.log
  - pytest conftest with in-memory SQLite fixtures and TestClient dependency overrides
  - CORS middleware allowing localhost:5173 and localhost:3000
  - Monorepo structure: backend/ + frontend/ with pyproject.toml for uv
affects: [02-oauth, 03-data-pipeline, 04-dashboard, 05-gear, 06-polish]

# Tech tracking
tech-stack:
  added:
    - fastapi==0.133.1
    - sqlmodel==0.0.37
    - pydantic-settings==2.13.1
    - uvicorn==0.41.0
    - httpx==0.28.1
    - pytest==9.0.2
    - pytest-asyncio==1.3.0
    - respx==0.22.0
    - uv==0.8.17 (package manager)
  patterns:
    - asynccontextmanager lifespan for FastAPI startup/shutdown
    - app.state.engine for engine lifecycle tied to app
    - lru_cache on get_settings() for singleton config
    - Dependency injection: get_session yields from app.state.engine
    - Test pattern: StaticPool in-memory SQLite with dependency_overrides

key-files:
  created:
    - backend/app/main.py
    - backend/app/config.py
    - backend/app/database.py
    - backend/app/models.py
    - backend/tests/conftest.py
    - backend/pyproject.toml
    - .gitignore
    - .env.example
  modified: []

key-decisions:
  - "Engine stored on app.state (not module-level) to avoid test isolation problems"
  - "Relative imports used within backend.app package (.config, .database)"
  - "backend/__init__.py added to support backend.app.* import pattern from project root"
  - "check_same_thread=False mandatory on SQLite engine for FastAPI thread pool compatibility"
  - "Token table is singleton (one row, id=1) — populated by OAuth flow in Plan 02"

patterns-established:
  - "FastAPI lifespan pattern: configure_logging -> mkdir -> create_engine -> store on app.state -> create_db_and_tables"
  - "Test fixture chain: session_fixture (in-memory engine) -> client_fixture (overrides get_settings + get_session)"
  - "All commands run with uv from project root, not cd into backend/"

requirements-completed: [DATA-01]

# Metrics
duration: 3min
completed: 2026-02-27
---

# Phase 1 Plan 1: Foundation and Auth - Scaffold Summary

**FastAPI monorepo scaffold with SQLModel Token table, pydantic-settings config, rotating file logging, and pytest in-memory fixtures — server starts and creates stravviz.db on first run**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-27T15:27:15Z
- **Completed:** 2026-02-27T15:30:00Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Replaced misconfigured `.gitignore` directory with proper file protecting .env, data/, logs/, .venv/
- FastAPI application with asynccontextmanager lifespan creates SQLite DB, configures logging, and stores engine on app.state
- Token SQLModel table with all required OAuth fields including athlete profile fields for Plan 02's success page
- pytest conftest.py with StaticPool in-memory SQLite session fixture and TestClient with full dependency overrides

## Task Commits

Each task was committed atomically:

1. **Task 1: Create monorepo structure, configuration files, and gitignore** - `43bf870` (feat)
2. **Task 2: Implement config, database, Token model, logging, and FastAPI app shell** - `55e14c0` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified

- `backend/app/main.py` - FastAPI app with lifespan, CORS, rotating log handler, configure_logging()
- `backend/app/config.py` - pydantic-settings Settings class with env_file=".env", lru_cached get_settings()
- `backend/app/database.py` - get_engine(), create_db_and_tables(), get_session() factory functions
- `backend/app/models.py` - Token SQLModel table (id, access_token, refresh_token, expires_at, athlete fields)
- `backend/tests/conftest.py` - session and client fixtures using StaticPool in-memory SQLite
- `backend/pyproject.toml` - uv-compatible project definition with all required dependencies
- `backend/__init__.py` - Empty init enabling backend.app.* imports from project root
- `.gitignore` - Proper file (replaced directory) with .env, data/, logs/, .venv/ rules
- `.env.example` - Documented placeholder with all 4 required env vars
- `frontend/.gitkeep` - Placeholder for future frontend phase

## Decisions Made

- Engine stored on `app.state` (not module-level) to prevent test isolation problems — each test can inject its own in-memory engine via dependency overrides
- Added `backend/__init__.py` to enable the `from backend.app.config import ...` import pattern from project root, consistent with running uvicorn as `backend.app.main:app`
- `check_same_thread=False` is mandatory on SQLite for FastAPI's thread pool — documented in code
- Token table uses id=1 singleton pattern — one row that gets upserted during OAuth, no multi-user complexity for v1
- Relative imports (`.config`, `.database`) used within `backend.app` package for clarity

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added backend/__init__.py for import compatibility**
- **Found during:** Task 2 (implementing database.py with `from backend.app.config import ...`)
- **Issue:** `backend/` directory lacked `__init__.py`, causing `ModuleNotFoundError` when importing `backend.app.*` from project root
- **Fix:** Created empty `backend/__init__.py` so the package is recognized by Python
- **Files modified:** `backend/__init__.py`
- **Verification:** `python -c "from backend.app.config import Settings"` succeeds from project root
- **Committed in:** `55e14c0` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking import issue)
**Impact on plan:** Fix was necessary for correct module resolution. No scope creep.

## Issues Encountered

- The `.gitignore` was a directory (misconfigured) rather than a file — replaced as the first step of Task 1
- `backend/data/` and `backend/logs/` are gitignored by content rules, so `.gitkeep` files in those directories cannot be tracked — directories are created at runtime by the lifespan startup code

## User Setup Required

The `.env` file with real Strava credentials exists at the project root and will be read by `pydantic-settings` on server start. See `.env.example` for the required variables.

The plan's `user_setup` block documents:
- `STRAVA_CLIENT_ID` — from https://www.strava.com/settings/api
- `STRAVA_CLIENT_SECRET` — from https://www.strava.com/settings/api
- Authorization Callback Domain must be set to `localhost` in Strava app settings

## Next Phase Readiness

- Backend foundation is fully runnable: `uvicorn backend.app.main:app` from project root
- Token table created on startup — Plan 02 can immediately write tokens after OAuth
- `get_settings()` and `get_session()` are ready for dependency injection in auth routers
- Test fixtures in `conftest.py` ready for Plan 02's auth route tests

---
*Phase: 01-foundation-and-auth*
*Completed: 2026-02-27*
