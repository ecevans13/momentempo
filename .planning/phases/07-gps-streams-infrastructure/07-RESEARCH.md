# Phase 7: GPS Streams Infrastructure - Research

**Researched:** 2026-03-13
**Domain:** Strava Streams API, SQLite JSON storage, FastAPI lazy-fetch caching
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STRM-01 | App lazily fetches GPS stream data (coordinates, altitude, HR, velocity) from Strava on first activity detail open and caches in SQLite; subsequent opens use the cache without calling Strava | Strava `/activities/{id}/streams` endpoint documented; SQLModel JSON column pattern verified; lazy-cache pattern maps cleanly to existing `BestEffort` marker approach |
</phase_requirements>

---

## Summary

Phase 7 adds GPS stream data (lat/lng, altitude, heart rate, velocity) as a lazy-fetched, SQLite-cached resource. The first time an activity detail is opened, the backend requests stream data from Strava and stores it; every subsequent open reads from the local cache with no Strava API call. Activities without GPS data (e.g., WeightTraining) are gracefully skipped because the Strava API simply omits unavailable stream types from the response rather than returning an error.

The project already has all the infrastructure needed: a rate-limit-aware `strava_get()` function in `strava_client.py`, a working SQLModel schema with SQLite, async FastAPI routes in `activity_detail.py`, and an established "marker row" pattern from the BestEffort sync (`_no_efforts`) that prevents redundant API calls. Phase 7 follows the same marker pattern: a `streams_fetched` flag (or a sentinel row) on the new `ActivityStream` model marks that fetch was attempted, so a second open never re-hits Strava even for zero-GPS activities.

The primary new work is: (1) a new `ActivityStream` SQLModel table with JSON columns for each stream array, (2) a service function `fetch_and_cache_streams()` that calls `/activities/{id}/streams`, parses the response, and upserts the row, (3) a new endpoint `GET /api/activity/{id}/streams` that checks the cache first and calls the service only on a miss, (4) a `streams_fetched` sentinel so zero-GPS activities are never re-fetched.

**Primary recommendation:** Add a single `ActivityStream` SQLModel table with `Optional[list]` JSON columns (one per stream type), a `fetched_at` timestamp, and reuse `strava_get()` from the existing client — no new libraries needed.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLModel | project-pinned | ORM + Pydantic model for `ActivityStream` table | Already in use; handles JSON column via `sa_column=Column(JSON)` |
| SQLAlchemy JSON | bundled with SQLAlchemy | JSON column type for array fields | SQLite-compatible; no separate install |
| httpx | project-pinned | Async HTTP client for Strava API call | Already used; `strava_get()` wraps it with rate-limit logic |
| FastAPI | project-pinned | New endpoint `GET /api/activity/{id}/streams` | Already in use; no new framework |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `json` (stdlib) | stdlib | Serialize/deserialize stream arrays for JSON columns | Already used in `strava_client.py` for `start_latlng` serialization |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single `ActivityStream` row per activity (JSON columns) | Separate table per stream type | One-row-per-activity is simpler; Phase 8 consumers only need full stream sets, not individual types |
| SQLAlchemy `JSON` type | Raw `TEXT` column + manual `json.loads` | JSON type is cleaner; SQLite stores it as TEXT anyway but JSON type handles serialization automatically |
| Marker row in new table | Boolean `streams_fetched` column on `Activity` | Adding columns to `Activity` requires migration; a new table is self-contained and follows existing BestEffort pattern |

**Installation:** No new dependencies — all libraries already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
backend/app/
├── models.py                       # Add ActivityStream model here
├── services/
│   ├── strava_client.py            # No change — strava_get() reused as-is
│   └── streams_service.py          # New: fetch_and_cache_streams()
└── routers/
    └── activity_detail.py          # Add GET /{activity_id}/streams endpoint
```

### Pattern 1: ActivityStream SQLModel Table

**What:** Single row per activity with one JSON column per stream array. A `fetched_at` timestamp (non-null) acts as the "already fetched" sentinel. A null `fetched_at` means never attempted.

**When to use:** One row per activity; downstream consumers (Phase 8) read the full row and pick what they need.

```python
# Source: https://github.com/fastapi/sqlmodel/discussions/1105
from typing import Any
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


class ActivityStream(SQLModel, table=True):
    """Cached GPS stream data for an activity. Null columns = stream not available."""
    activity_id: int = Field(primary_key=True)  # Strava activity ID

    # Stream arrays — null means the stream was not available for this activity
    latlng: list[Any] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    altitude: list[float] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    heartrate: list[int] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    velocity_smooth: list[float] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    time: list[int] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    distance: list[float] | None = Field(default=None, sa_column=Column(JSON, nullable=True))

    # Sentinel: if non-null, streams were fetched (regardless of whether GPS was present)
    fetched_at: float | None = Field(default=None)  # Unix epoch
