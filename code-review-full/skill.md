---
name: code-review-full
description: Combined four-part code review: UX/Information Design audit + Data Tiers audit + Architecture & Performance audit + Code Review V3 (TypeScript errors, tech debt, test generation, feature completeness). Always anchors to the delta since the last review. Spawns UX, data-tier, and architecture/performance reviews as background agents while executing the main code-review-v3 phases in context, then assembles a single composite analysis. Resumable via state.json. Supports --security-focus, --performance-critical, --strict-mode flags. Produces a full code-review/<date>/ directory.
trigger: /code-review-full
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Edit
  - Agent
---

# Code Review — Full Combined Review

Four-part execution-first review:
1. **UX/Information Design** — information hiding, progressive disclosure, cognitive load (background agent)
2. **Data Tiers** — schema drift, RLS gaps, migration correctness (background agent)
3. **Architecture & Performance** — coupling, dependency direction, N+1 queries, caching, concurrency, scalability (background agent)
4. **Code Review V3** — TypeScript errors, tech debt, test generation, feature completeness (main context)

Always delta-first: every finding is classified as **NEW** (since last review) or **CARRYOVER** (previously identified, still open).

## Behavioral Rules (from orchestrator discipline)

1. **Write phase outputs to files as you go.** After each main-context phase (0–9), append that phase's raw findings — and for the remediation phases 7–9, the before/after counts — to `code-review/<date>/phase-notes.md` under a `## Phase N` heading, and update `state.json`. Phase 11 assembles the final documents from phase-notes.md and the agent files — never from context-window memory (survives compaction and session interruption).
2. **Halt on failure.** If a scan command errors unexpectedly or a required file is missing — STOP, report the error, and ask how to proceed (interactive), or log it in the executive summary and continue with the remaining phases (autonomous). A dead background agent is not a halt: run its inline fallback from Phase 10 and note it. Never silently skip a review dimension.
3. **Track progress in `state.json`.** Update it after each phase so an interrupted review resumes instead of restarting.

## Optional Flags

Parse from the invocation arguments:

- `--security-focus` — deepen the security review: full OWASP Top 10 pass with CWE references and attack scenarios per finding when assembling `06-SECURITY-AND-QUALITY.md` in Phase 11, plus targeted auth/session/CORS/secret-handling greps added to the Phase 4 scans
- `--performance-critical` — Agent C treats all performance findings one severity higher; adds bundle-size and load-profile checks
- `--strict-mode` — pause for user approval at the two checkpoints: after the scan phases (before Phase 7 remediation) and before the Phase 12 commit. **Skip checkpoints entirely in autonomous/overnight runs** — log what would have been asked instead.
- `--framework <name>` — pin the framework for best-practice checks instead of auto-detecting in Phase 1

---

## Trigger Phrases

- `/code-review-full`
- "full review", "combined review", "three-part review", "four-part review"
- "run all reviews", "complete code review", "do the full analysis"

---

## Output Structure

```
code-review/YYYY-MM-DD/
├── state.json                       ← phase progress + base_sha/head_sha; enables resume
├── review-package.diff              ← commits + stat + -U10 diff over BASE..HEAD (agents + delta read this)
├── 00-EXECUTIVE-SUMMARY.md          ← composite: all four parts
├── 01-DELTA-REVIEW.md               ← what changed since last review
├── 02-TYPESCRIPT-ERRORS.md          ← tsc output, fixed vs deferred
├── 03-TECH-DEBT-REMEDIATION.md      ← console.log, any casts, TODOs, deprecated APIs
├── 04-FEATURE-COMPLETENESS.md       ← half-implemented features
├── 05-TEST-GENERATION.md            ← new tests written, coverage delta
├── 06-SECURITY-AND-QUALITY.md       ← RLS, OWASP pass, security controls, quality
├── 07-UX-INFO-DESIGN.md             ← from background agent A
├── 08-DATA-TIERS.md                 ← from background agent B
├── 09-ARCHITECTURE-PERFORMANCE.md   ← from background agent C
├── SPRINT_PLAN.md                   ← unified sprint plan (all four parts)
└── TODO_YYYY-MM-DD.md               ← actionable checklist
```

### state.json

Created immediately after the resume check passes (i.e., no in-progress session found), updated after every phase. Phases are recorded as strings so `"4.5"` and `"checkpoint"` fit the same array:

```json
{
  "target": "<repo/scope>",
  "base_sha": "<review BASE — prior review's recorded head_sha; else last commit before the prior review date>",
  "head_sha": "<HEAD at review start — recorded so the NEXT review's BASE is exact, not date-guessed>",
  "review_package": "code-review/<date>/review-package.diff",
  "status": "in_progress",
  "flags": { "security_focus": false, "performance_critical": false, "strict_mode": false, "framework": null },
  "current_phase": "0",
  "completed_phases": [],
  "background_agents": { "ux": "pending", "data_tiers": "pending", "arch_perf": "pending" },
  "files_created": [],
  "started_at": "ISO_TIMESTAMP",
  "last_updated": "ISO_TIMESTAMP"
}
```

`base_sha`/`head_sha` pin the exact review range (see Phase 0). Recording `head_sha` at completion means the next run reads it back as `base_sha` — a precise `BASE..HEAD` delta that survives merge commits and `[skip ci]` churn, instead of counting commits since a date.

**Resume check (before anything else):** if today's `code-review/<date>/state.json` exists with `status: "in_progress"`, read `completed_phases` and resume from the first incomplete phase. Re-read `phase-notes.md` and any agent-written files for prior-phase context instead of re-running completed scans — except: if a completed phase's notes are missing from `phase-notes.md`, re-run that phase's scans (they're cheap; correctness wins). Background agents from the dead session are gone — for any of 07/08/09 not yet written, respawn that agent (or use its Phase 10 inline fallback) and set its `background_agents` entry accordingly. If `status: "complete"`, this is a re-run: create a fresh dated directory only if the date differs, otherwise ask (interactive) or append a `-2` suffix (autonomous).

