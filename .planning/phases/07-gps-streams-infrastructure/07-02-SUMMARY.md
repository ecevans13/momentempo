---
phase: 07-gps-streams-infrastructure
plan: 02
subsystem: backend
tags: [api, endpoint, caching, gps, streams, integration-tests]
dependency_graph:
  requires: [ActivityStream-model, fetch_and_cache_streams]
  provides: [GET-/api/activity/{id}/streams]
  affects: [backend/app/routers/activity_detail.py, backend/tests/test_streams.py]
tech_stack:
  added: []
  patterns: [lazy-fetch-and-cache, boolean-flags-for-conditional-rendering]
key_files:
  created: []
  modified:
    - backend/app/routers/activity_detail.py
    - backend/tests/test_streams.py
decisions:
  - Boolean flags (has_gps/has_altitude/has_heartrate) returned alongside arrays so frontend can conditionally render without inspecting array values
  - Endpoint added to existing activity_detail router (no new router registration needed)
  - Defensive None fallback included though fetch_and_cache_streams always returns a row or raises
metrics:
  duration: ~15min
  completed: 2026-03-13
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 7 Plan 02: Streams API Endpoint Summary

**One-liner:** GET /api/activity/{id}/streams endpoint wired to fetch_and_cache_streams service, returning stream arrays with boolean GPS/altitude/HR flags.

## What Was Built

1. **Streams endpoint** (`backend/app/routers/activity_detail.py`) — Added `GET /{activity_id}/streams` to the existing activity_detail router. Delegates entirely to `fetch_and_cache_streams` from streams_service. Returns stream arrays plus `has_gps`, `has_altitude`, `has_heartrate` boolean flags so the frontend can conditionally render maps/charts without inspecting array contents.

2. **Integration tests** (`backend/tests/test_streams.py`) — 5 new integration tests using the `client` fixture to exercise the full HTTP request lifecycle:
   - Cache miss: endpoint fetches from Strava, returns full stream data
   - Cache hit: second request skips Strava entirely
   - No-GPS activity: returns `has_gps=False` with all-null arrays (no error)
   - No token: returns 401
   - Two sequential calls: Strava API called only once (second uses cache)

## Decisions Made

- **Boolean flags in response** — `has_gps/has_altitude/has_heartrate` included so frontend can conditionally render without inspecting arrays; cleaner than checking `latlng !== null`
- **Existing router** — No new router needed; endpoint fits naturally on `/api/activity` prefix alongside detail and zones endpoints

## Test Results

- 13 streams tests: all pass (8 unit/service + 5 integration)
- 127 total backend tests: all pass (no regressions)

## Deviations from Plan

**[Rule 3 - Blocking] Missing dependencies: anthropic, python-multipart**

- **Found during:** Task 2 verification (running tests)
- **Issue:** `anthropic` and `python-multipart` modules not installed in venv, causing conftest import to fail
- **Fix:** Installed both via `pip install anthropic python-multipart`
- **Impact:** Tests ran successfully after installation; these are pre-existing missing dependencies unrelated to this plan's changes

## Self-Check

Files modified:
- `backend/app/routers/activity_detail.py` — modified (streams endpoint added)
- `backend/tests/test_streams.py` — modified (5 integration tests added)

Commits:
- `8e05e01` — feat(07-02): add GET /api/activity/{id}/streams endpoint to activity_detail router
- `7b19e28` — test(07-02): add integration tests for streams endpoint

## Self-Check: PASSED
