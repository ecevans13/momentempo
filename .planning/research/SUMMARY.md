# Project Research Summary

**Project:** Personal Fitness Dashboard (Strava API Integration)
**Domain:** Single-user personal fitness dashboard with Strava OAuth integration
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH — Stack and architecture are well-established; Strava API mechanics are stable. Feature prioritization is sound. Some open verification items around gear image sourcing and VO2 max field availability.

## Executive Summary

This project is a single-user personal fitness dashboard that pulls running and strength training data from the Strava API, caches it locally, and presents it as an interactive SPA with charts, maps, and analytics. The canonical approach is a layered architecture: a Python FastAPI backend acts as a Strava API proxy that owns all OAuth token management, incremental caching, and data transformation; and a React (Vite) SPA consumes a clean internal JSON API. This separation is not optional — it is required to keep Strava tokens server-side and to enforce rate limit protection centrally.

The recommended stack (FastAPI + React + SQLite + Plotly.js + Leaflet) is well-matched to the problem and all components are in active, mainstream use. SQLite is the right choice for a single-user data store — it requires zero infrastructure, handles 10K+ activities comfortably, and enables SQL aggregations for trend queries. The project's existing Python + uv setup aligns with the stack directly. Build order is strictly dependency-driven: OAuth auth must be complete before any other feature can be built, and the caching/sync layer must exist before the UI is meaningful.

The top risks are all operational rather than architectural. Access token expiry (every 6 hours) is the most dangerous pitfall — it is invisible during development and breaks everything in production. Rate limits (100 req/15 min, 1000/day) must be respected from day one through SQLite caching and TTL-gated sync, not retrofitted later. Two features carry meaningful design uncertainty that must be resolved before their phases begin: gear image auto-fetch (requires an external image API that Strava does not provide) and the workout projector (VO2 max data may not be available; projections must be framed as estimates, not predictions).

---

## Key Findings

### Recommended Stack

The stack is modern, cohesive, and appropriate for a personal SPA dashboard. Python 3.13 + FastAPI (~0.133) on the backend provides async support, automatic OpenAPI docs, and Pydantic v2 validation — all of which align with stravalib 2.3's requirements. React 19 + Vite 6 on the frontend replaces the deprecated Create React App pattern and provides fast HMR. SQLite (accessed via aiosqlite) is the right single-user data store. Tailwind v4's native Vite plugin simplifies dark mode implementation.

All version compatibility is confirmed. One verification item: react-plotly.js 2.x compatibility with Plotly.js 6.5 should be checked at dependency installation time.

**Core technologies:**
- Python 3.13 + FastAPI ~0.133: async API framework with Pydantic v2 validation — already configured via uv
- React 19 + Vite 6: SPA frontend with fast HMR, replaces deprecated CRA
- SQLite (aiosqlite): zero-infrastructure local data warehouse for single-user apps
- stravalib 2.3: Strava API client that handles OAuth, pagination, and model parsing — do not bypass this with raw requests
- Plotly.js 6.5 + Recharts 2.x: interactive charts (Plotly for drill-downs, Recharts for sparklines/simple cards)
- Leaflet 1.9.4 + react-leaflet 5.x: route maps with polyline overlay
- TailwindCSS 4.x: utility-first CSS with native dark mode via Vite plugin
- Pydantic 2.x: data validation for FastAPI models and Strava data parsing

See `.planning/research/STACK.md` for full version compatibility matrix, installation commands, and alternatives considered.

### Expected Features

The Strava API is well-understood. Feature priorities flow directly from API capabilities and rate limit constraints. The dependency chain is clear: OAuth unblocks everything; activity list cache unblocks all dashboard metrics; activity detail/streams unblock drill-down views. Rate limits make eager fetching dangerous — design for lazy loading and caching from the start.

**Must have (table stakes):**
- OAuth token management with auto-refresh — without this, nothing works
- Activity list fetch with incremental caching — foundation for all metrics
- Key metrics summary (distance, runs, time by week/month/year)
- Long-term trend charts (weekly/monthly distance + pace over selectable range)
- Activity detail view (route map, splits table, pace/HR charts, HR zone breakdown)
- Dark mode + responsive layout — explicitly stated requirement

