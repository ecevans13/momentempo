# Architecture Patterns: Strava Personal Fitness Dashboard

**Domain:** Strava-integrated personal fitness dashboard
**Researched:** 2026-02-27
**Overall confidence:** MEDIUM (Strava API and OAuth patterns are stable and well-documented; specific library choices evolve but core architecture is proven)

---

## Recommended Architecture

A layered, service-oriented architecture with a Python backend acting as a Strava API proxy and data cache, and a JavaScript SPA frontend. The backend owns all Strava communication, token management, and caching. The frontend is a dumb consumer of a clean internal REST/JSON API.

```
┌─────────────────────────────────────────────────────┐
│                    Browser (SPA)                    │
│   React + Vite | Charting | Mapping | Dark theme    │
└────────────────────────┬────────────────────────────┘
                         │ HTTP/JSON (internal API)
┌────────────────────────▼────────────────────────────┐
│               Python Backend (FastAPI)               │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │   API Layer  │  │ Service Layer│  │ Data Layer│  │
│  │  (routes)   │  │ (business    │  │ (SQLite + │  │
│  │             │  │  logic)      │  │  cache)   │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬─────┘  │
│         └────────────────┴────────────────┘         │
└────────────────────────┬────────────────────────────┘
                         │ OAuth2 + HTTP
┌────────────────────────▼────────────────────────────┐
│                  Strava API                         │
│  /athlete  /activities  /gear  /segments  /routes   │
└─────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **SPA (React)** | Renders UI, charts, maps, handles user interactions, time-range filtering, theme switching | Backend API only — never touches Strava directly |
| **Backend API Layer (FastAPI routes)** | Exposes JSON endpoints, handles request validation, coordinates service calls | SPA (consumer), Service Layer (producer) |
| **Strava Auth Service** | Manages OAuth flow, stores tokens, handles refresh automatically before expiry | Strava OAuth endpoints, Token Store |
| **Strava Client Service** | Wraps all Strava API calls, enforces rate limiting, deduplicates requests | Strava REST API, Cache Layer |
| **Activity Service** | Transforms raw Strava data into app-shaped models, computes derived metrics (zones, pace, trends) | Strava Client, Database |
| **Gear Service** | Fetches gear metadata from Strava, coordinates image search via product name | Strava Client, Image Search API (optional), Database |
| **Trophy/Achievement Service** | Aggregates Strava PRs + segment efforts + custom milestones | Activity Service, Database |
| **Projection Engine** | Computes VO2max/pace/zone projections from training plan inputs | Activity Service (historical data) |
| **Cache/Data Layer (SQLite)** | Persists fetched activities, tokens, computed metrics; reduces Strava API calls | All services |
| **Deployment Host** | Serves the built SPA as static files, runs the FastAPI app | Browser (static), Strava (OAuth callback) |

**Confidence:** HIGH — this layered pattern is standard for any OAuth-integrated dashboard.

---

## Strava OAuth Flow

Strava uses OAuth 2.0 with short-lived access tokens (6 hours) and long-lived refresh tokens.

```
1. First-run setup (one time, developer-side):
   Browser → GET /auth/strava
   Backend → redirect to Strava authorization URL
   Strava  → redirect to /auth/callback?code=XXX
   Backend → exchange code for {access_token, refresh_token, expires_at}
   Backend → persist tokens to SQLite (encrypted or env-var protected)

2. Subsequent API calls (automatic, transparent):
   SPA     → GET /api/activities
   Backend → check token expires_at
           → if expired: POST strava.com/oauth/token (refresh_token grant)
                         → store new access_token + expires_at
           → use access_token to call Strava API
           → return transformed data to SPA
```

Key insight: For a single-user app, you do the OAuth dance once, store the refresh token, and never need to show OAuth UI again. The backend silently refreshes before every API call when needed.

**Scopes required:**
- `activity:read_all` — full activity list including private
- `profile:read_all` — athlete stats
- `read` — gear, segments

**Confidence:** HIGH — Strava OAuth docs are stable and well-established.

---

## Data Flow

### Page Load / Sync Flow

```
Browser opens dashboard
  └─→ SPA mounts → calls GET /api/sync
        └─→ Backend: check last sync timestamp
              ├─ If < 15 min ago: skip API call, return cached data
              └─ If stale: call Strava /athlete/activities?after={last_sync}
                    └─→ Store new activities in SQLite
                    └─→ Return {synced: N, total: M}
  └─→ SPA calls GET /api/dashboard?range=90d
        └─→ Backend queries SQLite, computes aggregates
        └─→ Returns JSON: {stats, trend_data, recent_activities}
  └─→ SPA renders charts/metrics from JSON
