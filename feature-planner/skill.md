# feature-planner

Research the competitive landscape, synthesize market trends, and produce a forward-looking feature roadmap that moves the product forward both competitively and compellingly. Uses live web searches — not training-data assumptions — to ground every recommendation.

## Trigger Phrases

- `/feature-planner`, `feature-planner`
- "competitive roadmap", "what features should we build next"
- "research competitors", "market-driven roadmap"
- "where should the product go", "future feature plan"
- "competitive analysis + roadmap", "AI feature planning"

## What This Skill Produces

One primary output in `docs/FEATURE-ROADMAP-YYYY-MM-DD.md`:

```
docs/FEATURE-ROADMAP-YYYY-MM-DD.md
  ├── Competitive Landscape (live research findings)
  ├── Market Trends (what's emerging)
  ├── Gap Matrix (what competitors have that we don't)
  ├── Opportunity Scoring (impact × effort × differentiation)
  └── Phased Feature Roadmap (Now / Next / Later / Moonshot)
```

Plus a companion research dump in `docs/research/competitive-YYYY-MM-DD.md` for source traceability.

---

## Instructions

<command-name>feature-planner</command-name>

Parse the user's message for optional focus:
- **`--focus [theme]`** — constrain research to a specific area (e.g., `--focus billing`, `--focus mobile`, `--focus enterprise`)
- **`--depth [quick|standard|deep]`** — `quick` = 3 competitors, 5 searches; `standard` = 6 competitors, 12 searches (default); `deep` = 10 competitors, 20+ searches
- **`--for [audience]`** — tailor recommendations for a specific user segment (e.g., `--for enterprise`, `--for consumers`, `--for developers`)

---

### Phase 1: Project Context (2–3 min)

Read all project context in parallel:

