---
name: code-review-v2
description: Continuity-aware code review that starts from the last review round, reconciles all planning docs, performs a targeted delta review of changed areas, analyses feature and test gaps, and produces a unified sprint plan that brings the full product to date. Use when the user says "code-review-v2", "updated review", "review from last time", "catch up the review", "sprint plan from review", or "full product review".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
---

# Code Review V2

**Continuity-aware review.** Starts from the last code-review round, reconciles all planning documents, performs a targeted delta analysis of what changed and what's new, and produces a unified sprint-structured action plan that addresses code quality, feature completion, and test coverage — everything needed to bring the full product to date.

## Trigger Phrases

- `code-review-v2`, `/code-review-v2`
- "updated review", "review from last time", "catch up the review"
- "sprint plan from review", "full product review"
- "review and sprint plan", "integrated review"

---

## Overview: What Makes This Different

| Aspect | /code-review | /code-review-v2 |
|--------|-------------|-----------------|
| Starting point | Fresh slate | Prior review + git history |
| Scope | Full re-review | Delta + persistent issues |
| Roadmap | Not included | Reconciled inline |
| Feature gaps | Listed | Sprint-planned |
| Test gaps | Listed | Sprint-planned |
| Output | 11 documents | 7 documents + SPRINT_PLAN |
| Sprint plan | Basic TODO tiers | Themed sprints with DoD |
| Time | ~60–90 min | ~45–60 min |

**If no prior review exists:** Fall back to a full `/code-review` then immediately proceed to sprint planning. Note this in the executive summary.

---

## Output Structure

All output goes to `code-review/<YYYY-MM-DD>/`:

```
code-review/YYYY-MM-DD/
├── 00-EXECUTIVE-SUMMARY.md       — Delta summary: what improved, what's new, overall rating change
├── 01-DELTA-REVIEW.md            — Resolved vs carryover vs new findings; git-correlated
├── 02-SECURITY-AND-QUALITY.md    — Focused: security gaps + type safety + error handling
├── 03-TESTING-GAPS.md            — Coverage map, missing suites, test quality issues
├── 04-FEATURE-COMPLETENESS.md    — Full product gap analysis vs spec/README/demo guide
├── 05-TECHNICAL-DEBT.md          — Unified backlog: surviving + new (replaces prior TODO)
├── SPRINT_PLAN.md                — THE deliverable: themed sprints with DoD, estimates, ordering
└── TODO_YYYY-MM-DD.md            — TOON action plan (successor to all prior TODO files)
```

`docs/ROADMAP-YYYY-MM-DD.md` is also updated or created as part of roadmap reconciliation.

---

## Execution Process

Execute each phase serially. Do not skip phases. Do not parallelize agents.

---

### Phase 1: Anchor — Find the Prior Review (5 min)

```bash
# Find all prior code-review directories, sorted by date
ls -td code-review/20*/ 2>/dev/null | head -10

# Get the most recent TODO file (the action plan from last review)
ls -t code-review/*/TODO_*.md 2>/dev/null | head -1

# Count prior TODO items and their completion state
grep -c "^\- \[x\]" <prior-TODO.md>   # done
grep -c "^\- \[ \]" <prior-TODO.md>   # still open
```

**If no prior review found:**
- Note "First review — no prior baseline" in DELTA-REVIEW.md
- Treat all findings as new (no carryover distinction)
- Still produce all 7 documents + SPRINT_PLAN

**Extract from prior review:**
- Overall rating (GREEN / YELLOW / RED)
- Total finding counts by severity
- All open `- [ ]` items (carryover candidates)
- All closed `- [x]` items (completed since last review)
- The prior review date (for git window)

---

### Phase 2: Inventory — Find All Planning Documents (5 min)

```bash
# All roadmap, TODO, phase, backlog, session context docs
find . -type f \( \
  -name "TODO*.md" -o -name "ROADMAP*.md" -o -name "PHASE*.md" \
  -o -name "*-BACKLOG*.md" -o -name "SESSION_CONTEXT*.md" \
  -o -name "UPDATE-*.md" -o -name "SPRINT*.md" \
\) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -not -path "*/code-review/*" \
  2>/dev/null | sort

# Find code-review TODO files specifically
find . -path "*/code-review/*/TODO*.md" \
  -not -path "*/node_modules/*" 2>/dev/null | sort

# Git log since prior review date (or 4 weeks if no prior)
git log --oneline --since="YYYY-MM-DD" | head -60
# or
git log --oneline --since="4 weeks ago" | head -60

# Files changed since prior review (scope indicator)
git diff --stat <prior-review-commit>..HEAD 2>/dev/null | tail -30
# or approximate:
git diff --stat HEAD~40..HEAD 2>/dev/null | tail -30
```

