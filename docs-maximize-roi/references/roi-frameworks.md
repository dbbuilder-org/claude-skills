# ROI analytical frameworks (Phase 1)

The four lenses that turn "list of benefits" into "one defended thesis." Apply all four; they
compose.

## 1. Intended / Potential / Approachable triage
Bucket every candidate source of value into exactly one:

| Bucket | Definition | Typical trap |
|---|---|---|
| **Intended** | The value the project was explicitly built to deliver — the stated pitch. | Often commoditized; competitors claim the same. Rarely the *greatest* ROI on its own. |
| **Potential** | Value the architecture *could* unlock but doesn't yet; latent, needs build. | A mirage if it needs a moonshot. Only counts if a credible path exists. |
| **Approachable** | Value reachable now/soon with current assets; near-term, low-lift. | Can be small. Only counts if it's also material. |

**The sweet spot is Potential ∩ Approachable:** big enough to matter, close enough to ship on the
current base. State which bucket your thesis sits in and why the others lose.

## 2. Mechanism, not feature
Ask: *what single mechanism makes several benefits real at once?* The strongest ROI is almost always
a **mechanism** — a loop, a structural position, a compounding data asset — not a feature. Features
are copyable line items; mechanisms are moats. Test: if you removed this one mechanism, how many of
the listed benefits evaporate? The more that die, the more it is the real thesis.

Common high-ROI mechanisms: a **closed feedback loop** (observe → attribute → improve); a
**privileged position** (in-path, at the control plane) that grants observability others lack; a
**compounding asset** (data/memory/graph) that gets more valuable with scale.

## 3. Moat analysis — valuable vs. defensible
Separate the two. Score each candidate on three axes and rank by their product:
`value × defensibility × (1 / time-to-value)`.

- **Value** — magnitude of the return.
- **Defensibility** — can a competitor structurally copy it? Name what they *cannot* replicate
  (position, data, integration surface, switching cost). This is the moat.
- **Time-to-value** — near-term dollars beat distant ones.

The greatest *ROI* is often not the most *valuable* item — it's the one that is valuable AND
defensible AND soon. Say so.

## 4. Honest value ranking (the persuasion strategy)
Rank ALL the returns most→least defensible, and **de-rank the oversold headline explicitly.** Almost
every project has one number everyone quotes that is real but unprovable or contested (e.g., "X%
cost savings" whose counterfactual can't be isolated, or that overlaps another product). Naming it
and demoting it, out loud, is what makes the technical reviewer and the CFO trust the rest. Hype
loses both readers; a candid ranking wins both.

Template ranking shape:
1. The provable near-term dollar (measurable directly today).
2. The durable moat / switching cost (strategic).
3. The compounding flywheel (year-2 economics).
4. The adoption/distribution lever (breadth).
5. **(De-ranked)** the oversold headline — real but weakest; don't lead with it.

## Provisioning knob vs. design constraint
When something isn't done yet, classify it: a **design constraint** is a real limit of the
architecture; a **provisioning knob** is money/latency/scale that spend solves (dedicated compute,
a bigger instance, a region move). Papers and roadmaps may present provisioning knobs as solved —
but record the true current state in the README scope note so the case survives a fact-check.