```bash
# 1a. Most recent feature docs
ls -t docs/REQUIREMENTS-*.md 2>/dev/null | head -1   # → read it
ls -t docs/ROADMAP-*.md 2>/dev/null | head -1         # → read it
ls -t docs/FEATURE-ROADMAP-*.md 2>/dev/null | head -1 # → read prior output if exists

# 1b. Product identity
cat CLAUDE.md 2>/dev/null | head -80   # critical rules + product description

# 1c. Current stack signals
cat package.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
deps = {**d.get('dependencies',{}), **d.get('devDependencies',{})}
print('name:', d.get('name','unknown'))
print('description:', d.get('description',''))
print('key_deps:', [k for k in deps if not k.startswith('@types') and k not in ['typescript','eslint','vite','vitest']][:20])
" 2>/dev/null

# 1d. What's already shipped (avoid redundant suggestions)
git log --oneline -30 2>/dev/null

# 1e. Current test/quality state
npx vitest run 2>&1 | tail -3
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

Extract from the project context:
- **Product name + one-sentence description**
- **Primary user personas** (who buys/uses this)
- **Business model** (B2C SaaS, B2B SaaS, marketplace, white-label, etc.)
- **Current differentiators** (what makes this unique today)
- **Stated north-star goals** (from CLAUDE.md or roadmap "vision" sections)
- **Explicitly deferred or excluded features** (don't re-suggest these)
- **Pricing tiers** (free/paid structure)

---

### Phase 2: Competitor Discovery (3–5 min)

**Step 2a: Identify direct competitors**

Search for direct competitors using the product name and category:

```
WebSearch: "[product name] alternatives 2025"
WebSearch: "[product category] best tools 2025 comparison"
WebSearch: "[product name] vs [likely competitor]"
```

Then identify 6–10 direct competitors. For each, note:
- Name + URL
- Positioning (who they serve)
- Pricing model (free tier, pricing tiers)
- Known differentiators

**Step 2b: Research each competitor's feature set**

For each of the top 4–6 competitors, run 1–2 searches:

```
WebSearch: "[competitor] features 2025"
WebSearch: "[competitor] changelog OR release notes OR new features 2025"
WebSearch: "[competitor] pricing 2025"
```

Also fetch their public changelog or features page directly if URL is known.

Extract for each competitor:
- Core feature set
- Recently shipped features (last 6 months)
- Announced roadmap items
- Pricing tiers + limits
- Enterprise/white-label offerings
- Unique or surprising capabilities

**Step 2c: Market trend research**

Run 3–5 broader trend searches relevant to the product category:

```
WebSearch: "[category] trends 2025 2026"
WebSearch: "AI [category] emerging features 2025"
WebSearch: "[category] enterprise features 2025"
WebSearch: "[category] what users want [category] forum OR reddit 2025"
WebSearch: "YC startups [category] 2025"   # for early signals
```

For AI/LLM products, always include:
```
WebSearch: "LLM inference pricing trends 2025"
WebSearch: "enterprise AI assistant features 2025"
WebSearch: "AI API usage patterns 2026"
```

---

### Phase 3: Gap Matrix (2 min)

Build a structured matrix comparing what competitors have vs. what this product has:

```markdown
| Feature | Us | Comp A | Comp B | Comp C | Comp D | Users Want |
|---------|----|----|----|----|-----|-----------|
| Feature X | ✅ | ✅ | ✅ | ✅ | ✅ | HIGH |
| Feature Y | ❌ | ✅ | ✅ | ❌ | ✅ | HIGH |
| Feature Z | ❌ | ❌ | ✅ | ❌ | ❌ | MED |
```

Mark:
- ✅ = has it (COMPLETE or shipping)
- ⚠️ = partial / limited
- ❌ = missing
- 🔒 = enterprise-only
- 🆕 = just launched / announced

"Users Want" = aggregate signal from forum/reddit/changelog research:
- **HIGH** = multiple sources confirm demand
- **MED** = some signals, not universal
- **LOW** = niche or edge-case demand

---

### Phase 4: Opportunity Scoring

Score each candidate feature on 4 dimensions (1–5 scale):

| Dimension | What it measures |
|-----------|-----------------|
| **User Impact** | How much does this improve the core user experience? |
| **Competitive Necessity** | How many competitors have this? (5 = all have it, we're behind) |
| **Differentiation** | Does this make us meaningfully different? (5 = unique, 1 = table stakes) |
| **Effort** | Inverse of engineering complexity (5 = easy, 1 = hard) |

**Priority Score** = `(User Impact × 2) + Competitive Necessity + Differentiation + Effort`

Max score = 25. Tier:
- **Now (≥18):** Ship in current sprint
- **Next (14–17):** Next 1–2 sprints
- **Later (9–13):** 1–3 months
- **Moonshot (<9 or high effort + high impact):** 3–6 months, requires investment decision

---

### Phase 5: Write the Feature Roadmap

Write `docs/FEATURE-ROADMAP-YYYY-MM-DD.md`:

```markdown
# [Product Name] — Competitive Feature Roadmap

**Date:** YYYY-MM-DD
**Author:** [git config user.name]
**Research Depth:** [quick|standard|deep] — N competitors, N searches
**Focus:** [all | specific theme if --focus was used]
**Audience:** [general | specific if --for was used]

---

## TL;DR — Top 5 Recommendations

> These are the highest-priority features based on competitive analysis and user demand.
> Implement these before anything else in the backlog.

1. **[Feature]** — [One sentence on why: user demand signal + competitive gap]
2. **[Feature]** — [Same]
3. **[Feature]** — [Same]
4. **[Feature]** — [Same]
5. **[Feature]** — [Same]

---

## Competitive Landscape

> Researched [date]. Sources: [list search queries used].

### Market Overview
[2–3 sentences on the overall market state: size, growth, consolidation, key dynamics]

### Competitor Profiles