**Should have (competitive differentiators):**
- Multi-year progression view (most apps cap at 90 days)
- Training week heatmap (calendar density view, visually distinctive)
- Best efforts timeline (PRs for standard distances)
- Gear gallery with auto-fetched images (best-effort with fallback)
- Trophy case with Strava achievements + custom milestones
- Workout projector ("what if I train this way for 8 weeks?")
- Elevation profile overlay on activity detail

**Defer to v2+:**
- VO2 max trend (data availability uncertain; subscription + device gated)
- ATL/CTL training load modeling (TrainingPeaks-style; high complexity, niche audience)
- Segment achievement deep-dive (rate-limit heavy; build after caching is solid)
- Cadence analysis (device-dependent; not all devices record cadence)

See `.planning/research/FEATURES.md` for full Strava API capabilities table, feature dependency graph, and open verification questions.

### Architecture Approach

The architecture is a standard layered backend-as-proxy pattern: SPA talks only to the FastAPI backend via internal JSON API; backend handles all Strava communication, token management, rate limiting, and SQLite caching. The SPA is a dumb consumer. This pattern keeps tokens server-side, centralizes rate limit enforcement, and makes the frontend portable.

The backend is organized into domain-based route files (APIRouter) and a service layer for business logic. SQLite stores raw activity JSON, parsed fields, streams as JSON blobs, tokens, gear metadata, and sync state. Aggregation queries are pushed to SQL, not Python loops.

**Major components:**
1. Strava Auth Service — OAuth flow, token persistence, auto-refresh before expiry
2. Strava Client Service — wraps stravalib, enforces rate limits, caches to SQLite
3. Activity Service — transforms raw Strava data, computes derived metrics (zones, pace, trends)
4. FastAPI Route Layer — domain-organized endpoints (`routes/auth.py`, `routes/activities.py`, `routes/gear.py`, `routes/projections.py`)
5. SQLite Data Layer — single-file local warehouse; activities, streams, gear, tokens, sync state
6. React SPA — charts, maps, dark theme; uses React Query for caching/loading states
7. Gear Service — Strava gear metadata + external image lookup (best-effort)
8. Projection Engine — VO2 max/pace projection from training plan inputs (client-side or via POST endpoint)

See `.planning/research/ARCHITECTURE.md` for full component boundary table, data flow diagrams, schema sketch, and deployment options.

### Critical Pitfalls

1. **Access token stored without refresh logic** — Strava tokens expire every 6 hours. Store all three values (`access_token`, `refresh_token`, `expires_at`) from the initial OAuth response. Check `time.time() > expires_at - 300` before every API call and refresh proactively. After refresh, the response issues a NEW refresh token — update both. Must be addressed in Phase 1 (auth).

2. **Rate limits not respected from day one** — 100 req/15 min and 1000/day are consumed quickly. Initial full-history backfill alone can exhaust the daily limit. Implement SQLite caching before any other feature. Gate sync operations with a 15-30 minute TTL — not on every page load. Expose a manual "Force Refresh" button for explicit refreshes.

3. **Gear image auto-fetch is not a Strava feature** — Strava provides brand + model name only. Auto-fetching product images requires a separate external API (Google Custom Search: 100 free queries/day). User-renamed gear ("Old Reliables") produces no image match. Design for best-effort with placeholder fallback from the start. Validate image source before committing to the feature.

4. **VO2 max data availability is not guaranteed** — Strava's VO2 max field is subscription-gated and device-dependent. It may simply be absent from the API response. Always guard with `.get('vo2_max')`. Design the projector to function on pace + HR zone distribution when VO2 max is unavailable.

5. **Activity data model inconsistency across activity types** — Strength training activities lack pace, cadence, HR, and map fields that running activities have. Code that assumes uniform fields will crash on strength workouts. Use `sport_type` as primary field (with `type` as fallback), and build separate data transformation paths per activity type.

---

## Implications for Roadmap