```

**Key design decision:** `activity_id` is the primary key (not auto-increment), so `session.merge()` can be used for idempotent upsert — the same pattern as `Activity`.

### Pattern 2: Lazy-Fetch Service Function

**What:** A service function that checks the cache before calling Strava. Called from the streams endpoint. Returns the cached row or fetches and stores it.

```python
# Source: pattern from backend/app/services/strava_sync.py (sync_best_efforts)
async def fetch_and_cache_streams(
    activity_id: int,
    session: Session,
    settings: Settings,
) -> ActivityStream | None:
    """Return cached streams or fetch from Strava on cache miss.

    Returns None if the activity has no GPS data (fetched_at is set, all arrays null).
    """
    # Cache hit: fetched_at is set means we already attempted a fetch
    existing = session.get(ActivityStream, activity_id)
    if existing is not None and existing.fetched_at is not None:
        return existing  # Could have null arrays — that's valid (no GPS activity)

    # Cache miss: fetch from Strava
    token = await ensure_valid_token(session, settings)
    if token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    keys = "latlng,altitude,heartrate,velocity_smooth,time,distance"
    async with httpx.AsyncClient(timeout=30.0, verify=settings.ssl_verify) as client:
        response, _ = await strava_get(
            client,
            f"/activities/{activity_id}/streams",
            token.access_token,
            params={"keys": keys, "key_by_type": "true"},
        )

    if response.status_code == 404:
        # Activity not found — treat as no-GPS; store sentinel
        streams = ActivityStream(activity_id=activity_id, fetched_at=time.time())
        session.merge(streams)
        session.commit()
        return streams

    response.raise_for_status()
    data = response.json()  # Dict keyed by type when key_by_type=true

    # Parse response — streams for unavailable types simply won't be in the dict
    streams = ActivityStream(
        activity_id=activity_id,
        latlng=_extract_stream_data(data, "latlng"),
        altitude=_extract_stream_data(data, "altitude"),
        heartrate=_extract_stream_data(data, "heartrate"),
        velocity_smooth=_extract_stream_data(data, "velocity_smooth"),
        time=_extract_stream_data(data, "time"),
        distance=_extract_stream_data(data, "distance"),
        fetched_at=time.time(),
    )
    session.merge(streams)
    session.commit()
    return streams


def _extract_stream_data(data: dict, key: str) -> list | None:
    """Extract stream data array from key_by_type response. Returns None if stream absent."""
    stream = data.get(key)
    if stream is None:
        return None
    return stream.get("data")  # Stream object has: {data: [...], series_type, resolution, ...}
```

### Pattern 3: Endpoint in activity_detail.py

**What:** New route that the frontend calls to get cached stream data. Returns nulls gracefully for no-GPS activities.

```python
@router.get("/{activity_id}/streams")
async def get_activity_streams(request: Request, activity_id: int):
    """Return cached GPS streams for an activity.

    On first call: fetches from Strava and caches. Subsequent calls: reads from cache.
    Activities without GPS return null stream fields (no error).
    """
    with _get_session(request) as session:
        streams = await fetch_and_cache_streams(activity_id, session, get_settings())
    return {
        "activity_id": activity_id,
        "has_gps": streams.latlng is not None,
        "has_altitude": streams.altitude is not None,
        "has_heartrate": streams.heartrate is not None,
        "latlng": streams.latlng,
        "altitude": streams.altitude,
        "heartrate": streams.heartrate,
        "velocity_smooth": streams.velocity_smooth,
        "time": streams.time,
        "distance": streams.distance,
    }
