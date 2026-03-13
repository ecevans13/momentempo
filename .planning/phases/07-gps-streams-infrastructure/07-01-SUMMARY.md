---
phase: 07-gps-streams-infrastructure
plan: 01
subsystem: backend
tags: [models, services, caching, gps, streams, tdd]
dependency_graph:
  requires: []
  provides: [ActivityStream-model, fetch_and_cache_streams]
  affects: [backend/app/models.py, backend/app/services/streams_service.py]
tech_stack:
  added: []
  patterns: [session.merge-upsert, lazy-fetch-and-cache, sentinel-row]
key_files:
  created:
    - backend/app/services/streams_service.py
    - backend/tests/test_streams.py
  modified:
    - backend/app/models.py
decisions:
  - activity_id as primary key enables session.merge() upsert without auto-increment
  - fetched_at sentinel distinguishes not-yet-fetched from fetched-with-no-data
  - sa_column=Column(JSON, nullable=True) used explicitly to avoid SQLModel/SQLAlchemy nullability quirks
metrics:
  duration: ~15min
  completed: 2026-03-13
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 1
---

# Phase 7 Plan 01: GPS Streams Infrastructure Summary

**One-liner:** ActivityStream SQLModel table with lazy-fetch-and-cache service using sentinel pattern to avoid re-fetching no-GPS activities.

## What Was Built

Added the data layer for GPS stream caching:

1. **ActivityStream model** (`backend/app/models.py`) — SQLModel table with `activity_id` as primary key (not auto-increment), six JSON stream columns (latlng, altitude, heartrate, velocity_smooth, time, distance), and `fetched_at` sentinel float.

2. **streams_service.py** (`backend/app/services/streams_service.py`) — `fetch_and_cache_streams()` function that: checks cache first (returns immediately on hit), authenticates via `ensure_valid_token`, calls Strava `/activities/{id}/streams?key_by_type=true`, stores full data or sentinel on 404/empty response, uses `session.merge()` for idempotent upsert.

3. **test_streams.py** (`backend/tests/test_streams.py`) — 8 tests covering all scenarios: model creation with/without data, merge upsert, cache hit skips API, cache miss fetches and stores, empty response sentinel, 404 sentinel, 401 on missing token.

## Decisions Made

- **`activity_id` as primary key** — mirrors the `Activity` model pattern, enables `session.merge()` for upsert without auto-increment overhead
- **`fetched_at` sentinel** — non-null means "fetch was attempted"; null means "never fetched". Stores sentinel even for 404/no-GPS so we never re-fetch
- **Explicit `sa_column=Column(JSON, nullable=True)`** — avoids SQLModel/SQLAlchemy nullable quirks with JSON columns (research Pitfall 3)
- **`_extract_stream_data()` helper** — uses `data.get(key, {}).get("data")` because Strava omits missing stream types entirely (does not null them)

## Test Results

- 8 new tests: all pass
- 114 existing backend tests: all pass (no regressions)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files created/modified:
- `backend/app/models.py` — modified (ActivityStream class added)
- `backend/app/services/streams_service.py` — created
- `backend/tests/test_streams.py` — created

Commits:
- `aa53b75` — feat(07-01): add ActivityStream model with JSON stream columns
- `28a1f62` — feat(07-01): create streams_service with fetch_and_cache_streams
- `83fe00d` — test(07-01): comprehensive tests for ActivityStream model and service
