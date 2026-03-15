# Phase 9: Best Efforts Timeline - Research

**Researched:** 2026-03-15
**Domain:** Recharts multi-series LineChart + FastAPI SQLModel BestEffort query
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-06 | User sees a best efforts progression timeline showing personal best times per standard distance (1mi, 5K, 10K, half marathon, marathon) over time — only rendered for distances with ≥2 recorded efforts | BestEffort table already exists with start_date + moving_time fields. New API endpoint returns per-distance series. Recharts LineChart renders multi-series time progression. |
</phase_requirements>

---

## Summary

Phase 9 adds a best efforts progression chart to the dashboard. The data layer is already in place: the `BestEffort` SQLModel table (populated by `/api/sync/best-efforts`) contains every recorded best effort at standard distances with `name`, `moving_time`, `start_date`, and `activity_id` fields. The existing `trophies.py` router only queries for the single fastest effort per distance (for the PR trophy case). This phase needs a new API endpoint that returns ALL recorded efforts per distance, sorted by date, so the frontend can render time-over-time progression lines.

The frontend uses Recharts 2.15 with React 19 + TypeScript 5.7. The existing `TrendChart.tsx` demonstrates the exact Recharts pattern to follow: `ResponsiveContainer > LineChart` (or `AreaChart`) with custom tick formatters and dark-mode-compatible styling. For multi-series (one line per distance), Recharts requires the data to be in wide format — each datum is a date point with a key per distance series. The implementation reshapes the raw API response (array of per-distance effort arrays) into this wide format client-side.

The ≥2 efforts requirement must be enforced server-side: the endpoint counts efforts per distance and omits any distance with fewer than 2. This prevents the frontend from ever receiving a single-point series (which would render as an invisible dot, not a line). Y-axis displays time in MM:SS format (e.g. "3:42 per mile" → just "3:42"). Values decrease over time as the runner improves, so the Y-axis should be inverted (lower is better) or the chart labeled clearly.

**Primary recommendation:** Add `GET /api/trophies/best-efforts-progression` to the existing `trophies.py` router; build `BestEffortsTimeline.tsx` using Recharts `LineChart` with one `<Line>` per distance series; insert the component into `DashboardView.tsx` after `TrendChart`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | 2.15.x | Multi-series line chart | Already installed; used by TrendChart, HRDriftChart, ElevationProfile |
| React | 19.x | UI component | Project standard |
| TypeScript | 5.7.x | Type safety | Project standard |
| FastAPI + SQLModel | (existing) | Backend endpoint | Project standard; BestEffort model already defined |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS | (existing) | Styling, dark mode | All components use Tailwind |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts LineChart | Victory, Nivo, Chart.js | Recharts is already installed and proven in this codebase — no reason to add a dependency |

**Installation:**
```bash
# No new dependencies required — recharts already installed
```

---

## Architecture Patterns

### Recommended Project Structure
```
backend/app/routers/trophies.py         # Add new endpoint here (existing file)
backend/tests/test_trophies.py          # Add tests here (existing file)
frontend/src/components/
  BestEffortsTimeline.tsx               # New component
frontend/src/api/client.ts             # Add fetchBestEffortsProgression()
frontend/src/api/types.ts              # Add BestEffortsProgressionResponse type
frontend/src/views/DashboardView.tsx    # Insert new component
```

### Pattern 1: Backend Endpoint — All Efforts Per Distance

**What:** Query ALL `BestEffort` rows (not just fastest) grouped by distance name, return per-distance arrays sorted by date. Filter out distances with <2 efforts.

**When to use:** Any time you need historical progression, not just current PRs.