Research strongly suggests a 10-phase structure, strictly ordered by dependency. The first three phases are blockers — nothing else can be built until they are complete. The pattern is: foundation first, then auth (the single biggest unblock), then data pipeline, then API layer, then UI in layers of increasing specificity, then differentiation features, then deployment.

### Phase 1: Project Foundation
**Rationale:** Zero-infrastructure setup must come first — SQLite schema, FastAPI skeleton, environment configuration. All later phases build on this scaffolding.
**Delivers:** Working project scaffold, database schema, health check endpoint, .env.example with Strava credential placeholders
**Addresses:** FEATURES.md dependency: local DB required for caching, OAuth tokens, sync state
**Avoids:** Anti-pattern of bolting on caching as an afterthought; Pitfall 1 and 2 mitigation is architectural, not optional

### Phase 2: Strava OAuth and Auth Layer
**Rationale:** This is the single biggest blocker. No auth = no data = no dashboard. Also the highest-risk phase (token refresh logic, expiry handling). Must be built, verified, and confirmed working before anything else.
**Delivers:** Working OAuth flow, token persistence to SQLite, auto-refresh before expiry, Strava client wrapper
**Uses:** stravalib 2.3, FastAPI routes/auth.py, SQLite token table
**Avoids:** Pitfall 1 (token expiry), Pitfall 6 (OAuth redirect URI mismatch in production — register both localhost and prod URIs on day one)
**Research flag:** Standard OAuth 2.0 pattern — stravalib handles much of this. Skip phase research.

### Phase 3: Data Pipeline (Ingestion and Sync)
**Rationale:** Once auth works, data must flow in before the UI can show anything real. Initial full-history backfill must be designed carefully around rate limits.
**Delivers:** Incremental sync endpoint (`/api/sync`), full-history paginated backfill, activity storage in SQLite (basic fields + raw JSON), sync state tracking, TTL gate (15-30 min minimum between syncs)
**Uses:** stravalib paginated activity fetch, aiosqlite, SQLite `activities` and `sync_state` tables
**Avoids:** Pitfall 2 (rate limits), Pitfall 5 (sync-on-load exhausts rate limits), Pitfall 10 (pagination not implemented = missing data)

### Phase 4: Backend API Layer
**Rationale:** With data in SQLite, expose clean JSON endpoints for the frontend. All aggregation logic belongs here — push computation to SQL, not Python loops.
**Delivers:** Activity list endpoint (filtered, paginated), activity detail endpoint, athlete stats endpoint, trend aggregation queries, gear endpoint, trophy/achievement endpoint
**Uses:** FastAPI APIRouter (domain-organized), Pydantic v2 models, SQL window functions for trend queries
**Avoids:** Anti-pattern of computing aggregates in Python loops; monolith route file
**Research flag:** Standard FastAPI patterns. Skip phase research.

### Phase 5: Frontend Foundation
**Rationale:** Frontend scaffolding and API client layer must exist before any UI components can be built. Dark mode is a stated requirement — establish it here, not as a retrofit.
**Delivers:** Vite + React 19 + TypeScript setup, TailwindCSS 4 with dark mode, typed API client (fetch wrappers), React Query setup for loading/error states, component directory structure
**Uses:** Vite 6, React 19, TailwindCSS 4 (native Vite plugin), TypeScript, ESLint + Prettier

### Phase 6: Core Dashboard UI
**Rationale:** First visible product — key metrics and trend charts represent the primary value proposition ("am I improving?"). Builds directly on the activity list and stats data from Phase 4.
**Delivers:** Key metrics cards (this week/month/all-time), long-term trend charts (weekly/monthly distance + pace), time-range selector (weekly through multi-year), activity feed/list, empty/loading states
**Uses:** Plotly.js 6.5 (trend charts), Recharts 2.x (metric cards), React Query hooks
**Addresses:** All FEATURES.md table stakes except activity detail

