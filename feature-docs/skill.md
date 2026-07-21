# feature-docs

Generate or update a dated, coordinated set of product documentation — Requirements, Roadmap, and UAT — for any project. Modeled on the U-Rent MVP Review Rubric Excel format (Req ID | Feature | Priority | Planned | Status | Notes).

## Trigger Phrases

- `/feature-docs`, `feature-docs`
- "create feature docs", "build requirements and roadmap"
- "update requirements", "update roadmap", "refresh UAT"
- "generate product docs", "write UAT plan"
- "dated requirements roadmap UAT"

## What This Skill Produces

Three files in the project's `docs/` directory, all dated today:

| File | Purpose |
|------|---------|
| `docs/REQUIREMENTS-YYYY-MM-DD.md` | Full feature inventory by module — Req ID, status, priority, implementation notes |
| `docs/ROADMAP-YYYY-MM-DD.md` | Versioned roadmap: what's shipped, what's next, external blockers |
| `docs/UAT-YYYY-MM-DD.md` | Acceptance test cases per feature area — preconditions, steps, expected results |

The skill **updates** existing docs (incremental pass — adds new features, marks completions) when prior docs exist, or **creates** them from scratch for new projects.

---

## Instructions

<command-name>feature-docs</command-name>

Parse the user's intent from the trigger:
- **`create`** — generate all three from scratch (new project or major version)
- **`update`** — diff against most recent dated docs, mark completions, add new items
- **`requirements`** — only regenerate/update `REQUIREMENTS-YYYY-MM-DD.md`
- **`roadmap`** — only regenerate/update `ROADMAP-YYYY-MM-DD.md`
- **`uat`** — only regenerate/update `UAT-YYYY-MM-DD.md`

Default: generate/update all three.

---

### Step 1: Discover Project Context (parallel)

Run all of these at once:

```bash
# 1a. Most recent existing docs (baseline)
ls -t docs/REQUIREMENTS-*.md 2>/dev/null | head -1
ls -t docs/ROADMAP-*.md 2>/dev/null | head -1
ls -t docs/UAT-*.md 2>/dev/null | head -1

# 1b. Git log since last docs date (what's shipped)
LAST_DATE=$(ls -t docs/ROADMAP-*.md 2>/dev/null | head -1 | grep -oP '\d{4}-\d{2}-\d{2}' || echo "1 month ago")
git log --oneline --since="$LAST_DATE" | head -40

# 1c. Current test count
npx vitest run --reporter=verbose 2>&1 | tail -3

# 1d. TypeScript errors
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l

# 1e. Open blockers / external dependencies
cat docs/ROADMAP-*.md 2>/dev/null | grep -A 2 "BLOCKED\|blocked\|External" | head -30

# 1f. Stack detection
cat package.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
deps = {**d.get('dependencies',{}), **d.get('devDependencies',{})}
print('test_runner:', 'vitest' if 'vitest' in deps else 'jest')
print('framework:', 'next' if 'next' in deps else 'vite' if 'vite' in deps else 'other')
print('db:', 'supabase' if '@supabase/supabase-js' in deps else 'prisma' if '@prisma/client' in deps else 'other')
" 2>/dev/null
```

Also read:
- `CLAUDE.md` — project conventions, key files, critical rules
- Most recent `ROADMAP-*.md` — current state baseline
- Most recent code-review `TODO_*.md` — pending items
- `src/` or `apps/` top-level structure to understand feature modules

---

### Step 2: Build the Feature Inventory

For each **source area** (auth, chat, billing, etc.), enumerate features by:

1. **Reading source files** — pages, components, edge functions, migrations
2. **Cross-referencing with git log** — commits since last docs date
3. **Checking existing Requirements doc** — carry forward all rows, mark new completions

Feature status rules:
| Signal | Status |
|--------|--------|
| Page/component/edge fn exists + tests pass | COMPLETE |
| Code exists, no tests or known bug | PARTIAL |
| Roadmap item, no code yet | NOT IMPL |
| External dependency (API key, human action, 3rd party) | BLOCKED |
| Accepted risk, no near-term plan | DEFERRED |

Priority rules:
| P0 | Launch blocker — app cannot ship without this |
| P1 | High value — required before public announcement |
| P2 | Nice to have — post-launch acceptable |

Req ID format: `AREA-N.N` (e.g., `AUTH-1.1`, `CHAT-2.3`, `WL-6.4`)

---

### Step 3: Write REQUIREMENTS-YYYY-MM-DD.md