```

### Activity Drill-Down Flow

```
User clicks activity card
  └─→ SPA calls GET /api/activities/{id}
        └─→ Backend: check SQLite cache for full activity detail
              ├─ Hit: return stored data
              └─ Miss: call Strava GET /activities/{id}?include_all_efforts=true
                    └─→ Store in SQLite
                    └─→ Return: {laps, streams, segment_efforts, map.polyline}
  └─→ SPA decodes polyline → renders Leaflet/MapLibre map
  └─→ SPA renders pace/HR chart from streams data
```

### Gear Gallery Flow

```
SPA calls GET /api/gear
  └─→ Backend fetches athlete.shoes + athlete.bikes from Strava
  └─→ For each gear item:
        ├─ Check SQLite for cached image URL
        └─ If missing: search product name via image API (Brave Search / Google Custom Search)
              └─→ Store image URL in SQLite
  └─→ Return gear list with image URLs
```

### Workout Projection Flow (client-side compute)

```
User enters training plan parameters
  └─→ SPA calls GET /api/athlete/stats (historical HR zones, VO2max baseline)
  └─→ SPA runs projection algorithm client-side (or via POST /api/project)
        ├─ Input: {weeks, runs_per_week, intensity_distribution}
        ├─ Baseline: {current_vo2max, avg_hr, training_load}
        └─ Output: {projected_pace, projected_zones, delta_metrics}
  └─→ SPA renders projection chart
```

**Confidence:** HIGH for OAuth/sync patterns. MEDIUM for projection engine (algorithm design is project-specific).

---

## Patterns to Follow

### Pattern 1: Backend-as-Strava-Proxy

**What:** All Strava API calls go through the backend. The SPA never calls strava.com directly.

**Why:** Keeps tokens server-side (never exposed to browser), enables caching at the API layer, centralizes rate limit enforcement, makes the SPA easily portable.

**Implementation:**
```python
# backend/services/strava_client.py
class StravaClient:
    def __init__(self, token_store: TokenStore):
        self.token_store = token_store

    def _get_headers(self) -> dict:
        token = self.token_store.get_valid_token()  # auto-refreshes
        return {"Authorization": f"Bearer {token}"}

    def get_activities(self, after: int | None = None) -> list[dict]:
        params = {"per_page": 200}
        if after:
            params["after"] = after
        resp = httpx.get(
            "https://www.strava.com/api/v3/athlete/activities",
            headers=self._get_headers(),
            params=params,
        )
        resp.raise_for_status()
        return resp.json()
```

### Pattern 2: Incremental Sync with Watermark

**What:** Track last sync timestamp. Only fetch activities newer than that timestamp.

**Why:** Strava rate limits are 100 req/15min, 1000/day. Fetching full history on every page load would exhaust limits quickly. Incremental sync keeps daily usage low.

**Implementation:**
```python
# On sync:
last_sync = db.get_setting("last_sync_at")
new_activities = strava.get_activities(after=last_sync)
db.upsert_activities(new_activities)
db.set_setting("last_sync_at", now())
```

### Pattern 3: SQLite as Local Data Warehouse

**What:** Store all fetched activity data in SQLite. All dashboard queries hit SQLite, not Strava.

**Why:** SQLite is fast, zero-infrastructure, perfect for single-user apps. Enables complex aggregations (trend queries, zone breakdowns) without repeated API calls. Also means the dashboard works offline after first sync.

**Schema sketch:**
```sql
activities (id, athlete_id, name, type, start_date, distance,
            moving_time, elapsed_time, total_elevation_gain,
            average_speed, max_speed, average_heartrate,
            max_heartrate, suffer_score, map_polyline, raw_json)

activity_streams (activity_id, stream_type, data_json)

gear (id, name, brand_name, model_name, distance, image_url)

tokens (id, access_token, refresh_token, expires_at, scope)