**Example:**
```python
# In trophies.py — add after existing /prs endpoint
@router.get("/best-efforts-progression")
def get_best_efforts_progression(request: Request):
    """Return all recorded best efforts per standard distance for progression chart.
    Only includes distances with >=2 recorded efforts (chart requires 2 points for a line).
    """
    with _get_session(request) as session:
        progression = {}
        for dist in PR_DISTANCES:
            names_lower = dist["strava_names"]
            stmt = (
                select(BestEffort)
                .where(func.lower(BestEffort.name).in_(names_lower))
                .where(col(BestEffort.moving_time) > 0)
                .where(col(BestEffort.name) != "_no_efforts")
                .order_by(col(BestEffort.start_date).asc())
            )
            efforts = session.exec(stmt).all()
            if len(efforts) >= 2:
                progression[dist["name"]] = [
                    {
                        "date": e.start_date[:10],  # YYYY-MM-DD
                        "moving_time": e.moving_time,
                        "activity_id": e.activity_id,
                        "activity_name": e.activity_name,
                    }
                    for e in efforts
                ]
        return {"progression": progression}
```

### Pattern 2: Frontend Data Reshaping for Recharts Multi-Series

**What:** Recharts LineChart needs wide-format data: each element is a date with one key per series. The API returns narrow format (per-distance arrays). Reshape client-side.

**When to use:** Any time you have multiple series in Recharts.

**Example:**
```typescript
// Merge per-distance effort arrays into wide-format for Recharts
// Input: { "5K": [{date, moving_time}, ...], "1 Mile": [...] }
// Output: [{date: "2024-01-15", "5K": 1234, "1 Mile": 284}, ...]
function buildChartData(
  progression: Record<string, EffortPoint[]>
): WidePoint[] {
  const dateMap = new Map<string, WidePoint>();
  for (const [distName, efforts] of Object.entries(progression)) {
    for (const e of efforts) {
      if (!dateMap.has(e.date)) dateMap.set(e.date, { date: e.date });
      dateMap.get(e.date)![distName] = e.moving_time;
    }
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}
```

### Pattern 3: Recharts LineChart with Multiple Series

**What:** One `<Line>` component per distance, each with a distinct color from the project palette.

**Example:**
```tsx
// Source: recharts.org LineChart API — verified in existing TrendChart.tsx patterns
const DISTANCE_COLORS: Record<string, string> = {
  "1 Mile":       "#6366f1",  // indigo-500
  "5K":           "#14b8a6",  // teal-500
  "10K":          "#10b981",  // emerald-500
  "Half Marathon":"#8b5cf6",  // violet-500
  "Marathon":     "#f59e0b",  // amber-500
};

<ResponsiveContainer width="100%" height={300}>
  <LineChart data={chartData}>
    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
    <XAxis
      dataKey="date"
      tick={{ fill: "#9ca3af", fontSize: 12 }}
      tickLine={false}
      axisLine={{ stroke: "#374151" }}
      tickFormatter={(date: string) =>
        new Date(date).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      }
    />
    <YAxis
      tick={{ fill: "#9ca3af", fontSize: 12 }}
      tickLine={false}
      axisLine={{ stroke: "#374151" }}
      tickFormatter={formatSeconds}   // MM:SS
      reversed                        // lower = better (faster times at top)
    />
    <Tooltip
      contentStyle={{
        backgroundColor: "#1f2937",
        border: "1px solid #374151",
        borderRadius: "8px",
        color: "#f3f4f6",
      }}
      formatter={(value: number, name: string) => [formatSeconds(value), name]}
    />
    <Legend />
    {activeDistances.map((distName) => (
      <Line
        key={distName}
        type="monotone"
        dataKey={distName}
        stroke={DISTANCE_COLORS[distName]}
        strokeWidth={2}
        dot={{ r: 3 }}
        connectNulls={false}
      />
    ))}
  </LineChart>
</ResponsiveContainer>
```

### Pattern 4: Time Formatting (MM:SS)

**What:** Y-axis tick values are seconds (integers); display as MM:SS.

```typescript
function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
```

This mirrors the pace formatter already in `TrendChart.tsx` (which formats `s/km` to `min:sec/mi`).

### Anti-Patterns to Avoid

