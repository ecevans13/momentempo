# Project Research Summary — v2.0 Enhanced Features

**Project:** StravaViz — Personal Strava Dashboard
**Domain:** Adding GPS stream visualization, best efforts progression, and training projector to existing v1 app
**Researched:** 2026-03-04
**Confidence:** HIGH

## Executive Summary

Before scoping v2, a full audit of the existing v1 codebase was performed. The finding: training heatmap, CTL/ATL/TSB fitness chart, race predictor, route replay, and a splits-based elevation profile are all already fully built. The actual v2 gap is smaller and more focused than originally assumed from the requirements list.

The real new work for v2 falls into three distinct tracks: (1) Strava Streams API integration — a new backend layer that fetches GPS-level data and enables both the pace/HR overlay and an accurate elevation profile; (2) a best efforts progression timeline — a historical chart answering "am I getting faster?" using the existing BestEffort data already in SQLite; and (3) a workout projector — extending the existing CTL/ATL/TSB model forward in time from plan inputs. No new libraries are needed. The entire v2 scope fits on the existing stack.

The top risk is Strava API rate limits: stream fetches count against the same 1000 req/day budget as sync. Aggressive SQLite caching is mandatory — not optional. The second risk is UX: the workout projector must be clearly framed as estimation, not prediction.

## Key Findings

### Recommended Stack

No new dependencies required. All v2 features are buildable on the existing stack (react-leaflet 4.x, Recharts 2.x, FastAPI 0.115+, SQLModel, httpx). The colored polyline approach uses multiple react-leaflet `<Polyline>` elements — no additional map library needed.

**Core technologies (already installed, reused for v2):**
- react-leaflet 4.x: colored polyline segments for pace/HR overlay
- Recharts 2.x: GPS elevation profile, best efforts timeline
- FastAPI + httpx: new streams and projector endpoints
- SQLModel: ActivityStream cache table

### Expected Features

**Must have (table stakes for v2):**
- Pace/HR colored polyline — users expect this from Strava and Garmin Connect
- GPS-accurate elevation profile — splits-based version is noticeably step-shaped and approximate
- Best efforts progression timeline — "am I getting faster?" is the core question

**Should have (differentiators):**
- Workout Projector (CTL/ATL forward projection) — no other free dashboard does this clearly

**Defer to v2.1+:**
- Pace vs HR overlay toggle (trivial once overlay exists)
- Taper week detection in projector

### Architecture Approach

Three additive changes to the existing architecture — no rewrites. (1) A new `ActivityStream` SQLite table + `/api/activities/{id}/streams` endpoint that lazily fetches and caches Strava GPS streams. (2) A new `/api/insights/best-efforts-history` endpoint querying the existing `BestEffort` table for monthly bests per standard distance. (3) A new `/api/projector/preview` POST endpoint that extends the existing CTL/ATL daily values forward using EWA math.

**New components:**
1. ActivityStream model + streams router — lazy Strava fetch, SQLite cache
2. PaceHROverlayMap — colored segments on existing Leaflet map
3. ElevationProfileGPS — smooth area chart from GPS altitude array
4. BestEffortsTimeline — multi-line progression chart
5. WorkoutProjector — plan input form + dashed projected CTL/ATL overlay

### Critical Pitfalls

1. **Fetching streams on every activity open** — cache in SQLite on first fetch; rate limit exhaustion is instant without this
2. **Streams absent for indoor/manual activities** — null-safe response for all keys; graceful degradation in frontend
3. **Pace color scale is monotone** — normalize color bounds per-activity (5th–95th percentile clip), not globally
4. **Best efforts timeline shows flat lines** — only render lines with ≥2 data points across ≥2 months
5. **Workout projector looks authoritative** — dashed projected lines, explicit uncertainty range, persistent disclaimer

## Implications for Roadmap

v2 continues phase numbering from v1 (which ended at Phase 6). Suggested phase structure:

### Phase 7: Strava Streams Backend
**Rationale:** Streams data is the dependency for both the pace/HR overlay and the GPS elevation profile. Must come first.
**Delivers:** ActivityStream model, `/api/activities/{id}/streams` endpoint with SQLite cache, null-safe handling, moving average smoothing on altitude
**Avoids:** Pitfalls 1, 2, 6, 7

### Phase 8: Pace/HR Overlay + GPS Elevation
**Rationale:** Both features consume the same streams data — natural to build together. Minimal scope per feature once streams exist.
**Delivers:** PaceHROverlayMap (colored polyline, per-activity normalized scale), ElevationProfileGPS (smooth altitude area chart), integrated into ActivityDetail
**Avoids:** Pitfall 3

### Phase 9: Best Efforts Progression Timeline
**Rationale:** Independent of streams; uses existing BestEffort data. Self-contained backend query + frontend chart.
**Delivers:** `/api/insights/best-efforts-history` endpoint, BestEffortsTimeline multi-line chart in InsightsView
**Avoids:** Pitfall 4

### Phase 10: Workout Projector
**Rationale:** Most complex feature; builds on existing CTL/ATL model. Last because it requires stable historical data and the fitness chart foundation.
**Delivers:** `/api/projector/preview` POST endpoint, WorkoutProjector component with structured plan input, dashed projected CTL/ATL/TSB chart overlay, uncertainty framing
**Avoids:** Pitfall 5

### Phase Ordering Rationale
- Phase 7 is a hard dependency for Phase 8 — streams must be cached before overlay can render
- Phase 9 is independent and can be executed in parallel with Phase 8 if desired, but sequential is simpler
- Phase 10 is last because the projector's value is proportional to having rich historical fitness data; also highest implementation complexity

### Research Flags

Phases with standard patterns (no additional research needed):
- **Phase 7:** Strava streams endpoint is stable and well-documented
- **Phase 8:** react-leaflet Polyline approach is established; color interpolation is straightforward
- **Phase 9:** SQL query + Recharts LineChart — well-documented patterns
- **Phase 10:** CTL/ATL math is well-defined; projector extends existing implementation

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new libraries; all existing, verified |
| Features | HIGH | Codebase audit confirmed what's built; streams API well-documented |
| Architecture | HIGH | Additive changes only; integration points are clear |
| Pitfalls | HIGH | Rate limit and null-safety issues are well-understood |

**Overall confidence:** HIGH

### Gaps to Address

- **BestEffort table schema:** Confirm `start_date` is stored on BestEffort rows (needed for history query) — check during Phase 9 planning
- **CTL/ATL last computed date:** Projector needs to pick up from the last day with data — confirm the insights service exposes this

## Sources

### Primary (HIGH confidence)
- StravaViz v1 codebase — direct source read, confirmed all existing features
- Strava API v3 docs — streams endpoint keys, `key_by_type` parameter, rate limits
- react-leaflet docs — Polyline component
- Training Peaks PMC methodology — CTL/ATL EWA formula (42-day, 7-day constants)

### Secondary (MEDIUM confidence)
- Recharts docs — LineChart multi-series, YAxis reversed prop
- GPS altitude noise characteristics — ±5-10m typical consumer device accuracy

---
*Research completed: 2026-03-04*
*Ready for roadmap: yes*
