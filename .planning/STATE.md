# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** See the story your training data tells — trends, progress, and projections — in one beautiful, personal dashboard.
**Current focus:** Phase 1 — Foundation and Auth

## Current Position

Phase: 1 of 6 (Foundation and Auth)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-27 — Plan 01-02 complete: Strava OAuth flow, token refresh, health endpoint, 16-test suite

Progress: [██░░░░░░░░] 10%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 2.5 min
- Total execution time: 5 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-and-auth | 2 | 5 min | 2.5 min |

**Recent Trend:**
- Last 5 plans: 01-01 (3 min), 01-02 (2 min)
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Single user for v1 — simplifies auth, no user management
- [Init]: Dark mode default — stated user preference
- [Init]: Auto-sync on page load — but with TTL gate (15-30 min minimum between syncs)
- [Init]: Workout projector deferred to v2 — high complexity, data availability uncertain
- [01-01]: Engine stored on app.state (not module-level) to prevent test isolation problems
- [01-01]: backend/__init__.py added to support backend.app.* import pattern from project root
- [01-01]: Token table uses singleton pattern (id=1) — one row upserted during OAuth, no multi-user complexity
- [01-02]: get_db_session uses request.app.state.engine directly (not get_session) for TestClient compatibility
- [01-02]: bootstrap_auth sleeps 1s before webbrowser.open() to let uvicorn finish port binding
- [01-02]: ensure_valid_token catches Exception (not just httpx.HTTPError) for full network error resilience

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2]: Verify actual Strava rate limit values against response headers during first API calls — may have changed from documented 100/15min, 1000/day
- [Phase 5]: Gear image auto-fetch requires an external image API (Strava does not provide images). Google Custom Search free quota is 100 queries/day. Validate feasibility with real gear names before committing to implementation.
- [Phase 5]: Strava `/athletes/{id}/koms` and `/segments/starred` endpoint deprecation status should be verified against current API docs before building trophy case segment features.

## Session Continuity

Last session: 2026-02-27
Stopped at: Completed 01-02-PLAN.md — Strava OAuth flow, token refresh, health endpoint, 16-test suite
Resume file: .planning/phases/01-foundation-and-auth/01-03-PLAN.md (next plan)
