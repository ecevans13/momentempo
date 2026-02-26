# Codebase Structure

**Analysis Date:** 2026-02-26

## Directory Layout

```
test_proj/
├── .claude/                # Claude Code configuration
│   └── settings.local.json
├── .git/                   # Git repository metadata
├── .gitignore/             # Empty directory (potentially misconfigured)
├── .planning/              # Project planning documents
│   └── codebase/           # Codebase analysis documents
└── .venv/                  # Python virtual environment (Python 3.13)
    ├── bin/
    ├── lib/
    └── ...
```

## Directory Purposes

**.claude:**
- Purpose: Claude Code editor configuration
- Contains: Local settings for permissions
- Key files: `settings.local.json`

**.planning:**
- Purpose: Project planning and documentation
- Contains: Codebase analysis documents
- Key files: Architecture and structure documentation stored in `codebase/` subdirectory

**.venv:**
- Purpose: Python 3.13 virtual environment
- Contains: Python interpreter and installed packages
- Key files: Standard virtualenv structure with `bin/`, `lib/`, and `site-packages/`

**.gitignore:**
- Purpose: Appears to be a directory (possibly misconfigured - should be a file)
- Contains: Empty
- Key files: None

## Key File Locations

**Entry Points:**
- Not yet created

**Configuration:**
- `.claude/settings.local.json`: Claude Code permissions and settings

**Core Logic:**
- Not yet created

**Testing:**
- Not yet created

## Naming Conventions

**Files:**
- Not yet established - no application files exist

**Directories:**
- Dotfile convention: Configuration and tooling use dot-prefix (`.claude`, `.planning`, `.venv`)

## Where to Add New Code

**New Feature:**
- Primary code: Suggested: `src/` or project root (to be established)
- Tests: Suggested: `tests/` (to be established)

**New Component/Module:**
- Implementation: Suggested: `src/` (to be established)

**Utilities:**
- Shared helpers: Suggested: `src/utils/` or `lib/` (to be established)

## Special Directories

**.venv:**
- Purpose: Python virtual environment with dependencies
- Generated: Yes (via `python -m venv`)
- Committed: No (should be in .gitignore)

**.planning:**
- Purpose: Project planning and codebase documentation
- Generated: Yes (by GSD tooling)
- Committed: Likely yes (planning documents are project artifacts)

**.gitignore:**
- Purpose: Currently a directory - should be converted to file
- Generated: Created but misconfigured
- Committed: Directory structure exists but is empty

---

*Structure analysis: 2026-02-26*
