# Feature Landscape

**Domain:** Personal Strava Fitness Dashboard (single-user, running + strength focus)
**Researched:** 2026-02-27
**Confidence note:** Web search and WebFetch tools were unavailable during this research session. All findings are based on training knowledge of the Strava API v3 (as of August 2025 cutoff), patterns from comparable open-source Strava dashboard projects, and the project's own PROJECT.md. Claims marked HIGH are well-established facts; LOW marks gaps requiring verification.

---

## Table Stakes

Features users expect from a personal fitness dashboard. Missing any of these makes the product feel broken or pointless.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Activity feed / list | First thing users check — "what have I done?" | Low | Paginated list with date, type, distance, duration; Strava `/athlete/activities` endpoint |
| Key metrics summary | Distance, time, elevation, runs this week/month/year | Low | Aggregations computed client-side from cached activity data |
| Long-term trend charts | "Am I improving?" — core reason to have a dashboard | Medium | Weekly/monthly distance, pace, HR over selectable time horizon |
| Activity detail view | Drill into any run — map, splits, stats | Medium-High | Requires separate `/activities/{id}` call with `include_all_efforts=true` |
| Route map display | Visual confirmation of where you ran | Medium | Strava polyline decoding + map tile rendering (Leaflet/Mapbox) |
| Pace and HR over time charts | Per-activity performance view | Medium | Stream data from `/activities/{id}/streams`; streams are separate API calls |
| Heart rate zone breakdown | Standard feature in any HR-enabled running app | Medium | Must compute zones client-side (Strava doesn't return them pre-binned) — needs user's max HR |
| Splits table | Per-mile/km breakdown | Low | Available in activity detail response |
| OAuth token management | App won't work without valid auth | Medium | Strava uses OAuth 2.0 with refresh tokens; tokens expire every 6 hours |
| Auto-sync on page load | Users expect data to be current | Low-Medium | Rate limit awareness required; cache strategy needed |
| Dark mode | Stated as requirement; also standard for modern data-heavy UIs | Low | CSS custom properties / Tailwind dark: variant |
| Responsive layout | Dashboard must be usable on phone | Low-Medium | Mobile-first CSS; map views need special handling on small screens |
| Empty state / loading state | First-time or slow-network experience | Low | Skeleton screens or spinners; not glamorous but users notice absence |

---

## Differentiators

Features that elevate this above a generic Strava clone. Not expected, but valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-year progression view | "See 3 years of training in one chart" — most apps only show 90 days | Medium | Data volume management; Strava paginates historical activities, initial backfill needed |
| Workout projector | "If I run 2 tempos + 1 long run for 8 weeks, what happens to my VO2 max?" | High | No Strava API endpoint for projections — must build model; VO2 max estimate from Garmin/Polar formulas or regression on existing data |
| Gear gallery with auto-fetched images | Visually appealing gear showcase without manual uploads | Medium | Strava `/gear/{id}` returns brand + model name; image fetching requires scraping or a third-party product image API (e.g., Google Custom Search) — verify approach carefully |
| Trophy case with custom milestones | Personal achievements beyond Strava's built-in PRs | Medium | Strava segment PRs and KOMs via `/athletes/{id}/koms`; custom milestones require local storage/DB |
| Segment achievement timeline | "When did I PR this segment? Show progression" | Medium | Strava `/segments/{id}/all_efforts` — requires segment ID lookup; rate-limit sensitive |
| VO2 max trend | Longitudinal fitness indicator | High | Strava exposes `suffer_score` and `fitness` (Relative Effort) but not raw VO2 max — must derive or use Garmin/device-side data if available. LOW confidence: verify availability |
| Training load / acute vs chronic | Fitness-fatigue modeling (ATL/CTL/TSB) | High | Must be computed from effort scores over rolling windows; standard in TrainingPeaks-style apps |
| Pace distribution histogram | "What paces do I actually run at?" | Low | Computed from stream data if cached; very insightful visualization |
| Elevation profile overlay | Visual route elevation chart on activity detail | Medium | From altitude stream; standard chart (Recharts area chart works well) |
| Cadence analysis | Running economy indicator | Low-Medium | Available in stream data if device records it; not all devices do |
| Best efforts timeline | PRs for standard distances (1mi, 5k, 10k, HM, M) | Medium | Strava `/athletes/{id}/stats` returns `best_efforts`; also in activity detail |
| Training week heatmap | Calendar-style activity density view | Low-Medium | GitHub contribution graph style; motivating and visually distinctive |

---

## Anti-Features

Features to explicitly NOT build — they add complexity without proportionate value for this project.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Multi-user / auth system | Doubles complexity, needs user DB, session management | Single user OAuth flow with stored tokens; add multi-user only if productizing |
| Real-time activity tracking / live updates | Strava doesn't push real-time GPS; WebSocket complexity for no v1 value | Auto-sync on page load is sufficient |
| Social feed / Kudos | This is a personal dashboard, not a social product | Show only your activities |
| Activity creation / editing | Strava's app does this better; write API scope is risky | Read-only Strava access |
| Cycling / swimming analytics | Scope creep; different metrics (power, SWOLF) need separate treatment | Clearly scope to running + strength in v1 |
| Native mobile app | Web-first responsive covers 90% of need; native is 10x the work | Responsive web design |
| Custom training plan builder (full) | Different product — TrainingPeaks territory | Workout projector with plan inputs covers the need |
| Strava webhook push sync | Adds server complexity (needs persistent process); overkill for personal use | Poll on page load; backfill historical data once |
| Premium / paywall | Personal tool — no monetization needed | — |
| Athlete comparison / leaderboards | Social feature creep | Personal focus only |
| Nutrition / sleep tracking | Out of scope; different data sources | Stay in Strava data lane |

---

## Strava API Capabilities and Limitations

Understanding what the API provides directly shapes what's feasible. (MEDIUM-HIGH confidence based on training knowledge; verify against current docs at developers.strava.com before implementation.)

### What the API Provides (HIGH confidence)

| Resource | Endpoint | Key Data | Notes |
|----------|----------|----------|-------|
| Authenticated athlete | `GET /athlete` | Profile, weight, FTP | Basic athlete info |
| Athlete stats | `GET /athletes/{id}/stats` | Totals, best efforts, recent/ytd/all-time | Pre-aggregated — fast |
| Activity list | `GET /athlete/activities` | Summary activity objects (no streams) | Paginated; 30 per page default, 200 max |
| Activity detail | `GET /activities/{id}` | Full activity with splits, best efforts, photos | One call per activity |
| Activity streams | `GET /activities/{id}/streams` | Time-series: time, latlng, altitude, HR, cadence, pace | Separate call; most valuable for charts |
| Gear | `GET /gear/{id}` | Brand, model, distance, weight | No images — brand + model name only |
| Segments | `GET /segments/{id}` | Segment metadata | Requires known segment ID |
| Segment efforts | `GET /segment_efforts` | Effort records for a segment | For PR tracking |
| Athlete KOMs | `GET /athletes/{id}/koms` | Segment efforts where athlete is KOM | Limited to KOMs, not all PRs |
| Starred segments | `GET /segments/starred` | Segments athlete has starred | Good for trophy case |

### Known Limitations (HIGH confidence)

| Limitation | Impact | Mitigation |
|------------|--------|-----------|
| Rate limit: 100 req/15 min, 1000 req/day | Can't fetch streams for all activities on first load | Backfill incrementally; cache aggressively |
| Tokens expire every 6 hours | App breaks silently without refresh logic | Implement automatic token refresh via refresh token |
| Activity list = summary objects | Must fetch each activity detail separately for streams/splits | Lazy-load detail on activity click; pre-fetch recent N activities |
| No raw VO2 max field | Can't show VO2 max directly | Derive from pace/HR data or use `suffer_score` as proxy; flag as estimate |
| Gear endpoint: no images | Auto-fetch gear photos requires external lookup | Use brand + model to search a product image API; fragile — plan fallback |
| Historical data: no bulk export | Getting 3 years of activities = hundreds of paginated API calls | One-time backfill job; store results locally |
| Strava subscription dependency | Some data (suffer_score, relative effort) may require premium | Gracefully degrade if fields are null |
| `polyline` encoding | Route maps require decoding Google polyline format | Use `polyline` library (Python or JS); well-documented |

### What the API Does NOT Provide (MEDIUM confidence — verify)

- Pre-computed heart rate zones (must calculate client-side)
- VO2 max as a field (Garmin Connect exposes this; Strava does not directly)
- Training load metrics (ATL/CTL)
- Power data for running (only for cycling with power meters)
- Weather at time of activity (historical weather would need a separate API)
- Shoe/gear images (brand + model name only)

---

## Feature Dependencies

```
OAuth token management
  → All features (nothing works without valid auth)

Activity list (paginated fetch + cache)
  → Key metrics summary
  → Long-term trend charts
  → Training week heatmap
  → Trophy case (achievement detection)

Activity detail (per-activity fetch)
  → Route map display
  → Splits table
  → Best efforts per activity
  → Elevation profile

Activity streams (per-activity fetch)
  → HR zone breakdown
  → Pace/HR over time charts
  → Pace distribution histogram
  → Cadence analysis

Athlete stats endpoint
  → Best efforts timeline (standard distances)
  → All-time / YTD / recent totals

Gear endpoint (per gear ID)
  → Gear gallery
  → [External image API] → Gear photo display

Segment efforts endpoint
  → Segment achievement timeline
  → Trophy case (segment PRs)

[Local storage / DB]
  → Custom milestones in trophy case
  → Cached activity data (rate limit protection)
  → Workout projector saved plans
```

---

## MVP Recommendation

For a v1 personal dashboard that delivers core value fast, prioritize in this order:

**Phase 1 — Foundation (must have to be useful at all)**
1. OAuth token management + auto-refresh
2. Activity list fetch + caching layer
3. Key metrics summary (distance, runs, time this week/month/year)
4. Long-term trend charts (weekly/monthly distance + pace)
5. Dark mode + responsive layout

**Phase 2 — Activity depth (makes it compelling)**
6. Activity detail view with route map
7. Splits table
8. HR zone breakdown per activity
9. Pace/HR stream charts
10. Best efforts timeline

**Phase 3 — Differentiators**
11. Gear gallery (with image fetching — validate image source early)
12. Trophy case (Strava achievements + custom milestones)
13. Training week heatmap
14. Workout projector

**Defer to post-MVP:**
- VO2 max trend (data availability uncertain, model complexity high)
- ATL/CTL training load (TrainingPeaks-style; high complexity, niche audience)
- Segment achievement deep-dive (rate-limit heavy; build after caching is solid)
- Cadence analysis (device-dependent data availability)

---

## Open Questions Requiring Verification

These items carry LOW confidence and should be verified before the relevant phase begins:

1. **Gear image sourcing**: What's the most reliable way to auto-fetch product images from a brand + model name? Options include Google Custom Search API (quota-limited), Open Food Facts (irrelevant), or scraping brand sites (fragile, ToS risk). Verify before committing to this feature.

2. **VO2 max field**: Confirm whether Strava API exposes any VO2 max-adjacent field in 2026, or whether it's purely derived from pace/HR. The `fitness` and `suffer_score` fields may be the closest proxies.

3. **Strava API deprecations**: Verify that `/athletes/{id}/koms` and `/segments/starred` still exist as documented — Strava has historically deprecated endpoints with limited notice.

4. **Stream data depth**: Confirm that cadence and power streams are available for running activities (vs cycling only).

5. **Rate limit current values**: Confirm 100/15min and 1000/day are still current as of 2026. Strava adjusted these in 2023; may have changed again.

---

## Sources

- Strava API v3 reference: https://developers.strava.com/docs/reference/ (verify at implementation time — training data may be stale)
- Project context: `/Users/ecevans/Documents/jm_work/test_proj/.planning/PROJECT.md`
- General knowledge of comparable open-source projects (VeloViewer, Sauce for Strava, running.app) — MEDIUM confidence, not directly verified in this session due to tool restrictions
- Training knowledge cutoff: August 2025; web search and WebFetch unavailable during this research session — mark all findings for verification against current Strava docs before implementation
