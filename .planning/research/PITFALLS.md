# Domain Pitfalls

**Domain:** Personal Strava Fitness Dashboard (Python, single-user)
**Researched:** 2026-02-27
**Confidence:** MEDIUM — Based on Strava API documentation knowledge (training data through Aug 2025). Rate limits and OAuth mechanics are well-established and unlikely to have changed. VO2 max and gear image pitfalls are based on known API behavior and community patterns.

---

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

---

### Pitfall 1: Access Token Stored Without Refresh Token Logic

**What goes wrong:** Strava access tokens expire after 6 hours. If you store only the access token (common mistake when first getting it working via OAuth), every 6 hours the app silently breaks — all API calls return 401, and the dashboard shows no data or crashes with unhandled exceptions.

**Why it happens:** During initial OAuth setup, the app "works" immediately after login because the token is fresh. The expiry problem is invisible until hours later. Developers store what they see working: `access_token`.

**Consequences:** Production breakage every 6 hours. If deploying to Vercel/Netlify with no persistent process, this is especially bad — there's no background thread to proactively refresh. Every page load that hits an expired token fails.

**Prevention:**
- Store all three: `access_token`, `refresh_token`, `expires_at` (Unix timestamp) from the initial OAuth response
- Before every API call, check `if time.time() > expires_at - 300:` (300s buffer) and refresh first
- The refresh endpoint is `POST https://www.strava.com/oauth/token` with `grant_type=refresh_token`
- After refresh, the response returns a NEW access token AND a NEW refresh token — update both in storage
- Store tokens in a local SQLite file or `.env`-style file, never hardcode

**Detection:** App works on first load, breaks 6 hours later. Look for 401 responses from Strava API.

**Phase:** Address in Phase 1 (Auth & Data Ingestion). Do not defer.

---

### Pitfall 2: Ignoring Rate Limits Until They Bite in Production

**What goes wrong:** Strava enforces 100 requests per 15-minute window and 1,000 requests per day. For a personal dashboard fetching activities, gear, athlete stats, and segment efforts on every page load, you can exhaust the 15-minute limit in a single session. The day limit can be hit during initial data backfill.

**Why it happens:** During development with a small dataset, the number of API calls is low. As the activity history grows (a runner with 3 years of data may have 1,000+ activities), and as individual activity drill-downs each require their own API call, the rate math becomes critical.

**Consequences:**
- Dashboard fails entirely during development data backfills
- After initial backfill, if caching is not implemented, repeated page loads during a 15-minute window exhaust the quota
- Strava returns 429 responses with `X-RateLimit-Limit` and `X-RateLimit-Usage` headers — if these aren't checked, the app crashes rather than gracefully degrading

