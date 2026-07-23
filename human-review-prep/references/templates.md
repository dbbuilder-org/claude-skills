# Templates & hand-off mechanics

Concrete skeletons for the artifacts. Fill the `<…>` placeholders. Read before Phases 5–7.

---

## `state.json`

```json
{
  "skill": "human-review-prep",
  "date": "YYYY-MM-DD",
  "status": "in_progress",
  "scope": "diff",
  "base_branch": "main",
  "base_sha": "<sha>",
  "head_sha": "<sha>",
  "reviewer": "<name>",
  "source_review": "code-review/YYYY-MM-DD/ | self",
  "counts": { "items": 0, "P0": 0, "P1": 0, "P2": 0, "P3": 0, "auto_applied": 0 },
  "expected_hours": 0.0,
  "band": [0.0, 0.0],
  "pr_url": null,
  "linear_url": null,
  "phases": []
}
```

Set `status: "complete"` and fill `pr_url`/`linear_url` at the end. On a re-run, if `head_sha`
matches and status is complete, update in place rather than starting fresh.

---

## `REVIEW-PLAN.md`

The manager rollup and curve go **first** — an owner must get the whole shape without scrolling.
Item cards follow in review-sequence order.

```markdown
# Human Review Plan — <Project> (<YYYY-MM-DD>)

| | |
|---|---|
| Reviewer | <name> |
| Scope | diff `origin/main..HEAD` (<N files>, <±LOC>) · or full project |
| Source analysis | code-review/<date>/ · or self-run <date> |
| Prepared | <YYYY-MM-DD> · Claude + Chris Therriault |
| PR | <url> |
| Linear | <url> |

## For the manager / project-owner

**Total review effort: <E>h expected (band <lo>–<hi>h) across <N> items.**
Staffing: <senior Xh · mid Yh>. Recommended: <e.g. "one senior, ~1.5 days; P0+P1 = <h>h is the
release-gate subset.">

<tier band bar — from estimation-and-curve.md rendering A>

| Tier | Items | Expected h | What it is |
|------|-------|-----------|------------|
| P0 | n | h | must-clear before review sign-off |
| P1 | n | h | fix before release |
| P2 | n | h | next sprint |
| P3 | n | h | backlog / nice-to-have |
| **Total** | **N** | **Eh** | band <lo>–<hi>h |

**By area:** auth <h> · data-tier <h> · UX <h> · infra <h> · …

**Assumptions & confidence:** <scope, test coverage, what widens the band, anything anchored to
past-review reality>. <If --apply-safe:> Auto-applied <k> safe mechanical refactors (see PR) —
please sanity-check; they are not counted in the reviewer-hours above.

## Review sequence (cumulative)

<per-item cumulative table — rendering B — with the P0-cleared / P1-cleared checkpoints marked>

---

## Items

<HRP-NNN item cards, in sequence order, using the schema in SKILL.md Phase 5>

## Auto-triaged out (not reviewer work)

Brief footnote list of what was handled mechanically or judged not to need a human, so the reviewer
knows it was considered, not missed: <e.g. "12 console.log removed · 4 unused imports · formatter run">
```

---

## `TODO_YYYY-MM-DD.md` (TOON anchor — linear-sync compatible)

One line per item; linear-sync reads this if `--linear-items`. Keep it terse.

```markdown
# TODO: <Project> Human Review — <date> | <E>h expected | <N> items

## P0 (<h>h)
- [ ] **HRP-001** [DECIDE, 2.2h, Senior]: <title> | `path:line`
- [ ] **HRP-002** [REVISE, 0.9h, Senior]: <title> | `path:line`

## P1 (<h>h)
- [ ] **HRP-010** [REFACTOR, 1.6h, Mid]: <title> | `path:line`

## P2 / P3
| ID | Verb | h | Owner | Title | Location |
|----|------|---|-------|-------|----------|
| HRP-020 | TEST | 0.8 | Mid | <title> | `path:line` |

## Quick ref
- Expected: <E>h (band <lo>–<hi>h) · P0+P1 gate: <h>h
- Plan: review-prep/<date>/REVIEW-PLAN.md · PR <url> · Linear <url>
```

---

## PR body

```markdown
## Human review assignment — <Project> (<date>)

**<E>h expected** (band <lo>–<hi>h) across **<N> items**. Full plan: `review-prep/<date>/REVIEW-PLAN.md`.

<tier band bar>

| Tier | Items | Expected h |
|------|-------|-----------|
| P0 | n | h |
| P1 | n | h |
| P2 | n | h |
| P3 | n | h |

**Where the weight is:** <top 2–3 areas by hours>.
**Release gate (P0+P1):** <h>h.

Reviewer: comment inline on `REVIEW-PLAN.md` and check items off as you go. Each item names the exact
action (REVIEW/REVISE/DOCUMENT/COMMENT/REFACTOR/TEST/DECIDE/VERIFY), what to produce, and done-when.

<If --apply-safe:> ### Auto-applied safe refactors (<k>) — please sanity-check
<list; these change no behavior and are excluded from the reviewer-hours above>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Create with `gh pr create --title "…" --body-file <file>`. Reuse the branch/PR on re-run
(`gh pr view "$BR" --json url -q .url` to detect an existing one). Follow the repo's push rules from
its CLAUDE.md — never merge, never deploy.

---

## Linear umbrella issue (idempotent, marker-based)

Reuse linear-sync's conventions. Get the key and team the same way it does:

```bash
LKEY=$(awk '/## Linear/,/^## [^L]/' ~/.config/claude/credentials.md | grep -oE 'lin_api_[A-Za-z0-9]+' | head -1)
API="https://api.linear.app/graphql"
q(){ curl -s "$API" -H "Authorization: $LKEY" -H "Content-Type: application/json" -d "$1"; }

# Verify team id at run time (don't trust a hardcoded id)
q '{"query":"{ teams(filter:{key:{eq:\"SER\"}}){ nodes { id key name states { nodes { id name type } } } } }"}'
```

**Marker** (last line of the description): `sync-id: review-prep/<date>/REVIEW-PLAN.md#umbrella`.

**Lookup before create** — update in place if it exists:

```bash
q '{"query":"{ issues(filter:{description:{contains:\"review-prep/<date>/REVIEW-PLAN.md#umbrella\"}, team:{key:{eq:\"SER\"}}}, first:1){ nodes { id identifier url } } }"}'
```

- **Not found** → `issueCreate(input:{ teamId, projectId, title:"Human Review: <project> (<date>)",
  description:"<manager rollup + curve + per-item checklist + PR link>\n\nsync-id: review-prep/<date>/REVIEW-PLAN.md#umbrella",
  stateId:<Todo>, assigneeId:<reviewer>, labelIds:[<human-review>] })`.
- **Found** → `issueUpdate(id, input:{ description:"…refreshed…" })`.

Ensure the `human-review` label exists (query `team.labels`, `issueLabelCreate` if missing) and the
Linear project for this repo exists (find by name = repo dir name, `projectCreate` if missing) —
exactly as linear-sync does. Put the whole per-item checklist in the description so the manager sees
the entire plan from the one issue; with `--linear-items`, hand `TODO_<date>.md` to `/linear-sync`
for per-item issues in addition.

Never delete/archive on re-run. Never sync confidential `working/` content — only the committed plan.
