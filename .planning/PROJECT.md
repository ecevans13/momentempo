# StravaViz — Personal Strava Dashboard

## What This Is

A personal fitness dashboard that pulls data from the Strava API and presents it in a sleek, dark-mode-first web app. It surfaces long-term trends across running and strength training, lets you drill into individual activities with maps and zone breakdowns, showcases your gear with auto-fetched product images, celebrates achievements in a trophy case, and projects how changes to your training plan would impact key health metrics.

## Core Value

See the story your training data tells — trends, progress, and projections — in one beautiful, personal dashboard.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Dashboard with key metrics and long-term trend visualizations (weekly to multi-year)
- [ ] Activity drill-downs with route maps, pace/HR overlays, splits, and heart rate zones
- [ ] Gear gallery with auto-fetched product photos based on Strava gear names
- [ ] Trophy case combining Strava achievements (PRs, segments) and custom milestones
- [ ] Workout projector — input a specific training plan, see projected impact on pace, HR zones, and VO2 max
- [ ] Dark mode by default with light mode toggle
- [ ] Auto-sync Strava data on page load
- [ ] Deployed to a hosting platform (Vercel, Netlify, or similar)
- [ ] Single-user experience (your Strava account)

### Out of Scope

- Multi-user / OAuth login flow — future state, not v1
- Real-time activity tracking — Strava handles recording, this app handles analysis
- Mobile native app — web-first, responsive design covers mobile access
- Social features — this is a personal dashboard, not a social platform
- Cycling/swimming analytics — running and strength focus for v1

## Context

- Strava API provides activity data, athlete stats, gear info, and segment efforts
- Python 3.13.7 environment with uv package manager already configured
- No application code exists yet — clean foundation
- Existing `.gitignore` is misconfigured (directory instead of file) — needs fixing during setup
- Activities tracked: running and strength/cross-training
- User wants flexible time horizons — from weekly training blocks to multi-year progression
- Gear images should be auto-fetched by searching product names from Strava gear data
- Custom milestones in trophy case are user-defined (e.g., "first 50-mile week", "100 runs this year")
- Workout projector takes specific plan input (e.g., "2 tempo runs + 1 long run/week for 8 weeks")

## Constraints

- **API**: Strava API rate limits (100 requests/15 min, 1000/day) — need caching strategy
- **Auth**: Strava OAuth required even for single user — need token management
- **Data**: VO2 max availability depends on Strava subscription tier and device data
- **Stack**: Python 3.13.7 with uv already configured — build on this foundation
- **Deployment**: Must be deployable to cloud hosting (Vercel, Netlify, or similar)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single user for v1 | Simplifies auth, no user management needed | — Pending |
| Dark mode default | User preference, modern aesthetic | — Pending |
| Auto-sync on page load | Simplest UX, no manual intervention | — Pending |
| Auto-fetch gear images | Avoids manual upload, more dynamic | — Pending |
| Running + strength focus | Matches user's actual Strava activities | — Pending |

---
*Last updated: 2026-02-27 after initialization*
