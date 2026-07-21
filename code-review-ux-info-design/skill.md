---
name: code-review-ux-info-design
description: Audits a UI codebase for information hiding, progressive disclosure, and information hierarchy. Finds where secondary data crowds primary actions, where onboarding content never retires, where all-at-once rendering should be phased or gated, and where step-machine flows are missing. Language-agnostic — works on Vue, React, Svelte, SwiftUI, Compose, Flutter, and server-rendered HTML. Produces a TOON-format action plan with sprint grouping by implementation cost.
trigger: /code-review-ux-info-design
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
---

# Code Review — UX Information Design

Audits UI source code for **information hiding and progressive disclosure** gaps.
The goal is a UI where users see exactly what they need for their current task — no more, no less — and can reach secondary information when they choose to.

Language-agnostic. Works on any component/template format.

---

## Trigger Phrases

- `/code-review-ux-info-design`
- "audit information hiding", "review progressive disclosure"
- "UX information design review", "declutter the interface"
- "information hierarchy audit", "review what's shown vs hidden"

---

## Vocabulary

| Term | Definition |
|------|-----------|
| **Progressive disclosure** | Show only what's needed for the current step; reveal more on demand |
| **Context-required gating** | Block a UI section from rendering until a prerequisite is met |
| **Step machine** | Multi-step modal/flow where each step hides the others |
| **Evergreen content** | Help/onboarding that shows every session regardless of user experience |
| **Primary action** | The one thing the user must do on this screen |
| **Secondary information** | Reference data useful but not required to complete the primary action |
| **Density cliff** | Point where adding one more field causes cognitive overload |
| **Role-appropriate visibility** | Admin sees columns/fields an inspector never needs |

---

## Output

Two files written to `code-review/<YYYY-MM-DD>/`:

1. `UX-INFO-DESIGN-AUDIT.md` — Findings by view, pattern matrix, severity
2. `UX-INFO-DESIGN-SPRINT-PLAN.md` — Grouped into Quick Wins / Sprint 1 / Sprint 2 / Backlog with SP estimates

---

## Phase 1 — Discover Views and Templates

### 1a. Find all UI components/views

```bash
# Web (Vue / React / Svelte / HTML)
find . -name "*.vue" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.svelte" \
  | grep -v node_modules | grep -v ".test." | grep -v ".spec." | sort

# Mobile (Swift / Kotlin / Dart)
find . -name "*.swift" -o -name "*.kt" -o -name "*.dart" \
  | grep -v node_modules | grep -v "Test" | grep -v "test" | sort

# Server-rendered
find . -name "*.html" -o -name "*.erb" -o -name "*.jinja" -o -name "*.blade.php" \
  | grep -v node_modules | sort
```

### 1b. Identify view categories

Classify each file as one of:
- **Flow view** — guides user through a task (form wizard, onboarding, inspection)
- **List/index view** — shows a collection with filters/search
- **Detail view** — shows a single entity with all its attributes
- **Dashboard** — aggregates multiple data sources into summary cards
- **Modal/drawer** — overlays an existing view with a focused action

Classification method: read the filename and the first 30 lines of the template. Look for `<form>`, `<wizard>`, `<stepper>`, filter refs, entity IDs in route params.

---

## Phase 2 — Per-View Audit

For each view, answer these 8 questions by reading the template:

### Q1 — What is the primary action?
The one button/submit/next the user must click to complete their goal on this screen.
Identified by: `@click`, `@submit`, `type="submit"`, primary CTA class.

### Q2 — What is always rendered regardless of state?
Everything outside `v-if`, `{condition &&}`, `<Show when=`, `if (condition)` guards.
List field names, sections, and button labels.

### Q3 — What is conditionally rendered, and on what condition?
Parse every `v-if`, `v-else-if`, `v-show`, `{x && <Y>}`, ternary renders.
Record: **condition → content shown**.

### Q4 — Does secondary information crowd the primary action?
Flag if: the primary action (Q1) shares visual space with >3 reference-only fields,
or if fields are displayed that are irrelevant to the current state/step/role.

### Q5 — Is there an all-at-once list that should be phased or paginated?
Flag if: a form renders all fields for all scenarios simultaneously,
a list renders all items with no virtual scroll / "show more" / pagination,
a detail view shows all attributes without expand/collapse sections.

### Q6 — Is there evergreen content that should retire?
Flag if: help text, onboarding guides, tooltips, or explainer cards render
without checking a "has seen" flag (localStorage, user preference, cookie, DB flag).

### Q7 — Are there fields or sections that are role-inappropriate?
Flag if: the same component is rendered for multiple roles (e.g., inspector and admin)
but doesn't filter out fields irrelevant to one role.

### Q8 — Is a step machine missing where one should exist?
Flag if: a single form or screen handles >2 conceptually distinct decisions that
could be separated into sequential steps, reducing the decision surface.

---

## Phase 3 — Pattern Scans (Language-Specific Grep)

Run all scans that match the detected stack. Skip non-matching ones.