Read each planning doc found. Extract:
- Every `- [ ]` / `- [x]` item with its ID and context
- Milestone definitions and target dates
- Any explicit "pending" / "deferred" / "blocked" items
- Product requirements language (what "done" looks like)

Also read: `README.md`, `docs/DEMO-GUIDE.md`, `docs/LAUNCH-CHECKLIST.md`, or any file that describes what the full product should do. This establishes the **product baseline** for feature gap analysis.

---

### Phase 3: Git Cross-Reference — What Got Done? (5 min)

Match commit messages against prior TODO items to determine completion status:

```bash
# Full commit list since prior review
git log --oneline --since="YYYY-MM-DD" --format="%h %s"

# Check what areas changed
git diff --name-only HEAD~40..HEAD 2>/dev/null | sort | uniq
```

**Completion signals (high confidence):**
- `[x]` in prior TODO file
- Commit message matches finding description (feat/fix + same component)
- Source file modified and prior finding was about that file
- PR merged with TD-NNN reference in title or body

**Completion signals (medium confidence):**
- Session context describes the item as done
- The file referenced in the finding no longer contains the issue

**Mark each prior open item as:**
- `RESOLVED` — confirmed fixed via git/PR
- `CARRYOVER` — still open, no evidence of fix
- `PARTIAL` — partially addressed, still needs work
- `SUPERSEDED` — replaced by a different approach

Build a delta table before proceeding to Phase 4:

| ID | Title | Status | Evidence |
|----|-------|--------|----------|
| TD-001 | ... | RESOLVED | commit abc1234 |
| TD-002 | ... | CARRYOVER | no matching commit |

---

### Phase 4: Targeted Delta Review (20 min)

**This is NOT a full re-review.** Focus on:
1. **Changed files** — files modified since last review; look for new issues
2. **Persistent issues** — files with CARRYOVER findings; confirm they're still present
3. **New modules/features** — code that didn't exist in the last review; full review
4. **High-risk areas** — always re-check: auth, env/secrets, input validation, payment flows

```bash
# Files changed since last review — these need targeted review
git diff --name-only <prior-date-approx>..HEAD | grep -E "\.(ts|tsx|js|jsx|py|go)$" | head -40

# New files (added since last review)
git log --diff-filter=A --name-only --since="YYYY-MM-DD" --format="" | sort | uniq | head -30

# Check for new TODO/FIXME/HACK comments added since last review
git diff HEAD~40..HEAD | grep "^+" | grep -E "(TODO|FIXME|HACK|XXX)" | head -20
```

**Review each changed area for:**

| Domain | What to Check |
|--------|--------------|
| Security | New endpoints without auth guards, new env var usage, secrets in code, new input validation |
| Type safety | New `any` casts, missing return types, unchecked nulls in new code |
| Error handling | New async code without try/catch, missing 404/403 handlers |
| Test coverage | New services/controllers without corresponding test files |
| Feature completeness | New routes/endpoints without corresponding frontend, or vice versa |

Assign finding IDs starting from the prior review's last used ID + 1 (to avoid collisions).

Write findings using the same format as `/code-review`:
```
### [PREFIX]-NNN: Title
| Severity | File:Line | Effort |
Code snippet + recommendation
```

---

### Phase 5: Feature & Test Gap Analysis (10 min)

#### Feature Gap Analysis

The goal: identify what's needed to reach **full product** state.

Source the product baseline from:
- `README.md` — feature list
- `docs/DEMO-GUIDE.md` — demo flow (what the product should do end-to-end)
- `docs/LAUNCH-CHECKLIST.md` — explicit launch requirements
- `docs/ROADMAP-*.md` — committed feature scope
- Session context / update docs — recent decisions

For each stated feature/requirement, verify against the codebase:

