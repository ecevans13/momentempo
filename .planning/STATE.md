# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** See the story your training data tells — trends, progress, and projections — in one beautiful, personal dashboard.
**Current focus:** Phase 3 — Core Dashboard (finalizing)

## Current Position

Phase: 3 of 6 (Core Dashboard)
Status: Near complete — backend API, frontend scaffold, and fixes all committed
Last activity: 2026-02-27 — Phase 3 frontend fixes: timeframe selector, sport filter, error boundaries

Progress: [██████░░░░] 55%

## Performance Metrics

**Velocity:**
- Total plans completed: 2 (formal), Phase 2 + Phase 3 executed without formal plans
- Total execution time: ~15 min

**By Phase:**

| Phase | Status | Notes |
|-------|--------|-------|
| 01-foundation-and-auth | Complete | OAuth flow, token refresh, health endpoint, 16 tests |
| 02-data-pipeline | Complete | Activity/SyncState models, Strava client, sync orchestrator, 53 tests |
| 03-core-dashboard | Near complete | Dashboard API, React frontend, dark mode, trends, activity feed |

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
- [02]: Page-based pagination with per_page=200 for backfill; empty-page termination (not short-page)
- [02]: session.merge() for upsert — Strava activity ID as natural primary key
- [02]: Incremental sync uses after=max_epoch-86400 (1-day overlap buffer) to catch edge cases
- [03]: TrendChart has own timeframe selector (3M/6M/1Y/2Y/All) independent of MetricCards period
- [03]: Sport type filter affects trends + activity feed (summary endpoint doesn't filter by sport)
- [03]: ErrorBoundary wraps each section independently for fault isolation
- [03]: .env path resolved to absolute project root for working directory independence

### Pending Todos

None.

### Blockers/Concerns

- [Phase 2]: Verify actual Strava rate limit values against response headers during first API calls — may have changed from documented 100/15min, 1000/day
- [Phase 5]: Gear image auto-fetch requires an external image API (Strava does not provide images). Google Custom Search free quota is 100 queries/day. Validate feasibility with real gear names before committing to implementation.
- [Phase 5]: Strava `/athletes/{id}/koms` and `/segments/starred` endpoint deprecation status should be verified against current API docs before building trophy case segment features.

## Session Continuity

Last session: 2026-02-27
Stopped at: Phase 3 frontend fixes committed — next is Phase 4 (Activity Drill-Down)
Resume: Phase 4 research and planning needed
