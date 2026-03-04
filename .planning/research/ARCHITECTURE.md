# Architecture Research — v2.0 Enhanced Features

**Domain:** Adding GPS streams, best efforts history, and training projector to existing StravaViz
**Researched:** 2026-03-04
**Confidence:** HIGH

## Existing Architecture (v1)

```
┌────────────────────────────────────────────────────────────┐
│  React SPA (TypeScript + Vite)                              │
│  ActivityDetail → RouteReplayMap (Leaflet)                  │
│  ActivityDetail → ElevationProfile (Recharts, splits-based) │
│  InsightsView → FitnessChart (CTL/ATL/TSB)                  │
│  InsightsView → RacePredictor (VDOT + race predictions)     │
│  InsightsView → TrainingHeatmap (52-week grid)              │
├────────────────────────────────────────────────────────────┤
│  FastAPI Backend                                            │
│  /api/activities/{id}     → activity_detail router          │
│  /api/activities/{id}/zones → activity_detail router        │
│  /api/insights/fitness    → insights router (CTL/ATL)       │
│  /api/insights/race-predictions → insights router (VDOT)   │
│  /api/insights/heatmap    → insights router                 │
├────────────────────────────────────────────────────────────┤
│  SQLite (via SQLModel)                                      │
│  Activity, Split, BestEffort, SyncState, TokenData, Gear   │
└────────────────────────────────────────────────────────────┘
```

## v2 Architecture Changes

### New: ActivityStream model + streams endpoint

```
SQLite
  └── ActivityStream (new table)
        activity_id  INTEGER FK
        stream_data  TEXT (JSON blob: {latlng, altitude, heartrate, velocity_smooth})
        fetched_at   DATETIME

FastAPI
  └── /api/activities/{id}/streams  (new endpoint)
        1. Check SQLite cache → return if exists
        2. Fetch from Strava GET /activities/{id}/streams
        3. Persist to ActivityStream table
        4. Return to frontend

Frontend
  └── ActivityDetail
        ├── PaceHROverlayMap (new component, replaces plain RouteReplayMap for overlay)
        │     Receives: latlng[], values[], overlay_type (pace|hr)
        │     Renders: N colored <Polyline> segments via react-leaflet
        └── ElevationProfileGPS (enhanced component)
              Receives: latlng[], altitude[]
              Renders: smooth area chart using GPS altitude (not splits)
```

### New: Best Efforts Progression Timeline

```
SQLite
  └── BestEffort (existing table, already populated)
        activity_id, distance_meters, elapsed_time, start_date

FastAPI
  └── /api/insights/best-efforts-history  (new endpoint)
        Query: for each standard distance, find best effort per month
        Return: { distance_name, history: [{month, best_seconds}] }

Frontend
  └── InsightsView
        └── BestEffortsTimeline (new component)
              Renders: multi-line Recharts LineChart
              X-axis: date (monthly), Y-axis: time (inverted — faster = higher)
              One line per standard distance (1mi, 5K, 10K, half, marathon)
              Only show lines where user has ≥2 data points
```

### New: Workout Projector

```
FastAPI
  └── /api/projector/preview  (new POST endpoint)
        Input: { weeks: number, weekly_km: number, intensity: "easy"|"moderate"|"hard" }
        Logic:
          1. Fetch current CTL/ATL from last computed day
          2. Convert plan to estimated daily TSS (km × intensity_factor)
          3. Run CTL/ATL EWA forward N×7 days
          4. Return: { historical: [...], projected: [{date, ctl, atl, tsb}] }

Frontend
  └── InsightsView
        └── WorkoutProjector (new component)
              Input form: weeks (4/8/12/16), weekly distance, intensity level
              Chart: extends FitnessChart with projected curve overlay
              Visual distinction: dashed lines for projected, solid for historical
              Framing: "Estimated projection, not a guarantee"
```

## Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| ActivityStream (model) | Cache GPS stream data per activity | SQLModel table, JSON text column |
| streams router (backend) | Fetch/cache/serve streams | FastAPI router with lazy Strava fetch |
| PaceHROverlayMap | Render colored polyline segments | react-leaflet Polyline array |
| ElevationProfileGPS | GPS-accurate elevation area chart | Recharts AreaChart with altitude[] data |
| BestEffortsTimeline | PR progression over time | Recharts LineChart, multi-series |
| WorkoutProjector | Plan input + CTL/ATL projection | Form + extended FitnessChart |