- **Querying only the fastest effort per distance:** The existing `/api/trophies/prs` endpoint does this. The new endpoint must fetch ALL efforts ordered by date, not just `LIMIT 1` ordered by time.
- **Including `_no_efforts` marker rows:** The `_no_efforts` sentinel rows must be excluded from the progression query (filter `name != "_no_efforts"` or use `moving_time > 0` which already excludes them since markers have `moving_time=0`).
- **Wide Y-axis domain with no inversion:** Running times improve by decreasing. Use `reversed` prop on YAxis so the top of the chart is the fastest (smallest) time. Without this, the line goes up as performance improves — counterintuitive.
- **Showing all 5 distances when some have <2 efforts:** Server must omit distances with fewer than 2 points. Client must not assume all 5 distances are present.
- **Using AreaChart instead of LineChart:** Multi-series area charts overlap and obscure each other. Use `LineChart` for this multi-series comparison.
- **Date strings with timezone offsets:** `start_date` in BestEffort is ISO 8601 UTC. Truncate to `[:10]` server-side for the date key to avoid timezone offset in comparisons.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time formatting | Custom time string builder | Simple `formatSeconds()` pure function | No library needed — pure math, <5 lines |
| Chart rendering | SVG path drawing | Recharts LineChart | Already installed; handles responsive sizing, tooltips, legend |
| Date parsing | Manual ISO date parsing | `new Date(dateStr)` + `toLocaleDateString` | Standard browser API, sufficient for YYYY-MM-DD |
| Data fetching | Custom cache layer | Same useState/useEffect hook pattern used by all other hooks | Project convention; no React Query or SWR installed |

**Key insight:** All the hard parts (data, chart library, styling system) are already solved. This phase is primarily wiring: new API endpoint + new component + insert into DashboardView.

---

## Common Pitfalls

### Pitfall 1: Y-Axis Direction Confusion
**What goes wrong:** Default Recharts YAxis shows smaller numbers at the bottom. For running times, smaller = faster = better. A chart where times improve shows the line going DOWN, which reads as getting worse.
**Why it happens:** Recharts defaults are designed for "bigger is better" metrics like distance.
**How to avoid:** Add `reversed` prop to `<YAxis>` so the y-axis is inverted (smaller values at the top).
**Warning signs:** A PR time showing a downward trend on the chart.

### Pitfall 2: `_no_efforts` Sentinel Rows in Query
**What goes wrong:** The sync service inserts marker `BestEffort` rows with `name="_no_efforts"` and `moving_time=0` to mark activities that were checked but had no efforts. If not filtered, these appear in the progression data.
**Why it happens:** The sync service uses these markers to avoid re-fetching activities.
**How to avoid:** Filter `moving_time > 0` (already excludes markers) OR explicitly filter `name != "_no_efforts"`. Both work; belt-and-suspenders is fine.
**Warning signs:** Zero-time entries appearing in the chart.

### Pitfall 3: Sparse Data Creating Gaps
**What goes wrong:** A runner may have 5K efforts in 2022, none in 2023, and several in 2024. Wide-format data has `null` for the gap year. Recharts `<Line connectNulls={false}>` (the default) will break the line at nulls.
**Why it happens:** Each distance's efforts don't align to the same dates — the wide-format table has many nulls.
**How to avoid:** This is correct behavior — broken lines accurately show data gaps. Do NOT use `connectNulls={true}` which would fabricate a line through time periods with no data. Leave it as default (false).
**Warning signs:** Disconnected line segments (this is intentional, not a bug).

### Pitfall 4: Missing `start_date` on BestEffort Rows
**What goes wrong:** Some older BestEffort records may have `start_date=""` (the field defaults to empty string, not null).
**Why it happens:** The `BestEffort.start_date` field is `str = ""` — not nullable.
**How to avoid:** Filter `col(BestEffort.start_date) != ""` in the endpoint query. Or handle empty strings in the date formatter.
**Warning signs:** Invalid Date objects from `new Date("")`.

### Pitfall 5: Recharts YAxis Tick Overlap
**What goes wrong:** With many effort points over a long time span, X-axis date labels overlap.
**Why it happens:** Recharts renders every tick by default.
**How to avoid:** Set `minTickGap={60}` on `<XAxis>` — same pattern used in `TrendChart.tsx`.

