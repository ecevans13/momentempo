# Requirements: StravaViz

**Defined:** 2026-02-27
**Core Value:** See the story your training data tells — trends, progress, and projections — in one beautiful, personal dashboard.

## v1 Requirements — Complete

All v1 requirements are implemented. Marked for reference.

### Data Infrastructure
- [x] **DATA-01**: App authenticates with Strava via OAuth and persists tokens to SQLite
- [x] **DATA-02**: App silently refreshes expired access tokens using stored refresh token
- [x] **DATA-03**: App performs full-history backfill of all activities on first use (paginated, rate-limit-aware)
- [x] **DATA-04**: App caches activity data in SQLite with incremental sync (only fetch new activities)
- [x] **DATA-05**: App enforces Strava rate limits (100/15min, 1000/day) with TTL-gated sync

### Dashboard
- [x] **DASH-01**: User sees key metrics summary (distance, runs, duration) by week, month, and year
- [x] **DASH-02**: User sees long-term trend charts for distance and pace (weekly/monthly)
- [x] **DASH-03**: User can select time range from weekly to multi-year for trend views
- [x] **DASH-04**: User sees a scrollable feed of recent activities with key stats
- [x] **DASH-05**: User sees training week heatmap (calendar density view) *(shipped in v1)*

### Activity Drill-Down
- [x] **DRLL-01**: User can click an activity to see per-mile/km splits with pace and HR
- [x] **DRLL-02**: User sees HR zone breakdown chart showing time in each zone for an activity

### Gear Gallery
- [x] **GEAR-01**: User sees gear cards showing brand, model, and total distance for each piece of gear
- [x] **GEAR-02**: App auto-fetches product images based on gear names (with placeholder fallback)

### Trophy Case
- [x] **TRPH-01**: User sees Strava PRs for standard distances (1mi, 5K, 10K, half marathon, marathon)
- [x] **TRPH-02**: User can define custom milestones (e.g., "first 50-mile week", "100 runs this year")
- [x] **TRPH-03**: User sees achievement timeline showing when PRs and milestones were earned

### UI/UX
- [x] **UIUX-01**: App uses dark mode by default
- [x] **UIUX-02**: User can toggle between dark and light mode
- [x] **UIUX-03**: App is responsive across desktop and mobile browsers
- [x] **UIUX-04**: App is deployed via Docker (local + cloud-ready)

## v2.0 Requirements — Enhanced Features

Current milestone. 8 requirements across 4 categories.

### GPS Streams Infrastructure
- [x] **STRM-01**: App lazily fetches GPS stream data (coordinates, altitude, HR, velocity) from Strava on first activity detail open and caches in SQLite; subsequent opens use the cache without calling Strava

### Activity Drill-Down (Enhanced)
- [x] **DRLL-03**: User sees route map colored by pace on activities with GPS data (faster segments green, slower segments red, scale normalized per activity)
- [x] **DRLL-04**: User sees smooth GPS altitude-based elevation profile on activities with altitude data (replaces splits-based approximation)

### Dashboard (Enhanced)
- [x] **DASH-06**: User sees a best efforts progression timeline showing personal best times per standard distance (1mi, 5K, 10K, half marathon, marathon) over time — only rendered for distances with ≥2 recorded efforts

### Workout Projector
- [ ] **PROJ-01**: User can input a structured training plan (weekly distance, intensity level, number of weeks)
- [ ] **PROJ-02**: User sees projected CTL/ATL/TSB fitness curve extending from current fitness level based on the plan
- [ ] **PROJ-03**: User sees estimated VDOT range at end of the plan period (conditional on sufficient HR data being available)
- [ ] **PROJ-04**: Projected values are shown with dashed lines, ±10% uncertainty band, and an explicit estimation disclaimer

## Future Requirements (v3+)

Deferred beyond v2.

### Multi-User
- **AUTH-01**: Any Strava user can log in via OAuth and see their own dashboard

### Trophy Case (Enhanced)
- **TRPH-04**: User sees segment achievements (starred/PR segments from Strava)

### Activity Drill-Down (v3)
- **DRLL-05**: User sees pace overlay vs HR overlay toggle on route map

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time activity tracking | Strava handles recording; this app handles analysis |
| Mobile native app | Web-first, responsive design covers mobile access |
| Social features | Personal dashboard, not a social platform |
| Cycling/swimming analytics | Running and strength focus for v1/v2 |
| Cadence analysis | Device-dependent; not all devices record cadence |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 2 | Complete |
| DATA-04 | Phase 2 | Complete |
| DATA-05 | Phase 2 | Complete |
| DASH-01 | Phase 3 | Complete |
| DASH-02 | Phase 3 | Complete |
| DASH-03 | Phase 3 | Complete |
| DASH-04 | Phase 3 | Complete |
| DASH-05 | Phase 3 | Complete |
| DRLL-01 | Phase 4 | Complete |
| DRLL-02 | Phase 4 | Complete |
| GEAR-01 | Phase 5 | Complete |
| GEAR-02 | Phase 5 | Complete |
| TRPH-01 | Phase 5 | Complete |
| TRPH-02 | Phase 5 | Complete |
| TRPH-03 | Phase 5 | Complete |
| UIUX-01 | Phase 3 | Complete |
| UIUX-02 | Phase 3 | Complete |
| UIUX-03 | Phase 3 | Complete |
| UIUX-04 | Phase 6 | Complete |
| STRM-01 | Phase 7 | Complete |
| DRLL-03 | Phase 8 | Complete |
| DRLL-04 | Phase 8 | Complete |
| DASH-06 | Phase 9 | Complete |
| PROJ-01 | Phase 10 | Pending |
| PROJ-02 | Phase 10 | Pending |
| PROJ-03 | Phase 10 | Pending |
| PROJ-04 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 21 total — all complete
- v2 requirements: 8 total — 0 complete, 8 pending
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-03-04 — v2.0 milestone requirements added, v1 marked complete*