sync_state (key, value)  -- last_sync_at, total_synced, etc.
```

### Pattern 4: Polyline Decode in Frontend

**What:** Strava returns route as encoded Google Polyline string. Decode in frontend, render with Leaflet or MapLibre GL.

**Why:** Polylines are compact (small JSON payload). Decoding is cheap client-side. Map rendering needs to happen in browser anyway.

**Libraries:**
- `@mapbox/polyline` (decode)
- `leaflet` or `maplibre-gl` (render)
- `react-leaflet` (React wrapper for Leaflet)

### Pattern 5: Streaming Data for Charts

**What:** For activity drill-downs, store the raw Strava streams (time, distance, heartrate, velocity_smooth, altitude) in SQLite as JSON blobs. Transform to chart-ready format on read.

**Why:** Strava streams are paginated and expensive to re-fetch. Storing them once allows rich chart interactivity without re-hitting the API.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Calling Strava from the Browser

**What:** Making `fetch("https://www.strava.com/api/v3/...")` from React code.

**Why bad:** Exposes your access token in the browser (visible in devtools). Tokens can be stolen. Also ties you to CORS limitations and makes caching impossible.

**Instead:** Always proxy through your backend. Never ship tokens to the client.

### Anti-Pattern 2: Fetching Full History on Every Page Load

**What:** Calling `/athlete/activities` for all activities on every visit.

**Why bad:** Blows through Strava's 100 req/15min rate limit instantly for users with 500+ activities. Also makes the app unusably slow.

**Instead:** Incremental sync with watermark timestamp. Full history fetch only on first run (paginated, with delay between pages).

### Anti-Pattern 3: Storing Tokens in Environment Variables Only

**What:** Hardcoding access_token in `.env`, relying on never rotating it.

**Why bad:** Strava access tokens expire in 6 hours. The app breaks after expiry. Refresh tokens also expire if unused for 6 months.

**Instead:** Store refresh_token in SQLite (or encrypted file). Auto-refresh before each API call using the refresh token grant.

### Anti-Pattern 4: Computing Aggregates in Python on Every Request

**What:** Loading all 1000 activities into Python lists and computing trends with loops.

**Why bad:** Slow for large datasets. SQLite can do aggregations much faster in the DB layer.

**Instead:** Use SQL window functions and GROUP BY for trend queries. Only load aggregated data into Python.

### Anti-Pattern 5: Monolith Route File

**What:** One massive `routes.py` with all 30 endpoints.

**Why bad:** Hard to navigate, test, and maintain as the dashboard grows.

**Instead:** Organize by domain: `routes/activities.py`, `routes/gear.py`, `routes/athlete.py`, `routes/auth.py`. Use FastAPI `APIRouter` to compose them.

---

## Suggested Directory Structure

```
stravaviz/
├── backend/
│   ├── main.py                 # FastAPI app creation, router mounting
│   ├── config.py               # Settings (env vars, rate limits)
│   ├── database.py             # SQLite setup, migrations
│   ├── routes/
│   │   ├── auth.py             # OAuth flow endpoints
│   │   ├── activities.py       # Activity list, drill-down
│   │   ├── athlete.py          # Stats, zones, sync
│   │   ├── gear.py             # Gear gallery
│   │   └── projections.py      # Workout projector
│   ├── services/
│   │   ├── strava_client.py    # Strava API wrapper + rate limiting
│   │   ├── token_store.py      # Token persistence + auto-refresh
│   │   ├── activity_service.py # Transform + compute
│   │   ├── gear_service.py     # Gear + image fetching
│   │   └── projection.py       # Training projection algorithms
│   └── models/
│       ├── activity.py         # Pydantic models
│       └── athlete.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard/
│   │   │   ├── ActivityDetail/
│   │   │   ├── GearGallery/
│   │   │   ├── TrophyCase/
│   │   │   └── Projector/
│   │   ├── api/                # Typed API client (fetch wrappers)
│   │   ├── hooks/              # React Query hooks
│   │   └── utils/
│   │       └── polyline.ts     # Route decoding
│   ├── index.html
│   └── vite.config.ts
├── pyproject.toml
├── .env.example                # STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
└── .gitignore
```

---

## Build Order (Phase Dependencies)

Components must be built in dependency order. Later components depend on earlier ones being functional.

```
Phase 1: Foundation
  └─→ Project scaffolding (pyproject.toml, .gitignore, env setup)
  └─→ SQLite schema + migrations
  └─→ FastAPI app skeleton (main.py, health check)

Phase 2: Strava Auth (UNBLOCKS EVERYTHING)
  └─→ OAuth flow endpoints (/auth/strava, /auth/callback)
  └─→ Token store (persist refresh_token to SQLite)
  └─→ Auto-refresh middleware
  └─→ Strava client wrapper
  [Nothing else can be built until this works]