---

## Code Examples

Verified patterns from existing codebase:

### Existing BestEffort Query Pattern (from trophies.py)
```python
# Source: backend/app/routers/trophies.py
stmt = (
    select(BestEffort)
    .where(func.lower(BestEffort.name).in_(names_lower))
    .where(col(BestEffort.moving_time) > 0)
    .order_by(col(BestEffort.moving_time).asc())
    .limit(1)
)
```
For the progression endpoint, remove `.limit(1)`, change `.order_by()` to `.asc()` on `start_date`, and loop over all results.

### Existing Hook Pattern (from useDashboard.ts)
```typescript
// Source: frontend/src/hooks/useDashboard.ts
export function useTrends(metric: Metric, ...) {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchTrends(...)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [metric, granularity, months, sportType]);

  return { data, loading, error };
}
```
`useBestEffortsProgression` follows this exact pattern with no parameters (the endpoint requires none).

### Existing Recharts Styling Conventions (from TrendChart.tsx)
```tsx
// Source: frontend/src/components/TrendChart.tsx
<CartesianGrid strokeDasharray="3 3" stroke="#374151" />
<XAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#374151" }} />
<YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#374151" }} />
<Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f3f4f6" }} />
```
All new charts must use these exact color values for consistency.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Querying activity.distance for PR detection | Using BestEffort table (Strava sub-activity segments) | Phase 5 | More accurate: Strava records a 5K split even in a 10K race |
| Single current PR per distance | Full history of all efforts per distance | Phase 9 (new) | Enables progression visualization |

**Deprecated/outdated:**
- Fallback distance-range matching on Activity table: Used only when BestEffort table is empty (not yet synced). For this phase, assume best efforts are synced (Phase 6 dependency satisfied).

---

## Open Questions

1. **Should the component be filterable by sport type?**
   - What we know: All other dashboard charts accept a `sportType` prop from `DashboardView`. BestEfforts are inherently run-specific (1mi, 5K, etc.).
   - What's unclear: Whether the chart should respond to the sport filter or always show running efforts only.
   - Recommendation: Ignore the sport filter in this component — best efforts only apply to running, and the filter would produce no data for other sport types. Keep component simple.

2. **What if the user has never synced best efforts?**
   - What we know: The endpoint will return `{"progression": {}}` with no distances — all have <2 efforts.
   - What's unclear: N/A — this is handled.
   - Recommendation: Show an empty state message: "No best effort data yet. Sync best efforts to see your progression." Include a note about `/api/sync/best-efforts` endpoint.

3. **Should the chart be in the Dashboard tab or Trophies tab?**
   - What we know: DASH-06 explicitly says "dashboard". The current DashboardView has MetricCards, TrendChart, ActivityFeed.
   - What's unclear: Visual placement order.
   - Recommendation: Insert `BestEffortsTimeline` between `TrendChart` and `ActivityFeed` in `DashboardView.tsx`.

---

## Sources

### Primary (HIGH confidence)
- Codebase: `backend/app/models.py` — BestEffort model fields verified directly
- Codebase: `backend/app/routers/trophies.py` — existing query patterns, PR_DISTANCES constant
- Codebase: `frontend/src/components/TrendChart.tsx` — Recharts usage, styling conventions
- Codebase: `frontend/src/hooks/useDashboard.ts` — hook pattern
- Codebase: `frontend/src/api/client.ts` + `types.ts` — API client conventions
- Codebase: `frontend/src/views/DashboardView.tsx` — integration point

### Secondary (MEDIUM confidence)
- Recharts 2.x docs: `reversed` prop on `<YAxis>` for inverted axis — verified behavior matches documentation pattern
- `connectNulls` prop default `false` on `<Line>` — verified against existing recharts usage in codebase

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — BestEffort model, query patterns, and Recharts conventions all verified from live codebase
- Pitfalls: HIGH — `_no_efforts` sentinel, Y-axis inversion, and sparse data gaps are all verifiable from the code

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable stack — Recharts 2.x API, SQLModel patterns)
