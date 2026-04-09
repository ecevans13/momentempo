---
name: phase-docs
description: "Scaffold phase planning documents (RESEARCH, PLAN, VERIFICATION) for the StravaViz GSD workflow. Use this skill when starting a new phase, when the user says 'plan phase X', 'start phase X', 'create docs for phase X', 'research phase X', or any time a new .planning/phases/ directory needs to be initialized with the standard document set. Also use when reviewing or updating existing phase documents, or when verifying a completed phase."
---

# Phase Documentation Generator

StravaViz uses a structured phase-based development workflow managed in `.planning/phases/`. Each phase follows a strict document progression: RESEARCH -> PLAN -> (execution) -> SUMMARY -> VERIFICATION. This skill scaffolds these documents following the exact patterns established in phases 01-09.

## Phase directory structure

```
.planning/phases/<NN>-<phase-slug>/
  <NN>-RESEARCH.md        # Domain research, tech decisions, pitfalls
  <NN>-01-PLAN.md          # Execution plan with must_haves and tasks
  <NN>-02-PLAN.md          # Additional plan (if phase needs multiple waves)
  <NN>-01-SUMMARY.md       # Post-execution summary
  <NN>-VERIFICATION.md     # Verification report against must_haves
```

Phase numbering is zero-padded two digits: `01`, `02`, ... `10`, `11`.

## Step 1: Create the phase directory

```bash
mkdir -p .planning/phases/<NN>-<phase-slug>
```

Use a descriptive slug: `10-workout-projector`, `11-training-load`, etc.

## Step 2: RESEARCH.md

The research document captures domain knowledge, tech decisions, and pitfalls before planning. Follow this structure:

```markdown
# Phase <NN>: <Phase Name> — Research

## Phase Requirements

| Req | Description | Priority |
|-----|-------------|----------|
| R1  | ...         | Must     |
| R2  | ...         | Must     |
| R3  | ...         | Should   |

## Summary

<1-2 paragraphs: what this phase delivers, domain context, confidence level, key insight>

## Standard Stack

| Library | Version | Why Standard | When to Use | Alternative |
|---------|---------|-------------|-------------|-------------|
| ...     | ...     | ...         | ...         | ...         |

Use existing project dependencies (FastAPI, SQLModel, Recharts, Tailwind) unless there's a strong reason to add something new.

## Architecture Patterns

### Pattern: <name>
<Description with code example showing how it fits the existing codebase>

## Don't Hand-Roll

- <Thing to use an existing library/pattern for instead of building from scratch>

## Common Pitfalls

### Pitfall: <name>
- **Root cause**: ...
- **Warning signs**: ...
- **Prevention**: ...

## Open Questions

- <Questions that need answering before planning>

## Sources

- **Primary**: <Strava API docs, existing codebase patterns>
- **Secondary**: <Community examples, similar projects>
```

Key: Research should reference specific files and patterns from the existing codebase. Read the relevant models, routers, and components before writing research.

## Step 3: PLAN.md

The plan document is an executable specification. It uses YAML frontmatter for machine-readable metadata and structured sections for tasks.