### Phase 7: Activity Drill-Down
**Rationale:** The detail view is what makes a dashboard compellling — route maps, splits, zone breakdowns. Requires activity streams from Strava (separate API calls — cache after first fetch).
**Delivers:** Activity detail page with route map (Leaflet + polyline decode), pace/HR stream charts, HR zone breakdown, splits table, elevation profile overlay
**Uses:** Leaflet 1.9.4 + react-leaflet 5.x, `@mapbox/polyline` for decode, Plotly.js for stream charts
**Avoids:** Pitfall 5 (polyline decode), Pitfall 7 (data model inconsistency per activity type), Pitfall 8 (segment efforts volume — lazy load)
**Research flag:** Standard patterns. Map + polyline decode is well-documented. Skip phase research.

### Phase 8: Gear Gallery
**Rationale:** Differentiator feature, but depends on stable activity data layer. The image auto-fetch component carries the most uncertainty of any feature — validate the image API approach before building.
**Delivers:** Gear cards with brand/model/distance stats, best-effort product image fetching (Google Custom Search or similar), placeholder fallback for unmatched gear
**Avoids:** Pitfall 4 (gear images require external API — plan fallback); user-renamed gear has no image match
**Research flag:** NEEDS PHASE RESEARCH — confirm viable image source API (Google Custom Search free quota, SerpAPI, or alternative) before committing to implementation.

### Phase 9: Trophy Case and Milestones
**Rationale:** Requires stable activity data, athlete stats, and (optionally) segment effort data. Segment fetches are rate-limit sensitive — fetch lazily, display starred/PR segments only.
**Delivers:** Strava PR display (best efforts for standard distances), segment achievement view, custom milestone definitions stored in SQLite, achievement timeline
**Avoids:** Pitfall 8 (segment efforts volume — lazy fetch, cache per activity, limit to starred/PRs)
**Research flag:** Strava KOM/starred segment endpoints — verify `/athletes/{id}/koms` and `/segments/starred` are still current (Strava has deprecated endpoints with limited notice).

