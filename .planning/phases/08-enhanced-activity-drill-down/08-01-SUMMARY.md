---
phase: 08-enhanced-activity-drill-down
plan: 01
subsystem: frontend
tags: [leaflet, gps, pace-map, elevation, activity-detail]
dependency_graph:
  requires: [07-02]
  provides: [pace-colored-route-map, gps-elevation-profile, activity-streams-fetch]
  affects: [frontend/src/components/ActivityDetail.tsx, frontend/src/components/ElevationProfile.tsx]
tech_stack:
  added: []
  patterns: [lazy-loaded-leaflet, parallel-downsample, pace-color-lerp, streams-fallback]
key_files:
  created:
    - frontend/src/utils/downsample.ts
    - frontend/src/components/PaceMap.tsx
    - frontend/src/components/PaceMapLeaflet.tsx
  modified:
    - frontend/src/api/types.ts
    - frontend/src/api/client.ts
    - frontend/src/components/RouteThumb.tsx
    - frontend/src/components/ElevationProfile.tsx
    - frontend/src/components/ActivityDetail.tsx
decisions:
  - "PaceMapLeaflet uses downsampleParallel to keep latlng and velocity arrays aligned at 300 points"
  - "lerpColor does linear RGB interpolation between red (slow) and green (fast)"
  - "ElevationProfile GPS branch uses distance on XAxis (km); splits fallback unchanged"
  - "ActivityDetail fetches streams with .catch(() => null) so GPS failures are silent"
  - "PaceMap shown when has_gps; RouteReplay shown as fallback when summary_polyline exists"
metrics:
  duration_minutes: 15
  completed_date: "2026-03-13"
  tasks_completed: 2
  files_changed: 8
---

# Phase 08 Plan 01: Pace Map and GPS Elevation Profile Summary

Lazy-loaded Leaflet PaceMap with red-to-green pace-colored polyline segments and GPS-based ElevationProfile with splits fallback, wired into ActivityDetail via streams endpoint.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | API types, shared downsample utility, PaceMap components | 1d51d61 | types.ts, client.ts, downsample.ts, PaceMap.tsx, PaceMapLeaflet.tsx, RouteThumb.tsx |
| 2 | ElevationProfile GPS branch + ActivityDetail streams wiring | 5a52b6c | ElevationProfile.tsx, ActivityDetail.tsx |

## What Was Built

### StreamsResponse type and fetchActivityStreams
Added `StreamsResponse` interface to `api/types.ts` and `fetchActivityStreams()` to `api/client.ts`, matching the Phase 7 endpoint response shape exactly.

### Shared downsample utility
Created `frontend/src/utils/downsample.ts` exporting:
- `downsample(points, target)` — step-based sampling for single arrays
- `downsampleParallel(arrays, target)` — samples multiple parallel arrays in sync (critical for keeping latlng/velocity aligned)

Updated `RouteThumb.tsx` to import from the shared utility, removing its inline copy.

### PaceMap components
`PaceMap.tsx` is a lazy-load wrapper following the RouteReplay pattern exactly. `PaceMapLeaflet.tsx`:
- Downsamples latlng + velocity to 300 points in parallel
- Builds per-segment polylines with `lerpColor(t)` coloring (t=0: red, t=1: green)
- Speed range computed from non-zero velocity values to avoid padding distortion
- Includes `FitBounds` helper and dark/light tile switching
- Shows pace legend (gradient bar with Slower/Faster labels) below map

### ElevationProfile GPS branch
When `gpsAltitude` and `gpsDistance` are both present and have >1 point:
- Downsamples to 500 points via `downsampleParallel`
- Converts distance from meters to km for XAxis ticks
- Renders absolute altitude vs distance (not cumulative splits)
When GPS data absent: falls back to existing splits-based cumulative elevation (unchanged).

### ActivityDetail streams wiring
- Fetches streams in `Promise.all` alongside detail and zones, with `.catch(() => null)` fallback
- Renders `<PaceMap>` when `streams?.has_gps && streams.latlng && streams.velocity_smooth`
- Falls back to `<RouteReplay>` when GPS unavailable but `summary_polyline` exists
- Passes `gpsAltitude={streams?.altitude}` and `gpsDistance={streams?.distance}` to ElevationProfile always
- Section order: Header > Stats > Route > Splits > HR Zones > Pace & HR Drift > Elevation

## Verification

- TypeScript: `npx tsc --noEmit` — clean (no output)
- Production build: `npx vite build` — succeeded, PaceMapLeaflet split into separate chunk (1.82 kB)
- Backend: 127 tests passing (no backend changes)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files verified present:
- frontend/src/utils/downsample.ts — FOUND
- frontend/src/components/PaceMap.tsx — FOUND
- frontend/src/components/PaceMapLeaflet.tsx — FOUND
- frontend/src/components/ElevationProfile.tsx — FOUND (updated)
- frontend/src/components/ActivityDetail.tsx — FOUND (updated)

Commits verified:
- 1d51d61 — Task 1 commit FOUND
- 5a52b6c — Task 2 commit FOUND