#### [Competitor A] — [URL]
- **Positioning:** [who they target]
- **Pricing:** [tiers and prices]
- **Recent ships:** [last 3–6 months]
- **Strengths:** [what they do really well]
- **Gaps:** [where they're weak]

[Repeat for each competitor]

---

## Market Trends

> Signals from research indicating where this category is heading.

| Trend | Signal Strength | Implication for Us |
|-------|----------------|-------------------|
| [Trend name] | HIGH/MED/LOW | [What we should do about it] |
...

### Emerging Capabilities to Watch
- **[Tech/feature]:** [Why it matters, when it might be mainstream]
...

---

## Feature Gap Matrix

| Feature | Us | [Comp A] | [Comp B] | [Comp C] | User Demand | Priority Score |
|---------|-----|---------|---------|---------|-------------|----------------|
[See Phase 3 format]

---

## Opportunity Scoring

| Feature | User Impact | Comp Necessity | Differentiation | Effort | Score | Tier |
|---------|------------|----------------|-----------------|--------|-------|------|
[Scored table — sorted by Score descending]

---

## Phased Roadmap

### 🟢 Now — Ship This Sprint (Score ≥18)

For each feature:

#### [Feature Name]
**Why:** [User need + competitive signal — cite specific competitor or trend]
**What it is:** [Concrete description of the feature, not vague]
**How:** [Implementation sketch — what files/systems are involved, SP estimate]
**Success metric:** [How we know it's working]
**Risk:** [What could go wrong]

---

### 🟡 Next — 1–2 Sprints (Score 14–17)

[Same format but slightly shorter — 3–4 features]

---

### 🔵 Later — 1–3 Months (Score 9–13)

[Table format for these — less detail needed]

| Feature | Why | Approx SP | Notes |
|---------|-----|-----------|-------|

---

### 🚀 Moonshot — 3–6 Months (High Effort + High Impact)

[Table format]

| Feature | Vision | Competitive Differentiation | Investment Required |
|---------|--------|----------------------------|---------------------|

---

## What NOT to Build

> Features that appear in competitor products but we should deliberately skip.
> Avoiding these keeps us focused.

| Feature | Why Skip |
|---------|---------|
| [Feature] | [Reason: not our user, too expensive, commoditized, etc.] |

---

## Pricing Intelligence

> How competitors price and what that means for our pricing strategy.

| Competitor | Free Tier | Entry Paid | Mid Tier | Enterprise | Key Limits |
|------------|-----------|------------|----------|------------|------------|

**Pricing recommendations:**
- [Specific recommendation based on gap analysis]

---

## Research Sources

| Query | Key Findings |
|-------|-------------|
| [Search query used] | [What was found] |

---

*Generated [date] via competitive web research. Recommendations are based on [N] competitor profiles and [N] market signals. Re-run `/feature-planner` monthly to stay current.*
```

---

### Phase 6: Write Research Dump

Write the raw research to `docs/research/competitive-YYYY-MM-DD.md`:

```markdown
# Competitive Research Dump — YYYY-MM-DD

## Search Queries Run

[List every query, with date/time if possible]

## Raw Findings by Competitor

### [Competitor A]
[Bullet list of everything found — unfiltered]

### [Competitor B]
...

## Raw Trend Findings
[Bullet list of trend signals found]

## Sources
[URLs visited or fetched]
```

This file is for traceability — not for sharing. It lets future runs compare what changed.

---

### Phase 7: Update MEMORY.md

Add or update in the project's memory file:

```markdown
- **Competitive roadmap**: `docs/FEATURE-ROADMAP-YYYY-MM-DD.md` — N competitors researched, top 5 recs: [list feature names]
```

---

### Phase 8: Commit and Report

```bash
git add docs/FEATURE-ROADMAP-YYYY-MM-DD.md docs/research/competitive-YYYY-MM-DD.md
git commit -m "docs: competitive feature roadmap YYYY-MM-DD

- Researched N competitors: [list names]
- Top 5 opportunities: [list feature names]
- Now tier: N features | Next tier: N | Later: N | Moonshot: N

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Report to user:

```
✅ Feature Roadmap — YYYY-MM-DD

Researched: N competitors | N web searches
Product: [name] | Category: [category]

TOP 5 NOW:
1. [Feature] (score: N/25) — [one line why]
2. [Feature] (score: N/25) — [one line why]
3. [Feature] (score: N/25) — [one line why]
4. [Feature] (score: N/25) — [one line why]
5. [Feature] (score: N/25) — [one line why]

Roadmap tiers:
  🟢 Now:      N features
  🟡 Next:     N features
  🔵 Later:    N features
  🚀 Moonshot: N features

Files:
  docs/FEATURE-ROADMAP-YYYY-MM-DD.md
  docs/research/competitive-YYYY-MM-DD.md
```

---

## Quality Rules

### Research quality
- **Always use live web searches** — never rely on training-data knowledge about competitor features. Products change monthly.
- **Minimum 3 searches per major competitor** — pricing page, features page, changelog/blog
- **Cross-validate claims** — if one source says a competitor has feature X, verify with a second search before listing it as a gap
- **Date-stamp all claims** — "as of [date]" on anything time-sensitive (pricing, feature availability)
- **Prefer primary sources** — competitor website > comparison site > blog post > Reddit

### Roadmap quality
- **No vague features** — "AI improvements" is not a feature. "Per-message model selector with cost preview" is.
- **Every Now-tier feature must have an implementation sketch** — what files, what SP, what risk
- **Competitive gap is necessary but not sufficient** — a feature must also serve our users, not just copy competitors
- **Include "What NOT to Build"** — deliberate exclusions are as important as inclusions
- **Score every candidate feature** — gut feeling roadmaps drift; the scoring matrix forces prioritization discipline
- **Pricing intelligence is mandatory** — most products ignore pricing as a strategic lever; surface it explicitly

### Relevance filter
Before adding a feature to the roadmap, ask:
1. Does this serve the stated user personas in CLAUDE.md or the requirements doc?
2. Is this consistent with the product's business model?
3. Does this conflict with any explicitly deferred/excluded items?
4. Is the engineering complexity proportionate to the value?

If any answer is "no" → move to "What NOT to Build" with explanation.

---

## Competitor Search Patterns by Category

### AI Chat / LLM Platform
```
WebSearch: "ChatGPT features 2025"
WebSearch: "Claude.ai features 2025"
WebSearch: "Gemini Advanced features 2025"
WebSearch: "Perplexity AI features 2025"
WebSearch: "Poe AI features 2025"
WebSearch: "character.ai features 2025"
WebSearch: "AI chat platform white label 2025"
WebSearch: "enterprise LLM platform features 2025"
WebSearch: "AI assistant API platform comparison 2025"
WebSearch: "multi-model AI platform pricing 2025"
```

### B2B SaaS (generic)
```
WebSearch: "[category] top features enterprise customers want 2025"
WebSearch: "[category] G2 top rated 2025"
WebSearch: "[category] Capterra comparison 2025"
WebSearch: "[category] Series A startup 2025"
WebSearch: "[category] product hunt 2025"
```

### Marketplace / Two-sided Platform
```
WebSearch: "[category] marketplace features 2025"
WebSearch: "[category] trust and safety features 2025"
WebSearch: "[category] seller tools 2025"
WebSearch: "[category] buyer experience 2025"
```

### White-Label / Platform-as-a-Service
```
WebSearch: "white label [category] platform 2025"
WebSearch: "[category] reseller features 2025"
WebSearch: "operator dashboard [category] 2025"
WebSearch: "multi-tenant SaaS features operators want 2025"
```

---

## Incremental Update Mode

When re-running on a project that already has a `FEATURE-ROADMAP-*.md`:

1. Read the prior roadmap — identify Now-tier items
2. Check git log since that date — which Now items shipped?
3. Mark shipped items in the gap matrix
4. Run fresh searches focused on what changed since last run:
   ```
   WebSearch: "[competitor] new features [last-date] to [today]"
   WebSearch: "[category] product launches [month] 2025"
   ```
4. Write new dated file — do NOT overwrite old one
5. Prepend supersession header to old file

---

## When to Use

- Before quarterly planning or investor updates
- After shipping a major feature (recalibrate what's next)
- When entering a new market segment or targeting a new persona
- Monthly competitive intelligence refresh
- Before a fundraise (shows market awareness + prioritization thinking)
- When the team debates "what to build next" — replaces gut-feel with evidence