### Phase 10: Workout Projector
**Rationale:** Most complex feature; requires all historical data to be stable. Must be framed as exploration ("what if"), not prediction. VO2 max data availability must be validated against actual athlete data before building.
**Delivers:** Training plan input UI, pace/HR/zone projection algorithm using established exercise science formulas (Riegel's race prediction, volume-based VO2 improvement estimates), projection chart with confidence interval framing, graceful fallback when VO2 max is unavailable
**Avoids:** Pitfall 3 (VO2 max absent from API — guard field access, feature works without it), Pitfall 9 (projection accuracy expectations — "estimates, not predictions" framing in UI)
**Research flag:** NEEDS PHASE RESEARCH — confirm VO2 max field availability in current Strava API; identify appropriate established projection formulas (Riegel, Daniel's VDOT, or similar).

### Phase 11: Deployment
**Rationale:** Final phase — deploy only after all features are stable locally.
**Delivers:** Configured split deployment (Vercel for React SPA, Render for FastAPI backend with SQLite on persistent disk), production OAuth redirect URIs registered, CI/CD pipeline
**Avoids:** Pitfall 6 (OAuth redirect URI — register prod URI on day one, not at deployment), Pitfall 13 (Python backend on Vercel requires specific configuration — use Render instead)
**Research flag:** Verify current Render free tier terms and SQLite persistent disk availability before deployment.

### Phase Ordering Rationale

- Phases 1-3 are strictly sequential blockers — no shortcuts. Nothing is demonstrable until all three are done.
- Phase 4 (API layer) can be built incrementally as Phase 3 data comes in, but must be complete before any frontend work starts.
- Phase 5 (frontend foundation) can begin in parallel with Phase 4, but the API client layer should be finalized after Phase 4 endpoints are stable.
- Phases 6-10 follow feature dependency order from FEATURES.md and the architecture build-order diagram.
- The gear image question and VO2 max availability question should be validated early (during Phases 1-4) as data exploration tasks, so they don't become blockers later.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 8 (Gear Gallery):** Viable external image API must be confirmed before committing to implementation. Google Custom Search free quota (100/day), SerpAPI costs, and scraping viability need evaluation.
- **Phase 9 (Trophy Case):** Strava's `/athletes/{id}/koms` and `/segments/starred` endpoints need verification against current API docs — Strava has deprecated endpoints without notice historically.
- **Phase 10 (Workout Projector):** VO2 max field availability in current API must be validated. Appropriate projection formulas (Riegel, VDOT, or similar) need selection with clear scope boundaries.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 1:** Standard project scaffolding — FastAPI skeleton + SQLite setup is well-documented.
- **Phase 2:** Strava OAuth is stable since 2018; stravalib handles the complexity. Standard token refresh pattern.
- **Phase 4:** FastAPI APIRouter patterns are established; SQL aggregation patterns are standard.
- **Phase 7:** Leaflet + polyline decode is well-documented; React Query patterns are standard.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core technologies are current, mainstream, and version-compatible. uv and Python 3.13 already configured. One minor verification item: react-plotly.js + Plotly 6.5 compatibility. |
| Features | MEDIUM-HIGH | Strava API capabilities are well-understood (stable since 2018). Feature prioritization is sound. Three open verification items: gear image API, VO2 max field availability in 2026, current rate limit values (Strava adjusted in 2023). |
| Architecture | HIGH | Backend-as-proxy, incremental sync with watermark, SQLite as local warehouse — all proven patterns for this class of application. Data flow diagrams are concrete and implementable. |
| Pitfalls | MEDIUM-HIGH | Token expiry, rate limits, and polyline decode are HIGH confidence (well-established). Gear image sourcing and VO2 max availability are MEDIUM confidence — require validation at the relevant phases. Vercel Python deployment patterns are MEDIUM confidence (evolving). |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Gear image source**: Google Custom Search API is the best known option but has a 100 query/day free quota. Validate the approach and fallback design before the Gear Gallery phase begins. Resolution: run a quick feasibility test during Phase 3 data exploration — try querying the image API with real gear names from the athlete's Strava account.

- **VO2 max field availability**: Strava's VO2 max field is subscription- and device-gated. May simply be absent. Resolution: call `/athlete/stats` during Phase 3 data exploration and log all present fields. If absent, the projector must be designed to operate on pace and HR zone distribution instead.

- **Current rate limit values**: Research based on training data through Aug 2025. Strava may have adjusted limits. Resolution: check `X-RateLimit-Limit` headers in Phase 2/3 API calls and update caching TTL accordingly.

- **Strava endpoint deprecation status**: `/athletes/{id}/koms` and `/segments/starred` should be verified against current API docs before building Phase 9. Strava has deprecated endpoints with limited notice historically.

- **react-plotly.js + Plotly.js 6.5 compatibility**: Verify `react-plotly.js` 2.x explicitly supports Plotly 6 before committing to this pairing. Recharts is the fallback for simpler charts.

---

## Sources

### Primary (HIGH confidence)
- Strava API v3 documentation (developers.strava.com) — OAuth mechanics, rate limits, activity/gear/segment endpoints — stable since 2018
- FastAPI official documentation — APIRouter, dependency injection, Pydantic v2 integration
- SQLite documentation — aggregation patterns for single-user dashboards
- stravalib 2.3 release notes (PyPI) — Pydantic v2 compatibility confirmed
- Stack version matrix: FastAPI 0.133, React 19, Vite 6, TailwindCSS 4, Leaflet 1.9.4, Plotly.js 6.5

### Secondary (MEDIUM confidence)
- Strava VO2 max field behavior — subscription gating and device dependency (community knowledge, training data through Aug 2025)
- Render/Fly.io deployment patterns — verify current free tier terms at deployment time
- Vercel Python deployment patterns — evolving; confirm current configuration approach

### Tertiary (LOW confidence)
- Gear image API viability — Google Custom Search as candidate; needs direct validation before Phase 8
- Workout projection formulas (Riegel, VDOT) — applicable formulas well-known but algorithm design is project-specific
- Current Strava rate limit values as of 2026 — verify against response headers during Phase 2/3

---

*Research completed: 2026-02-27*
*Ready for roadmap: yes*
