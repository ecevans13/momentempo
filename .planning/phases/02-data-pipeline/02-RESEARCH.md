# Phase 2: Data Pipeline - Research

**Researched:** 2026-02-27
**Domain:** Strava Activities API, paginated backfill, incremental sync, rate limiting, SQLite caching
**Confidence:** HIGH

## Summary

Phase 2 fetches all historical Strava activities via the `/api/v3/athlete/activities` endpoint and caches them in SQLite. The endpoint returns `SummaryActivity` objects with 40+ fields, supports pagination via `page`/`per_page` (max 200 per page) and timestamp filtering via `after`/`before` (epoch seconds). The Strava API enforces read rate limits of 100 requests per 15 minutes and 1,000 per day, reported in `X-ReadRateLimit-Usage` and `X-ReadRateLimit-Limit` response headers as comma-separated `short,long` values.

The sync architecture is straightforward for a single-user app: a full backfill paginating with `page` + `per_page=200` until an empty page is returned, then incremental syncs using the `after` parameter set to the most recent activity's `start_date` epoch. A TTL gate (15-minute cooldown stored in a `SyncState` table) prevents redundant syncs. Rate limit enforcement reads the response headers after each request and pauses when approaching thresholds.

**Primary recommendation:** Use page-based pagination with per_page=200 for backfill (simpler, reliable for single-user volumes), `after`-parameter for incremental sync, and parse `X-ReadRateLimit-Usage` headers after every API call to enforce limits proactively before hitting 429s.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-03 | App performs full-history backfill of all activities on first use (paginated, rate-limit-aware) | Strava activities endpoint supports page/per_page pagination (max 200/page), terminate on empty page; rate limit headers enable proactive throttling |
| DATA-04 | App caches activity data in SQLite with incremental sync (only fetch new activities) | `after` epoch parameter filters to activities after a timestamp; SyncState table tracks last sync time; Activity SQLModel table stores all SummaryActivity fields |
| DATA-05 | App enforces Strava rate limits (100/15min, 1000/day) with TTL-gated sync | X-ReadRateLimit-Usage/Limit headers return comma-separated short,long values; 429 status on exceed; SyncState TTL gate prevents re-sync within 15 minutes |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| httpx | >=0.27 | Async HTTP client for Strava API calls | Already used in Phase 1 for OAuth; AsyncClient supports response header access |
| SQLModel | >=0.0.21 | ORM for Activity and SyncState tables | Already used in Phase 1 for Token model; consistent patterns |
| FastAPI | >=0.115 | Sync trigger endpoint and background task support | Already the app framework |
| pydantic-settings | >=2.0 | Configuration (sync TTL, rate limits) | Already used for Settings |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| respx | >=0.21 | Mock httpx calls in tests | All API call tests |
| pytest-asyncio | >=0.23 | Test async sync functions | Sync service tests |

### No New Dependencies Needed

The existing stack covers all Phase 2 requirements. No additional packages are needed.

- `httpx.AsyncClient` provides `response.headers` access for rate limit parsing
- `SQLModel` handles the Activity table with standard Field() definitions
- `asyncio.sleep()` handles rate limit backoff (no external rate limiter library needed for single-user)
- Python `datetime` and `time` modules handle epoch conversions

## Architecture Patterns

### Recommended Project Structure

```
backend/app/
  models.py              # Add Activity and SyncState models
  services/
    strava_auth.py       # Existing — token management
    strava_sync.py       # NEW — sync orchestration (backfill + incremental)
    strava_client.py     # NEW — low-level API client with rate limit tracking
  routers/
    sync.py              # NEW — POST /api/sync endpoint
```

### Pattern 1: Rate-Limit-Aware API Client

**What:** A thin wrapper around httpx.AsyncClient that reads `X-ReadRateLimit-Usage` and `X-ReadRateLimit-Limit` from every response and tracks remaining budget. Before each request, it checks if the budget is exhausted and raises or waits.

**When to use:** Every Strava API call must go through this client.

