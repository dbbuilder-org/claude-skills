---
name: human-review-prep
description: Prepare a codebase or PR for HUMAN code review — turn the machine-review findings into a time-estimated assignment plan a reviewer can actually work, and a manager can budget. Use when the user says "human-review-prep", "prep this for review", "reviewer handoff", "get this ready for a human reviewer", "what should the reviewer look at", "estimate the review effort", "how long to review this", "build the review plan", or is handing a branch/PR to another developer to review. Runs a refactoring-triage pass, keeps only the items that genuinely need human judgment, labels each with an explicit action verb (REVIEW/REVISE/DOCUMENT/COMMENT/REFACTOR/TEST/DECIDE/VERIFY), estimates each in reviewer-hours with a 3-point band, builds a cumulative time curve rolled up total→tier→area→item, then opens ONE PR and ONE Linear issue for the reviewer. Use even when the user just says "get this reviewed" or "hand this off" — this is the skill that makes the handoff legible to both the reviewer and their manager.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - Skill
---

# human-review-prep

Machine review tells a **developer** what to *fix*. This skill produces something different:
a legible, time-estimated **assignment plan for a human reviewer** — and a manager-facing
rollup of how much review work exists, in total and all the way down. It reuses the
`code-review` engine's analysis, then reframes it around one question:

> *"What does a human need to look at, decide, or change here — and how long will each piece take?"*

The two deliverables are **one PR** (the plan committed to the repo, reviewer comments on it inline)
and **one Linear issue** (the umbrella review assignment with the time curve, so the manager and
project-owner see the whole shape from a single link).

## What makes this different from code-review

| code-review / code-review-full | human-review-prep |
|---|---|
| Audience: the developer who fixes | Audience: the **reviewer** + their **manager** |
| Output: findings to remediate | Output: **assignments** with action verbs + a **time curve** |
| Unit: story points (dev effort) | Unit: **reviewer-hours** (review effort), SP secondary |
| Keeps everything | Keeps only what needs **human judgment**; mechanical noise is auto-triaged out |
| Many documents | One scannable `REVIEW-PLAN.md` + a TODO anchor |

Do **not** re-run a full machine review if a recent one exists — consume it. This skill's value
is the transform and the estimate, not re-scanning.

## Assumptions & flags (state these to the user, then proceed)

- **Read-only by default.** The skill does not rewrite source. It writes the plan and opens a PR
  *of the plan*. Refactoring opportunities become reviewer tasks, not silent edits.
- `--apply-safe` — additionally apply the *trivially-safe* mechanical refactor subset
  (formatter, dead-code/unused-import removal, obvious one-line simplifications) into the branch,
  clearly separated in the PR body as "auto-applied, please sanity-check."