---

## Phase 0: Anchor to Prior Review (do this first, in parallel with Phase 1)

```bash
# Find the most recent prior code review directory (exclude today's — state.json may already exist)
ls -td code-review/20*/ 2>/dev/null | grep -v "$(date +%F)" | head -5

# Find the prior TODO and sprint plan
ls -t code-review/*/TODO_*.md 2>/dev/null | head -1
ls -t code-review/*/SPRINT_PLAN.md 2>/dev/null | head -1

# Find prior UX and data-tier docs if they exist
ls -t code-review/*/07-UX-INFO-DESIGN.md 2>/dev/null | head -1
ls -t code-review/*/08-DATA-TIERS.md 2>/dev/null | head -1

# ── Resolve a STABLE review BASE (recorded SHA > date-guess) ───────────────
# Prefer the prior review's recorded head_sha (exact; survives merges + [skip ci]).
# Fall back to the last commit BEFORE the prior review's date, then to a window
# for a first-ever review. Never count-commits-since-a-date (breaks on merges).
PRIOR_DIR=$(ls -td code-review/20*/ 2>/dev/null | grep -v "$(date +%F)" | head -1)
BASE=$(python3 -c "import json;print(json.load(open('${PRIOR_DIR}state.json')).get('head_sha',''))" 2>/dev/null)
if [ -z "$BASE" ] && [ -n "$PRIOR_DIR" ]; then
  LAST_REVIEW_DATE=$(echo "$PRIOR_DIR" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')
  BASE=$(git rev-list -1 --before="${LAST_REVIEW_DATE} 00:00" HEAD)
fi
BASE=$(git rev-parse --verify --quiet "${BASE:-HEAD~20}" || git rev-parse --verify --quiet HEAD~20 || git rev-list --max-parents=0 HEAD | head -1)
HEAD=$(git rev-parse HEAD)
echo "review range: ${BASE}..${HEAD}"   # record both into state.json base_sha/head_sha

# ── Build ONE review-package file: commits + stat + WIDE-context diff ───────
# The delta phase AND all three background agents read THIS in a single call
# instead of each re-running git and pulling file bodies into the orchestrator
# context. -U10 (not the default 3) gives reviewers real surrounding context;
# the full BASE..HEAD range keeps multi-commit deltas intact. Named per range so
# a re-review after fixes writes a distinct fresh file.
PKG="code-review/$(date +%F)/review-package.diff"; mkdir -p "$(dirname "$PKG")"
{
  echo "# Review package: ${BASE}..${HEAD}"; echo
  echo "## Commits";       git log --oneline "${BASE}..${HEAD}"; echo
  echo "## Files changed"; git diff --stat "${BASE}..${HEAD}"; echo
  echo "## Diff (-U10)";   git diff -U10 "${BASE}..${HEAD}"
} > "$PKG"
echo "wrote $PKG: $(git rev-list --count ${BASE}..${HEAD}) commit(s), $(wc -c <"$PKG" | tr -d ' ') bytes"
```

Record `BASE`/`HEAD` into `state.json` as `base_sha`/`head_sha` now. The
`review-package.diff` is the canonical changeset for this session — Phase 0's
delta classification, the Phase 2 agents, and the Phase 3 code-review all work
from it (opening full files only when a hunk needs more than ±10 lines).

Read the prior TODO and SPRINT_PLAN. For every open item (`- [ ]`), classify as:
- `RESOLVED` — commit message or code change closes it
- `CARRYOVER` — still open
- `SUPERSEDED` — no longer applicable

All NEW findings in this session must be labeled **[NEW]**. Carried-over findings from prior review are labeled **[CARRYOVER]**.

---

## Phase 1: Stack Detection

```bash
# Detect test runner, framework, ORM
cat package.json | python3 -c "
import json,sys; d=json.load(sys.stdin)
deps={**d.get('dependencies',{}),**d.get('devDependencies',{})}
print('vitest' if 'vitest' in deps else 'jest')
print('trpc' if '@trpc/server' in deps else 'nestjs' if '@nestjs/core' in deps else 'other')
print('drizzle' if 'drizzle-orm' in deps else 'prisma' if '@prisma/client' in deps else 'supabase')
print('nextjs' if 'next' in deps else 'vite' if 'vite' in deps else 'other')
" 2>/dev/null

# Source directories
ls src/ apps/ 2>/dev/null | head -20

# Supabase / migration detection
ls supabase/migrations/*.sql 2>/dev/null | tail -5
ls src/lib/db/schema.ts prisma/schema.prisma 2>/dev/null
```

Record: `test_runner`, `api_pattern`, `orm`, `frontend_bundler`, `source_dir` (src/ or apps/).

---

## Phase 2: Spawn Background Agents (do not wait — continue to Phase 3)

Spawn all three agents simultaneously (one message, multiple Agent calls) so they run in parallel with Phase 3. Each agent's prompt must include the review scope and the prior review paths — background agents cannot see this conversation's context.

**Give every agent the review-package path** (`code-review/<date>/review-package.diff` from Phase 0) and instruct: *"Read the review-package file FIRST — it is the exact changeset for this review (commits + `--stat` + a `-U10` wide-context diff over the recorded `BASE..HEAD`). Anchor your audit to those changed files and hunks; open full files only when a finding needs more than the ±10 lines of context the package already gives you. Verify every finding against a real file:line — do not invent."* This bounds each agent to the true delta, keeps whole-file bodies out of the orchestrator's context, and stops agents re-running their own git range guesses.

### Agent A — UX/Information Design

