# Phase 8: Enhanced Activity Drill-Down - Research

**Researched:** 2026-03-13
**Domain:** GPS stream visualization — pace-colored route map + GPS elevation profile
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DRLL-03 | User sees route map colored by pace on activities with GPS data (faster segments green, slower segments red, scale normalized per activity) | Multiple `<Polyline>` components with per-segment pace interpolation; velocity_smooth stream from Phase 7 API provides per-point speed data |
| DRLL-04 | User sees smooth GPS altitude-based elevation profile on activities with altitude data (replaces splits-based approximation) | Recharts AreaChart already in use; replace `elevation_difference` accumulation with direct `altitude` array from Phase 7 stream; update ElevationProfile component to accept GPS data prop |
</phase_requirements>

---

## Summary

Phase 8 is a pure frontend change. Phase 7 delivered a fully working `/api/activity/{id}/streams` endpoint that returns `latlng`, `altitude`, `velocity_smooth`, `time`, `distance` arrays alongside boolean flags (`has_gps`, `has_altitude`). No backend work is required for Phase 8 — both requirements are satisfied by consuming stream data that already exists in the cache.

The pace-colored route map (DRLL-03) replaces the existing static Leaflet map in `RouteReplayMap.tsx`. The approach is to render N separate `<Polyline>` components — one per GPS segment (consecutive point-pair) — each colored by interpolating the segment's pace from green (fastest) to red (slowest), normalized per activity. The `velocity_smooth` stream provides per-point speed values in m/s. The existing `RouteReplayMap` already lazy-loads via `RouteReplay.tsx` with `Suspense`, so the new map should follow the same lazy-load pattern.

The GPS elevation profile (DRLL-04) requires only a small change to `ElevationProfile.tsx`. The current component reconstructs elevation from cumulative `elevation_difference` splits values (an approximation). The new component accepts the `altitude` array directly from the stream and plots absolute altitude vs distance. The existing Recharts `AreaChart` pattern with `type="monotone"` already produces a smooth line. The key change is: switch from cumulative-diff reconstruction to raw altitude values, and replace split number on the x-axis with distance in km/miles.

**Primary recommendation:** No new libraries needed. Use existing react-leaflet `<Polyline>` (v5) and existing Recharts `AreaChart`. Add a `fetchActivityStreams` function to `api/client.ts`, a `StreamsResponse` type, and build two new components: `PaceMap.tsx` (lazy-loaded) and updated `ElevationProfile.tsx` that accepts an optional GPS altitude array.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-leaflet | ^5.0.0 (installed) | Interactive map with Polyline components | Already used in RouteReplayMap; Leaflet v1.9 is the underlying map engine |
| leaflet | ^1.9.4 (installed) | Underlying map engine | Already in use; no alternative needed |
| recharts | ^2.15.0 (installed) | AreaChart for elevation profile | Already powering ElevationProfile; same pattern, different data source |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript inline interpolation | n/a | lerpColor(t): string for pace-to-hex | No color library needed; simple linear RGB interpolation between two fixed endpoints |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Multiple `<Polyline>` per segment | Leaflet.MultiOptionsPolyline or leaflet-polycolor | Plugins are unmaintained (last commits 2018–2019); react-leaflet v5 wrapping them is fragile. Multiple `<Polyline>` is trivial with ~100–500 GPS points per activity and proven in production |
| Raw altitude array | d3 smooth/lowpass filter | Strava's `velocity_smooth` stream is already smoothed. Altitude data from GPS is generally clean enough; `type="monotone"` in Recharts is sufficient |
| chroma.js for color interpolation | Inline lerp | chroma.js is 14KB gzipped; a 6-line inline lerp is sufficient for two-color interpolation |

