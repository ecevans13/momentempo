---
name: docker-dev
description: "Quick Docker development commands for StravaViz: build, run, rebuild, logs, health check, restart, and teardown. Use this skill whenever the user says 'rebuild', 'restart docker', 'check if it's running', 'bring it up', 'docker', 'build and run', 'deploy locally', or any variation of wanting to build, test, or manage the Docker container. Also use when the user has just finished making code changes and wants to see them live."
---

# Docker Dev Cycle

Fast commands for the StravaViz Docker development workflow. The app runs as a single container with FastAPI serving both the API and the built React frontend on port 8080.

## Architecture

- **Dockerfile**: Multi-stage build (Node 22 alpine for frontend build, Python 3.13 slim for runtime)
- **docker-compose.yml**: Maps port 8080, mounts `./data:/data` for persistent SQLite, loads `.env` for Strava credentials
- **Database**: SQLite at `/data/stravviz.db` inside the container (volume-mounted from `./data/`)
- **Frontend**: Built by Vite, served as static files by FastAPI's `StaticFiles(html=True)`

## Commands

### Full rebuild (most common — use after code changes)

```bash
docker compose up -d --build
```

This rebuilds the image (both frontend and backend) and restarts the container. The `--build` flag is essential — without it, Docker reuses the cached image and your changes won't appear.

### Quick restart (config/env changes only, no code changes)

```bash
docker compose restart
```

Faster than a full rebuild since it skips the image build. Only useful when you've changed environment variables or `.env` — not for code changes.

### Check if it's running and healthy

```bash
docker ps --filter name=stravviz --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl -s http://localhost:8080/api/health | python3 -m json.tool
```

The health endpoint returns `{"status": "ok", "athlete_name": "..."}` when everything is working.

### View logs (troubleshoot startup issues)

```bash
docker compose logs --tail 50
```

Add `-f` to follow live: `docker compose logs -f`

### Stop everything

```bash
docker compose down
```

This stops and removes the container but preserves the SQLite database in `./data/`.

### Nuclear rebuild (clear Docker cache)

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

Use this when the build cache seems stale — e.g., dependency changes aren't being picked up. This is slow (full npm install + pip install from scratch) so only use when needed.

### Check frontend build output

```bash
docker compose exec stravviz ls -la /app/frontend/dist/
```

Useful for verifying that frontend assets (JS bundles, images in `brands/`, etc.) made it into the container.

### Database inspection

```bash
sqlite3 data/stravviz.db ".tables"
sqlite3 data/stravviz.db "SELECT COUNT(*) FROM activity"
```

The database file lives on the host at `./data/stravviz.db` thanks to the volume mount, so you can query it directly without `docker exec`.

## Common workflows

### "I changed backend code"
```bash
docker compose up -d --build
curl -s http://localhost:8080/api/health
```

### "I changed frontend code"
```bash
docker compose up -d --build
# Open http://localhost:8080 in browser
```

### "I changed both + want to verify tests still pass"
```bash
cd backend && uv run pytest tests/ -x -q && cd ..
cd frontend && npx tsc --noEmit && npx vite build && cd ..
docker compose up -d --build
curl -s http://localhost:8080/api/health
```

### "Container won't start"
```bash
docker compose logs --tail 100
# Look for Python import errors, missing env vars, or port conflicts
docker compose down && docker compose up -d --build
```

### "I need a fresh database"
```bash
rm data/stravviz.db
docker compose restart
# Re-authenticate at http://localhost:8080/auth/login and re-sync
```

## Environment variables

Required in `.env`:
- `STRAVA_CLIENT_ID` — from Strava API settings
- `STRAVA_CLIENT_SECRET` — from Strava API settings

Set in `docker-compose.yml`:
- `ENVIRONMENT=production`
- `DATABASE_URL=sqlite:////data/stravviz.db`
- `SSL_VERIFY=false` (for environments with intercepting proxies)

## Pre-flight check

Before rebuilding, make sure:
1. Docker Desktop is running: `docker info 2>&1 | head -3`
2. The `data/` directory exists: `mkdir -p data`
3. `.env` has Strava credentials: `test -f .env && echo "OK" || echo "MISSING .env"`
