# Roadmap: StravaViz

## Overview

StravaViz is built in strict dependency order: auth unblocks data, data unblocks the API, the API unblocks the UI, and the UI is layered from core dashboard through differentiation features to deployment. Phases 1 and 2 are infrastructure with nothing visible to the user — that is expected. The first observable product arrives in Phase 3. Phases 4 and 5 build the features that make the dashboard compelling beyond basic metrics. Phase 6 ships it.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation and Auth** - Project scaffold, Strava OAuth, and token management
- [ ] **Phase 2: Data Pipeline** - Full-history backfill, incremental sync, and rate-limit enforcement
- [ ] **Phase 3: Core Dashboard** - Backend API, frontend scaffold, key metrics, trends, and activity feed
- [ ] **Phase 4: Activity Drill-Down** - Per-activity splits, HR charts, and zone breakdown
- [ ] **Phase 5: Gear Gallery and Trophy Case** - Gear cards with auto-fetched images, PRs, milestones, and achievement timeline
- [ ] **Phase 6: Deployment** - Production deploy to cloud hosting

## Phase Details

### Phase 1: Foundation and Auth
**Goal**: The app connects to Strava, completes the OAuth flow, and persists tokens so every subsequent phase can make authenticated API calls without re-authorizing.
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02
**Success Criteria** (what must be TRUE):
  1. Running the app for the first time opens the Strava OAuth consent screen in the browser
  2. After authorizing on Strava, the app stores the access token, refresh token, and expiry in SQLite
  3. On a subsequent start, the app uses the stored token without prompting for OAuth again
  4. When the access token is expired, the app silently refreshes it and continues without user intervention
  5. A health check endpoint (`/api/health`) returns a valid response, confirming the backend is running
**Plans**: TBD

### Phase 2: Data Pipeline
**Goal**: All historical activity data is fetched from Strava and cached locally, with an incremental sync that respects rate limits so the app never hammers the API.
**Depends on**: Phase 1
**Requirements**: DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. On first use, the app performs a full paginated backfill of all Strava activities and stores them in SQLite
  2. On subsequent sync, only activities newer than the last-seen activity are fetched
  3. A sync operation will not start again if a sync completed less than 15 minutes ago (TTL gate)
  4. The app never exceeds 100 API requests per 15 minutes or 1000 per day (rate limit enforcement is observable via logs/headers)
  5. All activity data is queryable from SQLite after sync, including raw fields and sport type
**Plans**: TBD

### Phase 3: Core Dashboard
**Goal**: The user can open the app and see a fully functional, dark-mode-first dashboard with key fitness metrics, long-term trend charts, a time-range selector, and a scrollable activity feed — all backed by a clean FastAPI backend and a React frontend.
**Depends on**: Phase 2
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, UIUX-01, UIUX-02, UIUX-03
**Success Criteria** (what must be TRUE):
  1. User sees key metrics (total distance, run count, total duration) summarized by week, month, and year
  2. User sees long-term trend charts for distance and pace with weekly and monthly granularity
  3. User can select a time range (weekly through multi-year) and the dashboard updates accordingly
  4. User sees a scrollable feed of recent activities with key stats for each
  5. The app opens in dark mode by default, and the user can switch to light mode and back with a toggle
  6. The app renders correctly and is usable on both desktop and mobile browsers
**Plans**: TBD

### Phase 4: Activity Drill-Down
**Goal**: The user can tap into any activity and see granular detail — splits broken down by mile or kilometer, pace and heart rate charts, and a heart rate zone breakdown — making individual workouts explorable.
**Depends on**: Phase 3
**Requirements**: DRLL-01, DRLL-02
**Success Criteria** (what must be TRUE):
  1. Clicking an activity in the feed opens a detail view for that activity
  2. The detail view shows per-mile (or per-km) splits with pace and heart rate for each split
  3. The detail view shows a heart rate zone breakdown chart displaying time spent in each zone
  4. Strength training activities open a detail view without crashing (graceful handling of missing pace/HR fields)
**Plans**: TBD

### Phase 5: Gear Gallery and Trophy Case
**Goal**: The user can see their gear with auto-fetched product images and stats, and celebrate achievements through a trophy case that combines Strava PRs, custom user-defined milestones, and an achievement timeline.
**Depends on**: Phase 3
**Requirements**: GEAR-01, GEAR-02, TRPH-01, TRPH-02, TRPH-03
**Success Criteria** (what must be TRUE):
  1. User sees a gear gallery with a card for each piece of gear showing brand, model, and total distance
  2. Each gear card displays an auto-fetched product image, or a placeholder when no image is found
  3. User sees PRs for standard distances (1 mi, 5K, 10K, half marathon, marathon) pulled from Strava data
  4. User can define a custom milestone (e.g., "first 50-mile week") and see it appear in the trophy case
  5. User sees an achievement timeline showing when each PR and custom milestone was earned
**Plans**: TBD

### Phase 6: Deployment
**Goal**: The app is deployed to cloud hosting and accessible from any browser, with production OAuth credentials configured so the Strava flow works outside localhost.
**Depends on**: Phase 5
**Requirements**: UIUX-04
**Success Criteria** (what must be TRUE):
  1. The app is accessible at a public URL from a browser that has never run it locally
  2. The Strava OAuth flow completes successfully in the production environment (not just localhost)
  3. All dashboard features (metrics, trends, drill-down, gear, trophy case) work correctly in production
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and Auth | 0/TBD | Not started | - |
| 2. Data Pipeline | 0/TBD | Not started | - |
| 3. Core Dashboard | 0/TBD | Not started | - |
| 4. Activity Drill-Down | 0/TBD | Not started | - |
| 5. Gear Gallery and Trophy Case | 0/TBD | Not started | - |
| 6. Deployment | 0/TBD | Not started | - |