**Installation:** No new packages needed. All required libraries are already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── api/
│   ├── client.ts          # Add fetchActivityStreams()
│   └── types.ts           # Add StreamsResponse type
├── components/
│   ├── ActivityDetail.tsx # Fetch streams alongside detail; pass to children
│   ├── PaceMap.tsx        # NEW: Leaflet map with pace-colored polylines (lazy-loaded wrapper)
│   ├── PaceMapLeaflet.tsx # NEW: Actual Leaflet component (lazy-loaded leaf)
│   ├── ElevationProfile.tsx  # UPDATED: accept optional GPS altitude+distance arrays
│   └── RouteReplay.tsx    # Remains for replay animation (untouched)
```

### Pattern 1: Fetch streams alongside activity detail

`ActivityDetail.tsx` already performs a `Promise.all` for detail + zones. Extend this to a three-way `Promise.all` including streams. The stream fetch triggers lazy caching on the backend — the frontend just calls the endpoint and handles the boolean flags.

**What:** Call `/api/activity/{id}/streams` in the existing `Promise.all` in `ActivityDetail.tsx`.
**When to use:** Always — the stream endpoint returns gracefully (has_gps: false, arrays: null) for activities without GPS.

```typescript
// In ActivityDetail.tsx — extend the existing Promise.all
Promise.all([
  fetchActivityDetail(activityId),
  fetchActivityZones(activityId).catch(() => ({ has_zones: false, zones: [] } as ZonesResponse)),
  fetchActivityStreams(activityId).catch(() => null),
])
  .then(([detailData, zonesData, streamsData]) => {
    setDetail(detailData);
    setZones(zonesData);
    setStreams(streamsData);
  })
```

### Pattern 2: Pace-colored route — multiple Polylines per GPS segment

**What:** Map each consecutive point-pair in `latlng` to a `<Polyline>` with a color derived from the corresponding `velocity_smooth` value.
**When to use:** When `streams.has_gps === true`.

Key steps:
1. Compute `minSpeed` and `maxSpeed` from `velocity_smooth` array (normalize per activity)
2. For each index `i` in `latlng` (from 0 to N-2), create a segment `[latlng[i], latlng[i+1]]`
3. Use `velocity_smooth[i]` to get `t = (speed - minSpeed) / (maxSpeed - minSpeed)` clamped to [0, 1]
4. Interpolate: t=1 → green (#22c55e), t=0 → red (#ef4444) — faster is greener
5. Render `<Polyline positions={segment} pathOptions={{ color, weight: 4, opacity: 0.9 }} />`

```typescript
// PaceMapLeaflet.tsx — core interpolation
function lerpColor(t: number): string {
  // t=0 is slowest (red), t=1 is fastest (green)
  const r = Math.round(239 + (34 - 239) * t);   // 239→34
  const g = Math.round(68 + (197 - 68) * t);     // 68→197
  const b = Math.round(68 + (94 - 68) * t);      // 68→94
  return `rgb(${r},${g},${b})`;
}

function paceColoredSegments(
  latlng: [number, number][],
  velocity: number[],
): { segment: [number, number][]; color: string }[] {
  const speeds = velocity.filter((v) => v > 0);
  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);
  const range = maxSpeed - minSpeed || 1;

  return latlng.slice(0, -1).map((point, i) => {
    const t = Math.max(0, Math.min(1, (velocity[i] - minSpeed) / range));
    return { segment: [point, latlng[i + 1]], color: lerpColor(t) };
  });
}
```

### Pattern 3: GPS elevation profile replaces splits approximation

**What:** Update `ElevationProfile.tsx` to accept an optional `gpsAltitude` array and `gpsDistance` array from streams. When provided, render absolute altitude vs distance. When absent, fall back to the existing splits-based rendering.
**When to use:** `streams.has_altitude === true`.

The current ElevationProfile reconstructs elevation from `elevation_difference` splits (cumulative sum — this is an approximation and can drift). The GPS `altitude` array contains absolute altitude in meters at each GPS point; the `distance` array contains cumulative distance in meters.

```typescript
// ElevationProfile.tsx — new GPS branch
interface ElevationProfileProps {
  splits: Split[];                          // existing — fallback
  gpsAltitude?: number[] | null;            // NEW: from streams
  gpsDistance?: number[] | null;            // NEW: from streams
}

// When gpsAltitude and gpsDistance are provided:
const data = gpsAltitude.map((alt, i) => ({
  distance: (gpsDistance[i] / 1000),        // meters → km
  elevation: alt,                           // absolute meters
}));
// XAxis dataKey="distance", YAxis is absolute altitude
// type="monotone" on Area for smooth rendering
```

### Pattern 4: Lazy-load PaceMapLeaflet

Follow the exact pattern of `RouteReplay.tsx` / `RouteReplayMap.tsx`:

```typescript
// PaceMap.tsx (wrapper, not lazy itself)
const PaceMapLeaflet = lazy(() => import("./PaceMapLeaflet"));

