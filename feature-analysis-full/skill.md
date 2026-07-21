---
name: feature-analysis-full
description: Full end-to-end feature analysis and planning pipeline. Runs feature-docs → feature-planner → feature-roadmap → feature-roadmap-implement in strict sequence. Each step builds on the previous step's output. Produces: product docs (REQUIREMENTS, ROADMAP, UAT), competitive analysis (FEATURE-ROADMAP), execution-ready sprint plan with GitHub issues, and optional TDD implementation of Now-tier features.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - WebSearch
  - WebFetch
---

# feature-analysis-full

End-to-end feature analysis pipeline. Runs four sub-skills in strict sequence — each one's output feeds the next.

```
feature-docs          → REQUIREMENTS + ROADMAP + UAT baseline docs
      ↓
feature-planner       → FEATURE-ROADMAP (competitive gaps + scored opportunities)
      ↓
feature-roadmap       → Consolidated execution ROADMAP + GitHub issues per feature
      ↓
feature-roadmap-implement  → TDD implementation of Now-tier issues (one PR per issue)
```

## Trigger Phrases

- `/feature-analysis-full`
- "full feature analysis"
- "run the full feature pipeline"
- "end-to-end feature planning"
- "feature docs, planner, roadmap, and implement"

## Arguments (passed through to sub-skills as appropriate)

| Arg | Default | Passed to | Description |
|-----|---------|-----------|-------------|
| `--focus [theme]` | all | feature-planner | Constrain competitive research to a theme (e.g. `--focus billing`) |
| `--depth [quick\|standard\|deep]` | standard | feature-planner | Research depth (3/6/10 competitors) |
| `--for [audience]` | general | feature-planner | Target persona (e.g. `--for enterprise`) |
| `--tier [now\|next]` | now | feature-roadmap-implement | Which tier to implement |
| `--skip [N,N]` | none | feature-roadmap-implement | Issue numbers to skip in implementation |
| `--dry-run` | off | feature-roadmap-implement | Plan + write tests but do not open PRs |
| `--no-implement` | off | this skill | Stop after feature-roadmap; skip implementation entirely |

---

## Instructions

<command-name>feature-analysis-full</command-name>

Parse args from the user message. Set flags:
- `FOCUS` — passed to feature-planner if present
- `DEPTH` — passed to feature-planner if present (default: standard)
- `FOR` — passed to feature-planner if present
- `TIER` — passed to feature-roadmap-implement if present (default: now)
- `SKIP` — passed to feature-roadmap-implement if present
- `DRY_RUN` — passed to feature-roadmap-implement if present
- `NO_IMPLEMENT` — if present, skip Step 4

Before starting, confirm the plan with one message:
```
Starting feature-analysis-full pipeline:
  Step 1: feature-docs  — generate REQUIREMENTS, ROADMAP, UAT
  Step 2: feature-planner [--depth DEPTH] [--focus FOCUS] [--for FOR]  — competitive research
  Step 3: feature-roadmap  — execution plan + GitHub issues
  Step 4: feature-roadmap-implement [--tier TIER] [--dry-run?]  — TDD implementation
  [--no-implement: Step 4 will be skipped]
```
Then proceed immediately — do not wait for user confirmation unless a previous step failed.

---

### Step 1 — feature-docs

**Purpose:** Establish or update the product documentation baseline (REQUIREMENTS, ROADMAP, UAT) so that Steps 2–4 have an accurate picture of what is already built, what is in-flight, and what is open.

Invoke the `feature-docs` skill using the Skill tool:

```
Skill("feature-docs")
```

**What to check before continuing:**
- `docs/REQUIREMENTS-<today>.md` exists and is non-empty
- `docs/ROADMAP-<today>.md` exists and is non-empty
- `docs/UAT-<today>.md` exists and is non-empty

If any file is missing, stop and report the failure. Do not proceed to Step 2.

After Step 1 completes, note:
- Total feature count (from REQUIREMENTS)
- COMPLETE / PARTIAL / NOT IMPL / BLOCKED breakdown
- Test count and rating from ROADMAP health scorecard

---

### Step 2 — feature-planner

