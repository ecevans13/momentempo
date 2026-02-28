# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** See the story your training data tells — trends, progress, and projections — in one beautiful, personal dashboard.
**Current focus:** Phase 6 — Deployment (next)

## Current Position

Phase: 5 of 6 complete
Status: Phases 1-5 implemented and tested. Phase 6 (Deployment) remaining.
Last activity: 2026-02-28 — Phase 5 complete: gear gallery, trophy case, PRs, milestones, timeline

Progress: [█████████░] 90%

## Test Summary

- 79 backend tests passing
- Frontend builds clean (TypeScript + Vite)
- Branch: phase-1-foundation-and-auth

## What's Built

| Phase | What | Tests |
|-------|------|-------|
| 1. Auth | OAuth flow, token refresh, health endpoint | 16 |
| 2. Data Pipeline | Activity/SyncState models, Strava client, sync orchestrator | 37 |
| 3. Core Dashboard | Summary/trends/activities API, React frontend, dark mode | 13 |
| 4. Activity Drill-Down | Splits, HR zones, detail view | 7 |
| 5. Gear & Trophies | Gear gallery, PRs, milestones, timeline | 6 |

## Session Continuity

Last session: 2026-02-28
Stopped at: Phase 5 committed. Phase 6 (Deployment) is next.
Resume: Plan and implement Phase 6 — deploy to cloud hosting with production OAuth.

## Key Decisions (recent)

- [04]: Activity detail proxied from Strava on demand (not cached) — single user, low volume
- [04]: HR zones fetched from Strava /activities/{id}/zones endpoint (not computed from streams)
- [05]: PRs computed from stored activity data with distance tolerance ranges
- [05]: Gear images use placeholder icon — external image API deferred
- [05]: Tab navigation (Dashboard | Gear | Trophies) in App.tsx
- [05]: Milestone model with CRUD endpoints for user-defined achievements