```bash
# Check if an endpoint exists
grep -r "GET\|POST\|PATCH\|DELETE" apps/api/src --include="*.controller.ts" | grep -i "<feature>"

# Check if a frontend page exists
find apps/web/src/app -name "page.tsx" | xargs grep -l "<feature>" 2>/dev/null

# Check if a DB table exists
grep -i "<feature>" libs/prisma-client/prisma/schema.prisma
```

Rate each feature as:
- `COMPLETE` — implemented and tested
- `PARTIAL` — backend exists, no frontend (or vice versa); or implemented but untested
- `MISSING` — in spec/roadmap but not in code
- `DEFERRED` — explicitly deferred with reason

#### Test Gap Analysis

```bash
# Count test files and tests
find . -name "*.spec.ts" -o -name "*.test.ts" -o -name "*.spec.tsx" \
  -not -path "*/node_modules/*" 2>/dev/null | wc -l

# List modules/services WITHOUT a corresponding spec file
find apps/api/src -name "*.service.ts" -not -path "*/node_modules/*" | while read f; do
  spec="${f/.service.ts/.service.spec.ts}"
  spec="${spec/src\//src/__tests__/}"
  [ ! -f "$spec" ] && [ ! -f "${f/.service.ts/__tests__/*.spec.ts}" ] && echo "NO TEST: $f"
done

# List controllers WITHOUT spec files
find apps/api/src -name "*.controller.ts" | while read f; do
  echo "CHECK: $f"
done

# Check e2e coverage
find . -path "*/e2e/*" -name "*.spec.ts" | head -20

# Run existing tests to establish baseline
npx nx test api --passWithNoTests 2>&1 | tail -5
npx nx test web --passWithNoTests 2>&1 | tail -5
```

For each untested module, note:
- Which module is missing coverage
- Estimated SP to add tests
- Priority (HIGH if it handles money/auth/data, LOW for UI helpers)

---

### Phase 6: Write the Documents (15 min)

Write each document **in order**. After each document, record a 1-line finding tally before moving on.

#### 6.1 — 01-DELTA-REVIEW.md

```markdown
# Delta Review: <Project> — YYYY-MM-DD vs PRIOR-DATE

## Review Continuity

| Field | Value |
|-------|-------|
| This review | YYYY-MM-DD |
| Prior review | PRIOR-DATE (link) |
| Git window | PRIOR-DATE → YYYY-MM-DD (N commits) |
| Prior rating | RED / YELLOW / GREEN |
| This rating | RED / YELLOW / GREEN |

## Summary of Changes

- **N items resolved** since last review
- **N items carried over** (still open)
- **N new findings** identified

## Resolved Items (since last review)

| ID | Title | Resolution | Commit |
|----|-------|-----------|--------|
| TD-NNN | ... | Fixed | abc1234 |

## Carryover Items (still open)

| ID | Title | Priority | Notes |
|----|-------|----------|-------|
| TD-NNN | ... | HIGH | No evidence of fix |

## New Findings (since last review)

| ID | Title | Severity | Area |
|----|-------|----------|------|
| TD-NNN | ... | HIGH | Security |

## Coverage Change

| Area | Last Review | This Review | Trend |
|------|-------------|-------------|-------|
| API tests | N | N | ↑/↓/→ |
| Web tests | N | N | ↑/↓/→ |
| Feature completeness | N% | N% | ↑/↓/→ |
```

#### 6.2 — 02-SECURITY-AND-QUALITY.md

Focus: security gaps, type safety, error handling — with emphasis on what's new or changed since last review. Reuse surviving findings from prior `01-SECURITY-REVIEW.md`; add new ones. Use finding IDs `SEC-NNN` and `CQ-NNN`.

Include subsections:
- Authentication & Authorization
- Input Validation & Injection
- Secrets & Configuration
- Type Safety
- Error Handling Consistency

#### 6.3 — 03-TESTING-GAPS.md

Document the test coverage map. Use finding IDs `TST-NNN`.

```markdown
## Coverage Map

| Module | Unit Tests | Integration | E2E | Priority |
|--------|-----------|------------|-----|----------|
| auth | ✅ | ✅ | ❌ | HIGH |
| payments | ✅ | ❌ | ❌ | CRITICAL |
| <module> | ❌ | ❌ | ❌ | HIGH |

## Missing Test Suites (prioritized)

### TST-NNN: No tests for <Module>
| SP | Priority | Files |
...
```

Include:
- Current test count (total, by suite type)
- Modules with zero coverage
- Modules with partial coverage
- E2E/integration gaps
- Mock quality issues (e.g., mocking the DB when it should hit a real test DB)

