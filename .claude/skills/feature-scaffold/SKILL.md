---
name: feature-scaffold
description: "Scaffold a full-stack feature for the StravaViz project: FastAPI endpoint + SQLModel + pytest tests + TypeScript types + API client function + React component + view wiring. Use this skill whenever the user wants to add a new feature, endpoint, page, or data view to the app. Also use when they say 'add an endpoint for X', 'create a component for X', 'wire up X', or describe any new data they want to expose from backend to frontend."
---

# Full-Stack Feature Scaffold

Generate all the files needed to add a new feature to StravaViz, following the project's established patterns exactly. This skill creates the complete vertical slice from database query to rendered UI.

## When to use

Any time a new feature needs backend + frontend wiring. Even if the user only mentions one layer ("add an endpoint for X"), scaffold the full stack so nothing is left dangling.

## What you're building

StravaViz is a FastAPI + React 19 + TypeScript + Tailwind app that visualizes Strava fitness data. SQLite database, SQLModel ORM, Recharts for charts, dark mode by default. The codebase follows strict conventions — match them exactly.

## Step 1: Gather requirements

Before generating anything, clarify:
1. **Feature name** (e.g., "weekly-mileage", "shoe-rotation") — this drives file naming
2. **Data source** — existing model (Activity, BestEffort, Milestone, GearItem) or new model needed?
3. **Endpoints needed** — list (GET collection), detail (GET by ID), create (POST), delete (DELETE)?
4. **Frontend display** — table, chart, cards, detail view?
5. **Filters** — period selector, sport type, pagination?

## Step 2: Backend router

Create `backend/app/routers/<feature>.py`:

```python
from fastapi import APIRouter, HTTPException, Query, Request
from sqlmodel import Session, col, select, func
from app.models import <Model>

router = APIRouter(prefix="/api/<feature>", tags=["<feature>"])

def _get_session(request: Request) -> Session:
    return Session(request.app.state.engine)

@router.get("")
async def list_<feature>(request: Request):
    with _get_session(request) as session:
        stmt = select(<Model>)
        results = session.exec(stmt).all()
        return {"<feature>": [r.model_dump() for r in results]}
```

Key conventions:
- Return plain dicts, not Pydantic response models
- Use `col()` for column predicates: `col(Activity.start_date_epoch) >= cutoff`
- Use `func.count()`, `func.sum()`, `func.avg()` for aggregates — never sum in Python
- Session via context manager: `with _get_session(request) as session:`
- Strava IDs are NOT auto-increment — they're the Strava-provided integer
- Time is always epoch for queries, ISO string for display
- Filter `BestEffort` rows with `name != "_no_efforts"` and `moving_time > 0`

Register in `backend/app/main.py`:
```python
from app.routers import <feature>
app.include_router(<feature>.router)
```

## Step 3: Backend tests

Create `backend/tests/test_<feature>.py`:

```python
import pytest
from app.models import <Model>

def _make_<item>(id, **overrides):
    defaults = { ... }
    defaults.update(overrides)
    return <Model>(**defaults)

def test_<feature>_list(client, session):
    session.add(_make_<item>(1))
    session.commit()
    resp = client.get("/api/<feature>")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["<feature>"]) == 1
```

Key conventions:
- Fixtures `client` and `session` come from `conftest.py` (in-memory SQLite)
- Helper function `_make_<item>(id, **overrides)` for test data
- For time-dependent tests: use `monkeypatch.setattr()` to mock `time.time()` to a fixed epoch (e.g., Wednesday June 18, 2025 = 1750204800)
- Test naming: `test_<feature>_<scenario>`
- Cover: success, empty state, 404, 401 (auth required), pagination, filter combos

Run tests: `cd backend && DATABASE_URL="sqlite:////tmp/test_stravviz.db" uv run pytest tests/test_<feature>.py -v`

## Step 4: Frontend types

Add to `frontend/src/api/types.ts`:

```typescript
export interface <Feature>Item {
  id: number;
  name: string;
  // Match backend response fields exactly
  // Use `| null` for nullable fields, not `?`
}

export interface <Feature>Response {
  <feature>: <Feature>Item[];
  total?: number;
}
```

Conventions:
- Response interfaces: `<Feature>Response`
- Data item interfaces: `<Feature>Item`
- Nullable: `field: type | null` (explicit, not optional)
- Enums as unions: `type Period = "week" | "month" | "year" | "all"`

## Step 5: Frontend API client

Add to `frontend/src/api/client.ts`:

```typescript
import type { <Feature>Response } from "./types";

export function fetch<Feature>(): Promise<<Feature>Response> {
  return fetchJSON(`/api/<feature>`);
}
```

Conventions:
- Function name: `fetch<Feature>()`
- Use existing `fetchJSON<T>()` helper
- Query params via template literals for simple cases, `URLSearchParams` for multiple params
- POST: `{ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }`

## Step 6: React component

Create `frontend/src/components/<Feature>.tsx`:

```typescript
import { useState, useEffect } from "react";
import { fetch<Feature> } from "../api/client";
import type { <Feature>Item } from "../api/types";

interface <Feature>Props {
  onSelectActivity?: (id: number) => void;
}

export default function <Feature>({ onSelectActivity }: <Feature>Props) {
  const [items, setItems] = useState<<Feature>Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch<Feature>()
      .then((r) => setItems(r.<feature>))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400">Loading...</div>;
  if (error) return <div className="text-red-400">{error}</div>;
  if (!items.length) return <div className="text-gray-500">No data yet.</div>;

  return (
    <div className="space-y-4">
      {/* Render items with Tailwind + dark mode */}
    </div>
  );
}
```

Conventions:
- Functional components with hooks only — no class components
- Tailwind dark mode: `dark:bg-gray-900`, `dark:text-white`, etc.
- Always handle loading, error, and empty states
- Sub-components can be defined in the same file
- Color palette: indigo/teal/emerald (NOT orange/Strava colors)
- Wrap in `ErrorBoundary` at the view level, not inside the component

## Step 7: Wire into view

Either add to an existing view in `frontend/src/views/` or create a new one:

```typescript
import { lazy, Suspense } from "react";
import ErrorBoundary from "../components/ErrorBoundary";

const <Feature> = lazy(() => import("../components/<Feature>"));

// Inside the view's return:
<ErrorBoundary>
  <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
    <<Feature> />
  </Suspense>
</ErrorBoundary>
```

If adding a new tab/view, update `frontend/src/App.tsx` navigation.

## Step 8: Verify

After scaffolding, run the verification checklist:
1. `cd backend && uv run pytest tests/test_<feature>.py -v` — all tests pass
2. `cd frontend && npx tsc --noEmit` — no type errors
3. `cd frontend && npx vite build` — builds clean
4. Check the endpoint manually: `curl -s http://localhost:8080/api/<feature> | python3 -m json.tool`

## File summary

| Layer | File | Purpose |
|-------|------|---------|
| Backend router | `backend/app/routers/<feature>.py` | API endpoints |
| Backend registration | `backend/app/main.py` | Mount router |
| Backend tests | `backend/tests/test_<feature>.py` | pytest coverage |
| Frontend types | `frontend/src/api/types.ts` | TypeScript interfaces |
| Frontend client | `frontend/src/api/client.ts` | API fetch functions |
| Frontend component | `frontend/src/components/<Feature>.tsx` | React UI |
| Frontend view | `frontend/src/views/<Feature>View.tsx` | Page composition |
| Navigation | `frontend/src/App.tsx` | Route/tab wiring |