**Key details on header format (verified from Strava docs + stravalib source):**

```
X-RateLimit-Limit: 600,30000        # overall: 15min_limit, daily_limit
X-RateLimit-Usage: 314,27536        # overall: 15min_used, daily_used
X-ReadRateLimit-Limit: 100,1000     # read-only: 15min_limit, daily_limit
X-ReadRateLimit-Usage: 42,567       # read-only: 15min_used, daily_used
```

Headers are comma-separated (not space-separated). Parse with `.split(",")`.

**Example:**

```python
# Source: Strava rate-limits docs + stravalib/util/limiter.py patterns
import logging
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

@dataclass
class RateLimitState:
    """Tracks Strava API rate limit usage from response headers."""
    short_usage: int = 0
    short_limit: int = 100
    long_usage: int = 0
    long_limit: int = 1000

    def update_from_headers(self, headers: httpx.Headers) -> None:
        """Parse X-ReadRateLimit-* headers (preferred) or X-RateLimit-* headers."""
        # Prefer read-specific headers for our GET-only use case
        usage_header = (
            headers.get("x-readratelimit-usage")
            or headers.get("x-ratelimit-usage")
        )
        limit_header = (
            headers.get("x-readratelimit-limit")
            or headers.get("x-ratelimit-limit")
        )

        if usage_header:
            parts = usage_header.split(",")
            self.short_usage = int(parts[0].strip())
            self.long_usage = int(parts[1].strip())

        if limit_header:
            parts = limit_header.split(",")
            self.short_limit = int(parts[0].strip())
            self.long_limit = int(parts[1].strip())

    @property
    def short_remaining(self) -> int:
        return max(0, self.short_limit - self.short_usage)

    @property
    def long_remaining(self) -> int:
        return max(0, self.long_limit - self.long_usage)

    @property
    def is_exhausted(self) -> bool:
        return self.short_remaining <= 0 or self.long_remaining <= 0

    def seconds_until_short_reset(self) -> float:
        """Seconds until the next 15-minute boundary (resets at :00, :15, :30, :45)."""
        now = datetime.now(timezone.utc)
        minutes_past = now.minute % 15
        seconds_past = minutes_past * 60 + now.second
        return (15 * 60) - seconds_past
```

**Confidence:** HIGH -- header format verified against Strava official docs and stravalib source code.

### Pattern 2: Page-Based Backfill with Empty-Page Termination

**What:** Iterate `page=1, 2, 3, ...` with `per_page=200` until the API returns an empty list.

**When to use:** First sync (no activities in DB yet).

**Why page-based, not timestamp-based, for backfill:** For initial backfill of a single user, page-based pagination is simpler and reliable. The Strava docs explicitly state: "If you need to fully go through the full set of results, prefer iterating until an empty page is returned." Timestamp-based (`before`) pagination is more robust for multi-user/high-volume apps but adds unnecessary complexity here.

**Critical caveat (from Strava docs):** "The number of items returned may be lower than the requested page size, even when that page is not the last." This means you CANNOT use `len(results) < per_page` as the termination condition. You MUST continue until `len(results) == 0`.

**Example:**

```python
# Source: Strava API docs — pagination section
STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"

async def fetch_all_activities(
    client: httpx.AsyncClient,
    access_token: str,
    rate_state: RateLimitState,
    after: int | None = None,
) -> list[dict]:
    """Fetch all activities, paginating until empty page. Rate-limit-aware."""
    all_activities = []
    page = 1
    per_page = 200  # Maximum allowed by Strava API

    while True:
        # Check rate limit BEFORE making request
        if rate_state.is_exhausted:
            wait = rate_state.seconds_until_short_reset() + 1
            logger.warning(
                "Rate limit approaching — sleeping %.0fs (short: %d/%d, daily: %d/%d)",
                wait, rate_state.short_usage, rate_state.short_limit,
                rate_state.long_usage, rate_state.long_limit,
            )
            await asyncio.sleep(wait)

        params: dict = {"page": page, "per_page": per_page}
        if after is not None:
            params["after"] = after

        response = await client.get(
            STRAVA_ACTIVITIES_URL,
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()

        # Update rate limit state from response headers
        rate_state.update_from_headers(response.headers)
        logger.info(
            "Page %d: %d activities (rate: %d/%d short, %d/%d daily)",
            page, len(response.json()),
            rate_state.short_usage, rate_state.short_limit,
            rate_state.long_usage, rate_state.long_limit,
        )

        activities = response.json()
        if not activities:  # Empty page = done
            break

        all_activities.extend(activities)
        page += 1

    return all_activities
```