#### 6.4 — 04-FEATURE-COMPLETENESS.md

Document the full product gap analysis. Use finding IDs `FC-NNN`.

```markdown
## Product Baseline

Source: `README.md` + `docs/DEMO-GUIDE.md` + `docs/ROADMAP-*.md`

## Feature Status

| Feature | Backend | Frontend | Tests | Status |
|---------|---------|----------|-------|--------|
| User auth | ✅ | ✅ | ✅ | COMPLETE |
| Payments | ✅ | ✅ | ❌ | PARTIAL |
| <Feature> | ❌ | ❌ | ❌ | MISSING |

## Gap Details

### FC-NNN: <Feature> incomplete
| Severity | SP | Status |
...
What exists, what's missing, acceptance criteria.
```

#### 6.5 — 05-TECHNICAL-DEBT.md

Consolidated, de-duplicated backlog — combines:
- CARRYOVER items from prior review (reuse TD-NNN IDs)
- New findings from Phase 4 (new TD-NNN IDs continuing the sequence)
- Feature gaps from 04 (new FC-NNN IDs)
- Test gaps from 03 (new TST-NNN IDs)

Each item:
```markdown
### TD-NNN: Title

| Priority | SP | Type | Source | Files |
|----------|-----|------|--------|-------|
| HIGH | 3 | Security | SEC-003 | `path/to/file.ts:45` |

**Task:** Actionable description.

**Acceptance Criteria:**
- [ ] Criterion
```

Group by: CRITICAL → HIGH → MEDIUM → LOW → Backlog.

---

### Phase 7: Write the Sprint Plan (10 min)

This is the primary deliverable. Think hard about sprint sequencing before writing.

**Sprint design principles:**
1. **Theme, not number** — Each sprint has a name that describes its purpose
2. **Logical ordering** — Blockers first, then features, then tests, then polish
3. **Dependencies first** — If Sprint B needs Sprint A's output, Sprint A goes first
4. **Right-sized** — 8–15 SP per sprint (1–2 dev weeks)
5. **Definition of Done** — Each sprint has a clear, testable exit condition
6. **No mixed priorities** — Don't put LOW items in a sprint with CRITICAL items

**Standard sprint sequence (adapt as needed):**

| Sprint | Theme | Typical Content |
|--------|-------|-----------------|
| Sprint 1 | Blockers & Security | CRITICAL + HIGH security, auth gaps, broken flows |
| Sprint 2 | Feature Completion | MISSING/PARTIAL features needed for full product |
| Sprint 3 | Test Coverage | Critical test gaps, integration tests for payment/auth |
| Sprint 4 | Quality & Debt | Type safety, error handling, code quality |
| Sprint 5 | Polish & Launch Prep | UX gaps, accessibility, performance, launch checklist |
| Backlog | Deferred | LOW items, nice-to-haves, future features |

Adjust to the actual project state — if there are no security issues, merge Sprint 1 + 2. If tests are in great shape, skip Sprint 3.

#### SPRINT_PLAN.md format:

```markdown
# Sprint Plan: <Project Name>
**Date:** YYYY-MM-DD
**Based on:** code-review/YYYY-MM-DD/ + docs/ROADMAP-*.md
**Total remaining:** ~N SP across N sprints

---

## Product Completion Status

| Area | Status | Gaps |
|------|--------|------|
| Core features | N% complete | N MISSING, N PARTIAL |
| Test coverage | N suites / N tests | N modules untested |
| Security | N open issues | N CRITICAL, N HIGH |
| Tech debt | N SP | N items |

---

## Sprint 1: <Theme Name> (~N SP)

**Goal:** <One sentence: what "done" looks like for this sprint>

**Definition of Done:**
- [ ] All CRITICAL items resolved
- [ ] No new TypeScript errors
- [ ] Relevant tests pass

**Items:**

| ID | Title | SP | Type | Files |
|----|-------|----|------|-------|
| TD-NNN | Description | N | Security | `path/to/file.ts` |

**Sprint notes:** Dependencies, risks, or sequencing notes.

---

## Sprint 2: <Theme Name> (~N SP)

...same structure...

---

## Sprint N: <Theme Name> (~N SP)

...

---

## Backlog (Deferred / Nice-to-Have)

| ID | Title | SP | Why Deferred |
|----|-------|----|-------------|
| TD-NNN | Description | N | Low risk, future milestone |

---

## Completion Forecast

| Sprint | SP | Cumulative | State After |
|--------|-----|-----------|-------------|
| Sprint 1 | N | N | Secure & unblocked |
| Sprint 2 | N | N | Feature-complete |
| Sprint 3 | N | N | Test coverage ≥ 80% |
| Sprint 4 | N | N | Debt resolved |
| Sprint 5 | N | N | Launch-ready |

---

## Key Dependencies & Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| External API creds not available | Blocks gift card sprint | Stub + integration test |

---

*Generated: YYYY-MM-DD. Successor to: [prior TODO](../PRIOR-DATE/TODO_*.md)*
```

