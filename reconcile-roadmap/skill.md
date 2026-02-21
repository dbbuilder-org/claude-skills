---
name: reconcile-roadmap
description: Reconcile all TODO, requirements, and roadmap documents across a project. Finds all planning docs, identifies completed vs pending work, creates a unified go-forward plan, and updates individual docs to mark completions. Use when the user asks to "reconcile TODOs", "consolidate roadmaps", "unify planning docs", or "create go-forward plan".
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Edit
  - Task
---

# Reconcile Roadmap

Consolidate all TODO, requirements, and roadmap documents into a single authoritative go-forward plan. Updates individual docs, memory files, and commits the result.

## Trigger Phrases

- "reconcile roadmaps", "consolidate TODOs"
- "unify planning docs", "create go-forward plan"
- "merge requirements", "single source of truth"
- "what's left to do", "reconcile all docs"

## Output

1. **Primary:** `docs/ROADMAP-<YYYY-MM-DD>.md` — Consolidated go-forward plan
2. **Updates:** Superseded docs get header noting the new file
3. **Memory:** `~/.claude/projects/.../memory/MEMORY.md` roadmap pointer updated
4. **Commit:** New roadmap + updated docs committed and pushed

---

## Process

### Step 1: Discovery (2 min)

Find all planning documents in the project:

```bash
# Find TODO, requirements, roadmap, backlog, code-review docs
find . -type f \( \
  -name "TODO*.md" -o -name "ROADMAP*.md" -o -name "requirements*.md" \
  -o -name "PHASE*.md" -o -name "*-BACKLOG*.md" -o -name "STATE*.md" \
  -o -name "SESSION_CONTEXT*.md" \
) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  2>/dev/null | sort

# Also find code-review TODO files specifically
find . -path "*/code-review/*/TODO*.md" -not -path "*/node_modules/*" 2>/dev/null | sort

# Check current roadmap from memory if available
# (memory file path: ~/.claude/projects/<slug>/memory/MEMORY.md)
```

Check git for work done since the last roadmap's date:

```bash
# Use a generous window — 3+ weeks to catch all relevant work
git log --oneline --since="3 weeks ago" | head -40

# Check what files changed (gives scope of work done)
git diff --stat HEAD~30..HEAD 2>/dev/null | tail -20
```

### Step 2: Read All Documents (5 min)

Read each discovered document and extract:

| Extract | Purpose |
|---------|---------|
| Dated items (DONE, TODO, `[ ]`, `[x]`, `~~strikethrough~~`) | Track completion status |
| Story point estimates | Aggregate remaining work |
| Priority levels (P0, P1, Critical, High) | Determine order |
| Milestone / phase definitions | Understand structure |
| Document dates + supersession headers | Identify which is authoritative |
| `SESSION_CONTEXT_*.md` files | Surface recent work not yet in roadmap |

**Always read the most recent ROADMAP-<date>.md first** — it's the baseline.

### Step 3: Cross-Reference with Git (3 min)

Match commit messages against TODO items to find work done since last roadmap:

- `feat: add X` → Look for X in backlog/TODO lists → mark done
- `fix: Y` → Look for Y in open items → mark done
- `chore: downgrade / remove / enable` → Often closes infra/cost backlog items

Pay particular attention to commits **after** the date of the most recent roadmap.

### Step 4: Identify Supersession (2 min)

| Rule | Action |
|------|--------|
| Same topic, newer date | Newer supersedes older |
| More specific scope | Specific supersedes general |
| `> **Superseded by:**` header present | Follow the explicit chain |
| All sprint items `[x]` | That doc is closed, treat as reference |

### Step 5: Generate Consolidated Roadmap (10 min)

Create `docs/ROADMAP-<YYYY-MM-DD>.md`. Use this template:

```markdown
# <Project Name> — Consolidated Roadmap

**Date:** YYYY-MM-DD
**Author:** <from CLAUDE.md or git config>
**Status:** Reconciled from N prior documents

---

## Document Reconciliation

| Document | Status |
|----------|--------|
| `docs/ROADMAP-YYYY-MM-DD.md` | Superseded by this document |
| `code-review/YYYY-MM-DD/TODO_*.md` | Complete — all items done |

---

## Current State

### Health Scorecard

| Area | Score | Notes |
|------|-------|-------|
| Architecture | N/10 | ... |
| Security | N/10 | ... |
| Test Coverage | N/10 | N tests (breakdown) |
| Deployment | N/10 | ... |

### What's Complete

- [x] **Category** — summary (commit `abc1234`, YYYY-MM-DD)
- [x] **Category** — summary (commit `def5678`, YYYY-MM-DD)

### What's In Progress

- [ ] Item (started, ~50%)

---

## Remaining Backlog

### Surviving Items from Prior Reviews (~N SP)

| ID | SP | Title | Source | Notes |
|----|-----|-------|--------|-------|
| PREV-01 | N | Description | Origin doc | Why it survived |

### New Items (from this session)

| ID | SP | Title | Notes |
|----|----|-------|-------|
| NEW-01 | N | Description | Context |

---

## Future Phases (Post-MVP)

| Phase | Focus | Estimated Effort |
|-------|-------|-----------------|
| Phase A | Next milestone | N weeks |

---

## Sprint Plan (Next Session)

### Sprint A: Theme (N SP)
| Task | SP |
|------|----|
| Task 1 | N |

---

## Version History

| Version | Date | Milestone |
|---------|------|-----------|
| 0.x.0 | YYYY-MM-DD | Previous milestone |
| **0.y.0** | **YYYY-MM-DD** | **This milestone** |
| **1.0.0** | **TBD** | **Launch** |

---

## Key Notes

> **Important caveat or prerequisite** — description of edge case or dependency

---

## Quick Reference

| Resource | Location |
|----------|----------|
| This roadmap | `docs/ROADMAP-YYYY-MM-DD.md` |
| Deploy runbook | `scripts/deploy-runbook.md` |

---

*Single source of truth as of YYYY-MM-DD. [Summary sentence of current state.]*
```

