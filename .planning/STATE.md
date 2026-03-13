# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** See the story your training data tells — trends, progress, and projections — in one beautiful, personal dashboard.
**Current focus:** All phases complete

## Current Position

Phase: 07-gps-streams-infrastructure
Plan: 01 of N (in progress)
Status: Executing phase 07
Last activity: 2026-03-13 — Phase 07 Plan 01 complete (ActivityStream model + streams_service)

Progress: [██████████] 100%

## Test Summary

- 79 backend tests passing
- Frontend builds clean (TypeScript + Vite)
- Docker image builds and runs successfully
- Branch: phase-1-foundation-and-auth

## What's Built

| Phase | What | Tests |
|-------|------|-------|
| 1. Auth | OAuth flow, token refresh, health endpoint | 16 |
| 2. Data Pipeline | Activity/SyncState models, Strava client, sync orchestrator | 37 |
| 3. Core Dashboard | Summary/trends/activities API, React frontend, dark mode | 13 |
| 4. Activity Drill-Down | Splits, HR zones, detail view | 7 |
| 5. Gear & Trophies | Gear gallery with detail view, PRs, milestones, timeline | 6 |
| 6. Deployment | Dockerfile, docker-compose, SPA serving, production config | — |

## Session Continuity

Last session: 2026-03-13
Stopped at: Completed 07-01-PLAN.md: ActivityStream model and streams_service
Resume: Phase 07 Plan 01 complete. Next: 07-02 (streams API endpoint).

## Key Decisions (recent)

- [07-01]: activity_id as primary key for ActivityStream enables session.merge() upsert
- [07-01]: fetched_at sentinel field — non-null means fetch was attempted (even if no GPS data)
- [07-01]: sa_column=Column(JSON, nullable=True) for explicit nullable JSON columns
- [06]: Multi-stage Dockerfile — Node 22 alpine + Python 3.13 slim with uv
- [06]: Single container serves both API and built React SPA
- [06]: Conditional CORS — only enabled in development (Vite dev server)
- [06]: File logging with graceful fallback (skip if directory not writable)
- [06]: Production mode logs auth URL instead of opening browser
- [06]: SQLite persisted via Docker volume mount at /data