**Confidence:** HIGH -- empty-page termination is explicitly documented by Strava.

### Pattern 3: Incremental Sync with `after` Parameter

**What:** On subsequent syncs, pass `after=<epoch_of_newest_stored_activity>` to only fetch activities created after the last sync.

**When to use:** Every sync after the initial backfill.

**Key detail:** The `after` parameter is an epoch timestamp (integer, seconds since Unix epoch). It filters to activities with `start_date` after the given time.

**Example:**

```python
from sqlmodel import Session, select, func
from datetime import datetime

def get_latest_activity_epoch(session: Session) -> int | None:
    """Get the start_date epoch of the most recent stored activity."""
    # Query the max start_date from the Activity table
    statement = select(func.max(Activity.start_date_epoch))
    result = session.exec(statement).first()
    return result  # None if no activities exist
```

**Confidence:** HIGH -- `after` parameter documented in official Strava API reference.

### Pattern 4: TTL-Gated Sync

**What:** A SyncState singleton row stores `last_sync_at` (epoch). Before starting a sync, check if `time.time() - last_sync_at < TTL_SECONDS`. If within TTL, skip the sync.

**When to use:** Every sync trigger (endpoint call, startup).

**Default TTL:** 900 seconds (15 minutes), matching the requirement.

**Example:**

```python
import time
from sqlmodel import Session, select

SYNC_TTL_SECONDS = 900  # 15 minutes

def should_sync(session: Session) -> bool:
    """Return True if enough time has passed since the last sync."""
    state = session.exec(select(SyncState).where(SyncState.id == 1)).first()
    if state is None:
        return True  # Never synced — backfill needed
    return time.time() - state.last_sync_completed_at > SYNC_TTL_SECONDS
```

**Confidence:** HIGH -- straightforward time comparison with no external dependencies.

### Anti-Patterns to Avoid

- **Using `len(results) < per_page` to detect the last page:** Strava explicitly warns that pages may return fewer items than requested even when more pages exist. Always check for an empty page (`len(results) == 0`).
- **Sleeping a fixed duration between every request:** Wasteful. Instead, read the rate limit headers and only sleep when approaching the limit.
- **Creating a new httpx.AsyncClient per request:** Reuse a single client instance for connection pooling.
- **Storing `start_date` as a string without an epoch column:** Querying "max date" and converting ISO strings is fragile. Store a pre-computed `start_date_epoch` integer for efficient `after` parameter lookups.
- **Mixing `after`/`before` with `page` for incremental sync:** For incremental sync, use `after` + `page=1` + `per_page=200` and paginate. The `after` param filters at the API level; `page` paginates the filtered results.
- **Running sync synchronously in a request handler:** A full backfill can take many seconds. Use FastAPI `BackgroundTasks` or track sync status so the endpoint returns immediately.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client with retry | Custom retry loop | httpx built-in + manual rate limit sleep | httpx handles connection pooling; rate limit logic is Strava-specific (header parsing) so a generic retry library adds no value |
| Epoch timestamp handling | Manual string parsing | `datetime.fromisoformat()` + `.timestamp()` | Strava returns ISO 8601 strings (`2024-01-15T10:30:00Z`); Python's datetime handles this correctly |
| Database migrations | Manual ALTER TABLE | SQLModel `create_all()` for v1 (no existing data to migrate) | Fresh table creation is fine for initial development; Alembic only needed when schema changes after production data exists |