## Recommended Project Structure Changes

```
backend/app/
├── models.py          # Add ActivityStream model
├── routers/
│   ├── activity_detail.py   # Add /streams endpoint
│   ├── insights.py          # Add /best-efforts-history endpoint
│   └── projector.py         # New file: workout projector endpoint
└── services/
    └── strava_client.py     # Add fetch_activity_streams() method

frontend/src/
├── components/
│   ├── PaceHROverlayMap.tsx      # New: colored polyline map
│   ├── ElevationProfileGPS.tsx   # New (or replace ElevationProfile.tsx)
│   ├── BestEffortsTimeline.tsx   # New
│   └── WorkoutProjector.tsx      # New
├── api/
│   ├── client.ts      # Add fetchActivityStreams(), fetchBestEffortsHistory(), postProjection()
│   └── types.ts       # Add ActivityStreams, BestEffortsHistory, ProjectionResult types
└── views/
    └── InsightsView.tsx    # Add BestEffortsTimeline, WorkoutProjector sections
```

## Data Flow

### Streams flow (lazy, cached)
```
User opens ActivityDetail
    ↓
ActivityDetail mounts → calls fetchActivityStreams(id)
    ↓
Backend: check ActivityStream table → if cached, return
    ↓ (cache miss)
Backend: GET /activities/{id}/streams from Strava → store in SQLite
    ↓
Frontend receives streams → passes latlng+values to PaceHROverlayMap
    ↓
PaceHROverlayMap: compute color per segment → render N Polyline elements
```

### Projector flow
```
User fills WorkoutProjector form → submits
    ↓
POST /api/projector/preview {weeks, weekly_km, intensity}
    ↓
Backend: fetch last CTL/ATL value from insights service
    ↓
Backend: project forward N weeks using EWA formula
    ↓
Return combined historical + projected arrays
    ↓
Frontend: render FitnessChart extended with dashed projected lines
```

## Architectural Patterns

### Pattern 1: Lazy stream fetch with SQLite cache

**What:** Fetch Strava streams only on first detail view; cache in SQLite; serve from cache on repeat
**When to use:** Any Strava data that is expensive to fetch but rarely changes
**Trade-offs:** Slight latency on first open per activity; subsequent opens are instant

### Pattern 2: Colored polyline via N Polyline elements

**What:** Divide GPS track into N segments; assign color based on pace/HR value at each segment
**When to use:** Pace or HR overlay on Leaflet map
**Trade-offs:** 50-200 DOM elements per map; acceptable for a single activity view (not a list)

**Example:**
```typescript
const segments = buildColoredSegments(latlng, values, colorScale);
return segments.map((seg, i) => (
  <Polyline key={i} positions={seg.positions} color={seg.color} weight={4} opacity={0.85} />
));
```

### Pattern 3: Extend existing chart rather than replace

**What:** WorkoutProjector reuses FitnessChart's Recharts setup; adds dashed projected series
**When to use:** When a new feature is a logical extension of an existing visualization
**Trade-offs:** Tighter coupling between Projector and FitnessChart; easier to maintain visual consistency

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Strava Streams API | httpx GET in strava_client.py, lazy + cached | Same auth pattern as existing API calls; count against rate limits |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| ActivityDetail ↔ streams endpoint | REST GET | Cache miss triggers Strava fetch |
| WorkoutProjector ↔ projector endpoint | REST POST | Stateless: each projection request is self-contained |
| BestEffortsTimeline ↔ insights endpoint | REST GET | Read-only query on existing BestEffort data |

## Sources

- Existing StravaViz v1 codebase — component structure confirmed by reading source
- Strava API docs — streams endpoint shape, rate limits
- react-leaflet Polyline API — positions, color, weight props
- Training Peaks PMC — CTL/ATL EWA formula

---
*Architecture research for: StravaViz v2.0*
*Researched: 2026-03-04*