Prompt the agent:
> You are running a UX/Information Design audit on this codebase. The working directory is `<cwd>`. Prior UX review doc (if any): `<path or 'none'>`. 
>
> Audit the UI source files in `src/` (or `apps/web/src/`) for:
> 1. **Information overload** — forms/modals showing 10+ fields without progressive disclosure; all items always visible that should be collapsed/paginated
> 2. **Onboarding content that never retires** — tooltips/banners/empty-state guides still shown to returning users
> 3. **Missing step-machine flows** — multi-step processes with no wizard/stepper (e.g., long single-form onboarding)
> 4. **Cognitive load** — action buttons competing with each other, primary vs secondary actions visually indistinct
> 5. **Error state gaps** — error/validation state exists in code but is never rendered in the UI
> 6. **Mobile layout issues** — sidebars/modals that don't auto-close, touch target sizing
> 7. **Real-data scale failures** — `max-h-[Npx]` or fixed `max-h` on containers that render DB-sourced lists (test mentally with 10+ items); scrollbars that appear unexpectedly vs clip content silently
> 8. **Number/currency formatting** — financial values rendered with `toLocaleString()` without locale and `maximumFractionDigits: 0`; cent values shown on whole-dollar metrics; inconsistent decimal treatment across the same view
>
> For each finding:
> - Classify severity: P0 (user confusion/blocking), P1 (friction), P2 (polish)
> - Label [NEW] if not in prior UX review, [CARRYOVER] if it was
> - Estimate implementation cost: 1 SP (one-liner), 2 SP (small component change), 3+ SP (layout refactor)
> - Provide the file:line and the minimal fix
>
> Write your findings to `code-review/<TODAY>/07-UX-INFO-DESIGN.md`. Use today's date for <TODAY>.
>
> Format:
> ```
> # UX/Information Design Audit — YYYY-MM-DD
> ## P0 Findings
> ### [NEW/CARRYOVER] Title — file:line
> **Issue:** ...
> **Fix:** ...
> **Cost:** N SP
> ## P1 Findings
> ...
> ## P2 Findings (Polish)
> ...
> ## Sprint Plan
> | ID | SP | Title | File:Line | Priority |
> ```

### Agent B — Data Tiers

Prompt the agent:
> You are running a Data Tiers architecture audit on this codebase. The working directory is `<cwd>`. Prior data-tier review (if any): `<path or 'none'>`.
>
> Audit:
> 1. **RLS completeness** — every table that holds multi-tenant or user-scoped data must have RLS enabled with policies beyond `using (true)`. Run:
>    ```bash
>    grep -r "using (true)" supabase/migrations/ --include="*.sql" | grep -i "policy"
>    ```
> 2. **Migration correctness** — column names in raw SQL matches column names in TypeScript types. Check the most recent 5 migrations against the TypeScript DB types file.
> 3. **Seed data coverage** — do migrations that add new plan types/tiers also add corresponding seed rows? Check seed migration files.
> 4. **Orphaned constants** — environment variables or constants referenced in edge functions that no longer exist in the DB schema or vice versa.
> 5. **Missing indexes** — foreign keys without corresponding indexes on high-volume tables (chat_logs, audit tables, usage tracking).
> 6. **Schema drift** — TypeScript types generated from DB that may be stale vs latest migration.
>
> For each finding:
> - Classify: CRITICAL (data loss or security), HIGH (incorrect data), MEDIUM (performance), LOW (cleanup)
> - Label [NEW] or [CARRYOVER] vs prior data-tier review
> - Provide the exact migration SQL fix or the TypeScript change needed
>
> Write findings to `code-review/<TODAY>/08-DATA-TIERS.md`. Use today's date for <TODAY>.
>
> Format:
> ```
> # Data Tiers Audit — YYYY-MM-DD
> ## CRITICAL Findings
> ### [NEW/CARRYOVER] Title
> **Where:** migration/file:line
> **Issue:** ...
> **Fix:** (SQL or TS snippet)
> ## HIGH Findings
> ...
> ## Backlog (MEDIUM/LOW)
> | ID | Severity | Title | Fix |
> ```

### Agent C — Architecture & Performance

Prompt the agent:
> You are running an Architecture & Performance audit on this codebase. The working directory is `<cwd>`. Prior arch/perf review (if any): `<path or 'none'>`. Stack: `<from Phase 1: api_pattern, orm, frontend_bundler>`. Performance-critical flag: `<yes/no>`.
>
> **Architecture — evaluate:**
> 1. **Component boundaries** — separation of concerns, module cohesion; God files (500+ LOC doing unrelated things)
> 2. **Dependency management** — circular dependencies, inappropriate coupling, dependency direction (UI importing from data layer directly, bypassing the service/hook layer)
> 3. **API design** — endpoint consistency, request/response shape drift between similar routes, error contract consistency
> 4. **Design patterns** — missing abstractions used 3+ times (copy-pasted fetch/error handling), AND over-engineering (abstractions with a single caller)
> 5. **Architectural consistency** — does new code follow the project's established patterns, or introduce a second way to do the same thing?
>
> **Performance — evaluate:**
> 6. **Database** — N+1 query patterns (query inside a loop/map over rows), missing pagination on unbounded list endpoints, `select('*')` where few columns are used
> 7. **Memory** — unbounded in-memory collections/caches, large object retention in long-lived closures
> 8. **Caching** — repeated identical fetches with no cache/memo; stale-cache risks where caching exists
> 9. **I/O** — sequential awaits that could be `Promise.all`, synchronous blocking calls in request paths, oversized payloads
> 10. **Concurrency** — race conditions on shared state, missing idempotency on webhook/payment handlers
> 11. **Frontend** — unnecessary re-renders (unstable deps, missing memo on expensive lists), missing lazy loading on heavy routes, bundle-size red flags (full-library imports)
>
> For each finding:
> - Severity: CRITICAL / HIGH / MEDIUM / LOW (if performance-critical flag is set, bump performance findings one level)
> - Label [NEW] or [CARRYOVER] vs prior arch/perf review
> - Estimated impact (what breaks or degrades, at what scale)
> - file:line and the minimal fix with a code snippet
>
> Write findings to `code-review/<TODAY>/09-ARCHITECTURE-PERFORMANCE.md`. Use today's date for <TODAY>.
>
> Format:
> ```
> # Architecture & Performance Audit — YYYY-MM-DD
> ## CRITICAL Findings
> ### [NEW/CARRYOVER] Title — file:line
> **Issue:** ...
> **Impact:** ...
> **Fix:** (snippet)
> ## HIGH Findings
> ...
> ## Backlog (MEDIUM/LOW)
> | ID | Severity | Area (arch/perf) | Title | Fix |
> ```