### 3a. Find "always rendered" heavy sections

```bash
# Vue: large blocks outside v-if (look for sections with many fields)
grep -rn "v-model\|:value\|@input" --include="*.vue" . \
  | grep -v "node_modules" | awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -20
# High counts = many inputs = potential density cliff

# React/TSX: many JSX fields without conditional
grep -rn "onChange\|value={" --include="*.tsx" . \
  | grep -v "node_modules" | awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -20
```

### 3b. Find evergreen onboarding / help content

```bash
# Look for help/guide/onboarding components with no conditional guard
grep -rn "guide\|tutorial\|onboard\|help\|walkthrough\|tip\b\|hint\b" \
  --include="*.vue" --include="*.tsx" --include="*.jsx" --include="*.svelte" \
  --include="*.swift" --include="*.kt" --include="*.dart" \
  -i . | grep -v "node_modules" | grep -v "\.spec\." | grep -v "test"
# Then check if nearby v-if / condition references localStorage/userPrefs/hasSeenX
```

### 3c. Find filter/search panels that are always open

```bash
grep -rn "filter\|Filter\|search\|Search" \
  --include="*.vue" --include="*.tsx" --include="*.jsx" \
  . | grep -v "node_modules" | grep "v-model\|onChange\|value=" \
  | awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -15
# Then read each: does it have a showFilters / isFiltersOpen toggle?
```

### 3d. Find long scrollable lists without collapse/pagination

```bash
# Vue: v-for without :key pagination or virtual scroll
grep -rn "v-for=" --include="*.vue" . | grep -v "node_modules" \
  | grep -v "pagination\|pageSize\|virtualScroll\|limit"

# React
grep -rn "\.map(" --include="*.tsx" . | grep -v "node_modules" \
  | grep -v "slice\|pagination\|page\|limit\|take"
```

### 3e. Find step-machine candidates (multi-decision single screens)

```bash
# Screens with multiple submit/confirm buttons — may need splitting
grep -rn "type=\"submit\"\|@click.*save\|@click.*confirm\|@click.*submit" \
  --include="*.vue" --include="*.tsx" . \
  | grep -v "node_modules" | awk -F: '{print $1}' | sort | uniq -c | sort -rn \
  | awk '$1 > 2'  # More than 2 action buttons = worth reviewing
```

### 3f. Find role-awareness gaps

```bash
# Components used by multiple roles with no role guard inside
grep -rn "role\|Role\|isAdmin\|isInspector\|userRole\|hasPermission" \
  --include="*.vue" --include="*.tsx" --include="*.jsx" \
  . | grep -v "node_modules" \
  | awk -F: '{print $1}' | sort | uniq

# Cross-ref: are any view files NOT in this list that are shared across roles?
# (Check router or nav config for which roles reach each view)
```

### 3g. Detect competing-attention patterns

```bash
# Vue: buttons at same level as primary-action button
grep -rn "btn-\|button\|Button" --include="*.vue" . | grep -v "node_modules" \
  | awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -20
# Files with >4 button refs on one screen may have attention-splitting
```

---

## Phase 4 — Classify Findings

For each finding from phases 2 and 3, assign:

### Severity

| Level | Criteria |
|-------|---------|
| **HIGH** | Primary action buried or unreachable; role-inappropriate data exposed; required step machine missing causing data errors |
| **MEDIUM** | Secondary info crowds primary action but task still completable; all-at-once list with >20 items; filter panel always open; evergreen help content |
| **LOW** | Minor density; small counts; stylistic preference |

### Implementation Cost

| Label | Hours | Scope |
|-------|-------|-------|
| **Quick Win** | < 1h | Single `v-if` toggle, localStorage flag, CSS class change |
| **Sprint 1** | 1–4h | Collapse/expand component, filter drawer, show-more |
| **Sprint 2** | 4–16h | Phase/section grouping, step machine refactor, role filter |
| **Backlog** | > 16h | Full redesign, new routing, major state management change |

---

## Phase 5 — Write UX-INFO-DESIGN-AUDIT.md

```markdown
# UX Information Design Audit — YYYY-MM-DD
Project: <name> | Views audited: N | Findings: N | Rating: RED / YELLOW / GREEN

## Rating Criteria
GREEN = no HIGH findings, <3 MEDIUM
YELLOW = 1-2 HIGH findings or 4-8 MEDIUM
RED = 3+ HIGH findings or 9+ MEDIUM

---

## What Is Working Well
- <Pattern name>: <why it's good, with file reference>
- ...

---

## Findings

### HIGH — <View or Component Name>

**Pattern**: <pattern name from vocabulary>
**File**: `path/to/view.vue:line`
**Issue**: <1-2 sentences: what's always visible that shouldn't be>
**Primary action**: <what is it>
**Competing elements**: <what crowds it>
**Fix**: <specific change — toggle, phase, gate, collapse>
**Cost**: <Quick Win / Sprint 1 / Sprint 2>

---

### MEDIUM — <View or Component Name>

...same structure...

---

## Pattern Matrix

| View | Always-rendered fields | Conditional blocks | Has step machine | Has role filter | Has evergreen content | Cost |
|------|----------------------|-------------------|-----------------|-----------------|----------------------|------|
| ... | N | N | ✓/✗ | ✓/✗ | ✓/✗ | label |

---

## Counts

| Severity | Count | SP |
|----------|-------|----|
| HIGH | N | N |
| MEDIUM | N | N |
| LOW | N | N |
| **Total** | **N** | **N** |
```

