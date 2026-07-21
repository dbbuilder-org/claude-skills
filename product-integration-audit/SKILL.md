---
name: product-integration-audit
description: Use when asked to audit, check, or report the integration/operational status of a commercial product or site (e.g. "is drivertrack fully wired?", "audit fireproofapp integrations", "what's missing on X?", "integration status report") — covering lead development, email marketing, sales management, Linear, Sentry, OpenTelemetry, uptime monitoring, CI/CD, analytics, SEO, security, payments, and support. Also use when onboarding a new product to see its gaps, or on a cadence to detect drift.
---

# Product Integration Audit

## Overview

Audits one or more commercial products against a **fixed dimension matrix** (`checks.md`, this directory) and emits a comparable, dated status report. Core principle: **every check is typed and evidenced** — [AUTO] checks are verified by command/API with the evidence recorded; [MANUAL] checks emit exact UI instructions; [ASK] checks emit a question only the user can answer. A status without evidence is a guess, not a status.

**Strictly read-only.** dig/curl/repo greps and read-only API calls — GETs plus read-semantics POST queries like Attio's `/query` endpoints (tokens from `~/.config/claude/credentials.md`). Never a state-changing call, never a fix — fixes are the report's *output*, executed only when the user asks. Stale vault data you notice goes in the report's ANSWER section, not edited in place.

## Procedure

1. **Registry first**: read `~/dev2/gtm-bible/PRODUCTS.md`. Audit the product(s) named by the user; if none named, ask which (or "all"). A product not in the registry → add its row (the one permitted write) and flag it as newly registered.
2. **Run the matrix**: execute every dimension in `checks.md` for the product. Rules:
   - [AUTO] checks: run the command; record status + one-line evidence (`dig MX → …outlook.com` beats "email works"). A failed probe is ❌ *verified absent* — distinct from ❓ unknown.
   - [MANUAL]: don't guess — emit the check's UI path verbatim into the report's ASK section.
   - [ASK]: emit the question. Never infer answers to judgment questions (SLA owners, cadences, budgets).
   - N/A needs a reason (⬜ "OTel — static prerendered site, no runtime backend"). Silent dimension-skips are the #1 audit failure.
3. **Statuses**: ✅ verified · 🟡 partial (evidence for both halves) · ❌ verified missing · ❓ awaiting manual/ask · ⬜ N/A+reason. Day-zero artifacts (built today, zero usage evidence) are 🟡 "built, unproven" — never ✅, never ❌.
3b. **Dimension roll-up (fixed algorithm, for cross-product comparability)**: ignore ⬜ rows; then ✅ = every remaining check ✅ · ❓ = no check has ✅/❌ evidence · ❌ = the ❌ checks outnumber the ✅ checks · 🟡 = everything else.
4. **Write the report** to `~/dev2/gtm-bible/status/<product>-YYYY-MM-DD.md`:
   - Header: product, date, auditor, **delta vs the previous report** in that directory (new ✅, regressions, still-open items — diff the scorecards; first run says so).
   - **Scorecard**: one row per dimension with rolled-up status + counts.
   - Per-dimension detail: each check, status, evidence.
   - Then the three action sections — this structure is the deliverable:
     - **KNOW** — what is verified true today (the confident summary).
     - **ASK** — numbered questions + manual checks for the user, each with its exact UI path.
     - **ANSWER** — prioritized P0/P1/P2 fixes for every ❌/🟡, each tagged [AI] (say the word and Claude executes), [C] (user-only: purchases, tenant admin, judgment), or [DELEGATE] (hand-off-able with the runbook/doc reference).
5. **Update `status/INDEX.md`**: one row per product — date of last audit, scorecard summary, top P0. This is the cross-product rollup the user scans.
6. Commit the gtm-bible changes. Final message = scorecard + the ASK list + top ANSWERs (the user should not need to open the file to know what to do next).

## Common Mistakes

- **Auditing only what the repo shows** — half the matrix lives outside the repo (Attio, DNS, Instantly, BetterStack, Linear, Sentry, GitHub alerts). Probe the live systems.
- **Marking coded-but-unconfigured as working** — a GA4 plugin with no measurement ID in prod is ❌, not ✅ (live-HTML probe beats source grep; the reference baseline caught exactly this).
- **Inventing dimension lists per run** — reports must be comparable across products and dates; `checks.md` is fixed and only grows via edits to it.
- **Vague evidence** — every ✅/❌ cites the command or API result that proved it.
- **Fixing during the audit** — read-only; the ANSWER section is where fixes live.
- **Skipping the delta** — drift detection is the point of re-runs.