---

## Phase 3: Code Review V3 — TypeScript Baseline (run while agents are working)

```bash
# TypeScript errors
npx tsc --noEmit 2>&1 | tail -60

# For NX monorepos:
# npx nx typecheck api 2>&1 | tail -40
# npx nx typecheck web 2>&1 | tail -60
```

Parse output. Record:
- Total error count
- Error categories: `implicit any` (TS7006/7005), `null/undefined unsafe` (TS2531/18048), `missing property` (TS2339/2345), `type mismatch`, other
- Which files have errors

---

## Phase 4: Tech Debt Scan

Adjust `<SRC>` to `src/` for standalone or `apps/api/src apps/web/src` for NX monorepos.

```bash
# TODO/FIXME/HACK in non-test files
grep -rn "TODO\|FIXME\|HACK\|XXX\|TEMP\|NOCOMMIT" \
  <SRC> --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
  --exclude="*.spec.ts" --exclude="*.test.ts" 2>/dev/null | head -80

# console.log in production paths
grep -rn "console\.\(log\|warn\|debug\)" \
  <SRC> --include="*.ts" --include="*.tsx" \
  --exclude="*.spec.ts" --exclude="*.test.ts" \
  --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null \
  | grep -v "// console\|Logger\|NestFactory" | head -50

# Explicit any casts
grep -rn ": any\b\|as any\b\|<any>" \
  <SRC> --include="*.ts" --include="*.tsx" \
  --exclude="*.spec.ts" --exclude="*.test.ts" \
  --exclude-dir=node_modules 2>/dev/null \
  | grep -v "eslint-disable" | head -50

# Supabase edge functions: console.log in production billing/auth paths
grep -rn "console\.log" supabase/functions/ \
  --include="*.ts" --exclude-dir=node_modules 2>/dev/null | head -30

# Dependency health: known CVEs and stale packages (CVE hits become security findings in doc 06)
npm audit --omit=dev 2>/dev/null | tail -15
npm outdated 2>/dev/null | head -20

# Deprecated API usage the framework has moved past (adjust to detected stack)
# e.g. React: ReactDOM.render, componentWillMount; Next.js: getInitialProps; Node: url.parse
grep -rn "ReactDOM\.render\|componentWill\|getInitialProps\|url\.parse(" \
  <SRC> --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules 2>/dev/null | head -20
```

Classify each hit:
- **Fix now** (SP ≤ 2): simple removal, replacement, or type annotation
- **Sprint 1** (SP 3–5): requires context; fix next sprint
- **Backlog** (SP > 5 or architectural): document only

---

## Phase 4.5: Wiring & Placeholder Audit

This phase catches the class of bugs that static analysis and unit tests miss: components built correctly in isolation but never connected to real data at their call sites.

```bash
SRC="apps/web/src apps/web/app libs/ui/src"

# 1. Hardcoded mock/placeholder arrays in non-test component files
#    Pattern: const mockX = [ ... ] or arrays of { id, name } literals
grep -rn "const mock\|= \[" \
  $SRC --include="*.tsx" --include="*.ts" \
  --exclude="*.test.ts" --exclude="*.test.tsx" --exclude="*.spec.ts" \
  --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null \
  | grep -E "const mock[A-Z]|\[\s*\{[^}]*id:" | head -30

# 2. Fallback-to-mock patterns (the bug we hit: prop ?? mockData)
grep -rn "?? mock\||| mock" \
  $SRC --include="*.tsx" --include="*.ts" \
  --exclude="*.test.ts" --exclude-dir=node_modules 2>/dev/null | head -20

# 3. Call-site prop audit — find reusable components and check if data props are passed
#    For each unique component name that accepts data/availableFilters/items props,
#    find every JSX usage and flag missing data props
grep -rn "<FilterModal\|<DataTable\|<Select\b\|<Combobox" \
  $SRC --include="*.tsx" \
  --exclude="*.test.tsx" --exclude-dir=node_modules 2>/dev/null | head -30

# 4. max-h constraints on containers that render dynamic lists (breaks with real data volume)
grep -rn "max-h-\[" \
  $SRC --include="*.tsx" \
  --exclude-dir=node_modules 2>/dev/null | grep -v "\.test\." | head -20

# 5. toLocaleString() without locale/options on financial values (locale-dependent decimal output)
grep -rn "\.toLocaleString()" \
  $SRC --include="*.tsx" --include="*.ts" \
  --exclude="*.test.ts" --exclude-dir=node_modules 2>/dev/null | head -20

# 6. Financial formatters — confirm maximumFractionDigits: 0 is set where $ values are displayed
grep -rn "toLocaleString\|Intl\.NumberFormat\|formatCurrency\|fmtCurrency" \
  $SRC --include="*.tsx" --include="*.ts" \
  --exclude="*.test.ts" --exclude-dir=node_modules 2>/dev/null | head -30
```

For each finding, classify:
- **WIRE NOW** (SP ≤ 2): pass real data to the component at its call site; remove mock array from production file
- **SCALE FIX** (SP 1): change `max-h` constraint or add `toLocaleString('en-US', { maximumFractionDigits: 0 })`
- **DESIGN NEEDED** (SP 3+): data source doesn't exist yet, needs a new hook or API route