export default function PaceMap({ latlng, velocity }: PaceMapProps) {
  if (latlng.length < 2) return null;
  return (
    <Suspense fallback={<div className="h-64 rounded-lg bg-gray-200 dark:bg-gray-800 ..." />}>
      <PaceMapLeaflet latlng={latlng} velocity={velocity} />
    </Suspense>
  );
}
```

`PaceMapLeaflet` is the actual Leaflet-using component. This keeps Leaflet out of the initial bundle.

### Pattern 5: Section ordering in ActivityDetail.tsx

Replace the existing "Route Replay" section (which currently shows the summary_polyline replay animation) with the new pace-colored map when GPS stream data is available. The route replay animation can remain as a secondary section or be removed — the pace map is the primary visual for DRLL-03.

**Recommended ordering** in ActivityDetail:
1. Pace Map (GPS stream, replaces or supplements Route Replay)
2. Elevation Profile (GPS stream if available, splits fallback)
3. Splits table
4. HR Zones
5. Pace & HR Drift

### Anti-Patterns to Avoid

- **Rendering 1000+ individual Polyline elements naively:** GPS tracks can have 1000–3000 points. Rendering 999–2999 `<Polyline>` components could cause Leaflet re-render thrashing. Mitigate by downsampling GPS points to ~200–300 before color mapping (the same downsample approach used in `RouteThumb.tsx` already handles this) OR by grouping consecutive same-color segments (adjacent points within similar pace bracket share one Polyline).
- **Storing segments in component state:** Compute `paceColoredSegments()` via `useMemo` with `latlng` and `velocity` as deps — avoids recomputing on every render.
- **Modifying ElevationProfile to require GPS data:** Always provide a fallback to splits-based rendering. Activities without altitude stream (has_altitude: false) must still show elevation via splits.
- **Forgetting `"leaflet/dist/leaflet.css"` import:** `PaceMapLeaflet.tsx` must import leaflet CSS (as `RouteReplayMap.tsx` already does).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Color interpolation between two fixed endpoints | Custom HSL interpolation or import chroma.js | 6-line inline linear RGB lerp | HSL is non-trivial for green-to-red; linear RGB between #22c55e and #ef4444 is visually fine for 2-color gradients |
| GPS point downsampling | Custom Ramer-Douglas-Peucker | Reuse `downsample()` from RouteThumb.tsx | Already implemented; reduces ~2000 points to 200 in O(N) |
| Lazy-loading Leaflet components | Custom import() management | React `lazy()` + `Suspense` | Already established pattern in RouteReplay.tsx |
| Smooth elevation curves | Custom interpolation | Recharts `type="monotone"` | Already in ElevationProfile.tsx; no additional smoothing needed |

**Key insight:** All the hard infrastructure is already in place. Phase 8 is wiring GPS stream data (from Phase 7's working endpoint) into two new/updated UI components.

---

## Common Pitfalls

### Pitfall 1: GPS track has too many points for Leaflet
**What goes wrong:** Rendering 2000+ individual `<Polyline>` components causes slow map initialization and re-renders.
**Why it happens:** Strava GPS streams at "high" resolution can return 1–3 points/second for a 1-hour run = 3600+ points.
**How to avoid:** Downsample latlng + velocity arrays together (preserve index alignment) to ~300 points before rendering. Move `downsample()` to a shared utility or import from RouteThumb logic.
**Warning signs:** Map takes >500ms to render; React DevTools shows hundreds of Polyline renders.

### Pitfall 2: velocity_smooth index misalignment with latlng
**What goes wrong:** latlng[i] gets colored with velocity[i+1] or wrong segment.
**Why it happens:** Strava streams are time-aligned but the arrays in the response may have slightly different lengths if one stream has fewer samples. Backend stores all arrays as-is from Strava.
**How to avoid:** Guard with `Math.min(latlng.length, velocity.length) - 1` as the loop bound. If velocity is null/missing, render a solid gray route rather than crashing.
**Warning signs:** Coloring looks shifted/wrong; errors about undefined array access.

### Pitfall 3: Elevation profile x-axis showing GPS-point index instead of distance
**What goes wrong:** X-axis shows "0, 1, 2, 3..." (array indices) instead of km values.
**Why it happens:** Using array index as dataKey on XAxis.
**How to avoid:** Map GPS altitude+distance arrays together: `{ distance: gpsDistance[i]/1000, elevation: altitude[i] }`. Use `dataKey="distance"` on XAxis with a `tickFormatter` showing km.
**Warning signs:** X-axis labels are integers 0–3000 instead of 0–10 km.

### Pitfall 4: ElevationProfile regression for activities without GPS
**What goes wrong:** Existing split-based elevation breaks or disappears when GPS props are undefined.
**Why it happens:** Destructuring `gpsAltitude` without null checks.
**How to avoid:** Use `if (gpsAltitude && gpsDistance && gpsAltitude.length > 1)` guard before using GPS path; else fall through to existing splits logic.
**Warning signs:** No elevation chart shown for older activities that don't have streams cached yet.

### Pitfall 5: Pace map shown for activities without GPS
**What goes wrong:** PaceMap renders with empty/null data, showing a blank section or crashing.
**Why it happens:** `streams` state is null (stream fetch failed or activity has no GPS) but `has_gps` check is missing.
**How to avoid:** Conditionally render `<PaceMap>` only when `streams?.has_gps === true && streams.latlng !== null`.
**Warning signs:** Empty gray box where map should be; "Cannot read property of null" console errors.

### Pitfall 6: Dark mode tile URL not updating when theme changes
**What goes wrong:** Map tiles don't switch between dark/light Carto tiles on theme toggle.
**Why it happens:** `isDark` is computed once at render time (`document.documentElement.classList.contains("dark")`). RouteReplayMap has this same issue.
**How to avoid:** This is a known pre-existing quirk in RouteReplayMap. For Phase 8, replicate the same pattern — dark tiles by default in dark mode. A full theme-reactive map is deferred complexity. Document it as a known limitation.

---

## Code Examples

Verified patterns from official sources:

### StreamsResponse type (new, to add to types.ts)
```typescript
// frontend/src/api/types.ts — add to end of file
export interface StreamsResponse {
  activity_id: number;
  has_gps: boolean;
  has_altitude: boolean;
  has_heartrate: boolean;
  latlng: [number, number][] | null;
  altitude: number[] | null;
  heartrate: number[] | null;
  velocity_smooth: number[] | null;
  time: number[] | null;
  distance: number[] | null;
}
```

### fetchActivityStreams (add to client.ts)
```typescript
// frontend/src/api/client.ts
export function fetchActivityStreams(id: number): Promise<StreamsResponse> {
  return fetchJSON(`/api/activity/${id}/streams`);
}
```

### PaceMapLeaflet.tsx — complete skeleton
```typescript
// Source: react-leaflet v5 official docs + RouteReplayMap.tsx pattern
import { useMemo } from "react";
import { MapContainer, TileLayer, Polyline } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

