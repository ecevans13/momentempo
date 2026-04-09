---
name: test-timing-fix
description: "Audit and fix time-dependent test failures in StravaViz backend tests. Use this skill when tests fail on certain days of the week (especially Mondays) or early in the year/month, when the user mentions 'flaky tests', 'test timing', 'tests pass locally but fail in CI', 'epoch', 'calendar boundary', or when dashboard/summary tests produce unexpected counts. Also use when creating new time-dependent tests to avoid introducing the same class of bugs."
---

# Test Timing Fixer

StravaViz dashboard tests have been repeatedly bitten by timing issues: tests that pass most of the time but fail on Mondays, early in January, or at month boundaries. This happens because the backend uses **calendar-relative periods** (week starts Monday, month starts on the 1st, year starts Jan 1) while test data sometimes uses **rolling offsets** (now - N days).

## The root cause

The backend's `_period_cutoff()` function in `dashboard.py` calculates period boundaries:
- **week**: Monday 00:00 of the current week
- **month**: 1st of the current month at 00:00
- **year**: January 1st at 00:00

When tests create seed data using rolling offsets like `time.time() - 86400 * 3` (3 days ago), the data might fall inside or outside the period boundary depending on what day it is. A "3 days ago" activity created on Tuesday falls within the current week, but the same offset on Monday doesn't.

## The fix pattern

All time-dependent tests should use a **fixed reference time** via monkeypatch, set to a date that's safely in the middle of every calendar period.

The project's standard reference time is **Wednesday, June 18, 2025 at 12:00 UTC** (epoch `1750248000`). This date was chosen because:
- It's a Wednesday (middle of the week — not near Monday/Sunday boundaries)
- It's June 18 (middle of the month — not near the 1st or 31st)
- It's mid-year (not near January or December)

### How to apply the fix

```python
import time

FIXED_NOW = 1750248000  # Wed Jun 18, 2025 12:00 UTC

@pytest.fixture(name="seeded_session")
def seeded_session_fixture(session, monkeypatch):
    """Seed data with deterministic timing."""
    monkeypatch.setattr(time, "time", lambda: float(FIXED_NOW))
    # Also patch the module-level reference if dashboard imports time directly:
    monkeypatch.setattr("app.routers.dashboard.time", time)
    
    # Create seed data relative to FIXED_NOW, not real time
    _make_activity(1, start_date_epoch=FIXED_NOW - 86400 * 1)  # 1 day ago (same week)
    _make_activity(2, start_date_epoch=FIXED_NOW - 86400 * 3)  # 3 days ago (same week)
    _make_activity(3, start_date_epoch=FIXED_NOW - 86400 * 10) # 10 days ago (same month)
    _make_activity(4, start_date_epoch=FIXED_NOW - 86400 * 60) # 60 days ago (same year)
    session.commit()
    return session
```

## Audit process

When auditing existing tests for timing issues, search for these patterns:

### Red flags (likely broken on certain days)

```python
# Rolling offset from real time — DANGEROUS
time.time() - 86400 * N

# datetime.now() for epoch calculation — DANGEROUS
datetime.now().timestamp()

# Hardcoded epoch that might cross a year boundary — CHECK
start_date_epoch=1704067200  # Is this near Jan 1?
```

### Green flags (safe patterns)

```python
# Fixed reference time with monkeypatch — SAFE
monkeypatch.setattr(time, "time", lambda: float(FIXED_NOW))

# Offsets calculated from the fixed time — SAFE
start_date_epoch=FIXED_NOW - 86400 * 3

# Explicit calendar-aligned boundaries — SAFE
# (but only if they're relative to the mocked time, not real time)
```

### How to audit

1. Find all test files with time-dependent logic:
   ```
   grep -rn "time\.time\|datetime\.now\|86400\|start_date_epoch" backend/tests/
   ```

2. For each match, check:
   - Is `time.time()` being monkeypatched to a fixed value?
   - Are seed data epochs relative to the fixed value?
   - Do the expected counts in assertions match what the calendar boundaries would produce?

3. For each period type (week/month/year/all), verify the seed data:
   - Count how many activities fall within each period relative to the fixed reference
   - Make sure assertion expected counts match

## Writing new time-dependent tests

When creating new tests that depend on time:

1. Always import and use the `FIXED_NOW` constant
2. Always monkeypatch `time.time` AND the module that imports it
3. Create seed data at specific offsets from `FIXED_NOW` with comments explaining which period they fall in
4. Add a comment block at the top of the fixture listing the expected counts per period:

```python
# With FIXED_NOW = Wed Jun 18, 2025 12:00 UTC:
# - week period: activities 1, 2 (within Mon Jun 16 - Sun Jun 22)
# - month period: activities 1, 2, 3 (within Jun 1 - Jun 30)
# - year period: activities 1, 2, 3, 4 (within Jan 1 - Dec 31)
# - all: activities 1, 2, 3, 4, 5
```

## Quick fix checklist

1. Search for `time.time()` or rolling offsets in test file
2. Add `FIXED_NOW = 1750248000` constant
3. Monkeypatch `time.time` in the seeded fixture
4. Replace rolling offsets with `FIXED_NOW - 86400 * N`
5. Add comments explaining which period each activity falls in
6. Verify expected counts per period
7. Run: `cd backend && uv run pytest tests/test_<file>.py -v`
8. Run on its own AND with the full suite to catch fixture leakage: `uv run pytest tests/ -x -q`