**Rules:**
- A component with a `?? mockX` fallback in a non-test file is always at least P1 — it means a placeholder was never replaced
- A `max-h` constraint on a list that renders from the database is always at least P2 — test it with 10+ items
- `toLocaleString()` without `'en-US'` and `maximumFractionDigits` on any currency display is always P2

---

## Phase 4.6: Enum / Magic-Literal Cross-Layer Drift

The single highest-recurrence bug class in typed-DB apps: a string/number literal
used against an enum-typed field whose value has **drifted** from the enum's real
members — a typo (`'REJECTED'` where the enum has no such member), a **wrong-layer**
value (`selection.status === 'MEMBER_DECLINED'` — that's a *meeting stage*, not a
selection status), or a **hand-maintained mirror** (a TS `STATUS_MAP` / status-map)
that fell out of sync with the schema enum. TypeScript won't catch these when the
field is compared as a bare string or the value comes from an untyped source.

**Principle: the schema enum is the source of truth.** Extract the DB/ORM enums and
the fields they type, then check every literal used against those fields.

### The scan (Prisma; adapt the extractor for your ORM)

Run a schema-driven audit. This is the validated, low-noise approach — it only
inspects literals adjacent to fields the **schema itself** declares enum-typed, so
env-var names, job names, and external-API status strings never trip it:

```bash
# If the repo already ships one, run it; else write scripts/enum-drift-audit.py.
python3 scripts/enum-drift-audit.py 2>/dev/null || python3 - <<'PY'
import os, re
from collections import defaultdict
SCHEMA = 'libs/prisma-client/prisma/schema.prisma'   # <-- adjust; or prisma/schema.prisma
SRC = ['apps/api/src', 'apps/web/src', 'libs', 'src']
LIT = r"""['"]([A-Z][A-Z0-9_]{2,})['"]"""
txt = open(SCHEMA).read()
enums = {m.group(1): {ln.strip().split()[0].split('//')[0]
        for ln in m.group(2).splitlines() if re.match(r'^[A-Z][A-Z0-9_]*$', ln.strip().split()[0] if ln.strip() else '')}
        for m in re.finditer(r'enum\s+(\w+)\s*\{([^}]*)\}', txt, re.S)}
allm = set().union(*enums.values()) if enums else set()
m2e = defaultdict(set)
[m2e[v].add(e) for e, ms in enums.items() for v in ms]
fe, inmodel = defaultdict(set), False
for ln in txt.splitlines():
    s = ln.strip()
    if s.startswith('model ') and '{' in s: inmodel = True; continue
    if inmodel and s.startswith('}'): inmodel = False; continue
    fm = re.match(r'^\s*(\w+)\s+(\w+)(?:\?|\[\])?(?=\s|$)', ln)   # type may be last token
    if inmodel and fm and fm.group(2) in enums: fe[fm.group(1)].add(fm.group(2))
cross = []
for d in SRC:
    for root,_,fs in os.walk(d) if os.path.isdir(d) else []:
        if any(x in root for x in ('node_modules','generated','dist','.next')): continue
        for f in fs:
            if not f.endswith(('.ts','.tsx')): continue
            for i,ln in enumerate(open(os.path.join(root,f),encoding='utf-8',errors='ignore'),1):
                for field,es in fe.items():
                    valid = set().union(*(enums[e] for e in es))
                    for r in (re.compile(r'\.%s\s*[=!]==?\s*%s'%(field,LIT)), re.compile(r'\b%s\s*:\s*%s'%(field,LIT))):
                        for mm in r.finditer(ln):
                            v = mm.group(1)
                            if v not in valid and v in allm:   # a REAL enum member, wrong field
                                cross.append(f"{os.path.join(root,f)}:{i}  .{field}='{v}' is a {'/'.join(m2e[v])} value, not {'/'.join(es)}")
print("CROSS-LAYER DRIFT:", len(cross))
[print(" ", c) for c in sorted(set(cross))]
PY
```

**What it reports & how to triage:**
- **CROSS-LAYER DRIFT (P0/P1 — always a real bug):** a literal that IS a member of one enum, used against a field typed by a *different* enum. Unambiguous. Fix immediately and add a **BUG-LEDGER** entry (this is the BL-024/BL-025 family).
- **UNKNOWN on a single-enum field (P2 — verify):** a literal matching no enum, on a field mapped to exactly one enum. Either a typo/invented value, or the `.field` is actually a plain `String`/external-API status — confirm before "fixing."
- **DEAD enum members (INFO):** enum members never referenced in source — dead, or written only by DB/sync.

**Extractor per stack:** Prisma → `enum` blocks + `field EnumName` lines (as above). Drizzle → `pgEnum('name', [...])` + column `.enum` refs. TS-native → `enum X {}` / `as const` unions. Raw SQL → `CHECK (col IN (...))` / Postgres `CREATE TYPE ... AS ENUM`. In every case: build `{enum: members}` + `{field: enum}`, then run the same literal check.