**Purpose:** Research the competitive landscape and score feature opportunities against what is already shipped (from Step 1's REQUIREMENTS). Produces a FEATURE-ROADMAP with Now/Next/Later/Moonshot tiers and scored gap matrix.

Invoke the `feature-planner` skill, passing any `--focus`, `--depth`, and `--for` args from the user:

```
Skill("feature-planner [--focus FOCUS] [--depth DEPTH] [--for FOR]")
```

**What to check before continuing:**
- `docs/FEATURE-ROADMAP-<today>.md` exists and is non-empty
- Research dump at `docs/research/competitive-<today>.md` exists
- At least 1 Now-tier feature is present in the FEATURE-ROADMAP

If the FEATURE-ROADMAP has no Now-tier features, stop and report. Do not proceed to Step 3.

After Step 2 completes, note:
- Number of competitors researched
- Now-tier feature count and names
- Top 3 opportunity scores

---

### Step 3 — feature-roadmap

**Purpose:** Meld the competitive feature roadmap (Step 2) with the working ROADMAP and REQUIREMENTS (Step 1) into a single, execution-ready sprint plan. Creates GitHub issues for each net-new feature. Adds REQ-* entries for new features. Writes a new consolidated ROADMAP.

Invoke the `feature-roadmap` skill:

```
Skill("feature-roadmap")
```

**What to check before continuing:**
- `docs/ROADMAP-<today>.md` has been updated with implementation tasks
- At least 1 GitHub issue was created (or confirmed already existing) for Now-tier features
- New REQ-* entries added to REQUIREMENTS for net-new features

If `--no-implement` was set, **stop here** and deliver the final summary report (skip Step 4).

After Step 3 completes, note:
- GitHub issues created (list numbers + titles)
- Sprint assignments
- SP total for Now tier

---

### Step 4 — feature-roadmap-implement

**Purpose:** Work through the GitHub issues created in Step 3, implementing each one in dependency order using TDD (tests first, then backend, then frontend). Opens one PR per issue. Marks roadmap items complete as PRs are opened.

Invoke the `feature-roadmap-implement` skill, passing any `--tier`, `--skip`, and `--dry-run` args:

```
Skill("feature-roadmap-implement [--tier TIER] [--skip SKIP] [--dry-run?]")
```

---

### Final Report

After all steps complete (or after Step 3 if `--no-implement`), report:

```
✅ feature-analysis-full complete — <today>

Step 1 — feature-docs:
  REQUIREMENTS: docs/REQUIREMENTS-<date>.md — N features, N COMPLETE, N BLOCKED
  ROADMAP:      docs/ROADMAP-<date>.md — vX.Y.Z, N SP remaining, N Ryan actions
  UAT:          docs/UAT-<date>.md — N test cases

Step 2 — feature-planner:
  Researched:   N competitors, N searches
  FEATURE-ROADMAP: docs/FEATURE-ROADMAP-<date>.md
  Now tier: N features | Next: N | Later: N | Moonshot: N
  Top opportunities: [name] (NN), [name] (NN), [name] (NN)

Step 3 — feature-roadmap:
  Consolidated ROADMAP: docs/ROADMAP-<date>.md (updated)
  GitHub issues created: #N [title], #N [title], ...
  Sprint Now: N SP | Sprint Next: N SP

Step 4 — feature-roadmap-implement:
  [PRs opened / dry-run plan / skipped]

Commits: [hash list]
```

---

## Sequencing Rules

1. **Each step is a hard dependency** — do not invoke Step N+1 if Step N failed or produced empty output
2. **Pass today's date** to each sub-skill; all files must use the same date
3. **Do not re-invoke a step** if its output file already exists from today — skip ahead and report it was already done
4. **Failures are reported immediately** with the step name and the error — do not silently continue
5. **`--no-implement`** is respected — it is NOT a failure condition; it is a deliberate stop

## Skip Detection

At the start of each step, check if today's output already exists:

| Step | Skip condition |
|------|---------------|
| feature-docs | `docs/REQUIREMENTS-<today>.md` exists |
| feature-planner | `docs/FEATURE-ROADMAP-<today>.md` exists |
| feature-roadmap | `docs/ROADMAP-<today>.md` modified today (git log) |
| feature-roadmap-implement | All Now-tier issues have an open PR (check via `gh pr list`) |

If a step is skipped, note it in the report: `Step N — [name]: SKIPPED (output already exists from today)`.

## When to Use

- At the start of each sprint planning cycle
- After a major feature ship (recalibrate what's next)
- Before investor meetings or stakeholder demos (produces all docs + a shipped feature in one run)
- Monthly competitive intelligence refresh + implementation cadence
- When "what should we build next?" needs a real answer backed by market data
- Onboarding a new team member — runs the full context-building pipeline automatically