**Key insight:** For a single-user app with no concurrent sync pressure, simple in-process rate tracking and sequential pagination are the right tools. Libraries like `aiometer` or `httpx-limiter` are designed for concurrent request limiting -- overkill here.

## Common Pitfalls

### Pitfall 1: Rate Limit 429 Handling
**What goes wrong:** App hits 429 Too Many Requests and either crashes or enters an infinite retry loop.
**Why it happens:** Not reading the response headers before making requests; only reacting to 429 instead of preventing it.
**How to avoid:** Read `X-ReadRateLimit-Usage` after every response. Before each request, check if usage is at or near the limit. If `short_remaining <= 1` or `long_remaining <= 1`, sleep until the next reset window.
**Warning signs:** Any 429 in the logs means the proactive check is failing.

### Pitfall 2: Empty Page vs Short Page Confusion
**What goes wrong:** Pagination stops too early, missing hundreds of activities.
**Why it happens:** Using `len(page) < per_page` as the stop condition.
**How to avoid:** Only stop when `len(page) == 0`. This is explicitly documented by Strava.
**Warning signs:** User reports "only 200 activities imported" when they have thousands.

### Pitfall 3: Token Expiry Mid-Sync
**What goes wrong:** A long backfill takes 10+ minutes, and the access token expires mid-sync, causing 401s.
**Why it happens:** Strava access tokens expire after 6 hours (21600 seconds), but if a token was already close to expiry when sync started, it could expire during the backfill.
**How to avoid:** Call `ensure_valid_token()` before starting the sync. If a 401 is received mid-sync, refresh the token and retry that single request.
**Warning signs:** 401 errors in sync logs after successful initial pages.

### Pitfall 4: Duplicate Activities on Re-Sync
**What goes wrong:** Running sync multiple times creates duplicate rows in the Activity table.
**Why it happens:** Using INSERT without checking if the activity ID already exists.
**How to avoid:** Use the Strava `id` field as the primary key or a unique constraint. Use INSERT OR REPLACE / upsert semantics.
**Warning signs:** Activity count in DB exceeds the count shown on the Strava profile.

### Pitfall 5: 15-Minute Reset Alignment
**What goes wrong:** Rate limit counter does not reset when expected.
**Why it happens:** Strava's 15-minute windows reset at natural clock boundaries (:00, :15, :30, :45 UTC), not 15 minutes from the first request.
**How to avoid:** Calculate sleep time based on the next 15-minute boundary, not from the current time.
**Warning signs:** Rate limit budget calculation is off after sleeping.

### Pitfall 6: Missing Nullable Fields
**What goes wrong:** Parsing fails on activities without heart rate, cadence, or power data.
**Why it happens:** Fields like `average_heartrate`, `max_heartrate`, `average_cadence`, `average_watts` are only present when `has_heartrate` is True or when the device recorded that data.
**How to avoid:** All Optional fields in the Activity model must default to `None`. Use `dict.get()` when parsing the API response, not direct key access.
**Warning signs:** `KeyError` or validation errors for strength training, walking, or manual activities.

## Code Examples

### Activity SQLModel Table Definition