- `--full` — force whole-project readiness scope instead of the auto-detected branch delta.
- `--reviewer "<name>"` — who the plan is assigned to (default: the repo's usual reviewer / Chris).
- `--linear-items` — after the umbrella issue, also explode per-item issues via `/linear-sync`.
- `--no-pr` / `--no-linear` — skip that hand-off (produce the doc only).
- Never merges, never deploys. It opens a PR and a Linear issue and stops.

---

## Output

```
review-prep/YYYY-MM-DD/
├── state.json          ← scope, base_sha/head_sha, phase progress; enables resume
├── review-package.diff ← commits + --stat + -U10 diff over BASE..HEAD (analysis reads this)
├── REVIEW-PLAN.md      ← THE deliverable: manager rollup + time curve, then ordered item cards
└── TODO_YYYY-MM-DD.md  ← TOON anchor, linear-sync-compatible (for --linear-items / re-runs)
```

Plus: one PR (branch `review-prep/YYYY-MM-DD`) and one Linear issue.

---

## Phase 0 — Scope, anchor, resume

Do this first. Decide **what is being reviewed** — a human reviews a *change set*, so scope
matters more here than in a whole-project audit.

```bash
TODAY=$(date +%F)
DIR="review-prep/${TODAY}"; mkdir -p "$DIR"

# Resume if an in-progress run exists
[ -f "$DIR/state.json" ] && grep -q '"status": *"in_progress"' "$DIR/state.json" && echo "RESUMING — read state.json, skip completed phases"

# Scope auto-detect: feature branch ahead of base → DIFF review; else FULL readiness.
BASE_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'); BASE_BRANCH=${BASE_BRANCH:-main}
CUR=$(git branch --show-current)
AHEAD=$(git rev-list --count "origin/${BASE_BRANCH}..HEAD" 2>/dev/null || echo 0)
# --full overrides to whole-project. Otherwise: AHEAD>0 → diff scope.
```

- **Diff scope** (default when ahead of base): `BASE=origin/<base>`, `HEAD=HEAD`. The plan estimates
  "how long to review *this branch*."
- **Full scope** (`--full`, or trunk with no delta): `BASE` = the last review-prep's recorded
  `head_sha` if any, else the repo root. The plan estimates a whole-project readiness pass.

Build the review package **once** (delta and every agent read this file, not raw git):

```bash
git log --oneline "${BASE}..${HEAD}" > "$DIR/_commits.txt"
{ git diff --stat "${BASE}..${HEAD}"; echo; git diff -U10 "${BASE}..${HEAD}"; } > "$DIR/review-package.diff"
```

Write `state.json` (see `references/templates.md`) with `scope`, `base_sha`, `head_sha`,
`reviewer`, and an empty `phases` array. Update it after every phase — this is what survives
compaction and lets a re-run resume instead of restart.

## Phase 1 — Gather findings (reuse; do not reinvent)

**If** a `code-review/<date>/` from the last ~7 days covering this same `head_sha` exists →
read its `TODO_*.md` + `06-TECHNICAL-DEBT-BACKLOG.md` (or `03/04/06/09` in the full-review layout).
That IS the analysis. Skip to Phase 2.

**Else** run the analysis yourself, scoped to `review-package.diff`. Spawn the three background
agents in parallel (same as code-review-full — do not wait between them), then run the inline scans:

- **Agent A — UX/information design** (if a frontend exists)
- **Agent B — data tiers** (schema/RLS/migration drift; invoke the `code-review-data-tiers` skill's checks)
- **Agent C — architecture & performance** (coupling, N+1, god files, unbounded queries)
- **Inline** while agents work: `tsc`/typecheck, tech-debt greps (TODO/FIXME/`any`/console.log in
  prod paths), feature-completeness (unwired routes, `?? mock` fallbacks), test-coverage gaps.

Collect every finding with its `file:line`, severity, and a one-line description into a working list.
Halt and report on a scan error; never silently drop a dimension.

## Phase 2 — Refactoring-triage pass

Run a refactoring-opportunity pass over the in-scope files (complexity hotspots: deep nesting /
long functions / god files; duplication; dead code; unclear names; obvious simplifications).
Classify each opportunity into exactly one bucket:

- **AUTO-SAFE** — mechanical, no behavior change, no judgment (formatter, unused imports, dead code,
  one-line simplifications). With `--apply-safe`, apply these to the branch and record them under
  "auto-applied" for the PR body. Without the flag, they become 0.25–0.5h `REFACTOR` reviewer tasks.
- **NEEDS-JUDGMENT** — restructuring that changes shape, splits a module, or trades off readability
  vs performance vs risk. These are **always** reviewer tasks (`REFACTOR` or `DECIDE`), never auto-applied.

The point of this pass is to **shrink the reviewer's surface**: settle the noise mechanically so the
human spends their hours only where judgment is actually required.

## Phase 3 — Human-attention triage (the core transform)

For every finding (Phase 1) and every NEEDS-JUDGMENT opportunity (Phase 2), ask:
**does resolving this genuinely require a human?** A tool can settle "add a missing type" or
"remove a console.log." A human is needed for judgment, product/domain context, risk tolerance,
security nuance, API/naming taste, or a decision with tradeoffs. Only human-judgment items become
plan items — everything mechanical is either auto-fixed (Phase 2) or noted as a footnote, not a card.

For each surviving item, assign the **action verb** — be explicit; this is what the reviewer *does*:

| Verb | Meaning | Typical deliverable |
|---|---|---|
| **REVIEW** | Read and assess; confirm it's sound or flag it | a ✅/❌ + notes on the PR |
| **REVISE** | Change the code to fix an identified problem | a commit |
| **DOCUMENT** | Write prose docs (README, ADR, module header) | a doc / ADR |
| **COMMENT** | Add in-code explanation where intent is non-obvious | code comments |
| **REFACTOR** | Restructure for clarity/perf without changing behavior | a refactor commit |
| **TEST** | Write or extend tests to pin behavior | a test file / cases |
| **DECIDE** | Make a call with tradeoffs (no single right answer) | a decision note / ADR |
| **VERIFY** | Run it / reproduce it to confirm real behavior | a verification note |

## Phase 4 — Estimate & sequence

Estimate each item in **reviewer-hours** with a 3-point band, using the signal-based rubric in
`references/estimation-and-curve.md` (lines changed, files touched, blast radius, test presence,
nesting/complexity). Record: 3-point `o·m·p`, expected `E=(o+4m+p)/6`, band `±(p-o)/6`, SP (secondary),
owner profile (Junior/Mid/Senior/Domain/Security), parallelizable (y/n), depends-on.

Then **order** the items into a recommended review sequence: critical path first (P0 before P1…),
dependencies respected, and group items touching the same files adjacently so the reviewer loads that
context once. Compute the **cumulative time curve** and the **rollups** — total, per-severity-tier,
per-area — following `references/estimation-and-curve.md`. Estimates must be *defensible*: each cites
the signal it came from, so "1.2h" reads as "1.2h because it's a 180-line change across 4 files on the
auth path with no tests," not a guess.

## Phase 5 — Write REVIEW-PLAN.md + TODO anchor

Write `REVIEW-PLAN.md` from the template in `references/templates.md`: the **manager rollup + time
curve at the very top** (so a busy owner gets the whole shape in 20 seconds), then the ordered,
**descriptive item cards** below (see schema next section). Write the `TODO_<date>.md` TOON anchor
(one line per item, linear-sync-compatible). Update `state.json`.

### Item card schema (this is the "more than a checklist" part — use it exactly)

```markdown
### HRP-NNN · <short imperative title>

| | |
|---|---|
| Action | REFACTOR |
| Area | auth |
| Severity | P1 |
| Owner | Senior + security |
| Effort | o 0.5 · m 1.0 · p 2.5 → **E 1.2h** (±0.3) · 2 SP |
| Sequence | 3 / 14 · parallelizable: no · depends on: HRP-001 |
| Location | `src/auth/session.ts:88-140` (hunk in review-package.diff) |

**Why a human:** <the crux — the judgment a tool can't settle. If you can't name one, it's not a card.>
**What to do:** <concrete steps tied to the action verb — not "look at auth" but "confirm the session
TTL refresh path can't extend an expired token; trace `refreshSession()` callers">
**Produce:** <the exact artifact — a PR comment / a test / an ADR / a commit>
**Done when:** <acceptance the reviewer can check off>
**Risk if skipped:** <what ships broken or what debt compounds>
```

The `Why a human` line is load-bearing. It's the filter that keeps this a *review plan* and not a
regurgitated findings dump. No crux → not a reviewer item.

## Phase 6 — Open the PR

```bash
BR="review-prep/${TODAY}"
git switch -c "$BR" 2>/dev/null || git switch "$BR"
git add "$DIR"                       # + applied safe refactors if --apply-safe
git commit -m "review-prep(${TODAY}): human review plan — <N> items, <E>h expected" -m "$(cat <<'EOF'
Human review assignment plan. Reviewer works REVIEW-PLAN.md; manager rollup + time curve in the PR body.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git push -u origin "$BR"
gh pr create --title "Human review: <project> (${TODAY}) — <E>h expected across <N> items" \
  --body-file <(<manager rollup + time curve + link to REVIEW-PLAN.md>)
```

Respect the repo's push rules (see project CLAUDE.md — e.g. ecommerce-app is two-remote, PaymentAPI is
Azure-only). Open the PR only; never merge, never trigger a deploy. On re-run, reuse the branch/PR
rather than opening a duplicate.

## Phase 7 — Sync the Linear issue

Create/update **one umbrella issue** — the review assignment — idempotently, reusing linear-sync's
credential + marker conventions (`references/templates.md` has the exact curl). Title
`Human Review: <project> (<date>)`; description = the manager rollup + time curve + the per-item
checklist + a link to the PR; label `human-review`; assign to the reviewer. Marker line last:
`sync-id: review-prep/<date>/REVIEW-PLAN.md#umbrella` so a re-run updates in place.

With `--linear-items`, additionally invoke `/linear-sync` on the `TODO_<date>.md` anchor to explode
one issue per item for granular tracking. Without it, the umbrella issue's checklist is the tracking surface.

## Phase 8 — Report

Print the manager view: total expected reviewer-hours ±band, the cumulative curve, item count by tier,
the PR URL, and the Linear URL. This paragraph is what the user forwards to the manager/owner.

---

## Rules

1. **Every card names an action verb and a "why a human."** No crux, no card. This is the whole discipline.
2. **Estimates cite their signal.** A number a manager can't interrogate is worthless. Tie every `E` to
   lines/files/blast-radius/tests per the rubric.
3. **Reviewer-hours lead; SP is secondary.** Managers budget in hours. Keep SP for continuity with code-review.
4. **Reuse the machine review; don't re-run it** if a fresh one covers this head_sha.
5. **Read-only unless `--apply-safe`.** Never silently rewrite source. Auto-applied refactors are the
   trivially-safe subset only, and are called out separately in the PR so the reviewer can sanity-check them.
6. **Delta-first.** Scope to the branch under review by default; a reviewer reviews a change set.
7. **One PR, one Linear issue, idempotent.** Re-running updates in place — never duplicates.
8. **Never merge or deploy.** Hand off for review and stop.
9. **Roll up all the way down** — total → tier → area → item — so the plan reads top-down for the owner
   and bottom-up for the reviewer from the same document.
10. **Phase outputs are files, not memory** — write each phase to `review-prep/<date>/` and update
    `state.json` before the next phase, so a resumed run continues instead of restarting.

## References

- `references/estimation-and-curve.md` — the signal→reviewer-hours rubric, 3-point/PERT math,
  cumulative-curve + rollup rendering, and calibration guidance. Read before Phase 4.
- `references/templates.md` — full `REVIEW-PLAN.md`, `TODO` anchor, PR body, Linear umbrella-issue
  curl, and `state.json` templates. Read before Phases 5–7.

## When to run

- Handing a branch/PR to another developer to review
- A manager asks "how much review work is in this, and who should do it?"
- Before a release gate that requires human sign-off
- Preparing an external / client / investor code review
- Turning a machine `code-review` into an actual reviewer assignment