---

## Phase 6 — Write UX-INFO-DESIGN-SPRINT-PLAN.md

```markdown
# UX Information Design Sprint Plan — YYYY-MM-DD

## Quick Wins (< 1h each — do this week)

| ID | View | Change | File | SP |
|----|------|--------|------|----|
| UX-QW-01 | <view> | <specific change> | `path:line` | 1 |

## Sprint 1 (1–4h each — next sprint)

| ID | View | Change | File | SP |
|----|------|--------|------|----|
| UX-S1-01 | <view> | <specific change> | `path:line` | 2 |

## Sprint 2 (4–16h — schedule when sprint capacity allows)

| ID | View | Change | File | SP |
|----|------|--------|------|----|
| UX-S2-01 | <view> | <specific change> | `path:line` | 5 |

## Backlog (> 16h — requires design spike)

| ID | View | Change | Notes | SP |
|----|------|--------|-------|----|
| UX-BL-01 | <view> | <specific change> | <why deferred> | 13 |

---

## Implementation Notes

### Quick Win patterns

**localStorage "has seen" flag:**
```js
// On first completion of key action:
localStorage.setItem('inspector_onboarded', '1')

// In component:
const showGuide = computed(() => !localStorage.getItem('inspector_onboarded'))
```

**Filter toggle with count badge:**
```html
<button @click="showFilters = !showFilters">
  Filters <span v-if="activeFilterCount > 0">({{ activeFilterCount }})</span>
</button>
<div v-show="showFilters"> <!-- filter panel --> </div>
```

**Collapse completed list items:**
```html
<div v-for="item in items" :key="item.id">
  <template v-if="item.status !== 'completed' || showCompleted">
    <!-- item content -->
  </template>
</div>
<button @click="showCompleted = !showCompleted">
  {{ showCompleted ? 'Hide' : 'Show' }} completed ({{ completedCount }})
</button>
```

### Step machine scaffold

```html
<template>
  <!-- Step indicator -->
  <div class="steps">
    <span v-for="(step, i) in steps" :class="{ active: currentStep === i }">
      {{ step.label }}
    </span>
  </div>

  <!-- Only the current step renders -->
  <component :is="steps[currentStep].component" @next="currentStep++" @back="currentStep--" />
</template>
```

### Phase grouping for long forms

```html
<template>
  <div v-for="(phase, i) in phases" :key="phase.id">
    <template v-if="currentPhase === i">
      <h2>{{ phase.title }}</h2>
      <component :is="phase.component" @complete="nextPhase" />
    </template>
  </div>
  <progress :value="currentPhase" :max="phases.length" />
</template>
```

---

## Acceptance Criteria (per fix)

Each UX-QW / UX-S1 / UX-S2 fix is "done" when:
- [ ] Primary action is visually dominant (no competing same-level CTAs)
- [ ] Secondary info is reachable in ≤ 1 tap/click from primary flow
- [ ] Evergreen content has a dismiss/seen mechanism
- [ ] Phased forms show ≤ 5 fields per phase
- [ ] Filter panels default closed when 0 filters are active
- [ ] Completed/historical items are collapsed by default with count shown
- [ ] Step machines show N/M progress indicator
- [ ] No field is rendered for a role that has no action on it
```

---

## Rules

1. **Read before reporting.** Every finding cites a real file and line number.
2. **Name the primary action.** Every finding must state what the primary action is before describing what crowds it.
3. **Cost everything.** No finding without a Quick Win / Sprint / Backlog label and SP estimate.
4. **Language-agnostic patterns.** The audit principles apply regardless of framework; adapt grep patterns to the detected stack.
5. **No redesign without rationale.** If suggesting a step machine, explain which two decisions currently coexist that shouldn't.
6. **Respect working patterns.** Document what IS working (phase 5 "What Is Working Well") before listing gaps.
7. **Sprint plan must be executable.** Every Sprint 1 item should be implementable by a developer without a design meeting.
8. **Backlog items require a design note.** If something needs a design spike before coding, say so explicitly.

---

## When to Use vs Other Review Skills

| Skill | Use when |
|-------|---------|
| `/code-review-ux-info-design` | UI has too much on screen; users report confusion; new feature added to existing dense view |
| `/code-review-quick` | Broad code quality check across all dimensions |
| `/code-review-v3` | Full TS + tech debt + test + feature completeness pass |
| `/code-review-v2` | Sprint planning from prior review findings |