```markdown
---
phase: "<NN>-<phase-slug>"
plan: "<NN>-01"
type: "implementation"
wave: 1
depends_on: []
files_modified:
  - backend/app/routers/<feature>.py
  - backend/tests/test_<feature>.py
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/components/<Feature>.tsx
autonomous: true
requirements:
  - "R1"
  - "R2"
---

# Plan <NN>-01: <Plan Title>

## must_haves

### truths
Observable behaviors that must be true when this plan is complete:

1. `GET /api/<feature>` returns <expected shape>
2. Frontend renders <component> with <data>
3. Tests cover <scenarios>

### artifacts
Files that must exist:

1. `backend/app/routers/<feature>.py` — API endpoints
2. `backend/tests/test_<feature>.py` — pytest coverage
3. `frontend/src/components/<Feature>.tsx` — React component

### key_links
Wiring between components:

| From | To | Via |
|------|----|-----|
| `<Feature>.tsx` | `/api/<feature>` | `client.ts:fetch<Feature>()` |
| `main.py` | `<feature>.router` | `app.include_router()` |

## <objective>

<2-3 sentences: what this plan achieves and why>

## <execution_context>

Key files to read before executing:
- `backend/app/routers/dashboard.py` — reference endpoint pattern
- `backend/tests/test_dashboard.py` — reference test pattern
- `frontend/src/components/GearGallery.tsx` — reference component pattern

## <tasks>

### Task 1: Backend endpoint
- **files**: `backend/app/routers/<feature>.py`, `backend/app/main.py`
- **action**: Create router with GET endpoint, register in main.py
- **verify**: `cd backend && uv run pytest tests/test_<feature>.py -v`
- **done**: All tests pass, endpoint returns expected JSON

### Task 2: Backend tests
- **files**: `backend/tests/test_<feature>.py`
- **action**: Write tests covering success, empty, error cases
- **verify**: `uv run pytest tests/test_<feature>.py -v`
- **done**: All tests pass

### Task 3: Frontend types and client
- **files**: `frontend/src/api/types.ts`, `frontend/src/api/client.ts`
- **action**: Add TypeScript interfaces and fetch function
- **verify**: `cd frontend && npx tsc --noEmit`
- **done**: No type errors

### Task 4: React component
- **files**: `frontend/src/components/<Feature>.tsx`
- **action**: Create component with loading/error/empty states
- **verify**: `cd frontend && npx tsc --noEmit && npx vite build`
- **done**: Builds clean, component renders correctly

### Task 5: View wiring
- **files**: `frontend/src/views/<Feature>View.tsx` or existing view
- **action**: Import component, add to layout with ErrorBoundary
- **verify**: Visual check in browser
- **done**: Feature accessible from navigation
```

## Step 4: VERIFICATION.md (after execution)

The verification report checks every must_have from the plan against the actual implementation.

```markdown
---
phase: "<NN>-<phase-slug>"
verified: "<YYYY-MM-DD>"
status: "passed"  # or "failed"
re_verification: false
---

# Phase <NN> Verification Report

## Goal Achievement

<1-2 sentences: did the phase achieve its goal?>

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/<feature> returns expected shape | PASS | `curl -s http://localhost:8080/api/<feature>` returns valid JSON |
| 2 | Frontend renders component | PASS | Screenshot confirms rendering |
| 3 | Tests cover scenarios | PASS | `uv run pytest tests/test_<feature>.py -v` — N/N pass |

## Required Artifacts

| # | Artifact | Status | Evidence |
|---|----------|--------|----------|
| 1 | `backend/app/routers/<feature>.py` | PRESENT | File exists, N endpoints |
| 2 | `backend/tests/test_<feature>.py` | PRESENT | N tests |

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| Component | API | client.ts | VERIFIED |
| main.py | router | include_router | VERIFIED |

## Requirements Coverage

| Req | Status | Evidence |
|-----|--------|----------|
| R1  | MET    | ...      |
| R2  | MET    | ...      |

## Gaps

<List any gaps found, or "None identified.">
```

## Step 5: Update tracking files

After creating phase docs, update:
1. `.planning/ROADMAP.md` — add/update phase entry
2. `.planning/STATE.md` — update current phase status

## Quick reference: existing phases

| Phase | Slug | Status |
|-------|------|--------|
| 01 | foundation-and-auth | Complete |
| 02 | data-pipeline | Complete |
| 03 | core-dashboard | Complete |
| 04 | drill-down | Complete |
| 05 | gear-trophies | Complete |
| 06 | deployment | Complete |
| 07 | gps-streams | Complete |
| 08 | enhanced-drill-down | Complete |
| 09 | best-efforts-timeline | Complete |
| 10 | (next) | Not started |

When creating a new phase, read the most recent completed phase's documents (e.g., phase 09) as a reference for format and level of detail.
