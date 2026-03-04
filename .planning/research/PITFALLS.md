# Pitfalls Research — v2.0 Enhanced Features

**Domain:** Adding Strava Streams, best efforts history, and training projector to StravaViz
**Researched:** 2026-03-04
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Fetching Streams on Every Activity Open

**What goes wrong:**
Every time a user opens an activity detail, the backend calls Strava's streams endpoint. With 1000+ activities and a 1000 req/day rate limit, this exhausts the budget in minutes.

**Why it happens:**
Streams are not part of the initial activity sync, so they feel like "detail data" — but treating them as on-demand-only without caching causes repeated API calls.

**How to avoid:**
Cache streams in SQLite on first fetch. Check `ActivityStream` table before calling Strava. Never bypass the cache.

**Warning signs:**
`X-RateLimit-Limit` headers dropping rapidly; users seeing 429 errors after viewing several activities.

**Phase to address:** Phase 7 (Streams backend)

---

### Pitfall 2: Streams Data May Be Absent

**What goes wrong:**
Not all activities have GPS streams. Indoor runs, treadmill workouts, and manual entries have no `latlng` or `altitude`. Activities without HR monitors have no `heartrate`. Code that assumes streams arrays are always present crashes silently or throws.

**Why it happens:**
Developers test on their own outdoor HR-monitored runs and don't encounter missing streams.

**How to avoid:**
Always check presence of each key in the streams response. Backend should return `null` for each missing key. Frontend must handle `null` streams gracefully: no overlay if no latlng, no HR option if no heartrate.

**Warning signs:**
`KeyError` or `TypeError` in backend; blank map or JS errors in frontend on certain activities.

**Phase to address:** Phase 7 (Streams backend) and Phase 8 (Overlay component)

---

### Pitfall 3: Pace Coloring Uses Wrong Scale

**What goes wrong:**
The color scale is computed using absolute pace values (e.g., 4:00–8:00/km). On a hilly run, pace varies dramatically and the "fast" end is never reached. On a flat recovery run, "slow" end is never used. The map shows monotone color.

**Why it happens:**
Using a fixed global pace scale instead of normalizing per-activity.

**How to avoid:**
Compute the color scale bounds dynamically per activity: min/max pace from the actual stream data. Apply a small percentile clip (5th–95th) to exclude outlier GPS spikes.

**Warning signs:**
Map polyline appears one solid color; color legend shows extreme values never seen in the run.

**Phase to address:** Phase 8 (PaceHROverlayMap component)

---

### Pitfall 4: Best Efforts History Is Empty for Most Distances

**What goes wrong:**
User opens Best Efforts Timeline and sees only 1–2 lines instead of 5. Half marathon and marathon lines don't appear because the user hasn't run those distances often enough to have ≥2 data points.

**Why it happens:**
Trying to render a trend line with a single data point, or rendering a line and calling it a "timeline" when there's no trend.

**How to avoid:**
Only render a line for a distance if there are ≥2 data points across ≥2 different months. Show a friendly empty state: "Complete more [marathon] efforts to see your progression." Don't clutter the chart with single-point "trends."

**Warning signs:**
Chart shows flat lines; user questions why the feature is there.

**Phase to address:** Phase 9 (BestEffortsTimeline component)

---

### Pitfall 5: Workout Projector Overconfidence

**What goes wrong:**
User inputs a training plan, sees a projected CTL curve, and treats it as a guarantee. Then gets injured or sick and blames the app when reality diverges.

**Why it happens:**
Clean charts look authoritative. Users forget the projector is estimation, not prediction.

**How to avoid:**
- Label projected section clearly: dashed lines, different opacity
- Add persistent disclaimer: "Estimated projection based on training load math. Actual fitness depends on rest, nutrition, health, and consistency."
- Show projections as ranges (±10%) not point estimates — acknowledges uncertainty visually
- Never show projected VDOT as a hard number; show as "~X" or a range

**Warning signs:**
User asks "why isn't my CTL matching the projection?" — they've treated it as a forecast.

**Phase to address:** Phase 10 (WorkoutProjector component)

---

### Pitfall 6: Strava Streams Rate Limit Not Tracked Separately

**What goes wrong:**
The existing sync logic tracks its own API call budget, but streams fetches bypass this tracking. Both hit the same 1000 req/day limit. On a day with many new activities, sync + stream fetches together exhaust the budget.

