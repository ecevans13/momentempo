# Stack Research

**Domain:** Personal Fitness Dashboard (Strava API Integration)
**Researched:** 2026-02-27
**Confidence:** HIGH — All core technologies are mainstream, well-documented, and verified against current releases.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Python | 3.13.7 | Runtime | Already configured; latest stable with performance improvements |
| FastAPI | ~0.133 | Backend API framework | Async by default, auto-generated docs, Pydantic validation, top Python framework for APIs |
| React | 19 | Frontend UI framework | Dominant ecosystem, server components, hooks, massive library support |
| Vite | 6.x | Frontend build tool | Fast HMR, native ESM, React plugin, replaces Create React App |
| SQLite | 3.x | Local data store | Zero-config, perfect for single-user apps, fast aggregation queries, ships with Python |
| uv | 0.8.17 | Python package manager | Already configured; fastest Python package manager, handles virtualenvs |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| stravalib | 2.3 | Strava API client | All Strava API interactions — handles OAuth, pagination, rate limits |
| Plotly.js | 6.5 | Interactive charts | Trend visualizations, zone charts, metric dashboards — rich interactivity |
| Leaflet | 1.9.4 | Route maps | Activity route display with polyline overlays |
| react-leaflet | 5.x | React + Leaflet binding | Declarative map components in React |
| Recharts | 2.x | Lightweight charts | Simple metrics display where Plotly is overkill (sparklines, small charts) |
| TailwindCSS | 4.x | Utility-first CSS | Rapid UI styling, dark mode support built-in, modern aesthetic |
| Pydantic | 2.x | Data validation | FastAPI models, Strava data parsing, config management |
| HTTPX | 0.28+ | Async HTTP client | Backend requests to image APIs, async Strava calls if bypassing stravalib |
| APScheduler | 3.x | Background tasks | Optional: scheduled data sync alternative to page-load sync |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Ruff | Python linting + formatting | Replaces flake8 + black + isort; extremely fast |
| Pytest | Python testing | Standard Python test framework |
| ESLint + Prettier | JS/TS linting + formatting | Standard frontend tooling |
| TypeScript | Type-safe frontend | Catches errors at compile time, better DX with React |

## Installation

```bash
# Backend (Python with uv)
uv add fastapi uvicorn stravalib pydantic httpx aiosqlite

# Backend dev dependencies
uv add --dev pytest ruff

# Frontend (Node.js)
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install plotly.js react-plotly.js leaflet react-leaflet recharts
npm install -D tailwindcss @types/leaflet typescript eslint prettier
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| FastAPI | Flask | If you want simpler sync-only code; but FastAPI is better for API-first apps |
| FastAPI | Django | If you needed ORM, admin panel, auth system — overkill for single-user dashboard |
| React | Svelte/SvelteKit | If bundle size is critical or you prefer less boilerplate; smaller ecosystem |
| React | Next.js | If you needed SSR/SSG; adds complexity unnecessary for personal dashboard |
| SQLite | PostgreSQL | If multi-user or concurrent writes needed; overkill for single-user |
| Plotly | Chart.js | If you want lighter weight charts; Plotly has better interactivity for drill-downs |
| Plotly | D3.js | If you need fully custom visualizations; much steeper learning curve |
| Leaflet | Mapbox GL JS | If you want vector tiles and 3D terrain; requires API key and has usage costs |
| TailwindCSS | CSS Modules | If you prefer scoped CSS without utility classes; Tailwind is faster for prototyping |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Dash (Plotly) | Monolithic Python-rendered UI; poor for SPA experience and custom interactions | FastAPI + React + Plotly.js |
| Streamlit | Prototyping tool, not production web apps; limited customization and routing | FastAPI + React |
| Flask | No async support, no auto-validation, no auto-docs; FastAPI does everything Flask does plus more | FastAPI |
| Create React App | Deprecated, slow builds, no longer maintained | Vite |
| Matplotlib for web | Server-side rendering, no interactivity, poor web integration | Plotly.js or Recharts |
| requests (Python) | Sync only; blocks event loop in FastAPI | HTTPX (async capable) |
| raw Strava API calls | Reinventing OAuth, pagination, model parsing | stravalib |

## Stack Patterns

**For dark mode:**
- TailwindCSS `dark:` variant with CSS custom properties
- Store preference in localStorage, respect system preference as default
- Apply `class="dark"` on `<html>` element

**For Strava data caching:**
- SQLite with `aiosqlite` for async access from FastAPI
- Store raw activity JSON + parsed fields in separate tables
- Watermark-based incremental sync (only fetch activities after last sync timestamp)

**For deployment:**
- Backend: Render.com or Railway (native Python support, free tier)
- Frontend: Vercel or Netlify (optimized for React/Vite, free tier)
- Alternative: Single Render service serving both backend API and static frontend

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| FastAPI ~0.133 | Pydantic 2.x | Pydantic v1 support deprecated in FastAPI |
| stravalib 2.3 | Pydantic 2.x | v2.0+ dropped Pydantic v1 support |
| React 19 | Vite 6.x | Use @vitejs/plugin-react |
| Plotly.js 6.5 | react-plotly.js 2.x | Verify react-plotly.js supports Plotly 6 |
| Leaflet 1.9.4 | react-leaflet 5.x | react-leaflet 5 requires Leaflet 1.9+ |
| TailwindCSS 4.x | Vite 6.x | Native Vite plugin in Tailwind v4 |

## Sources

- [FastAPI PyPI](https://pypi.org/project/fastapi/) — version 0.133.1, Feb 2026
- [stravalib PyPI](https://pypi.org/project/stravalib/) — version 2.3, Mar 2025
- [Plotly.js releases](https://github.com/plotly/dash/releases) — Plotly 6.5.2, Jan 2026
- [Leaflet releases](https://github.com/leaflet/leaflet/releases) — version 1.9.4
- [React docs](https://react.dev/) — React 19
- [Vite](https://vite.dev/) — Vite 6.x

---
*Stack research for: Personal Fitness Dashboard (Strava API)*
*Researched: 2026-02-27*
