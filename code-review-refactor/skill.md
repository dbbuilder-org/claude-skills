---
name: code-review-refactor
description: Due-diligence-grade refactor analysis across five parallel dimensions — architecture, security & correctness, type safety & error handling, test quality, and operational readiness. Spawns 5 background subagents that each write a dimension report, then synthesizes an executive punch-list ranked by investor-flag severity. Use before a fundraise close, a technical DD call, or an acquirer walk-through. Read-only by default — proposes fixes but does not apply them until explicitly asked.
trigger: /code-review-refactor
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Edit
  - Agent
---

# Code Review — Refactor / DD Analysis

Five-dimension parallel audit oriented at **investor due-diligence** and **acquirer diligence** standards. Every finding is written so a sharp reviewer's follow-up question can be answered on the spot.

The five dimensions are complementary — they do not overlap with `/code-review-full` (which is UX + data tiers + tech-debt scan). Run this AFTER `/code-review-full` has already closed its sprint; this one is the deeper "is the codebase investable" pass.

---

## Trigger Phrases

- `/code-review-refactor`
- "refactor analysis", "DD refactor", "diligence-grade review"
- "investable code review", "acquirer-ready audit"
- "top-to-bottom refactor review"

---

## Output Structure

```
code-review/YYYY-MM-DD-DD/
├── 00-EXECUTIVE-SYNTHESIS.md         ← punch list ranked by DD-flag severity
├── 01-ARCHITECTURE.md                ← module boundaries, layering, package cohesion
├── 02-SECURITY-CORRECTNESS.md        ← OWASP + multi-tenant + crypto + auth
├── 03-TYPE-SAFETY.md                 ← any/unknown/error-swallow/exhaustiveness
├── 04-TEST-QUALITY.md                ← real coverage vs claimed count
├── 05-OPERATIONAL-READINESS.md       ← logging, shutdown, migrations, retry, DR
└── REFACTOR-SPRINT-PLAN.md           ← ordered by DD-flag risk × cost
```

The `-DD` suffix on the directory distinguishes this from a standard `/code-review-full` run on the same date.

---

## Phase 0: Anchor to Prior Reviews (parallel with Phase 1)

```bash
# Find the most recent standard review + any prior DD review
ls -td code-review/20*-DD/ 2>/dev/null | head -3
ls -td code-review/20*/ 2>/dev/null | grep -v -- "-DD" | head -3

# What changed since the last DD review?
LAST_DD=$(ls -td code-review/20*-DD/ 2>/dev/null | head -1 | grep -oP '\d{4}-\d{2}-\d{2}')
git log --oneline --since="${LAST_DD:-3 weeks ago}" | head -40
```

Read the prior DD directory if present. Every NEW finding must be labeled **[NEW]**; carryovers labeled **[CARRYOVER]**.

---

## Phase 1: Stack + Baseline

```bash
# Detect the shape
cat package.json | python3 -c "
import json,sys; d=json.load(sys.stdin)
deps={**d.get('dependencies',{}),**d.get('devDependencies',{})}
print('vitest' if 'vitest' in deps else 'jest')
print('fastify' if 'fastify' in deps else 'express' if 'express' in deps else 'other')
print('next' if 'next' in deps else 'vite' if 'vite' in deps else 'other')
print('pg' if 'pg' in deps else 'drizzle' if 'drizzle-orm' in deps else 'prisma' if '@prisma/client' in deps else 'other')
" 2>/dev/null

# Real test count baseline
npx pnpm -r test 2>&1 | tail -5

# TS baseline
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

Record: `test_count`, `tsc_errors`, `package_count`, `service_count`.

---

## Phase 2: Spawn 5 Background Subagents (parallel — do not wait)

All five run simultaneously in a single message with 5 Agent tool calls. Each is `subagent_type: general-purpose` so it has full tool access and does not consume the coordinator's context.

Every subagent writes to `code-review/<TODAY>/` using today's date + `-DD` suffix. Use `subagent_type: general-purpose`, not fork — these need fresh context and their outputs go to files, not back to the coordinator.

The prompt template for every subagent MUST include:
- Working directory (absolute)
- One-paragraph codebase context (what it is, what stack)
- Numbered remit — exactly what to look for
- Output file path (absolute, with `-DD` in the directory name)
- Fixed output format block (markdown with sections)
- Word limit (≤1200 words) — DD reports are read fast
- "Be blunt. This is DD." — DD reports must not sugar-coat

### Subagent A — Architecture

Remit (adapt for the current stack):
1. Module boundaries — dependency direction, circulars, cross-domain imports
2. Layering discipline — routes → repos → drivers, not routes → drivers directly
3. Package cohesion — merge / split / delete candidates
4. Structural interfaces vs concrete driver leaks
5. Domain modeling — one type per concept, no duplicate `interface Org` drift
6. Config surface — env-var sprawl, silent-degrade paths
7. API-boundary validation — every route validates input
8. Dead / duplicate / vestigial code
9. Deploy-time coupling — migrations vs code deploy ordering

Output: `01-ARCHITECTURE.md`

### Subagent B — Security & Correctness

Remit:
1. Secret & key handling — logs, responses, URLs, hard-coded IVs
2. Multi-tenant isolation — every SELECT scoped by tenant id
3. Auth & authz — every mutation gates on ownership
4. Injection — SQL / command / prompt (verify claims)
5. XSS / CSRF / SSRF surfaces
6. Race conditions & TOCTOU — nonce cache, budget check-and-decrement
7. Attestation & signature verification — no alg=none, no unverified headers
8. Crypto correctness — modern algorithms, per-encryption IVs, no hand-rolled
9. Rate limiting & abuse surfaces
10. Audit trail integrity — append-only
11. Committed secrets scan — `sk_live_`, `pk_live_`, `AKIA`, `-----BEGIN`, `postgres://...:password`