**Why it happens:**
Streams endpoint is added to a different router and the rate limit tracking is in the sync service.

**How to avoid:**
Centralize rate limit tracking in `strava_client.py`. Every Strava API call (sync, streams, detail) must decrement the same counter and check the same limit.

**Warning signs:**
Sync succeeds but stream fetches start returning 429; or vice versa.

**Phase to address:** Phase 7 (Streams backend)

---

### Pitfall 7: GPS Elevation Profile Looks Jagged

**What goes wrong:**
Raw GPS altitude data from consumer devices is noisy. The elevation chart shows rapid spiky fluctuations rather than a smooth profile.

**Why it happens:**
GPS altitude accuracy is ±5–10m on most devices. At fine resolution (GPS samples every 1 second), this creates noise.

**How to avoid:**
Apply a simple moving average smoothing (window=5–10 points) to the altitude array before sending to frontend. The frontend Recharts chart should use `type="monotone"` on the Area component (already does).

**Warning signs:**
Elevation profile looks like a noise chart rather than a hill profile.

**Phase to address:** Phase 7 (streams backend pre-processing)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip stream caching (fetch every time) | No DB schema change | Rate limit exhaustion | Never |
| Hard-code pace color scale bounds | No per-activity computation | Monotone maps on most runs | Never |
| Project CTL without uncertainty range | Simpler UI | User overtrust in projections | Never |
| Fetch all streams eagerly on sync | All data preloaded | ~500 extra API calls per sync | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Strava Streams API | Request `key_by_type=false` → get array of stream objects instead of dict | Always use `key_by_type=true` → returns `{latlng: {...}, altitude: {...}}` dict |
| Strava Streams API | Assume all keys present in response | Check each key: `latlng`, `altitude`, `heartrate`, `velocity_smooth` may be absent |
| react-leaflet Polyline | Pass array of [lng, lat] (GeoJSON order) | Leaflet uses [lat, lng] order — Strava streams return [lat, lng] already ✓ |
| Recharts LineChart | Invert Y-axis by negating values | Use `reversed` on YAxis or `domain` trick — negating breaks tooltips |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Rendering 1000+ Polyline segments | Map freezes on load | Cap segments at 200 via downsampling | Activities with 1-second GPS resolution (30-min run = 1800 points) |
| Querying best efforts history without index | Slow InsightsView load | Add index on `BestEffort(distance_meters, start_date)` | When BestEffort table has 1000+ rows |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------| 
| Show pace AND HR overlay simultaneously | Confusing color conflict | Toggle button: one overlay at a time |
| Projector form with free-text plan input | "2 tempo runs + 1 long run/week" is hard to parse reliably | Structured input: sliders/dropdowns for weekly km, intensity, duration |
| Best efforts timeline Y-axis: higher = slower | Counterintuitive | Invert axis so improvements go upward, OR use negative seconds with custom labels |

## "Looks Done But Isn't" Checklist

- [ ] **Streams cache:** Check that second open of same activity doesn't call Strava again — verify with network tab or backend logs
- [ ] **Pace overlay:** Test on a treadmill (no GPS) activity — map section should not crash, should show plain route replay
- [ ] **Best efforts timeline:** Test with an athlete who has only run 1 marathon — single data point should not render as a line
- [ ] **Workout Projector:** Test with 0 weeks of history (new user) — CTL starts at 0, projection should still work
- [ ] **GPS elevation:** Test on flat indoor activity with no altitude data — ElevationProfileGPS should not render

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Streams fetched every open | Phase 7 — cache in SQLite | Open same activity twice; confirm single Strava call in logs |
| Streams arrays absent | Phase 7 — null-safe response | Test with indoor activity; verify no crash |
| Pace scale monotone | Phase 8 — per-activity normalization | View hilly run; confirm color variation |
| Best efforts single-point line | Phase 9 — ≥2 point guard | Test user with 1 marathon; confirm no line rendered |
| Projector overconfidence | Phase 10 — dashed + disclaimer | Review final UI for uncertainty language |
| Rate limits across sync+streams | Phase 7 — centralized counter | View 5 activities back-to-back; confirm counter shared |

---
*Pitfalls research for: StravaViz v2.0*
*Researched: 2026-03-04*