**Rules:**
- **Cross-layer drift is never P2** — a real enum member on the wrong field is a latent wrong-behavior bug (a comparison that's always false, or a write the state machine rejects). Fix in-session and ledger it.
- **A hand-maintained enum mirror** (a TS `const STAGES = [...]` / status-map duplicating a schema enum) must be **diffed against the schema enum** — list any member present in one and not the other. This is BL-024.
- **Keep the audit script in the repo** (`scripts/enum-drift-audit.py`) and wire it into `bug-pattern-audit.sh` / CI so drift fails the build, not just the review.

---

## Phase 5: Test Coverage Scan

```bash
# Find lib modules without tests (Vitest pattern)
find src/lib -name "*.ts" \
  -not -path "*/__tests__/*" -not -path "*/node_modules/*" | while read f; do
    dir=$(dirname "$f"); base=$(basename "$f" .ts)
    [ ! -f "${dir}/__tests__/${base}.test.ts" ] && echo "MISSING: $f"
done

# Find stores without tests
find src/store -name "*.ts" \
  -not -path "*/__tests__/*" -not -path "*/node_modules/*" | while read f; do
    dir=$(dirname "$f"); base=$(basename "$f" .ts)
    [ ! -f "${dir}/__tests__/${base}.test.ts" ] && echo "MISSING store test: $f"
done

# Baseline test count
npm run test -- --run 2>&1 | grep -E "Tests:|Test Files:|passed|failed" | tail -5
```

Classify each missing spec:
- `WRITE NOW` — small module (< 150 LOC), self-contained, no live DB needed
- `WRITE SPRINT 1` — critical path (auth, payments) but complex
- `BACKLOG` — integration-only or requires live DB

---

## Phase 6: Feature Completeness Scan

```bash
# Backend edge functions vs frontend invocation
ls supabase/functions/ 2>/dev/null | grep -v "_shared\|node_modules"

# Which edge functions are called from frontend?
grep -rn "invoke\|supabase\.functions\." src/ \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules 2>/dev/null \
  | grep -oE "invoke\('[^']+" | sed "s/invoke('//" | sort | uniq > /tmp/invoked_fns.txt
cat /tmp/invoked_fns.txt

# Pages vs routes wired up
find src/pages src/app -name "*.tsx" -not -path "*/node_modules/*" 2>/dev/null | sort
```

For each gap (backend exists, no frontend call; or frontend calls non-existent backend):
- `IMPLEMENT` — clear enough to implement this session (SP ≤ 5)
- `DESIGN NEEDED` — needs architecture discussion
- `EXTERNAL DEPENDENCY` — blocked on credentials/third-party

---

## Checkpoint (only if --strict-mode AND interactive)

Before remediation begins, present a scan summary — TypeScript error count, tech debt hits, wiring gaps, missing tests, feature gaps — and ask: **1)** proceed with remediation, **2)** remediate critical/P0 only, or **3)** stop and write documents only. In autonomous/overnight runs, skip this checkpoint and note in the executive summary which option would have been recommended.

---

## Phase 7: Remediate — Fix TypeScript Errors

For each fixable error (SP ≤ 2):
1. Read the file
2. Apply the minimal fix: type annotation, null guard, proper cast (never change business logic)
3. Prefer `unknown` + type guard over `as any`
4. For DB types: verify the column exists in the generated DB types before removing a cast
5. For Supabase SDK `onConflict` / method-chaining limitations: leave `as any` with `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment

After fixes:
```bash
npx tsc --noEmit 2>&1 | tail -10
```

Record before/after error counts.

---

## Phase 8: Remediate — Tech Debt

**console.log removal:**
- Remove bare `console.log` in production paths entirely
- In billing/auth/webhook edge functions: `console.error` only on failure paths
- In NestJS services: replace with `this.logger.log()` / `this.logger.debug()`

**`any` cast replacement:**
- `(obj as any).field` → add field to type/interface or use `(obj as { field: T }).field`
- `value: any` parameter → union type or `unknown` with type guard
- Untyped JSON response → `Record<string, unknown>` or typed interface

**TODO/FIXME:**
- If the TODO describes something now implemented → remove comment
- If the TODO is a 1-liner → implement and remove
- If SP > 2 → convert to sprint backlog entry, remove inline comment

After all debt fixes:
```bash
npm run test -- --run 2>&1 | tail -10
```

---

## Phase 9: Generate Missing Tests

For each `WRITE NOW` module from Phase 5, write the spec file.

**Vitest lib utility pattern:**
```typescript
// @vitest-environment node  (or happy-dom if module imports window/document)
import { describe, it, expect, vi } from 'vitest';
import { functionName } from '../module';

describe('functionName', () => {
  it('returns expected for valid input', () => {
    expect(functionName(validInput)).toEqual(expected);
  });
  it('handles edge case', () => {
    expect(functionName(edgeInput)).toEqual(edgeExpected);
  });
  it('throws for invalid input', () => {
    expect(() => functionName(badInput)).toThrow();
  });
});
```

**Vitest store pattern (Zustand):**
```typescript
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: vi.fn(), signOut: vi.fn() } }
}));

describe('storeName', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('critical path', async () => { ... });
});
```

**Note:** Any module that transitively imports `supabase.ts` (which accesses `window.localStorage`) needs `// @vitest-environment happy-dom`.

After writing each spec:
```bash
npx vitest run <path/to/spec.test.ts> 2>&1 | tail -15
```

All tests must pass before proceeding.

---

## Phase 10: Collect Background Agent Results

By now Agents A, B, and C should be done. Read their output:

```bash
cat code-review/$(date +%F)/07-UX-INFO-DESIGN.md 2>/dev/null | head -5
cat code-review/$(date +%F)/08-DATA-TIERS.md 2>/dev/null | head -5
cat code-review/$(date +%F)/09-ARCHITECTURE-PERFORMANCE.md 2>/dev/null | head -5
```

If an agent did not write its file, execute that review inline (both interactive and autonomous modes — the fallback is the recovery path; note it in the executive summary). Then set each agent's `background_agents` entry in `state.json` to `"complete"` or `"fallback"`.

**Inline UX scan fallback:**
```bash
# Fields per form — find forms with 8+ inputs
grep -rn "<input\|<Input\|<TextField\|<Select\|register(" src/ \
  --include="*.tsx" -l 2>/dev/null | while read f; do
  count=$(grep -c "<input\|<Input\|<TextField\|<Select\|register(" "$f" 2>/dev/null)
  [ "$count" -ge 8 ] && echo "$count fields: $f"
done | sort -rn | head -10

# Error states that exist but aren't rendered
grep -rn "setError\|setValidationError\|setFieldError" src/ \
  --include="*.tsx" 2>/dev/null | \
  grep -v "\.test\." | head -20
```