interface PaceMapLeafletProps {
  latlng: [number, number][];
  velocity: number[];
}

function lerpColor(t: number): string {
  const r = Math.round(239 + (34 - 239) * t);
  const g = Math.round(68 + (197 - 68) * t);
  const b = Math.round(68 + (94 - 68) * t);
  return `rgb(${r},${g},${b})`;
}

export default function PaceMapLeaflet({ latlng, velocity }: PaceMapLeafletProps) {
  const segments = useMemo(() => {
    const len = Math.min(latlng.length, velocity.length);
    const speeds = velocity.slice(0, len).filter((v) => v > 0);
    const minSpeed = Math.min(...speeds);
    const maxSpeed = Math.max(...speeds);
    const range = maxSpeed - minSpeed || 1;

    return latlng.slice(0, len - 1).map((pt, i) => ({
      positions: [pt, latlng[i + 1]] as [number, number][],
      color: lerpColor(Math.max(0, Math.min(1, (velocity[i] - minSpeed) / range))),
    }));
  }, [latlng, velocity]);

  const bounds = useMemo(() => latlng.reduce(
    (acc, [lat, lng]) => [
      [Math.min(acc[0][0], lat), Math.min(acc[0][1], lng)],
      [Math.max(acc[1][0], lat), Math.max(acc[1][1], lng)],
    ],
    [[90, 180], [-90, -180]],
  ) as LatLngBoundsExpression, [latlng]);

  const isDark = document.documentElement.classList.contains("dark");

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700" style={{ height: 300 }}>
      <MapContainer style={{ height: "100%", width: "100%" }} scrollWheelZoom={false} zoomControl={true}>
        {/* FitBounds hook component — reuse pattern from RouteReplayMap */}
        <TileLayer
          url={isDark
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        />
        {segments.map((seg, i) => (
          <Polyline
            key={i}
            positions={seg.positions}
            pathOptions={{ color: seg.color, weight: 4, opacity: 0.9 }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
```

### ElevationProfile.tsx — GPS branch
```typescript
// Updated ElevationProfile to accept GPS data with splits fallback
interface ElevationProfileProps {
  splits: Split[];
  gpsAltitude?: number[] | null;
  gpsDistance?: number[] | null;
}

export default function ElevationProfile({ splits, gpsAltitude, gpsDistance }: ElevationProfileProps) {
  const useGPS = gpsAltitude && gpsDistance && gpsAltitude.length > 1 && gpsDistance.length > 1;

  const data = useGPS
    ? gpsAltitude.map((alt, i) => ({
        x: parseFloat((gpsDistance[i] / 1000).toFixed(2)), // meters → km
        elevation: Math.round(alt),
      }))
    : (() => {
        let cumulative = 0;
        return splits.map((s) => {
          cumulative += s.elevation_difference;
          return { x: s.split, elevation: cumulative };
        });
      })();

  if (data.length < 2) return null;

  // Render AreaChart with dataKey="x" on XAxis
  // tickFormatter for x: useGPS ? `${v} km` : `Split ${v}`
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Splits-based elevation (cumulative diff) | GPS altitude array | Phase 8 | More accurate; shows absolute altitude, no drift from cumulative approximation |
| Static summary_polyline route (single color) | Pace-colored GPS polylines | Phase 8 | Visual narrative of run effort; green=fast, red=slow segments |
| Route replay animation only | Route replay + pace map | Phase 8 | Both remain; pace map is static overview, replay is animated story |

**Note on Route Replay vs Pace Map:** The existing `RouteReplay` component renders the summary_polyline (lower resolution, from activity detail). The new `PaceMap` uses the full GPS stream. Consider whether to show both or only the pace map. Based on requirements (DRLL-03 asks for pace-colored map), the pace map is the primary artifact. The replay animation can remain as-is for activities where it already shows.

---

## Open Questions

1. **Downsample threshold for pace map**
   - What we know: RouteThumb uses 200 points; Strava high-res streams can be 3000+ points
   - What's unclear: At what point count does react-leaflet noticeably slow? Likely around 500–1000 segments
   - Recommendation: Start with 300 points (same order as RouteThumb). If performance is acceptable, go higher.

2. **Route Replay section fate**
   - What we know: Existing RouteReplay uses summary_polyline (not GPS stream). Pace map uses GPS stream latlng.
   - What's unclear: Whether to keep both sections or replace Route Replay with Pace Map
   - Recommendation: Keep Route Replay for activities without GPS stream (uses summary_polyline). Show Pace Map instead of (or above) Route Replay when GPS stream is available. Avoids regression.

3. **GPS altitude units**
   - What we know: Strava altitude stream is in meters. formatElevation() in the existing codebase formats meters.
   - What's unclear: Whether the user's units preference (km vs miles) affects altitude display
   - Recommendation: Always display altitude in meters (standard for elevation). Distance x-axis can be km.

---

## Sources

### Primary (HIGH confidence)
- react-leaflet.js.org/docs/example-vector-layers/ — Polyline + pathOptions API, multiple Polyline pattern confirmed
- Existing codebase: `RouteReplayMap.tsx` — established lazy-load Leaflet pattern with `react-leaflet` v5
- Existing codebase: `ElevationProfile.tsx` — current splits-based AreaChart implementation
- Existing codebase: `activity_detail.py` `/streams` endpoint — confirmed response shape: latlng, altitude, velocity_smooth arrays + boolean flags
- Existing codebase: `frontend/package.json` — react-leaflet ^5.0.0, recharts ^2.15.0, leaflet ^1.9.4 all installed

### Secondary (MEDIUM confidence)
- paigeniedringhaus.com/blog/render-multiple-colored-lines — confirms "separate Polyline per color segment" as the standard pattern for react-leaflet; no alternative that works reliably mid-line
- recharts/recharts#1124 — Area `type="monotone"` is the standard smoothing option, confirmed to be stable

### Tertiary (LOW confidence)
- WebSearch results for leaflet-polycolor and Leaflet.MultiOptionsPolyline — these plugins are unmaintained (circa 2018); recommendation to avoid confirmed by age of last commits, not by direct current-docs verification

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in active use; no new packages needed
- Architecture: HIGH — patterns directly derived from existing codebase (RouteReplayMap.tsx, ElevationProfile.tsx)
- Pitfalls: HIGH — index misalignment and over-rendering pitfalls are well-understood GPS viz problems; null-guard patterns are directly observable in existing code

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (react-leaflet v5, recharts v2 are stable; low churn)