---

### Phase 8: Write TODO_YYYY-MM-DD.md (TOON Format) (5 min)

Token-optimized distillation of SPRINT_PLAN.md. This is what gets loaded in future sessions.

```markdown
# TODO: <Project> — YYYY-MM-DD (v2 Review)
Prior: PRIOR-DATE | Rating: RED→YELLOW | Delta: N resolved, N new, N carried
Total open: N SP | Sprints: N

## Sprint 1: <Theme> (N SP)
- [ ] **TD-NNN** (N SP): Description | `file.ts:LINE` | SEC-NNN
- [ ] **TD-NNN** (N SP): Description | `file.ts:LINE` | CQ-NNN

## Sprint 2: <Theme> (N SP)
- [ ] **FC-NNN** (N SP): Feature name — backend+frontend | `module/` | FC-NNN
- [ ] **TST-NNN** (N SP): Tests for X — unit+integration | `module.service.ts` | TST-NNN

## Sprint 3: <Theme> (N SP)
...

## Backlog
| ID | SP | Title | Source |
|----|----|-------|--------|
| TD-NNN | N | Description | ARCH-NNN |

## Quick Ref
- CRITICAL: N items, N SP
- Feature gaps: N (MISSING: N, PARTIAL: N)
- Test gaps: N modules uncovered
- Prior resolved: N items (commits since PRIOR-DATE)
- Docs: `code-review/YYYY-MM-DD/`
- Sprint plan: `code-review/YYYY-MM-DD/SPRINT_PLAN.md`
- Roadmap: `docs/ROADMAP-YYYY-MM-DD.md`
```

---

### Phase 9: Roadmap Reconciliation (5 min)

Create or update `docs/ROADMAP-YYYY-MM-DD.md` following the reconcile-roadmap format.

Key additions over standard reconcile-roadmap output:
- Link directly to SPRINT_PLAN.md for the execution plan
- Include the health scorecard from this review
- Mark all items resolved since last roadmap
- Note the new code-review as the authoritative source

Add supersession headers to:
- All prior `docs/ROADMAP-*.md` files
- All prior `code-review/*/TODO_*.md` files

```markdown
> **Superseded by:** [ROADMAP-YYYY-MM-DD](ROADMAP-YYYY-MM-DD.md) — Updated YYYY-MM-DD
```

Update MEMORY.md roadmap pointer.

---

### Phase 10: Executive Summary (5 min)

Write `00-EXECUTIVE-SUMMARY.md` last, after all other documents.

```markdown
# Code Review V2: <Project Name>

| Field | Value |
|-------|-------|
| Date | YYYY-MM-DD |
| Prior review | PRIOR-DATE |
| Repository | <repo> |
| Branch | main |
| Commit | <short-sha> |

## Rating Change

| | Prior | This Review | Trend |
|-|-------|-------------|-------|
| Overall | RED / YELLOW / GREEN | ... | ↑/↓/→ |
| Security | ... | ... | |
| Test Coverage | N% | N% | |
| Feature Completeness | N% | N% | |

## Since Last Review

- ✅ **N items resolved** — <highlights of biggest fixes>
- 🆕 **N new findings** — <most important new issues>
- ↩️ **N items carried over** — <why they weren't addressed>

## Current State Summary

<2–3 paragraphs: where the product stands, what's blocking launch, what's in good shape>

## Critical Must-Fix Before Launch

<Numbered list of CRITICAL/blockers only>

## Document Index

| # | Document | Findings | Focus |
|---|----------|----------|-------|
| 01 | Delta Review | N resolved, N new | Continuity |
| 02 | Security & Quality | N findings | ... |
| 03 | Testing Gaps | N modules | ... |
| 04 | Feature Completeness | N gaps | ... |
| 05 | Technical Debt | N items | ... |
| — | SPRINT_PLAN | N sprints | **Key deliverable** |

## Recommended Next Steps

1. **This week:** Sprint 1 items (N SP) — <brief description>
2. **Next 2 weeks:** Sprint 2 items (N SP) — <brief description>
3. **Milestone:** Sprint N completion → launch-ready
```