**Inline data-tier scan fallback:**
```bash
# RLS world-read policies
grep -rn "using (true)" supabase/migrations/ --include="*.sql" 2>/dev/null

# Missing enterprise/special plans in seed
grep -rn "enterprise\|enterprise_plan" supabase/migrations/ --include="*.sql" 2>/dev/null | head -10

# Orphaned constants in edge functions
grep -rn "CARBON_CREDITS\|LEGACY_\|DEPRECATED_" supabase/functions/ --include="*.ts" 2>/dev/null
```

**Inline architecture/performance scan fallback:**
```bash
# N+1 pattern: awaited query inside a loop/map
grep -rn "for.*await\|\.map(async" src/ supabase/functions/ \
  --include="*.ts" --include="*.tsx" --exclude-dir=node_modules 2>/dev/null \
  | grep -v "\.test\." | head -20

# Unbounded list endpoints: select without range/limit
grep -rn "\.select(" src/ --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules 2>/dev/null | grep -v "limit\|range\|single\|\.test\." | head -20

# Sequential awaits that could be parallel (3+ consecutive awaits on independent calls)
grep -rn -A2 "^\s*const .* = await" src/ --include="*.ts" \
  --exclude-dir=node_modules 2>/dev/null | grep -c "await"

# God files (500+ LOC in src)
find src/ -name "*.ts" -o -name "*.tsx" | grep -v node_modules | \
  xargs wc -l 2>/dev/null | awk '$1 > 500' | sort -rn | head -10
```

---

## Phase 11: Write Review Documents

Create the `code-review/$(date +%F)/` directory and write all docs.

### 00-EXECUTIVE-SUMMARY.md

```markdown
# Executive Summary — YYYY-MM-DD

## Health Scorecard

| Area | Score | Delta | Notes |
|------|-------|-------|-------|
| TypeScript | N/10 | ±N | N errors fixed, N deferred |
| Security/RLS | N/10 | ±N | ... |
| Test Coverage | N/10 | ±N | N tests total, +N this session |
| UX/Information Design | N/10 | ±N | N P0, N P1 findings |
| Data Integrity | N/10 | ±N | ... |
| Architecture | N/10 | ±N | coupling, consistency, patterns |
| Performance | N/10 | ±N | N+1s, caching, concurrency |
| Code Quality | N/10 | ±N | console.logs, any casts, deprecated APIs |

## Findings by Priority (unified across all four parts)

Severity mapping: CRITICAL → P0, HIGH → P1, MEDIUM → P2, LOW → P3. UX P0/P1/P2 map directly.

### P0 — Fix Immediately
[Every CRITICAL/P0 finding from all four parts, with source doc reference, fixed-this-session or open status]

### P1 — Fix Before Next Release
### P2 — Plan for Next Sprint
### P3 — Backlog

## Findings by Category

| Category | Total | P0 | P1 | P2 | P3 | Fixed This Session |
|----------|-------|----|----|----|----|--------------------|
| TypeScript | | | | | | |
| Tech Debt | | | | | | |
| Tests | | | | | | |
| Features/Wiring | | | | | | |
| Security | | | | | | |
| UX | | | | | | |
| Data Tiers | | | | | | |
| Architecture | | | | | | |
| Performance | | | | | | |

## Delta Since Last Review ([LAST_DATE])

### Resolved
- [x] Item — commit `abc1234`
- [x] Item — commit `def5678`

### New This Session
- TypeScript: N errors fixed, N remaining
- Security: N RLS fixes applied
- Tests: +N tests (N files)
- UX: N P0 issues identified, N fixed
- Data: N schema corrections

### Still Open (Carryover)
- [ ] CARRYOVER-001 — description (Sprint N)

## Priority Actions This Sprint

| Priority | Item | SP | Owner |
|----------|------|----|-------|
| P0 | ... | N | ... |
| P1 | ... | N | ... |
```

### 01-DELTA-REVIEW.md

List every item from the prior review. Status: RESOLVED / CARRYOVER / PARTIAL / SUPERSEDED.

### 02-TYPESCRIPT-ERRORS.md

```markdown
# TypeScript Error Report — YYYY-MM-DD

## Before / After
| Before | After | Fixed | Deferred |
|--------|-------|-------|---------|
| N | N | N | N |

## Fixed This Session
| File:Line | Error Code | Fix Applied |

## Deferred
| File:Line | Error Code | Why Deferred | Sprint |
```

### 03-TECH-DEBT-REMEDIATION.md

```markdown
# Tech Debt Remediation — YYYY-MM-DD

## Summary
- console.log removed: N
- `any` casts replaced: N
- TODOs resolved: N
- Deferred: N items

## Fixed
| File:Line | Pattern | Resolution |

## Deferred
| File:Line | Pattern | Reason | Sprint |
```

### 04-FEATURE-COMPLETENESS.md

```markdown
# Feature Completeness — YYYY-MM-DD

## Completed This Session
| Feature | Gap Filled | Files Changed |

## Wiring Gaps (from Phase 4.5)
Components built but not connected to real data at their call sites.
| Component | Call Site | Missing Prop | Data Source | SP |

## Scale/Format Issues (from Phase 4.5)
Works with mock data, breaks or looks wrong with real data.
| File:Line | Pattern | Fix | SP |

## Still Incomplete
| Feature | Gap | SP | Sprint |

## Blocked (External)
| Feature | Blocked By |
```

### 05-TEST-GENERATION.md

```markdown
# Test Generation Report — YYYY-MM-DD

## Coverage Delta
| Before | After | New Tests |
|--------|-------|-----------|

## Tests Written
| File | Tests | Methods Covered | Pass/Fail |

## Still Uncovered (Deferred)
| Module | Lines | Reason | Sprint |
```

### 06-SECURITY-AND-QUALITY.md

Security findings from all review parts: RLS gaps (from data tiers), input validation gaps (from code review), XSS/injection risks (from UX form review), dependency CVEs (from `npm audit` in Phase 4), idempotency gaps on webhook/payment handlers (from arch/perf).