Phase 3: Data Pipeline
  └─→ Incremental sync endpoint (/api/sync)
  └─→ Initial full-history backfill (paginated)
  └─→ Activity storage in SQLite (basic fields)
  └─→ Activity streams storage (for drill-downs)
  [Dashboard can't show real data until this works]

Phase 4: Backend API Layer
  └─→ Activity list endpoint (with filtering, pagination)
  └─→ Activity detail endpoint (with streams)
  └─→ Athlete stats endpoint
  └─→ Trend aggregation queries (SQL)
  └─→ Gear endpoint
  └─→ Trophy/achievement endpoint

Phase 5: Frontend Foundation
  └─→ Vite + React setup
  └─→ Dark theme + component library baseline
  └─→ API client layer (typed fetch wrappers)
  └─→ React Query setup for caching/loading states

Phase 6: Dashboard UI
  └─→ Key metrics cards (this week, this month, all time)
  └─→ Trend charts (Chart.js or Recharts)
  └─→ Time-range selector (weekly → multi-year)
  └─→ Activity list/feed

Phase 7: Activity Drill-Down
  └─→ Route map (Leaflet + polyline decode)
  └─→ Pace/HR chart with segment overlays
  └─→ HR zone breakdown
  └─→ Splits table

Phase 8: Gear Gallery
  └─→ Gear cards from Strava data
  └─→ Image search integration
  └─→ Usage stats per gear item

Phase 9: Trophy Case
  └─→ Strava PRs and segment trophies
  └─→ Custom milestone definitions
  └─→ Achievement timeline

Phase 10: Workout Projector
  └─→ Training plan input UI
  └─→ Projection algorithm (VO2max, pace, zones)
  └─→ Projection chart

Phase 11: Deployment
  └─→ Build pipeline (Vite static + FastAPI)
  └─→ Deploy to Vercel/Render/Fly.io
```

**Critical dependency:** Phase 2 (Auth) is the single biggest blocker. No data = no dashboard. Plan extra time here.

---

## Scalability Considerations

This is a single-user personal dashboard. Scalability is not the primary concern. However:

| Concern | Single user (this project) | If multi-user later |
|---------|---------------------------|---------------------|
| Data volume | SQLite handles 10K activities fine | Migrate to PostgreSQL |
| Token management | One token set in SQLite | Per-user token table |
| API rate limits | 1000 req/day is plenty | Need per-user quota tracking |
| Sync strategy | On page load is fine | Need webhooks or background jobs |
| Deployment | Static SPA + single Python process | Need horizontal scaling |

---

## Strava API Key Endpoints

(Based on Strava API v3 documentation — confidence HIGH, stable since 2018)

| Endpoint | Data | Notes |
|----------|------|-------|
| `GET /athlete` | Profile, stats summary | Includes gear list |
| `GET /athlete/activities` | Activity list (paginated) | Max 200/page, use `after`/`before` for incremental |
| `GET /activities/{id}` | Full activity detail | Include `?include_all_efforts=true` for segments |
| `GET /activities/{id}/streams` | Time-series data (HR, pace, GPS) | Request specific stream types |
| `GET /gear/{id}` | Gear detail (brand, model, distance) | Referenced from athlete endpoint |
| `GET /athlete/zones` | HR zones | Requires premium subscription |
| `GET /segments/{id}/leaderboard` | Segment times | Rate-limited heavily |

**Rate limits:** 100 requests per 15 minutes, 1000 per day (daily limit is the binding constraint for initial full-history sync).

**Pagination strategy for full history:** `GET /athlete/activities?per_page=200&page=N` — most users have <1000 activities so 5 pages maximum. After initial load, incremental sync needs 1 request per sync.

---

## Deployment Architecture

For Vercel/Netlify + Python backend:

```
Option A: Split deployment (recommended for simplicity)
  Frontend: Vercel (static SPA, free tier)
  Backend:  Render or Fly.io (Python, free/cheap tier)
  Database: SQLite file on persistent volume (Render) or included in backend

Option B: Unified (more complex)
  Vercel serverless functions for API routes
  [Problem: SQLite doesn't work well with serverless — no persistent filesystem]

Option C: VPS (simplest long-term)
  Single DigitalOcean/Hetzner droplet
  Nginx serves built SPA as static
  Gunicorn/uvicorn runs FastAPI
  SQLite file on local disk
```

**Recommendation:** Option A (Vercel for frontend, Render for backend) for v1. Free tiers cover a personal project. SQLite on Render's persistent disk. If Render's free tier sleeps the backend, upgrade to a paid tier ($7/month).

**Confidence:** MEDIUM — hosting landscape changes. Verify current Render/Fly.io free tier terms at deployment time.

---

## Sources

- Strava API v3 Documentation (stable since 2018, OAuth patterns well-established) — HIGH confidence
- FastAPI official documentation patterns (APIRouter, dependency injection for services) — HIGH confidence
- SQLite use in single-user web apps — well-established pattern — HIGH confidence
- Deployment architecture (Vercel + Render split) — MEDIUM confidence, verify current free tier limits
- Workout projection algorithm — LOW confidence, project-specific design needed, no standard implementation

---

*Architecture research: 2026-02-27*
