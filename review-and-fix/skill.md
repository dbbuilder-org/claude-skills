---
name: review-and-fix
description: "Full code review + reconcile roadmap + execute fixes — all in series. Runs a comprehensive code review, reconciles all planning docs, then executes each fix item one by one. Use when the user asks to 'review and fix', 'audit and remediate', 'review then execute fixes', or wants a complete review-to-resolution cycle. Covers: code quality, tech debt, test coverage, UI completeness, type safety, feature completeness."
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
---

# Review and Fix

End-to-end code review, roadmap reconciliation, and serial fix execution.

Builds on the `code-review` and `reconcile-roadmap` skills but adds a third phase: **execute the fixes in series**, clearing context between phases.

## Trigger Phrases

- "review and fix", "audit and remediate"
- "code review then fix everything"
- "review, reconcile, execute"
- "full review-to-fix cycle"

## Overview

```
Phase 1: CODE REVIEW          → code-review/<date>/ (13 documents)
Phase 2: RECONCILE ROADMAP    → docs/ROADMAP-<date>.md (consolidated plan)
Phase 3: EXECUTE FIXES        → serial implementation, one item at a time
```

Each phase completes fully before the next begins. No parallelism between phases.

---

## Phase 1: Code Review

Follow the full `/code-review` skill specification. Produce all 13 documents in `code-review/<YYYY-MM-DD>/`.

### Focus Areas (weighted)

These six areas get extra scrutiny — each must have dedicated findings:

| Focus Area | Review Doc | What to Look For |
|-----------|------------|-----------------|
| **Code Quality** | 03 | `as any`, `as unknown`, missing types, dead code, duplication |
| **Tech Debt** | 06 | Accumulated shortcuts, deprecated patterns, migration residue |
| **Test Coverage** | 04 | Untested routes, missing edge cases, mock quality, coverage gaps |
| **UI Completeness** | 08 | Missing states (loading/error/empty), broken layouts, a11y gaps |
| **Type Safety** | 03 | Unsafe casts, untyped JSON, `Record<string, any>`, loose generics |
| **Feature Completeness** | 09 | TODO/FIXME, stub implementations, orphan endpoints, unused DB columns |

### Phase 1 Execution

1. **Discovery** — Read package.json, schema, configs, count files/tests/LOC
2. **Layer Analysis** — Launch up to 6 Task agents in parallel (one per focus area above), each producing findings for their respective review document
3. **Remaining Docs** — Security (01), Architecture (02), Deployment (05), Strengths (07), Appendices
4. **Synthesis** — Write Executive Summary (00) and Tech Debt Backlog (06) last
5. **Distillation** — Write `TODO_<date>.md` in TOON format

### Phase 1 Gate

All 13 documents written. `TODO_<date>.md` has actionable items with SP estimates.

---

## Phase 2: Reconcile Roadmap

Follow the full `/reconcile-roadmap` skill specification.

### Phase 2 Inputs

- The freshly written `code-review/<date>/TODO_<date>.md`
- All existing `docs/TODO*.md`, `docs/ROADMAP*.md`, `docs/*BACKLOG*.md`
- Recent git history (`git log --oneline -30`)

### Phase 2 Steps

1. **Discover** all planning docs in the project
2. **Read** each one, extract items with status
3. **Cross-reference** with git commits to mark completions
4. **Merge** new code review findings into the consolidated plan
5. **Write** `docs/ROADMAP-<date>.md` — single authoritative go-forward plan
6. **Update** source TODO files to point to the consolidated doc

### Phase 2 Output: Sprint Plan

The consolidated roadmap MUST include a sprint plan organized for serial execution:

```markdown
## Execution Plan

### Sprint 1: Critical + Security (N SP)
| # | ID | SP | Title | Files |
|---|----|----|-------|-------|
| 1 | TD-001 | 3 | Fix X | `path/file.ts` |
| 2 | TD-002 | 2 | Fix Y | `path/other.ts` |

### Sprint 2: Code Quality + Type Safety (N SP)
...

### Sprint 3: Test Coverage (N SP)
...

### Sprint 4: UI + Feature Completeness (N SP)
...
```

### Phase 2 Gate

`docs/ROADMAP-<date>.md` exists with numbered execution order. All prior TODOs updated.

---

## Phase 3: Execute Fixes

Work through the sprint plan **in order, one item at a time**.

### Execution Rules

1. **Serial, not parallel** — Complete item N before starting item N+1
2. **Read before edit** — Always read the target file(s) before modifying
3. **Test after each fix** — Run `pnpm test` (or equivalent) after each change; do not proceed if tests fail
4. **Commit after each logical group** — Group related 0.5-1 SP fixes into one commit; 2+ SP items get their own commit
5. **Update the TODO** — Check off each item in `TODO_<date>.md` as completed
6. **Skip items that need user input** — If an item requires a design decision, product input, or external service config, mark it `DEFERRED: <reason>` and move on
7. **Stop on failure** — If a fix breaks tests and can't be resolved in <5 min, revert and mark `BLOCKED: <reason>`

### Commit Convention

```
<type>: <description> (TD-NNN, N SP)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

Types: `fix`, `refactor`, `test`, `style`, `feat`, `chore`

### Progress Tracking

After each sprint block, update the ROADMAP with:
- Items completed (checked off)
- Items deferred/blocked (with reasons)
- Running SP tally

### Phase 3 Gate

All executable items complete or explicitly deferred. Tests passing. Changes committed.

---

## Final Summary

After all three phases, output:

```
Review & Fix Complete:
- Review: code-review/<date>/ (N findings across 13 documents)
- Roadmap: docs/ROADMAP-<date>.md (N items, N SP total)
- Executed: N items (N SP), N deferred, N blocked
- Tests: N passing
- Commits: N
```

---

## Severity & SP Scales

(Inherited from code-review skill)

| Level | Definition |
|-------|-----------|
| CRITICAL | Exploitable vulnerability or data loss risk |
| HIGH | Significant risk or major quality issue |
| MEDIUM | Moderate risk or notable improvement |
| LOW | Minor improvement or best practice gap |

| SP | Scope |
|----|-------|
| 0.5 | Config change, one-liner |
| 1 | Single file, < 30 min |
| 2 | 2-3 files, < 2 hours |
| 3 | Small feature or multi-file refactor, < 1 day |
| 5 | Cross-cutting change, 1-2 days |
| 8 | Large feature or architectural change, 3-5 days |
| 13 | Epic-level effort, 1-2 weeks |

## Rules

1. **Phases are sequential** — never start Phase N+1 until Phase N is fully gated
2. **Every finding cites file:line** — no vague observations
3. **Read before write** — never edit a file you haven't read in this session
4. **Test after every change** — green tests are the gating condition
5. **Commit discipline** — small, focused commits with TD-NNN references
6. **Don't over-scope** — if a fix grows beyond its SP estimate, split it
7. **Preserve what works** — document strengths, don't refactor working patterns
8. **TOON format for all tracking docs** — optimized for future context loading