### Step 6: Update Source Documents (3 min)

Add supersession header to each prior roadmap/TODO being replaced. Use this exact format at the very top:

```markdown
> **Superseded by:** [ROADMAP-YYYY-MM-DD](ROADMAP-YYYY-MM-DD.md) — Updated YYYY-MM-DD
```

For code-review TODO files where all items are done, add at the top:
```markdown
> **Superseded by:** [ROADMAP-YYYY-MM-DD](../../docs/ROADMAP-YYYY-MM-DD.md)
```

Do **not** delete content — only prepend the supersession notice.

### Step 7: Update MEMORY.md (1 min)

Find the project's memory file at `~/.claude/projects/<slug>/memory/MEMORY.md`.

Update the roadmap pointer line:

```markdown
- **Consolidated roadmap**: `<project-dir>/docs/ROADMAP-YYYY-MM-DD.md`
```

Also update any stale project status summary if it's significantly out of date.

### Step 8: Commit and Push (1 min)

```bash
git add docs/ROADMAP-YYYY-MM-DD.md docs/ROADMAP-YYYY-MM-DD-old.md [other updated files]
git commit -m "docs: consolidated roadmap YYYY-MM-DD — <one-line summary>

<bullet points of what's new since last roadmap>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push
```

### Step 9: Report Summary (1 min)

```
Reconciliation complete:
- Consolidated N documents into docs/ROADMAP-YYYY-MM-DD.md
- Marked N items complete (commits: abc1234, def5678, ...)
- Remaining: N SP across N items
- Next priority: <first Sprint A task>
- Committed: <hash> pushed to origin/main
```

---

## Document Types to Find

| Pattern | Typical Content |
|---------|-----------------|
| `TODO*.md` | Action items, checkboxes |
| `ROADMAP*.md` | Milestones, phases, timelines |
| `PHASE*.md` | Phase-specific plans |
| `requirements*.md` | Feature specs, acceptance criteria |
| `*-BACKLOG*.md` | Prioritized work items |
| `STATE*.md` | Current state inventory |
| `code-review/*/*.md` | Review findings, tech debt |
| `SESSION_CONTEXT_*.md` | Recent session work not yet in roadmap |

## Completion Detection

An item is marked DONE if:

| Signal | Confidence |
|--------|------------|
| `[x]` checkbox | High |
| `~~strikethrough~~` | High |
| `DONE` / `Complete` label | High |
| Commit message matches description (post last-roadmap date) | Medium |
| `SESSION_CONTEXT` entry describes it as done | Medium |
| Source file deleted or significantly changed | Medium |

## Priority Mapping

Normalize priorities across documents:

| Input | Normalized |
|-------|------------|
| Critical, P0, Blocker, Must-Fix | P0 |
| High, P1, Important, Sprint 1 | P1 |
| Medium, P2, Should-Fix, Sprint 2-3 | P2 |
| Low, P3, Nice-to-Have, Backlog | Backlog |

## Sprint Naming Convention

- **Sprint 1/2/3...** — Active sprint items from a code review cycle
- **Sprint A/B/C...** — Post-MVP or post-sprint backlog work (no time pressure)
- Label sprints by theme, not just number: "Sprint A: Polish + Verification"

## Rules

1. **Read before consolidating** — Every item must be verified in source
2. **Check SESSION_CONTEXT files** — They capture work done between roadmap updates
3. **Use a 3-week git window** — `git log --since="3 weeks ago"` catches more than `-20`
4. **Preserve attribution** — Keep original IDs (TD-001, SEC-01, FC-01, etc.)
5. **Date everything** — Completion dates from git or explicit
6. **Link to commits** — Reference commit hashes for done items
7. **Don't delete** — Prepend supersession notice, never overwrite source content
8. **Update MEMORY.md** — Always update the roadmap pointer after creating a new one
9. **Commit the result** — Roadmap + updated source docs in one commit, then push
10. **Single authoritative doc** — One ROADMAP-<date>.md is the truth
11. **~25 min total** — Efficient reconciliation, not exhaustive archaeology

## When to Use

Use this skill when:
- Multiple TODO files have accumulated since last reconciliation
- Code reviews generated new action items
- Sprint planning needs consolidated backlog
- Handoff documentation is needed
- "What's left?" question needs answering
- Duplicate/conflicting plans exist
- After a major feature ship (update version history)