Output: `02-SECURITY-CORRECTNESS.md`

### Subagent C — Type Safety & Error Handling

Remit:
1. `any` cast audit — classify LEGIT / LAZY / HIDES-BUG per hit
2. Non-null assertions — every `!` in prod is a "trust me"
3. `unknown` handling — followed by type guard or silently cast?
4. Error swallowing — empty catches, log-and-continue where throw should fire
5. Discriminated unions vs naked boolean + optional fields
6. Optional-chaining cascades that hide required-field bugs
7. Exhaustiveness checks (`never` in default) in switch statements
8. Zod / manual validation at every boundary
9. JSON pitfalls — `JSON.parse` without try/catch, Date/bigint mismatches
10. Async correctness — `Promise.all` vs `allSettled`, missing `await`
11. Postgres numeric-as-string coercion discipline
12. Explicit return types on top-level exports

Output: `03-TYPE-SAFETY.md`

### Subagent D — Test Quality

Remit:
1. Actual test count via real `pnpm test` output, per package
2. Coverage vs risk — which business-logic files are untested
3. Mocking discipline — structural fakes vs `vi.mock` whole modules
4. Assertion quality — `.toBeDefined()` / `.toBeTruthy()` count (weak assertions)
5. Property-based / fuzz coverage — `fast-check` etc.
6. Integration test presence — real Fastify + real Postgres over HTTP
7. E2E / smoke suite — Playwright, Cypress, `.spec.mjs`
8. Test data quality — realistic fixtures vs happy-path stubs
9. Race / concurrency tests — actual concurrent load, not "call twice"
10. Regression hygiene — no `it.only`, `.skip` in main
11. Contract tests at package public boundaries
12. CI / pre-commit gate — is the test gate real?

Output: `04-TEST-QUALITY.md`

### Subagent E — Operational Readiness

Remit:
1. Logging discipline — structured vs freeform, no secret-leaking log lines
2. Error observability — error IDs, stack capture, safe error shapes
3. Health/ready endpoints — actually verify Postgres/Redis reachability
4. Graceful shutdown — SIGTERM handled, pool closed, in-flight drained
5. Migration safety — idempotent, no big-table locks, two-phase drops
6. Config validation at startup — required env vars checked before first request
7. Retry / timeout / circuit breaker on every outbound HTTP call
8. Rate limits / budget guards — inline enforcement, not post-hoc alerts
9. Backup & DR — PITR documented, restore-from-bad-migration runbook
10. Secret rotation — every long-lived credential parameterized
11. Deploy pipeline — rollback plan, known-good pin, staging exists
12. Cost accounting — visibility into the product's OWN infra spend
13. Documentation — new engineer to local-run in <1 hr; incident-responder knows what to do

Output: `05-OPERATIONAL-READINESS.md`

---

## Phase 3: Coordinator continues while agents run

While the 5 subagents work, the coordinator can:
- Read prior DD reports (if present) to line up carryover language
- Sanity-check the working tree is clean (`git status --short`) so nothing surprises the reports
- Prepare the synthesis skeleton (see Phase 5)
- Nothing else — do NOT open the files the subagents are writing to

**Do NOT tail the subagent transcript files.** The completion notification is the signal.

---

## Phase 4: Collect Subagent Results

When all 5 task-notifications have arrived, read the five report files:

```bash
for i in 01 02 03 04 05; do
  echo "=== $i ==="
  head -20 code-review/$(date +%F)-DD/${i}-*.md
done
```

If any file is missing or truncated, re-launch that specific subagent with the same prompt.

---

## Phase 5: Executive Synthesis

Write `00-EXECUTIVE-SYNTHESIS.md`:

