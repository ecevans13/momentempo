---
phase: 01-foundation-and-auth
plan: 02
subsystem: auth
tags: [strava, oauth2, httpx, respx, fastapi, sqlite, sqlmodel, pytest, pytest-asyncio]

# Dependency graph
requires:
  - phase: 01-foundation-and-auth plan 01
    provides: FastAPI app shell, Token SQLModel table, pydantic-settings config, pytest fixtures
provides:
  - Strava OAuth 2.0 authorization code flow (GET /auth/login, GET /auth/callback)
  - Token exchange and upsert with athlete name and avatar URL stored in SQLite
  - Silent token refresh via ensure_valid_token (persists new refresh token)
  - Startup bootstrap: opens browser on first run, refreshes silently when near expiry
  - GET /api/health endpoint with not_authenticated / authenticated / token_expired status
  - Polished dark-themed success and error HTML pages (dark bg #1a1a2e)
  - 16 passing tests covering all OAuth scenarios with respx-mocked Strava API
affects: [02-data-pipeline, 03-dashboard, 04-gear, 05-polish]

# Tech tracking
tech-stack:
  added:
    - webbrowser (stdlib — browser opener in bootstrap_auth)
    - urllib.parse (stdlib — urlencode for auth URL construction)
    - asyncio (stdlib — sleep(1.0) in bootstrap_auth before browser open)
  patterns:
    - request.app.state.engine dependency pattern for DB session in routes that bypass get_session
    - respx.mock decorator for mocking httpx calls in both sync and async tests
    - Token singleton upsert: query id=1, update if exists else insert with id=1
    - Graceful degradation: httpx errors during refresh are logged at WARNING, not raised
    - pytest.mark.asyncio for async service function tests (ensure_valid_token)

key-files:
  created:
    - backend/app/services/strava_auth.py
    - backend/app/routers/auth.py
    - backend/app/routers/health.py
    - backend/tests/test_auth.py
    - backend/tests/test_health.py
  modified:
    - backend/app/main.py

key-decisions:
  - "get_db_session uses request.app.state.engine directly (not get_session dependency) so auth/health routes work with TestClient's app.state.engine override in conftest"
  - "bootstrap_auth sleeps 1s before webbrowser.open() to let the server finish port binding before the callback arrives"
  - "Error page 'Try Again' text replaced with 'Connect Again' on scope-mismatch 403 to communicate re-auth intent vs retry"
  - "ensure_valid_token catches all exceptions (not just httpx.HTTPError) for network error resilience"

patterns-established:
  - "Auth route session dependency: def get_db_session(request) -> Session via request.app.state.engine"
  - "HTML pages: f-string templates defined as render_success_page() and render_error_page() helpers — no Jinja2"
  - "Strava mock pattern: @respx.mock + respx.post(STRAVA_TOKEN_URL).mock(return_value=Response(...))"
  - "Upsert pattern: session.exec(select(Token).where(Token.id==1)).first() then update or create"

requirements-completed: [DATA-01, DATA-02]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 1 Plan 2: Foundation and Auth - OAuth Flow Summary

**Strava OAuth 2.0 with silent token refresh, startup bootstrap, dark-themed callback pages, and 16-test suite covering all OAuth scenarios using respx-mocked Strava API**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T15:32:54Z
- **Completed:** 2026-02-27T15:35:29Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Complete OAuth 2.0 authorization code flow: GET /auth/login redirects to Strava, GET /auth/callback exchanges code, upserts Token with athlete info, renders polished success page
- Silent token refresh: ensure_valid_token checks the 1-hour buffer window, POSTs to Strava refresh endpoint, persists both new access_token and new refresh_token (old refresh token invalidates ~1h after issue)
- Startup auth bootstrap: opens browser on first run with asyncio.sleep(1.0) port-binding guard, silently refreshes near-expiry tokens, stays completely silent for valid tokens
- Health endpoint accurately reports not_authenticated / authenticated / token_expired based on live Token table state
- 16 tests (13 auth + 3 health) pass against mocked Strava API with zero real HTTP calls

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement Strava auth service and OAuth routes with success/error pages** - `b2c2b5d` (feat)
2. **Task 2: Implement health check endpoint and comprehensive test suite** - `9622124` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified

- `backend/app/services/strava_auth.py` — build_auth_url, token_needs_refresh, exchange_code_for_tokens, refresh_access_token, ensure_valid_token, bootstrap_auth
- `backend/app/routers/auth.py` — GET /auth/login, GET /auth/callback with upsert; render_success_page, render_error_page HTML helpers; get_db_session dependency
- `backend/app/routers/health.py` — GET /api/health returning status/auth_status/version JSON
- `backend/app/main.py` — wire bootstrap_auth into lifespan, include auth and health routers
- `backend/tests/test_auth.py` — 13 tests: callback success/error/scope/exchange-failure/upsert, token_needs_refresh variants, build_auth_url, login redirect, ensure_valid_token refresh + network error
- `backend/tests/test_health.py` — 3 tests: no_token, valid_token, expired_token

## Decisions Made

- `get_db_session` dependency uses `request.app.state.engine` directly instead of going through `get_session()`. This is required for TestClient compatibility — conftest sets `app.state.engine` to the in-memory engine, and the route-level dependency reads from there.
- `bootstrap_auth` adds `await asyncio.sleep(1.0)` before `webbrowser.open()` to let uvicorn finish port binding. Without this sleep, the browser fires the callback before the server is ready to accept connections.
- Scope-mismatch 403 page says "Connect Again" instead of "Try Again" — the user must restart the full OAuth flow, not just retry the callback.
- `ensure_valid_token` wraps the refresh call in `except Exception` (not just `httpx.HTTPError`) to catch DNS failures, timeouts, and connection resets in addition to HTTP protocol errors — required for "app must not crash" spec.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no new external service configuration required. Strava credentials were established in Plan 01's `.env` setup.

## Next Phase Readiness

- OAuth flow is fully operational: server start triggers browser on first run, token stored in SQLite after consent
- `ensure_valid_token` is ready to be called by Phase 2 data pipeline routes before every Strava API call
- GET /api/health provides a testable liveness + auth-status endpoint for Phase 3 dashboard
- All Phase 1 requirements satisfied: DATA-01 (Token model + DB schema) and DATA-02 (OAuth flow + token persistence)

## Self-Check: PASSED

All 6 files verified present. Both task commits verified in git log.

---
*Phase: 01-foundation-and-auth*
*Completed: 2026-02-27*
