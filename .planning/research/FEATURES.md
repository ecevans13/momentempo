# Feature Research — v2.0 Enhanced Features

**Domain:** Fitness dashboard — GPS stream visualization, best efforts progression, training projector
**Researched:** 2026-03-04
**Confidence:** HIGH

## Existing v1 Feature Inventory (Already Built)

These are fully implemented and NOT in scope for v2:
- Training heatmap (GitHub-style, 52-week, day drilldown) ✓
- CTL/ATL/TSB Fitness & Freshness chart ✓
- Race Predictor (VDOT-based predictions with confidence levels) ✓
- Route Replay (animated Leaflet map with playback controls) ✓
- Elevation Profile (from splits cumulative data) ✓
- Activity drill-down (splits, HR zones, pace decay, HR drift) ✓

## Feature Landscape — v2 Scope

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Pace/HR colored polyline on route map | Garmin Connect, Strava itself show this | MEDIUM | Requires Streams API fetch + segment coloring |
| GPS-accurate elevation profile | Splits-based elevation is approximated and step-shaped; GPS altitude is smooth and accurate | MEDIUM | Replace/augment existing ElevationProfile with streams altitude data |
| Best efforts progression timeline | "Am I getting faster?" is the #1 training question; showing PRs as snapshots misses the trend | MEDIUM | Query best effort history over time, plot as multi-line chart |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Workout Projector — CTL/ATL trajectory | "What happens to my fitness if I train X way for 8 weeks?" — No other free tool does this clearly | HIGH | Extend existing CTL/ATL model forward; requires plan input UI |
| Pace overlay + HR overlay toggle | Let user switch between pace coloring and HR coloring on same map | LOW | Trivial once streams data is available; toggle button |
| Projector "taper week" detection | Automatically highlights when TSB peaks for race readiness | MEDIUM | Add to projector output once base projection works |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time stream during replay | "Show HR/pace live during route replay animation" | Complexity explosion — must sync animation clock with stream index; stream resolution varies | Show static colored route (full overlay), keep replay as separate plain animation |
| VO2 max trend chart | Seems analytical and impressive | Strava VO2 max is subscription+device gated; absent for many users; value decreases if field is missing for half your history | Use VDOT (already computed from best efforts) as proxy — it's more reliable and already implemented |
| Segment-by-segment pace targets | "Tell me my target pace per split for my goal race" | Out of scope for projector — this is a coach feature, not a projection tool | The projector shows CTL/VDOT trajectory; specific segment pace is too granular for v2 |

## Feature Dependencies

```
Strava Streams API (backend cache)
    ├──enables──> Pace/HR polyline overlay
    ├──enables──> GPS elevation profile (accurate)
    └──enables──> (future) cadence, power overlays

Best efforts history query (backend)
    └──enables──> Best efforts progression timeline (frontend)

Existing CTL/ATL/TSB model (already built)
    └──extends──> Workout Projector (project forward from today)
```

### Dependency Notes

- **Streams must be cached before overlay renders:** First load fetches from Strava, subsequent loads hit SQLite. Never fetch streams on every page load.
- **Best efforts history is independent of streams:** Uses existing `BestEffort` model / activity data already in DB.
- **Workout Projector builds on existing fitness model:** The CTL/ATL/TSB daily values are already computed. Projector just extends the curve forward.

## MVP Definition for v2

### Ship With (v2.0)

- [ ] Strava Streams backend endpoint + SQLite caching — enables everything else
- [ ] Pace/HR colored polyline overlay on route map — high-visibility improvement to existing map
- [ ] GPS elevation profile (altitude stream) — replaces approximate splits-based version
- [ ] Best efforts progression timeline — shows "am I getting faster" trend
- [ ] Workout Projector — plan input UI + projected CTL/ATL/TSB chart

### Defer (v2.1+)

- [ ] Pace overlay vs HR overlay toggle — trivial to add after overlay is built
- [ ] Taper detection in projector — add after core projector is working
- [ ] Cadence, power stream overlays — not all users have this data

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Streams backend + cache | HIGH (unblocks 2 features) | MEDIUM | P1 |
| Pace/HR polyline overlay | HIGH | LOW (once streams exist) | P1 |
| GPS elevation profile | MEDIUM | LOW (once streams exist) | P1 |
| Best efforts progression timeline | HIGH | MEDIUM | P1 |
| Workout Projector | HIGH | HIGH | P2 |
| Pace vs HR toggle | LOW | LOW | P3 |

## Sources

- Strava API docs — streams endpoint, available keys
- Garmin Connect, Strava app — comparable features establishing user expectations
- TrainingPeaks PMC — CTL/ATL model used as projector basis
- Existing StravaViz v1 codebase — confirmed what's already built

---
*Feature research for: StravaViz v2.0*
*Researched: 2026-03-04*
