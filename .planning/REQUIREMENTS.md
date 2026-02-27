# Requirements: StravaViz

**Defined:** 2026-02-27
**Core Value:** See the story your training data tells — trends, progress, and projections — in one beautiful, personal dashboard.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Data Infrastructure

- [x] **DATA-01**: App authenticates with Strava via OAuth and persists tokens to SQLite
- [x] **DATA-02**: App silently refreshes expired access tokens using stored refresh token
- [ ] **DATA-03**: App performs full-history backfill of all activities on first use (paginated, rate-limit-aware)
- [ ] **DATA-04**: App caches activity data in SQLite with incremental sync (only fetch new activities)
- [ ] **DATA-05**: App enforces Strava rate limits (100/15min, 1000/day) with TTL-gated sync

### Dashboard

- [ ] **DASH-01**: User sees key metrics summary (distance, runs, duration) by week, month, and year
- [ ] **DASH-02**: User sees long-term trend charts for distance and pace (weekly/monthly)
- [ ] **DASH-03**: User can select time range from weekly to multi-year for trend views
- [ ] **DASH-04**: User sees a scrollable feed of recent activities with key stats

### Activity Drill-Down

- [ ] **DRLL-01**: User can click an activity to see per-mile/km splits with pace and HR
- [ ] **DRLL-02**: User sees HR zone breakdown chart showing time in each zone for an activity

### Gear Gallery

- [ ] **GEAR-01**: User sees gear cards showing brand, model, and total distance for each piece of gear
- [ ] **GEAR-02**: App auto-fetches product images based on gear names (with placeholder fallback)

### Trophy Case

- [ ] **TRPH-01**: User sees Strava PRs for standard distances (1mi, 5K, 10K, half marathon, marathon)
- [ ] **TRPH-02**: User can define custom milestones (e.g., "first 50-mile week", "100 runs this year")
- [ ] **TRPH-03**: User sees achievement timeline showing when PRs and milestones were earned

### UI/UX

- [ ] **UIUX-01**: App uses dark mode by default
- [ ] **UIUX-02**: User can toggle between dark and light mode
- [ ] **UIUX-03**: App is responsive across desktop and mobile browsers
- [ ] **UIUX-04**: App is deployed to cloud hosting accessible from anywhere

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Workout Projector

- **PROJ-01**: User can input a specific training plan (e.g., "2 tempo + 1 long run/week for 8 weeks")
- **PROJ-02**: User sees projected impact on pace and HR zones based on training plan
- **PROJ-03**: User sees projected VO2 max changes (if data available from Strava)
- **PROJ-04**: Projections are framed as estimates with confidence intervals

### Activity Drill-Down (Enhanced)

- **DRLL-03**: User sees route map with pace/HR color overlay
- **DRLL-04**: User sees elevation profile along the route

### Dashboard (Enhanced)

- **DASH-05**: User sees training week heatmap (calendar density view)
- **DASH-06**: User sees best efforts timeline for standard distances

### Trophy Case (Enhanced)

- **TRPH-04**: User sees segment achievements (starred/PR segments from Strava)

### Multi-User

- **AUTH-01**: Any Strava user can log in via OAuth and see their own dashboard

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time activity tracking | Strava handles recording; this app handles analysis |
| Mobile native app | Web-first, responsive design covers mobile access |
| Social features | Personal dashboard, not a social platform |
| Cycling/swimming analytics | Running and strength focus for v1 |
| ATL/CTL training load modeling | High complexity, niche audience — v2+ consideration |
| Cadence analysis | Device-dependent, not all devices record cadence |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 2 | Pending |
| DATA-04 | Phase 2 | Pending |
| DATA-05 | Phase 2 | Pending |
| DASH-01 | Phase 3 | Pending |
| DASH-02 | Phase 3 | Pending |
| DASH-03 | Phase 3 | Pending |
| DASH-04 | Phase 3 | Pending |
| DRLL-01 | Phase 4 | Pending |
| DRLL-02 | Phase 4 | Pending |
| GEAR-01 | Phase 5 | Pending |
| GEAR-02 | Phase 5 | Pending |
| TRPH-01 | Phase 5 | Pending |
| TRPH-02 | Phase 5 | Pending |
| TRPH-03 | Phase 5 | Pending |
| UIUX-01 | Phase 3 | Pending |
| UIUX-02 | Phase 3 | Pending |
| UIUX-03 | Phase 3 | Pending |
| UIUX-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after roadmap creation — all 20 requirements mapped*