```python
# Source: Strava SummaryActivity schema + project SQLModel conventions
from datetime import datetime
from sqlmodel import Field, SQLModel

class Activity(SQLModel, table=True):
    """Cached Strava SummaryActivity. Primary key is the Strava activity ID."""
    # Identity
    id: int = Field(primary_key=True)  # Strava activity ID — NOT auto-generated
    athlete_id: int

    # Core fields
    name: str
    sport_type: str                      # e.g. "Run", "TrailRun", "WeightTraining"
    activity_type: str                   # Legacy "type" field — e.g. "Run", "Ride"
    start_date: str                      # ISO 8601 UTC string from Strava
    start_date_local: str                # ISO 8601 local time string
    start_date_epoch: int = Field(index=True)  # Pre-computed for `after` queries
    timezone: str

    # Metrics
    distance: float                      # meters
    moving_time: int                     # seconds
    elapsed_time: int                    # seconds
    total_elevation_gain: float          # meters

    # Speed
    average_speed: float                 # meters/second
    max_speed: float                     # meters/second

    # Heart rate (nullable — not all activities have HR)
    has_heartrate: bool = False
    average_heartrate: float | None = Field(default=None)
    max_heartrate: int | None = Field(default=None)

    # Optional metrics (device-dependent)
    average_cadence: float | None = Field(default=None)
    average_watts: float | None = Field(default=None)
    max_watts: int | None = Field(default=None)
    weighted_average_watts: int | None = Field(default=None)
    kilojoules: float | None = Field(default=None)
    suffer_score: int | None = Field(default=None)

    # Social/metadata
    kudos_count: int = 0
    achievement_count: int = 0
    pr_count: int = 0
    gear_id: str | None = Field(default=None)
    device_name: str | None = Field(default=None)
    workout_type: int | None = Field(default=None)

    # Map data (stored as string — polyline encoded)
    map_summary_polyline: str | None = Field(default=None)

    # Flags
    trainer: bool = False
    commute: bool = False
    manual: bool = False
    private: bool = False
    flagged: bool = False

    # External IDs
    upload_id: int | None = Field(default=None)
    external_id: str | None = Field(default=None)
```

**Key design decisions:**
1. `id` is the Strava activity ID (not auto-incremented) -- natural upsert key
2. `start_date_epoch` is indexed for fast incremental sync queries
3. `activity_type` stores the legacy `type` field; `sport_type` stores the newer granular field
4. All HR/power fields are nullable with `None` defaults
5. `map_summary_polyline` stored as string for future route rendering

### SyncState Model

```python
class SyncState(SQLModel, table=True):
    """Singleton row (id=1) tracking sync metadata."""
    id: int | None = Field(default=None, primary_key=True)
    last_sync_completed_at: float = 0.0    # epoch timestamp
    last_sync_activity_count: int = 0       # activities fetched in last sync
    total_activities_stored: int = 0        # total in DB after last sync
    is_initial_backfill_done: bool = False  # True after first full sync
```

### Mapping Strava Response to Activity Model

```python
from datetime import datetime, timezone

def strava_activity_to_model(data: dict) -> Activity:
    """Convert a Strava SummaryActivity JSON dict to an Activity model instance."""
    # Parse ISO 8601 start_date to epoch for indexing
    start_dt = datetime.fromisoformat(data["start_date"].replace("Z", "+00:00"))
    start_epoch = int(start_dt.timestamp())

    return Activity(
        id=data["id"],
        athlete_id=data["athlete"]["id"],
        name=data["name"],
        sport_type=data.get("sport_type", data.get("type", "Unknown")),
        activity_type=data.get("type", "Unknown"),
        start_date=data["start_date"],
        start_date_local=data["start_date_local"],
        start_date_epoch=start_epoch,
        timezone=data.get("timezone", ""),
        distance=data.get("distance", 0.0),
        moving_time=data.get("moving_time", 0),
        elapsed_time=data.get("elapsed_time", 0),
        total_elevation_gain=data.get("total_elevation_gain", 0.0),
        average_speed=data.get("average_speed", 0.0),
        max_speed=data.get("max_speed", 0.0),
        has_heartrate=data.get("has_heartrate", False),
        average_heartrate=data.get("average_heartrate"),
        max_heartrate=data.get("max_heartrate"),
        average_cadence=data.get("average_cadence"),
        average_watts=data.get("average_watts"),
        max_watts=data.get("max_watts"),
        weighted_average_watts=data.get("weighted_average_watts"),
        kilojoules=data.get("kilojoules"),
        suffer_score=data.get("suffer_score"),
        kudos_count=data.get("kudos_count", 0),
        achievement_count=data.get("achievement_count", 0),
        pr_count=data.get("pr_count", 0),
        gear_id=data.get("gear_id"),
        device_name=data.get("device_name"),
        workout_type=data.get("workout_type"),
        map_summary_polyline=data.get("map", {}).get("summary_polyline"),
        trainer=data.get("trainer", False),
        commute=data.get("commute", False),
        manual=data.get("manual", False),
        private=data.get("private", False),
        flagged=data.get("flagged", False),
        upload_id=data.get("upload_id"),
        external_id=data.get("external_id"),
    )
```

