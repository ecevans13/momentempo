# Stack Research — v2.0 Enhanced Features

**Domain:** Fitness dashboard — Strava Streams API, pace/HR map overlay, training projector
**Researched:** 2026-03-04
**Confidence:** HIGH

## Context: What's Already Installed

The existing stack (react-leaflet 4.x, Leaflet 1.9.x, Recharts 2.x, FastAPI 0.115+, SQLModel, httpx) covers most of v2. No major library additions are needed.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| react-leaflet | 4.x (installed) | Pace/HR polyline overlay | Multiple `<Polyline>` segments per color bucket — no new library needed |
| Recharts | 2.x (installed) | Best efforts timeline, elevation profile from GPS | Already used everywhere; consistent look |
| FastAPI | 0.115+ (installed) | New `/streams` and `/projector` endpoints | Add alongside existing routers |
| httpx | 0.27+ (installed) | Strava Streams API fetch | Already used in strava_client.py |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new required) | — | — | All v2 features fit existing stack |

### Optional: numpy

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| numpy | ≥1.26 | Vectorized CTL/ATL projection math | Only worth adding if projector has performance issues; plain Python lists are fine for ≤52 weeks |

## Installation

```bash
# No new frontend packages needed
# No new backend packages needed for core features

# Optional — only if projector math is slow at scale:
cd backend && uv add numpy
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|------------------------|
| Multiple `<Polyline>` segments (react-leaflet) | Leaflet.hotline | hotline is unmaintained (last release 2018), no TypeScript types — DIY segments are safer |
| Multiple `<Polyline>` segments | MapLibre GL JS | Use MapLibre only if smooth gradient lines are required; requires swapping the entire map library |
| Plain Python CTL/ATL projection | scikit-learn | Overkill — CTL/ATL is just exponential weighted moving average with fixed constants (42-day, 7-day); no ML needed |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Leaflet.hotline | Unmaintained, no TS types, breaks with Leaflet 1.9 | N colored `<Polyline>` elements via react-leaflet |
| Mapbox GL JS | Requires API key + paid tier for production traffic | Stick with Leaflet (already installed, free) |
| D3 for color scale | Adds 80KB dependency for 5 lines of interpolation | Inline linear RGB interpolation function |
| Strava official SDK | No maintained JS/Python SDK from Strava | Use existing `strava_client.py` httpx pattern |

## Strava Streams API — Key Details

The streams endpoint is the core new dependency for v2:

```
GET /activities/{id}/streams?keys=latlng,altitude,heartrate,velocity_smooth&key_by_type=true
```

- Returns arrays of equal length: one value per GPS sample point
- `latlng`: array of [lat, lng] pairs — raw GPS track
- `altitude`: array of meters above sea level per point — replaces splits-based elevation
- `heartrate`: array of bpm per point (only present if activity has HR data)
- `velocity_smooth`: array of m/s per point — convert to pace for overlay
- Rate limit: 1 API call per activity detail load; cache aggressively in SQLite as JSON blob
- Stream data is large (50-500KB per activity) — store compressed or as JSON text, not parsed rows

## Workout Projector — Algorithm

CTL/ATL/TSB is already implemented. The projector extends it forward:

- **CTL** (Chronic Training Load / Fitness): 42-day EWA of daily TSS
- **ATL** (Acute Training Load / Fatigue): 7-day EWA of daily TSS  
- **TSB** (Training Stress Balance / Form): CTL − ATL
- **TSS estimate from plan input**: distance × pace-based intensity factor, or simpler: minutes × zone multiplier
- Projection: from today's CTL/ATL, run the EWA formula forward N days using plan-estimated daily TSS

No new libraries needed — the math is a simple loop.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| react-leaflet 4.x | React 18 | Already verified |
| Recharts 2.x | React 18 | Already verified |
| FastAPI 0.115 | Python 3.13 | Already verified |

## Sources

- Strava API v3 docs — GET /activities/{id}/streams, key types, rate limits
- react-leaflet docs — Polyline component props
- Training Peaks PMC methodology — CTL/ATL/TSB constants (42-day, 7-day EWA)

---
*Stack research for: StravaViz v2.0 — GPS stream visualization & training projector*
*Researched: 2026-03-04*