Structure the security section against the OWASP Top 10 — for each applicable category state PASS, FINDING, or N/A. If `--security-focus` is set, every FINDING gets a CWE reference and a concrete attack scenario; auth/authz, session management, secret handling, and CORS/security-header configuration are audited even if no scan hit flagged them.

### 09-ARCHITECTURE-PERFORMANCE.md

Written by Agent C (or the inline fallback). Verify it exists and its findings are represented in the executive summary and sprint plan.

### SPRINT_PLAN.md

Unified sprint plan merging all four review parts. Sprint 1 = highest-impact fixes from all reviews. Sprint E = blocked items. For each item include relative effort (S/M/L or SP) and group related fixes into a single work item where they touch the same files.

### TODO_YYYY-MM-DD.md

Checkbox list of all open items, grouped by sprint. This becomes the anchor for the next combined review.

---

## Phase 12: Commit All Changes

**Pre-commit checkpoint (only if --strict-mode AND interactive):** show `git status`, the test result, and the before/after counts, and ask whether to commit. In autonomous runs, skip and commit.

```bash
TODAY=$(date +%F)

# Stage all code changes + review docs
git add src/ supabase/ code-review/${TODAY}/

# Verify tests still pass before commit
npm run test -- --run 2>&1 | tail -5

git status | head -30

# Title uses -m with double quotes so ${TODAY} expands; body heredoc stays quoted
# so the backticks in it are not command-substituted
git commit -m "review(${TODAY}): full four-part review — TS fixes, debt, tests, UX, data-tier, arch/perf" -m "$(cat <<'EOF'
Code Review V3:
- N `any` casts fixed
- N debug console.log removed
- N tests added (N total)
- N TypeScript errors remaining (N fixed)

Security:
- N RLS policies fixed/audited

UX/Data/Architecture:
- N P0 UX findings
- N data-tier findings
- N architecture/performance findings

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

git push
```

Then mark the review complete so a re-run doesn't resume into a finished session: edit `code-review/${TODAY}/state.json` — set `status` to `"complete"`, refresh `last_updated`, and set `head_sha` to the **post-commit** HEAD (`git rev-parse HEAD`). That recorded `head_sha` becomes the next review's `base_sha` in Phase 0 — an exact hand-off so the next delta starts precisely where this one ended, remediation commits included.

---

## Phase 13: Linear Hand-off

The review just wrote a new `TODO_YYYY-MM-DD.md` anchor — the planning truth changed,
so mirror it to Linear via the `/linear-sync` skill (idempotent, marker-based, never
duplicates; completed checkboxes flip existing issues to Done, new items create).

- **Interactive session:** ask — "Review committed. Push the new TODO anchor to Linear
  now? (/linear-sync)" — and run it on yes.
- **Autonomous/overnight run:** don't block on a prompt (rule 17) — run `/linear-sync`
  automatically and list the created/updated issue identifiers in the final report.
- Skip silently only if the project has no Linear project AND has never been synced —
  first-time Linear setup for a repo is the user's call, not the review's.

---

## Rules

1. **Delta-first always** — read the prior review before touching any code, and drive the delta from the recorded `base_sha..head_sha` range (Phase 0), never from a `HEAD~N` commit count. The Phase-0 `review-package.diff` (commits + `--stat` + `-U10` diff) is the single source the delta phase and all agents read. Never re-report fixed items as new findings.
2. **Label everything** — every finding is `[NEW]` or `[CARRYOVER]`. Nothing is unlabeled.
3. **Fix > document** — if SP ≤ 2, fix it in this session. Only defer if SP > 2 or blocked externally.
4. **Background agents are parallel, not sequential** — spawn all three agents (UX + data-tier + arch/perf) at the same time, before starting Phase 3. Don't wait for them before running code-review phases.
5. **Never change business logic** during type fixes — type annotations only.
6. **Vitest environment** — any module that transitively imports `supabase.ts` (which accesses `window.localStorage`) needs `// @vitest-environment happy-dom`.
7. **All tests must pass** before committing — run the full suite after all changes.
8. **RLS `using (true)` is always P1 or higher** — never defer a world-read RLS policy.
9. **Console.log in billing/auth/webhook paths is always P1** — remove in this session.
10. **One commit per session** — stage all code changes + all review docs in a single commit with a descriptive message. Reference PR numbers if applicable.
11. **Update TODO** — the `TODO_YYYY-MM-DD.md` generated by this review becomes the anchor for the next run. It must be accurate and complete.
12. **Wiring gaps are feature gaps, not polish** — a component with a `?? mockX` fallback or an unwired data prop at its call site is P1 minimum. Treat it the same as a missing backend route. Fix in this session if SP ≤ 2.
13. **Real-data scale is part of correctness** — `max-h` on a dynamic list and `toLocaleString()` without options on financial values are not cosmetic issues. They break with real client data. Flag in Phase 4.5 and fix before shipping.
14. **Phase outputs are files, not memory** — every phase writes its findings into `code-review/<date>/` before the next dependent phase runs, and `state.json` is updated after each phase. A resumed session reads those files instead of re-scanning completed phases.
15. **Halt on failure, never skip silently** — a failed scan is reported and resolved with the user (interactive) or logged in the executive summary (autonomous). A dead background agent gets its Phase 10 inline fallback in both modes, noted in the executive summary. A review dimension is never quietly dropped.
16. **One severity language in the composite docs** — map CRITICAL→P0, HIGH→P1, MEDIUM→P2, LOW→P3 when merging the four parts. Source docs keep their native scale; the executive summary, sprint plan, and TODO use P0–P3 only.
17. **Checkpoints are strict-mode + interactive only** — never block an autonomous/overnight run waiting for approval; log the decision that would have been asked.

---

## When to Run

- Before every sprint planning session
- After a major feature ship
- When "what's the current state of the codebase?" needs a real answer
- When preparing for an investor demo or external review
- On a regular cadence (every 2–4 weeks)