### Upsert Activities into SQLite

```python
from sqlmodel import Session

def upsert_activities(session: Session, activities: list[Activity]) -> int:
    """Insert or update activities. Returns count of upserted rows."""
    count = 0
    for activity in activities:
        # merge() handles upsert: inserts if new, updates if existing PK found
        session.merge(activity)
        count += 1
    session.commit()
    return count
```

**Note:** `session.merge()` is the SQLAlchemy/SQLModel upsert mechanism. It checks if an object with the same primary key exists; if so, it updates the existing row. This is critical for avoiding duplicates on re-sync.

### Sync Orchestrator

```python
import time
import logging

from sqlmodel import Session, select, func

logger = logging.getLogger(__name__)

SYNC_TTL_SECONDS = 900  # 15 minutes

async def run_sync(session: Session, settings) -> dict:
    """Main sync entry point. Returns sync result summary."""
    # 1. TTL gate
    sync_state = session.exec(select(SyncState).where(SyncState.id == 1)).first()
    if sync_state and time.time() - sync_state.last_sync_completed_at < SYNC_TTL_SECONDS:
        seconds_remaining = SYNC_TTL_SECONDS - (time.time() - sync_state.last_sync_completed_at)
        return {"status": "skipped", "reason": "ttl", "retry_after_seconds": int(seconds_remaining)}

    # 2. Ensure valid token
    token = await ensure_valid_token(session, settings)
    if token is None:
        return {"status": "error", "reason": "no_token"}

    # 3. Determine sync mode
    rate_state = RateLimitState()
    if sync_state and sync_state.is_initial_backfill_done:
        # Incremental: only fetch activities after the latest stored one
        latest_epoch = session.exec(
            select(func.max(Activity.start_date_epoch))
        ).first()
        after_epoch = latest_epoch if latest_epoch else None
    else:
        after_epoch = None  # Full backfill

    # 4. Fetch activities
    async with httpx.AsyncClient() as client:
        raw_activities = await fetch_all_activities(
            client, token.access_token, rate_state, after=after_epoch
        )

    # 5. Convert and upsert
    activities = [strava_activity_to_model(a) for a in raw_activities]
    upserted = upsert_activities(session, activities)

    # 6. Update sync state
    total = session.exec(select(func.count(Activity.id))).first() or 0
    if sync_state is None:
        sync_state = SyncState(id=1)
    sync_state.last_sync_completed_at = time.time()
    sync_state.last_sync_activity_count = upserted
    sync_state.total_activities_stored = total
    sync_state.is_initial_backfill_done = True
    session.merge(sync_state)
    session.commit()

    return {
        "status": "completed",
        "activities_fetched": len(raw_activities),
        "activities_upserted": upserted,
        "total_stored": total,
    }
```

### Rate-Limit-Aware Request with 429 Handling