```markdown
# Refactor / DD Analysis — Executive Synthesis — YYYY-MM-DD

## The One-Paragraph Verdict
[Would a sharp technical DD partner clear this codebase for a $X term sheet?
What is the single largest technical risk?]

## Composite Health Scorecard

| Dimension | Score /10 | Trend | Highest-priority finding |
|-----------|-----------|-------|--------------------------|
| Architecture | | | |
| Security & correctness | | | |
| Type safety & errors | | | |
| Test quality | | | |
| Operational readiness | | | |
| **Composite** | **N/10** | | |

## Top 10 DD-Flag Findings (ranked by risk × cost)

For each — one line: **[DIMENSION] [SEV] file:line — issue — fix — SP**

## What a Sharp Acquirer Will Ask in the DD Call

[5–8 questions, each with the answer already drafted from the reports above]

## Suggested Refactor Sprint Plan

### Wave 1 — Ship before any DD call (blocking) — ~N SP
| ID | Dim | SP | Title | File:Line |

### Wave 2 — Ship before term sheet signed — ~N SP
| ID | Dim | SP | Title | File:Line |

### Wave 3 — Ship before close — ~N SP
| ID | Dim | SP | Title | File:Line |

### Post-close backlog (document, do not fix now) — ~N SP
| ID | Dim | SP | Title | File:Line |

## Composite Verdict — 2-Sentence
[Investable YES/NO, with the largest specific caveat.]
```

Rank findings by DD-flag risk (would this survive an adversarial technical DD call?) × cost (SP to fix).

---

## Phase 6: Refactor Sprint Plan

Write `REFACTOR-SPRINT-PLAN.md` — the executive summary above, but broken into individual actionable tasks with file:line + minimal-fix guidance drawn directly from the subagent reports.

Each row must include:
- Origin: which dimension report flagged it
- Severity: CRITICAL / HIGH / MEDIUM / LOW
- Blocking gate: which wave (pre-DD / pre-termsheet / pre-close / post-close)
- File:line + one-sentence fix
- SP estimate
- Owner default (if user is solo founder, always "Founder")

---

## Phase 7: Report Summary (do NOT commit)

Report to the user:

```
Refactor / DD analysis complete — 5 dimension reports + executive synthesis.

Composite: N/10.
Weakest dimension: <dim> (M/10) — <one-line reason>.

Wave 1 blockers before any DD call: N items, ~N SP.
  1. [file:line — one-liner]
  2. [file:line — one-liner]
  ...

Everything at: code-review/YYYY-MM-DD-DD/

Nothing committed. To proceed with Wave 1 fixes: "proceed with Wave 1".
```

**Do NOT commit or push.** The analysis is a decision artifact. Fixes come from the follow-up conversation.

---

## Rules

1. **DD-blunt tone** — every subagent prompt includes "Be blunt. This is DD." No sugar-coating in the reports.
2. **Read-only default** — this skill produces analysis + a proposed plan; it does NOT edit code or commit. Fixes come from a follow-up "proceed with Wave 1" from the user.
3. **-DD suffix on the review dir** — do NOT overwrite a same-day `/code-review-full` output.
4. **Word budget per report** — ≤1200 words. DD reports are read fast; padding hurts.
5. **File:line specificity** — every finding must reference a concrete file:line (or migration id / commit hash).
6. **Fix in one paragraph** — every finding must include the minimal fix inline. "Refactor this" is not a fix.
7. **Composite verdict is honest** — a codebase that shipped fast but has 3 CRITICAL security findings scores 6/10, not 9/10. Investors read this.
8. **Wave-based sprint plan** — ordered by gate (pre-DD / pre-termsheet / pre-close / post-close), not by numeric SP.
9. **Explicit deferrals** — anything not in a wave is in the "document, do not fix" backlog with a reason.
10. **~30-45 min total wall clock** — 5 subagents in parallel + synthesis + report.

---

## When to Use

- Preparing for a fundraise close where technical DD is expected
- Preparing for an acquirer walk-through
- After a hire onboarding — "give me an outside audit of what I inherited"
- Before a public open-source release — the same standard applies
- Post-major-milestone quality gate ("we just shipped Sprint ω‴; how healthy is the codebase overall?")
- Not the same as `/code-review-full` — that one closes a sprint of found bugs. This one measures the codebase against an outside standard.

---

## Anti-patterns to reject when running this skill

- **Do not just re-run `/code-review-full`.** This skill is deeper on architecture/security/type-safety/tests/ops; it is not "the same but more."
- **Do not open files the subagents are writing to** while they run — you'll pollute your context with WIP output.
- **Do not synthesize until all 5 finish.** Partial synthesis reads incomplete and misses cross-dimension findings.
- **Do not commit the reports before the user has read them.** DD analysis is a decision artifact — the user chooses which findings survive.
- **Do not label a finding CRITICAL unless you can name the DD partner question it would trigger.** CRITICAL is a strong word; overuse it and it means nothing.
