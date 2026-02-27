# Phase 1: Foundation and Auth - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the project scaffold, Strava OAuth integration, and token persistence. After this phase, every subsequent phase can make authenticated Strava API calls without re-authorizing. No data fetching, no UI beyond the OAuth redirect page, no dashboard.

</domain>

<decisions>
## Implementation Decisions

### First-Run Experience
- Auto-open the default browser to Strava's OAuth consent page when no tokens are stored
- OAuth redirect page shows the user's Strava name/avatar with a success confirmation message (not just a plain text success)
- On subsequent starts with valid tokens, auth is completely silent — no console messages, no status indicators, just works

### Project Structure
- Monorepo layout: `/backend` and `/frontend` at the top level, shared config at root
- `.env.example` committed to repo with placeholder values documenting required variables

### Dev Workflow
- Strava API credentials (client ID, client secret) managed via `.env` file at project root, gitignored
- pytest set up from the start with basic test structure — each phase adds tests for its features

### Auth Error Handling
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

</decisions>

<specifics>
## Specific Ideas

- Redirect page should feel polished — showing the Strava user's name and avatar confirms the connection is real, not just "success"
- Graceful degradation means the app is never completely dead even if Strava is down

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-and-auth*
*Context gathered: 2026-02-27*