```python
async def strava_get(
    client: httpx.AsyncClient,
    url: str,
    params: dict,
    access_token: str,
    rate_state: RateLimitState,
    max_retries: int = 2,
) -> httpx.Response:
    """Make a GET request to Strava, handling rate limits and 429s."""
    for attempt in range(max_retries + 1):
        # Proactive rate limit check
        if rate_state.is_exhausted:
            wait = rate_state.seconds_until_short_reset() + 1
            logger.warning("Rate limit reached — sleeping %.0fs", wait)
            await asyncio.sleep(wait)

        response = await client.get(
            url,
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
        )

        # Always update rate state from headers
        rate_state.update_from_headers(response.headers)

        if response.status_code == 429:
            wait = rate_state.seconds_until_short_reset() + 1
            logger.warning("429 received — sleeping %.0fs (attempt %d)", wait, attempt + 1)
            await asyncio.sleep(wait)
            continue

        response.raise_for_status()
        return response

    raise httpx.HTTPStatusError(
        "Rate limit exceeded after retries",
        request=response.request,
        response=response,
    )
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `type` field only | `sport_type` field (more granular) | Strava API v3 2022 | "MountainBikeRide" vs just "Ride"; store both for compatibility |
| Polling for new activities | Strava Webhooks (push model) | Available since 2018 | Reduces API calls; NOT needed for Phase 2 (single-user, manual trigger) but relevant for Phase 6+ |
| `X-RateLimit-*` headers only | `X-ReadRateLimit-*` headers added | 2020+ | Read-specific limits are what matter for GET-only operations |

**Not needed for Phase 2:**
- Strava Webhooks -- overkill for single-user; a manual "Sync" button or startup trigger is sufficient
- Detailed Activity endpoint (`/activities/{id}`) -- SummaryActivity from list endpoint has all fields needed for the dashboard
- stravalib Python library -- adds dependency for what is 1 endpoint call; httpx is already in the stack

## Open Questions

1. **Activities with future start_date (manual entry or timezone edge cases)**
   - What we know: The `after` parameter filters by `start_date`, so a manually entered activity with a future date would be missed by incremental sync if the `after` value is before it
   - What's unclear: How common this is in practice
   - Recommendation: Use `after = latest_epoch - 86400` (subtract 1 day buffer) for incremental sync to catch edge cases. The upsert handles duplicates.

2. **Maximum total activities a user can have**
   - What we know: Community reports of 500+ activities retrieved successfully; no documented hard cap
   - What's unclear: Whether Strava has an undocumented upper limit (e.g., 10,000+ activities for decade-long users)
   - Recommendation: For a user with 5,000 activities at 200/page = 25 pages = 25 API calls. Well within the 100/15min limit. No special handling needed.

3. **Background task vs synchronous sync**
   - What we know: A full backfill of 5,000 activities takes ~25 API calls, likely 20-30 seconds total
   - What's unclear: Whether this delay is acceptable for a single-user desktop app
   - Recommendation: Start with `BackgroundTasks` for the sync endpoint so the HTTP response returns immediately. The sync status can be checked via the sync state endpoint.

## Sources

### Primary (HIGH confidence)
- [Strava API Reference - getLoggedInAthleteActivities](https://developers.strava.com/docs/reference/#api-Activities-getLoggedInAthleteActivities) -- endpoint params, response schema
- [Strava API Rate Limits](https://developers.strava.com/docs/rate-limits/) -- limit values, header format, reset behavior
- [Strava API Pagination](https://developers.strava.com/docs/) -- per_page max 200, empty-page termination, short-page caveat
- [Strava SummaryActivity Model](https://developers.strava.com/docs/reference/#api-models-SummaryActivity) -- all field names and types
- [stravalib rate limiter source](https://stravalib.readthedocs.io/en/latest/_modules/stravalib/util/limiter.html) -- header parsing format verified (comma-separated)

### Secondary (MEDIUM confidence)
- [Strava Community Hub - Activities Limit](https://communityhub.strava.com/developers-api-7/list-athlete-activities-limit-2535) -- pagination reliability discussion, page vs before/after
- [Strava Community Hub - Rate Limit Avoidance](https://communityhub.strava.com/developers-api-7/how-to-avoid-rate-limit-11118) -- community best practices

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; all patterns use existing libraries verified in Phase 1
- Architecture: HIGH -- pagination, rate limiting, and sync patterns are well-documented by Strava and verified against stravalib reference implementation
- Pitfalls: HIGH -- Strava's official docs explicitly warn about the short-page gotcha; rate limit header format verified against two independent sources (docs + stravalib source)
- Activity field mapping: HIGH -- SummaryActivity schema directly from Strava API reference

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (Strava API v3 is stable; rate limits and endpoints rarely change)