**Prevention:**
- Implement a local cache (SQLite recommended) from day one — not as a future optimization
- Cache strategy: store fetched activities with a `fetched_at` timestamp; on page load, only fetch activities created after the latest cached `start_date`
- For activity detail pages (maps, zones, splits), cache the detailed activity JSON after first fetch — it never changes
- Respect rate limit headers: check `X-RateLimit-Usage` and back off or return cached data if approaching limit
- Initial backfill: paginate through activities at 200/page (Strava's max per_page), with a small delay between requests
- Day limit awareness: 1,000 requests/day is consumed fast during development. Keep a request counter and log it.

**Detection:** HTTP 429 responses. Strava also sends a 429 with `message: "Rate Limit Exceeded"` in the JSON body.

**Phase:** Address in Phase 1 (Data ingestion) — caching architecture must be decided before any other feature is built.

---

### Pitfall 3: VO2 Max Data Availability Assumed but Not Guaranteed

**What goes wrong:** The workout projector feature wants to project impact on VO2 max, but Strava's `vo2_max` field on athlete stats is not available to all users and its presence is inconsistent.

**Why it happens:** VO2 max on Strava is:
1. Only calculated when the athlete uses a compatible device (Garmin, Apple Watch with HR, etc.) AND has HR data for runs
2. Only surfaced in the API for Strava Premium/Summit subscribers (subscription tier gating)
3. Available on `GET /athlete/stats` but the field may simply be absent (not null, absent) if not calculated

**Consequences:** Projector feature silently has no baseline to project from. If the code assumes `athlete.stats.vo2_max` exists and accesses it without a guard, you get a KeyError/AttributeError at runtime.

**Prevention:**
- Treat VO2 max as "may not exist" from day one — always use `.get('vo2_max')` (Python dict style) or safe attribute access
- Design the projector with fallbacks: if VO2 max is unavailable, the projection works on pace and HR zone distribution instead
- Surface a clear message in the UI: "VO2 max projection unavailable — connect a HR-enabled device and ensure Strava Summit subscription"
- Do not make VO2 max a prerequisite for the entire projector feature — it should be an additive data point when available

**Detection:** `vo2_max` key absent from API response. Test by calling `/athlete/stats` early and logging what fields are actually present.

**Phase:** Address before building the Workout Projector phase. Validate field availability in Phase 1 data exploration.

---

### Pitfall 4: Gear Image Auto-Fetch Is Not a Strava Feature

**What goes wrong:** Strava's API returns gear data (shoe name, brand, total distance) but does NOT provide product images. The project requirement to "auto-fetch product photos based on Strava gear names" requires an external image source — this is a third-party integration problem, not a Strava API problem.

**Why it happens:** The gear name from Strava (e.g., "Nike Pegasus 40") can be searched via a product image API or image search, but this requires:
- A separate API (Google Custom Search API, SerpAPI, or a scraping approach) with its own rate limits and costs
- Text parsing to extract brand + model from the gear name string (which users can rename arbitrarily)
- Handling cases where the user has renamed their shoe to something like "Old Reliables" — no product image match is possible

**Consequences:**
- Feature is significantly more complex than it appears
- External API costs or scraping reliability issues
- User-renamed gear (very common) produces no image match
- Could become a blocked feature if a suitable free/cheap image API isn't found

**Prevention:**
- Scope this feature as "best-effort with graceful fallback to gear brand logo or placeholder"
- Use a deterministic lookup: maintain a small mapping of known gear names to product page URLs as a seed
- Consider using the Google Custom Search API (100 free queries/day) with a query like `"Nike Pegasus 40" running shoe product image`
- Always design the UI with a placeholder state — many gear items will have no image
- Do NOT attempt image scraping in a deployed app (fragile, may violate ToS)
- Evaluate whether this feature provides enough value to justify the complexity before building it

**Detection:** During planning/design, test the gear name strings returned by Strava API for your own account — see how many are user-renamed vs. using official product names.

**Phase:** Flag as HIGH COMPLEXITY before the Gear Gallery phase. May require a phase-specific feasibility check.

---

### Pitfall 5: "Auto-sync on page load" Hits Rate Limits Under Normal Use

**What goes wrong:** The project spec says "Auto-sync Strava data on page load." Without smart incremental sync, every page load triggers API calls. Multiple page loads in a 15-minute window (opening different activities, switching views) compounds with rate limits.

**Why it happens:** "Sync on load" sounds simple. But if sync means "check for new activities + refresh athlete stats + update gear data" on EVERY page load, a user who opens the dashboard, clicks an activity, goes back, clicks another activity has done 4+ "syncs" within seconds.

**Consequences:** Rate limit exhaustion during active dashboard use. 15-minute window blackout — no data updates for up to 15 minutes.

**Prevention:**
- Define "sync" as a TTL-gated operation: only re-sync if last sync was more than N minutes ago (suggest 15-30 minutes minimum)
- Store `last_synced_at` timestamp persistently. On page load, check: if `now - last_synced_at < 900`: serve from cache only
- Activity detail data is immutable after completion — cache forever, never re-fetch
- Athlete stats (weekly mileage, etc.) are the only thing that needs periodic refresh — rate-limit this separately
- Expose a manual "Force Refresh" button for when the user actually wants fresh data outside the TTL window

**Detection:** Add a request counter to logs. If a normal browsing session (5-10 page actions) triggers >20 API calls, the sync logic is too aggressive.

**Phase:** Define sync TTL strategy in Phase 1 alongside caching architecture.

---

## Moderate Pitfalls

---

### Pitfall 6: OAuth Initial Setup Requires a Redirect URI That Works in Production

**What goes wrong:** Strava OAuth requires a registered redirect URI in your app settings. During development you register `http://localhost:8000/callback`. When you deploy to Vercel/Netlify, the production URL is different. If you forget to add the production URL to your Strava app settings, OAuth fails entirely in production.

**Prevention:**
- Register BOTH the localhost and production URLs in your Strava app's "Authorization Callback Domain" setting on day one
- Strava allows multiple callback domains — add `localhost` and your production domain before starting development
- If using Vercel preview URLs (branch deploys), be aware those dynamic URLs cannot all be pre-registered — use a stable custom domain or only deploy production from main branch

**Phase:** Address during initial deployment phase setup.

---

### Pitfall 7: Activity Data Model Inconsistency Between Activity Types

**What goes wrong:** Running activities have `average_speed`, `max_speed`, `average_heartrate`, `average_cadence`, `splits_metric`. Strength training activities have almost none of these — they have `elapsed_time`, `moving_time`, and that's about it. Code that assumes all activities have the same fields crashes on strength activities.

**Prevention:**
- Always check `activity['type']` or `activity['sport_type']` before accessing type-specific fields
- Create separate data transformation layers for `Run` vs. `WeightTraining`/`Workout` activity types
- Do not build generic activity cards that assume pace, HR, and cadence are always present
- Run an exploratory API call on YOUR actual data early — log all fields present for each activity type to discover what's actually available

**Detection:** AttributeError or KeyError when viewing strength training activities in the dashboard.

**Phase:** Address in Phase 1 data modeling and Phase 2 (activity drill-down).

---

### Pitfall 8: Segment Efforts Can Return Thousands of Records

**What goes wrong:** Athletes who run the same routes frequently accumulate hundreds to thousands of segment efforts. Fetching all segment efforts for a long activity (e.g., a 20-mile long run through a popular area) can return many pages of data. Naively fetching everything on activity load is slow and wasteful.

**Prevention:**
- Fetch segment efforts lazily — only when the user opens a specific activity's detail view
- Cache segment effort data per activity ID after first fetch
- Limit display to the top N starred segments or PR segments rather than showing all
- Consider not fetching detailed segment data at all for strength activities (they have no routes)

**Phase:** Address in Activity Drill-Down phase.

---

### Pitfall 9: Workout Projector Model Accuracy Is Fundamentally Limited

**What goes wrong:** The workout projector feature ("input a training plan, see projected impact on pace/HR/VO2 max") implies a predictive model. But:
- Exercise science projection models are highly individual (age, current fitness, training history, recovery)
- Strava data doesn't include sleep, nutrition, stress, or injury history
- "8 weeks of 2 tempo runs + 1 long run" affects different athletes very differently

**Prevention:**
- Frame projections explicitly as estimates with wide confidence intervals, not predictions
- Use established simple models (e.g., Riegel's race prediction formula for pace projection; rough VO2 max improvements based on volume increase from research)
- Surface clear UI language: "Estimated range" not "You will achieve"
- Do not promise accuracy — make the feature about exploration ("what if") not commitment ("this will happen")
- Do not attempt to build a proprietary ML model — use published exercise science formulas with known limitations

**Phase:** Address during Workout Projector design phase — scope and framing must be locked before implementation.

---

### Pitfall 10: Strava API Pagination Not Implemented = Missing Data

**What goes wrong:** Most Strava list endpoints return 30 items by default and max out at 200 per page. Developers who don't implement pagination see only their most recent 30 activities and think the API is returning incomplete data or that their older activities are unavailable.

**Prevention:**
- Always paginate: `GET /athlete/activities?per_page=200&page=N` — increment page until empty result returned
- For initial backfill, paginate through all historical activities and store locally
- After backfill, only fetch activities with `after={last_known_activity_timestamp}` to get incremental updates

**Detection:** Activity count in dashboard doesn't match Strava website count. Check if total activities shown is suspiciously close to 30 or 200.

**Phase:** Address in Phase 1 data ingestion.

---

## Minor Pitfalls

---

### Pitfall 11: Latitude/Longitude Polyline Decoding Required for Maps

**What goes wrong:** Strava returns route data as an encoded polyline (Google's Polyline Algorithm), not as a raw list of lat/lon coordinates. Developers who try to use `activity['map']['polyline']` as a coordinate list get garbage.

**Prevention:**
- Use the `polyline` Python library to decode: `polyline.decode(encoded_string)` returns list of `(lat, lon)` tuples
- Map rendering (e.g., Leaflet.js, Mapbox) expects `[lon, lat]` order (GeoJSON standard) — note the swap from Strava's `(lat, lon)`
- Some activities (treadmill runs, indoor strength) have no map data — guard with `if activity.get('map', {}).get('polyline')`

**Phase:** Address in Activity Drill-Down phase.

---

### Pitfall 12: Strava "sport_type" vs "type" Field Deprecation Confusion

**What goes wrong:** Strava has two fields: the older `type` (e.g., "Run", "WeightTraining") and the newer `sport_type` (e.g., "TrailRun", "Workout"). The `type` field is deprecated but still present. Using `type` misses sport type nuance; using `sport_type` may not match older activities correctly.

**Prevention:**
- Use `sport_type` as primary, with `type` as fallback for compatibility
- Check both fields when filtering by activity type
- Be aware that `sport_type` has more granular values (e.g., "TrailRun" is a subtype of "Run")

**Phase:** Address in Phase 1 data modeling.

---

### Pitfall 13: Deploying a Python Backend to Vercel Requires Specific Configuration

**What goes wrong:** Vercel is primarily optimized for Node.js and Next.js. Python backends (Flask, FastAPI) on Vercel require a `vercel.json` with specific routing configuration and a `api/` directory structure. Without this, the deployment silently serves nothing or a 404.

**Prevention:**
- If using Vercel with Python: use their serverless functions approach with `api/*.py` files, or use a FastAPI + Mangum adapter
- Alternatively, use Railway, Render, or Fly.io which have simpler Python deployment stories
- Netlify similarly requires specific configuration for Python backends — consider if static-first with API calls from the browser is viable (it is for single-user cases)
- For a simpler path: static HTML/JS frontend deployed to Vercel/Netlify, Python backend deployed separately to Render or Railway

**Detection:** Deployment succeeds but all API routes return 404. Check runtime configuration in Vercel dashboard.

**Phase:** Address during deployment planning — pick hosting strategy before building, not after.

---

### Pitfall 14: Heart Rate Zone Calculation Requires Manual Configuration

**What goes wrong:** Strava returns raw heart rate data but does NOT calculate heart rate zones for you in most API responses. Zone breakpoints (e.g., Zone 2: 120-140bpm) are athlete-specific. Displaying "Zone 2 training" requires knowing the athlete's max HR or lactate threshold, which Strava may or may not have.

**Prevention:**
- Check `GET /athlete/zones` — Strava does provide configured HR zones if the athlete has set them
- If zones are not configured in Strava, use a standard formula (e.g., Karvonen method using max HR) with a note that it's estimated
- Make zone breakpoints configurable in the app as a fallback
- Do not hardcode generic zone ranges as if they're personalized

**Phase:** Address in Activity Drill-Down phase when building HR zone display.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Initial OAuth Setup | Token stored without refresh logic | Store all three token fields; implement expiry check before every API call |
| Data Ingestion / Caching | Rate limits hit during backfill | Paginate slowly; implement SQLite cache before any other feature |
| Activity Dashboard | Sync-on-load exhausts rate limits | TTL gate on sync (15-30 min minimum); serve cache for page loads |
| Activity Drill-Down | Missing fields on strength activities | Type-check before field access; separate data models per activity type |
| Activity Drill-Down | Encoded polyline not decoded | Use `polyline` library; guard for indoor activities with no map |
| Gear Gallery | No product images in Strava API | Plan external image source with fallback placeholder before building |
| Gear Gallery | User-renamed gear has no image match | Design for "best-effort with fallback" from the start |
| Trophy Case | Segment efforts volume | Fetch lazily; cache after first load; limit displayed segments |
| Workout Projector | VO2 max may be unavailable | Guard field access; design feature to work without VO2 max baseline |
| Workout Projector | Model accuracy expectations | Frame as estimates, not predictions; use published formulas |
| Deployment | Python backend on Vercel/Netlify | Choose hosting strategy before building; test deployment path early |
| Deployment | OAuth redirect URI mismatch | Register both dev and prod URIs in Strava app settings on day one |

---

## Sources

- Strava API Documentation (developers.strava.com) — rate limits, authentication, data models (HIGH confidence — well-established stable API surface)
- Strava OAuth flow mechanics — token expiry at 6 hours, refresh token behavior (HIGH confidence — documented and stable since 2018 update)
- Strava gear API fields — known to return name/brand/distance but no images (HIGH confidence — confirmed absence)
- VO2 max field gating — MEDIUM confidence — known to be subscription-gated and device-dependent; specific field name and behavior may have changed
- Google Polyline encoding used by Strava — HIGH confidence — established format unchanged
- Vercel Python deployment patterns — MEDIUM confidence — Vercel's Python support has evolved; validate current docs before implementing
- Workout projection model accuracy limitations — HIGH confidence — inherent to exercise science domain, not a platform limitation