```markdown
# [Project Name] — Product Requirements

**Date:** YYYY-MM-DD
**Version:** vX.Y.Z current
**Author:** [git config user.name]
**Format:** Req ID | Feature | Priority | Planned Implementation | Status | Notes

> Legend: P0 = Must have | P1 = High value | P2 = Nice to have
> Status: COMPLETE | PARTIAL | NOT IMPL | DEFERRED | BLOCKED

---

## [N]. [Area Name]

| Req ID | Feature | Priority | Planned Implementation | Status | Notes |
|--------|---------|----------|----------------------|--------|-------|
| AREA-N.N | Feature name | P0/P1/P2 | How it's built | STATUS | Short note |
...

---

## [N+1]. [Next Area]
...

---

## [Last]. Gap Analysis

| Feature | Status | Gap | Impact | Resolution Plan | Target | Priority |
|---------|--------|-----|--------|-----------------|--------|---------|
...

---

*Requirements baseline as of YYYY-MM-DD — vX.Y.Z. N tests, 0 TypeScript errors.*
```

**Minimum required areas** (adapt for project type):
- Authentication & Identity
- Core Feature (chat / booking / listings / etc.)
- Billing & Plans
- User/Team Management
- Admin / Operator
- Infrastructure & Security
- Client Applications (web, mobile, extension)
- Gap Analysis

---

### Step 4: Write ROADMAP-YYYY-MM-DD.md

```markdown
# [Project Name] — Product Roadmap

**Date:** YYYY-MM-DD
**Author:** [git config user.name]
**Version:** vX.Y.Z current
**Status:** Supersedes docs/ROADMAP-[prior date].md

> Current state: N tests, 0 TS errors, [deployment URL] live.

---

## Document Supersession

| Document | Status |
|----------|--------|
| docs/ROADMAP-[prior].md | Superseded |

---

## Platform Health Scorecard

| Area | Score | Notes |
|------|-------|-------|
| Architecture | N/10 | ... |
| Security | N/10 | ... |
| Test Coverage | N/10 | N tests |
| CI/CD | N/10 | ... |
| Deployment | N/10 | ... |
| Feature Completeness | N/10 | ... |
| Billing | N/10 | ... |

---

## What's Shipped ✅

### [Version] — [Theme] ([Date])
- [x] Feature A | commit/PR ref
- [x] Feature B | commit/PR ref

---

## Remaining Backlog

### Phase 1: [Theme] (~N SP, mostly external)

| ID | SP | Task | Owner | Blocker |
|----|----|------|-------|---------|

### Phase 2: [Theme] (~N SP, unblocked)

| ID | SP | Task | Notes |
|----|----|------|-------|

---

## External Blockers

| Blocker | Owner | Impact | Days Blocked |
|---------|-------|--------|-------------|

---

## Version History

| Version | Date | Milestone |
|---------|------|-----------|
| vX.Y.Z | YYYY-MM-DD | Description |
| **vX.Y.Z+1** | **TBD** | **Next gate** |

---

## Sprint Execution Order

\`\`\`
✅ Current     → [state]
Phase 1        → [theme] → vX.Y+1.0
Phase 2        → [theme] → vX.Y+2.0
\`\`\`

---

*Single source of truth as of YYYY-MM-DD. [One-sentence current state summary.]*
```

---

### Step 5: Write UAT-YYYY-MM-DD.md

```markdown
# [Project Name] — User Acceptance Testing

**Date:** YYYY-MM-DD
**Version:** vX.Y.Z
**Environment:** [deployment URL]

> Status legend: PASS | FAIL | PARTIAL | NOT TESTED | BLOCKED
> Priority: P0 = Launch blocker | P1 = Pre-launch required | P2 = Post-launch acceptable

---

## UAT Execution Summary

| Area | Total | Pass | Fail | Partial | Not Tested |
|------|-------|------|------|---------|------------|
| [Area 1] | N | — | — | — | N |
...

---

## 1. [Area Name]

| UAT ID | Test Name | Priority | Preconditions | Steps | Expected Result | Status | Notes |
|--------|-----------|----------|---------------|-------|-----------------|--------|-------|
| UAT-AREA-01 | Test name | P0/1/2 | What must be true | 1. Step 2. Step | What should happen | NOT TESTED | |
...

---

## Regression Test Areas (Automated)

| Area | Test Files | Count |
|------|------------|-------|
| [module] | [file.test.ts] | N |
...

Run: `npx vitest run` → must show N/N pass, 0 failures.

---

## UAT Sign-Off Checklist

Before marking [version] as launch-ready:

- [ ] All P0 UAT tests: PASS
- [ ] All P1 UAT tests: PASS
- [ ] [Specific external dependency] confirmed
- [ ] No regressions in automated test suite (N/N)

---

*UAT baseline as of YYYY-MM-DD. All tests NOT TESTED — requires manual execution against [URL].*
```