```

### Pattern 4: No-GPS Activities — Graceful Handling

**What:** The Strava API omits unavailable stream types from the response; it does NOT return an error for valid activities without GPS. Indoor workouts, WeightTraining, etc. will simply have empty stream dicts.

**Detection:** Check `activity.summary_polyline` on the `Activity` model. If `summary_polyline` is null/empty, the activity almost certainly has no GPS. This can be used as a pre-fetch short-circuit: store a sentinel row without even calling Strava.

**Alternative approach** (more reliable): Skip the short-circuit and always attempt the Strava fetch — the API handles it gracefully. The sentinel (`fetched_at` set) ensures we never retry.

### Anti-Patterns to Avoid

- **Storing streams per-stream-type in separate rows:** Over-engineered for this use case. Phase 8 needs all streams together for map rendering.
- **Re-fetching if `fetched_at` is old:** Once fetched, GPS streams never change. There is no TTL on cached streams.
- **Requesting all 11 stream types:** Only request what the app uses (latlng, altitude, heartrate, velocity_smooth, time, distance). Reduces response size and rate limit usage.
- **Relying on `activity_type` to skip GPS fetch:** Strava has many activity types; using `summary_polyline` presence is a more reliable GPS indicator.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate-limited Strava API call | Custom HTTP client with rate limit logic | `strava_get()` from `strava_client.py` | Already handles 429 retry, pre-flight pauses, header parsing |
| JSON column serialization | Manual `json.dumps`/`json.loads` on TEXT column | SQLAlchemy `Column(JSON)` | Handles type round-trip; less error-prone in tests |
| Cache invalidation | Custom TTL logic | None needed — GPS streams never change | Once fetched, stream data is immutable for that activity |
| Re-fetch prevention | Separate "attempted" table | `fetched_at` column on `ActivityStream` | Same row holds both the sentinel and the data |

**Key insight:** GPS streams are immutable once recorded. No cache invalidation logic is needed — `fetched_at` is a write-once sentinel.

---

## Common Pitfalls

### Pitfall 1: `key_by_type=true` vs Array Response
**What goes wrong:** When `key_by_type=false` (default), the API returns an array of stream objects: `[{"type": "latlng", "data": [...]}, ...]`. When `key_by_type=true`, it returns a dict: `{"latlng": {"data": [...], ...}}`. Parsing logic differs.
**Why it happens:** The default array format requires iterating to find each type; dict format is easier.
**How to avoid:** Always pass `key_by_type=true` and use `data.get("latlng", {}).get("data")` to extract stream arrays.
**Warning signs:** KeyErrors when accessing `data["latlng"]` directly.

### Pitfall 2: Strava API Omits (Not Nulls) Missing Streams
**What goes wrong:** A WeightTraining activity returns `{}` (empty dict with `key_by_type=true`), not `{"latlng": null}`. Code that does `data["latlng"]["data"]` raises `KeyError`.
**Why it happens:** The API simply leaves out stream types that have no data.
**How to avoid:** Use `.get()` for all stream lookups: `data.get("latlng", {}).get("data")`.
**Warning signs:** `KeyError: 'latlng'` in production logs.

### Pitfall 3: SQLModel JSON Column Nullable Semantics
**What goes wrong:** `Field(default=None)` alone does not guarantee the column is nullable at the SQLAlchemy level when using `sa_column`.
**Why it happens:** SQLModel has known quirks with nullable inference when mixing `Field()` and `sa_column`.
**How to avoid:** Explicitly set `nullable=True` on the `Column`: `sa_column=Column(JSON, nullable=True)`.
**Warning signs:** SQLite `NOT NULL constraint failed` on insert for no-GPS activities.

### Pitfall 4: Missing `fetched_at` Sentinel Causes Infinite Re-Fetch
**What goes wrong:** If a no-GPS activity stores no row (or a row with `fetched_at=None`), every subsequent request re-hits the Strava API.
**Why it happens:** Forgetting to write the sentinel row when streams are empty.
**How to avoid:** Always write the `ActivityStream` row with `fetched_at=time.time()` after every Strava call, even when all stream arrays are null.
**Warning signs:** Repeated Strava API calls for the same activity visible in logs.

### Pitfall 5: `session.merge()` Requires Detached Object Handling
**What goes wrong:** `session.merge()` returns the managed instance; the original object passed in should not be used after the merge.
**Why it happens:** SQLModel/SQLAlchemy identity map behavior.
**How to avoid:** Use `merged = session.merge(streams); session.commit(); session.refresh(merged)` — same pattern as `Activity` in `strava_sync.py`.
**Warning signs:** `DetachedInstanceError` when accessing `streams.latlng` after `session.commit()`.

### Pitfall 6: Large Stream Arrays and SQLite Page Size
**What goes wrong:** A marathon activity can have 10,000+ GPS points. Storing as JSON in SQLite works but can be slow if queried frequently.
**Why it happens:** SQLite stores the JSON as TEXT; large blobs increase page reads.
**How to avoid:** This is acceptable for Phase 7 (single-activity fetch). Phase 8 should read streams only when rendering a detail view, not in list queries.
**Warning signs:** Slow activity list queries — check that `ActivityStream` is never JOINed in list endpoints.

---

## Code Examples

Verified patterns from official sources and project codebase:

### Calling the Strava Streams Endpoint
```python
# Source: https://strava.github.io/api/v3/streams/ + strava_client.py pattern
response, rate_limit = await strava_get(
    client,
    f"/activities/{activity_id}/streams",
    token.access_token,
    params={
        "keys": "latlng,altitude,heartrate,velocity_smooth,time,distance",
        "key_by_type": "true",
    },
    rate_limit=rate_limit,
)
# Response with key_by_type=true:
# {
#   "latlng": {"data": [[38.60, -122.86], ...], "series_type": "distance", "original_size": 512, "resolution": "high"},
#   "altitude": {"data": [142.3, 143.1, ...], ...},
#   "heartrate": {"data": [142, 145, ...], ...},
#   ...
# }
# If stream unavailable for activity: key simply absent from dict
```

### JSON Column Declaration in SQLModel
```python
# Source: https://github.com/fastapi/sqlmodel/discussions/1105
from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel

class ActivityStream(SQLModel, table=True):
    activity_id: int = Field(primary_key=True)
    latlng: list | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    altitude: list | None = Field(default=None, sa_column=Column(JSON, nullable=True))
```

### Cache-Check Pattern (from existing BestEffort precedent)
```python
# Source: backend/app/services/strava_sync.py — _no_efforts marker pattern
# Check if already fetched:
existing = session.get(ActivityStream, activity_id)
if existing is not None and existing.fetched_at is not None:
    return existing  # Cache hit — no API call

# Cache miss: fetch and store with fetched_at set
```

### Registering the New Router
```python
# Source: backend/app/main.py pattern
# In activity_detail.py — add route to existing router (no new router needed)
@router.get("/{activity_id}/streams")
async def get_activity_streams(request: Request, activity_id: int): ...
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Streams stored per-stream-type as separate rows | Single row per activity with JSON columns | N/A (project choice) | Simpler schema, fewer queries |
| Always fetch from Strava API on activity open | Lazy-fetch + SQLite cache | This phase | No repeated API calls after first open |

**Deprecated/outdated:**
- Strava v2 API endpoint format (`/v2/activities/:id/streams`): replaced by v3 `GET /activities/{id}/streams` — v3 is what the project already uses.

---

## Open Questions

1. **Should `summary_polyline` presence be used to short-circuit the streams fetch for no-GPS activities?**
   - What we know: `summary_polyline` null on `Activity` strongly indicates no GPS data. The Strava streams API for such activities returns an empty dict, not an error.
   - What's unclear: Edge cases — e.g., an activity with GPS but a short polyline that Strava compresses to null.
   - Recommendation: Do NOT short-circuit. Always call Strava on first open. The sentinel pattern handles the "already fetched" case regardless of result. Short-circuiting adds complexity and potential false negatives.

2. **What scope does the streams endpoint require?**
   - What we know: The API reference states `activity:read` scope is required (or `activity:read_all` for private activities). The existing token flow already requests `activity:read` scope.
   - What's unclear: Whether any OAuth scope change is needed.
   - Recommendation: Verify the token scope in the existing DB before implementing. If `activity:read` is already in the stored `Token.scope`, no OAuth change is needed. If missing, a re-auth will be required (LOW risk for personal dashboard).

3. **Should the streams endpoint be called eagerly on activity detail open, or via a separate frontend call?**
   - What we know: The existing `GET /api/activity/{id}` endpoint fetches detail from Strava on every call. Streams could be fetched in that same call (eager) or via a new endpoint (lazy/parallel).
   - What's unclear: Frontend architecture preferences for Phase 8 (map rendering).
   - Recommendation: Separate endpoint `GET /api/activity/{id}/streams` — keeps Phase 7 self-contained, lets Phase 8 fetch streams in parallel with the detail call, and avoids inflating the existing detail endpoint response.

---

## Sources

### Primary (HIGH confidence)
- `https://strava.github.io/api/v3/streams/` — Strava v3 streams endpoint format, request parameters, response structure, missing stream handling
- `https://github.com/fastapi/sqlmodel/discussions/1105` — SQLModel JSON column declaration pattern with `sa_column=Column(JSON, nullable=True)`
- `/Users/ecevans/Documents/GitHub/test_proj/backend/app/services/strava_client.py` — `strava_get()` function signature and rate-limit-aware pattern
- `/Users/ecevans/Documents/GitHub/test_proj/backend/app/models.py` — Existing `Activity`, `BestEffort` SQLModel patterns
- `/Users/ecevans/Documents/GitHub/test_proj/backend/app/services/strava_sync.py` — `_no_efforts` marker pattern, `session.merge()` upsert pattern

### Secondary (MEDIUM confidence)
- `https://communityhub.strava.com/developers-api-7/strava-api-activities-streams-api-not-returning-latlng-8199` — Confirmed: absent GPS streams are omitted from response (not nulled); recommended `.get()` pattern
- WebSearch cross-reference: stream types (latlng, altitude, heartrate, velocity_smooth, time, distance), response shape (each stream: `{data, series_type, original_size, resolution}`)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, no new installs
- Architecture: HIGH — directly derived from existing `BestEffort` marker pattern in the same codebase
- Strava API behavior: MEDIUM-HIGH — confirmed from official docs + community reports; `key_by_type=true` behavior verified from multiple sources
- Pitfalls: MEDIUM — SQLModel JSON nullable quirks from GitHub issues; session.merge() behavior from SQLAlchemy docs

**Research date:** 2026-03-13
**Valid until:** 2026-06-13 (Strava API stable; SQLModel stable)
