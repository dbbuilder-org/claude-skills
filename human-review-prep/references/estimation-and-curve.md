# Estimation & the time curve

The point of this skill is a review-effort estimate a **manager can interrogate** and a reviewer
can trust. That means every hour figure traces back to something observable in the code — never a
gut number. This file is the rubric. Read it before Phase 4.

## Why reviewer-hours, not story points

Story points measure *build* effort and are team-relative. A manager budgeting a reviewer's week
needs wall-clock **review** hours. Review time scales differently from build time: reading and
judging a 200-line diff can take longer than writing it. So estimate the *review* act directly.
Keep SP as a secondary annotation only for continuity with the code-review docs.

## The signal → base-hours table

Score each item on the signals below, then read the base "likely" hours (`m`) off the dominant driver.
These are **review** hours (read + judge + write the deliverable), not build hours.

| Signal | Low | Medium | High |
|---|---|---|---|
| **Lines in scope** (the hunk/function under this item) | < 40 | 40–200 | > 200 |
| **Files touched** | 1 | 2–4 | 5+ |
| **Blast radius** (callers / dependents of the changed symbol) | 0–2 | 3–10 | 10+ or public API |
| **Test coverage of the area** | good | partial | none |
| **Cognitive load** (max nesting, branches, async/concurrency) | flat | some | deep/concurrent |
| **Domain risk** (auth, money, migrations, PII, deploy) | none | adjacent | directly in it |

**Base `m` (likely reviewer-hours) by dominant driver:**

| Dominant profile | `m` |
|---|---|
| All-low (trivial REVIEW/COMMENT) | 0.25 |
| One medium signal | 0.5 |
| Two mediums, low risk | 1.0 |
| Any high signal, or medium + domain-risk | 2.0 |
| Two+ highs, or high + no tests + domain-risk | 4.0 |
| Cross-cutting DECIDE (architecture / API contract) | 6.0+ |

**Action-verb multiplier** (applied to `m` — different acts cost differently):

| Verb | ×    | Why |
|---|---|---|
| REVIEW / VERIFY | 1.0 | read + confirm |
| COMMENT | 1.1 | read + write a little |
| DOCUMENT | 1.5 | read + write prose, get it right |
| TEST | 1.6 | understand behavior + write + run |
| REVISE | 1.7 | judge + change + re-verify |
| REFACTOR | 2.0 | change shape without breaking behavior |
| DECIDE | 2.2 | weigh options, write rationale, socialize |

## From `m` to a 3-point band (PERT)

A single number hides risk; a manager needs the spread. Derive optimistic and pessimistic from the
same signals:

- `o` (optimistic) = `m × 0.5` — clean, tests pass, no surprises.
- `p` (pessimistic) = `m × (2.0 + 0.5·highSignals + 1.0·noTests + 1.0·domainRisk)` — the tail when it
  fights back. The multiplier grows with exactly the things that make review overrun: unknowns
  (high signals), no safety net (no tests), and stakes (domain risk).
- **Expected** `E = (o + 4m + p) / 6` (PERT weighting — the likely case dominates but the tail counts).
- **Std dev** `σ = (p − o) / 6`; report the item band as `E ± σ`.

Round to 0.25h. Anything under 0.25h isn't a card — fold it into a footnote or auto-apply it.

**Worked example** — REFACTOR a 180-line auth-session function across 4 files, no tests:
signals = lines High, files Medium, blast High (public), tests none, risk directly-in-it →
dominant profile "two+ highs + no tests + domain-risk" → base `m = 4.0`, verb REFACTOR ×2.0 →
`m = 8.0`? No — cap the base at the profile, apply the verb multiplier to the *pre-verb* base.
Here base `m=4.0`, ×REFACTOR 2.0 = **m 8.0h**. `o = 4.0`. highSignals=2, noTests=1, domainRisk=1 →
`p = 8.0 × (2.0 + 1.0 + 1.0 + 1.0) = 40`… that's runaway. **Clamp `p ≤ 4×m`.** So `p = 32→` clamp to
`4×8=32`? Still large — for any single item exceeding `m > 4h`, split it into sub-items instead of
carrying a huge band. Big items are a *decomposition* signal, not an estimation one.

**Rule: if `m > 4h`, split the item.** A reviewer task longer than half a day is really several tasks;
splitting is what gives the manager a real curve instead of one scary bar.

## Rollups — "all the way down"

Compute and present three levels so the plan reads top-down (owner) and bottom-up (reviewer):

1. **Total** — Σ`E` across all items, with an aggregate band `ΣE ± √(Σσ²)` (variances add, not std devs).
2. **Per severity tier** — Σ`E` for P0, P1, P2, P3. This is the manager's triage lever: "P0+P1 is 6h."
3. **Per area** — Σ`E` grouped by Area field (auth, data-tier, UX, infra…). Shows where the review weight sits.

Also give **per-owner-profile** subtotals when the plan spans skill levels — it answers "how much
senior time vs mid time," which is what staffing a review actually needs.

## The cumulative time curve

Order items by the recommended review sequence (Phase 4), then render a cumulative view so the shape
of the review is visible at a glance. Two renderings, both text (they must survive in Markdown, a PR
body, and a Linear description — no images):

**A. Tier band bar** — cumulative expected hours, one row per tier, ▓ = ~0.4h:

```
Review time curve — cumulative expected reviewer-hours
0    2    4    6    8   10   12
├────┼────┼────┼────┼────┼────┤
P0 ▓▓▓▓▓▓▓                         3.1h   (critical path — do first)
P1        ▓▓▓▓▓▓▓▓▓▓▓              4.4h
P2                   ▓▓▓▓▓▓▓       2.8h
P3                          ▓▓▓▓   1.9h
                                   ─────
Total 12.2h expected · band 9.4–16.1h
```

**B. Per-item cumulative table** — the drill-down, so a reviewer can stop at any checkpoint:

```
| Seq | ID | Action | E (h) | Cumulative | Owner |
|-----|----|--------|-------|------------|-------|
| 1 | HRP-001 | DECIDE   | 2.2 |  2.2 | Senior |
| 2 | HRP-002 | REVISE   | 0.9 |  3.1 | Senior |  ← all P0 cleared at 3.1h
| 3 | HRP-003 | REFACTOR | 1.6 |  4.7 | Mid    |
| … |
```

The cumulative column is the "time curve … all the way down": the owner reads the tier bar; the
reviewer reads the cumulative table and knows exactly where each natural stopping point falls.

## Calibration notes

- **Anchor to reality when you can.** If the repo has git history of past reviews, or PR review
  durations are observable, sanity-check the total against them and say so.
- **State confidence.** If scope is a clean, well-tested diff, the band is tight; if it's a
  whole-project pass with no tests, widen `p` and *say why* in the plan's assumptions line.
- **Never inflate to look thorough or deflate to look cheap.** The estimate's only value is being
  believed on the second review. Wrong-but-honest with cited signal beats confidently-round.