For each UAT test case:
- **UAT ID** format: `UAT-AREA-NN` (e.g., `UAT-AUTH-01`)
- Write 3–6 numbered steps maximum
- Expected result is observable, not "works correctly"
- Mark BLOCKED if test requires an unmet external dependency
- Always include a Regression Test Areas section linking to automated test files

---

### Step 6: Supersede Old Docs

Add to the TOP of each superseded file:

```markdown
> **Superseded by:** [REQUIREMENTS/ROADMAP/UAT-YYYY-MM-DD.md](REQUIREMENTS/ROADMAP/UAT-YYYY-MM-DD.md) — Updated YYYY-MM-DD
```

---

### Step 7: Update MEMORY.md

Find and update the project memory file:

```bash
cat ~/.claude/projects/<slug>/memory/MEMORY.md
```

Update or add these lines:
```markdown
- **Requirements baseline**: `<project-dir>/docs/REQUIREMENTS-YYYY-MM-DD.md`
- **Roadmap**: `<project-dir>/docs/ROADMAP-YYYY-MM-DD.md`
- **UAT baseline**: `<project-dir>/docs/UAT-YYYY-MM-DD.md`
```

---

### Step 8: Commit

```bash
git add docs/REQUIREMENTS-YYYY-MM-DD.md docs/ROADMAP-YYYY-MM-DD.md docs/UAT-YYYY-MM-DD.md [superseded files]
git commit -m "docs: requirements, roadmap, UAT baseline YYYY-MM-DD — vX.Y.Z

- REQUIREMENTS: N features across N areas; N COMPLETE, N PARTIAL, N NOT IMPL, N BLOCKED
- ROADMAP: supersedes ROADMAP-[prior date]; N items remaining, N external blockers
- UAT: N test cases across N areas; all NOT TESTED (manual execution required)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Step 9: Report to User

```
✅ Feature docs generated — YYYY-MM-DD

REQUIREMENTS: docs/REQUIREMENTS-YYYY-MM-DD.md
  - N features across N areas
  - N COMPLETE | N PARTIAL | N NOT IMPL | N BLOCKED

ROADMAP: docs/ROADMAP-YYYY-MM-DD.md
  - Supersedes: docs/ROADMAP-[prior].md
  - Next gate: [description]
  - [N] external blockers

UAT: docs/UAT-YYYY-MM-DD.md
  - N test cases across N areas
  - N BLOCKED (missing: [deps])
  - Run automated regression: npx vitest run → N/N

Committed: [hash]
```

---

### Step 10: Linear Hand-off

The Requirements/Roadmap/UAT set just rewrote the planning truth — mirror it to
Linear via the `/linear-sync` skill (idempotent, marker-based, never duplicates).

- **Interactive session:** ask — "Docs committed. Push the updated roadmap backlog
  to Linear now? (/linear-sync)" — and run it on yes.
- **Autonomous run:** don't block on a prompt — run `/linear-sync` automatically
  (idempotent, mutation-capped) and include the issue identifiers in the report.
- Skip silently only if the project has no Linear project AND has never been
  synced — first-time Linear setup for a repo is the user's call.

---

## Incremental Update Mode

When updating existing docs (not creating from scratch):

1. Read the most recent version of each file
2. Carry forward all existing rows — do NOT delete rows
3. Update `Status` column where git commits show feature shipped
4. Add new rows for features added since last date
5. Update Version History and health scorecard
6. Update UAT Summary table counts
7. Mark BLOCKED tests as PASS if the blocker is resolved
8. Write a NEW dated file (do not overwrite old one)
9. Prepend supersession header to old file

---

## Quality Rules

- **Never write "works correctly"** as expected result — be specific and observable
- **Never guess at test steps** — read the actual page/component to understand the UX
- **Req IDs must be stable** — carry forward existing IDs, only add new ones
- **Gap Analysis is mandatory** — list every NOT IMPL, PARTIAL, and BLOCKED item
- **External blockers must have an Owner** — no ownerless blockers
- **UAT tests for BLOCKED features** → Status = BLOCKED (not NOT TESTED)
- **Automated test count** must match actual `vitest run` output

---

## When to Use

- After a major feature sprint completes
- Before a stakeholder demo or investor presentation
- Before App Store / public launch
- When onboarding a new team member who needs product context
- Monthly cadence for actively developed products
- Any time someone asks "what's the current feature set?"