---

### Phase 11: Commit (3 min)

```bash
# Stage all new files
git add code-review/YYYY-MM-DD/
git add docs/ROADMAP-YYYY-MM-DD.md
git add docs/ROADMAP-PRIOR-DATE.md   # supersession header added

# Commit
git commit -m "$(cat <<'EOF'
docs: code-review-v2 YYYY-MM-DD — <one-line rating/state summary>

Delta from PRIOR-DATE:
- N items resolved (commits: abc123, def456)
- N new findings (highest: ...)
- N items carried over
Sprint plan: N sprints, ~N SP total

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
git push
```

---

### Phase 12: Report to User

```
Code Review V2 complete.

Rating: PRIOR → THIS (↑ improved / ↓ regressed / → unchanged)

Since last review (PRIOR-DATE → YYYY-MM-DD):
  ✅ N resolved  |  🆕 N new  |  ↩️  N carried over

Product state:
  Features: N% complete (N MISSING, N PARTIAL)
  Tests:    N suites, N untested modules
  Debt:     N SP open (N CRITICAL, N HIGH)

Sprint plan: N sprints, ~N SP total
  Sprint 1: <Theme> (N SP) — starts immediately
  Sprint 2: <Theme> (N SP)
  ...
  Sprint N: Launch-ready

Key files:
  code-review/YYYY-MM-DD/SPRINT_PLAN.md  ← execution plan
  code-review/YYYY-MM-DD/TODO_YYYY-MM-DD.md  ← action items
  docs/ROADMAP-YYYY-MM-DD.md  ← updated roadmap

Committed: <hash>
```

---

## Rules

1. **Always read the prior review before writing anything.** The delta is the core value of this skill.
2. **Use git as ground truth for completion.** If a commit addresses a finding, it's RESOLVED regardless of checkbox state.
3. **Preserve prior TD-NNN IDs** for carryover items — do not renumber them.
4. **New findings get IDs that continue the prior sequence** — if last review ended at TD-042, start new items at TD-043.
5. **Every sprint must have a Definition of Done** — not just a list of items.
6. **SPRINT_PLAN.md is the primary deliverable** — if time is short, this gets written even if other documents are abbreviated.
7. **Feature gaps and test gaps belong in the sprint plan** — not just in a backlog.
8. **Read the product spec** — README, demo guide, launch checklist. You cannot assess feature completeness without knowing what the product is supposed to do.
9. **Don't re-review what didn't change.** If a module hasn't been touched since the last review and had no CARRYOVER findings, skip it.
10. **Update MEMORY.md.** Roadmap pointer and test counts must be current after this skill runs.
11. **Commit everything.** Review docs + roadmap + supersession headers in one commit.
12. **~60 min total.** This is a focused, value-dense session — not exhaustive archaeology.

## Severity & Story Point Scales

Same as `/code-review`:

| Level | Definition |
|-------|-----------|
| CRITICAL | Exploitable, data loss, or launch blocker |
| HIGH | Significant risk, fix in current sprint |
| MEDIUM | Moderate risk, fix within 2 sprints |
| LOW | Minor, backlog |

| SP | Scope |
|----|-------|
| 0.5 | Config change, one-liner |
| 1 | Single file, < 30 min |
| 2 | 2–3 files, < 2 hours |
| 3 | Small feature or multi-file, < 1 day |
| 5 | Cross-cutting, 1–2 days |
| 8 | Large feature or architectural change, 3–5 days |
| 13 | Epic, 1–2 weeks |

## When to Use Which Review Skill

| Need | Skill |
|------|-------|
| First review of a new project | `/code-review` |
| Quick sanity check, single output file | `/code-review-quick` |
| Continuing from last review, sprint planning | `/code-review-v2` ← this |
| Pick up next item from existing action plan | `/code-review-proceed` |
| Reconcile planning docs only | `/reconcile-roadmap` |
