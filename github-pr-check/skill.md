# github-pr-check

Pre-push (or post-push) review that catches what CI cannot: incomplete implementations,
false assumptions, sibling-form blindspots, empty placeholder elements, and acceptance
criteria that were never actually tested.

Run this before marking any PR ready for review.

## Trigger Phrases

- `/github-pr-check`
- "check this PR", "review before pushing", "pre-push check"
- "is this PR complete", "ready to push?"

## Arguments (optional)

- `--pr [N]` — check an already-open PR by number instead of the current branch
- `--issue [N]` — override the linked issue to check against
- `--strict` — also check for test coverage gaps (slower)

---

## Instructions

<command-name>github-pr-check</command-name>

---

### Phase 0: Load context

Run in parallel:

**0A — Identify the PR / branch being checked:**
```bash
# If --pr N was given, use that. Otherwise use current branch.
BRANCH=$(git branch --show-current)
gh pr list --head "$BRANCH" --json number,title,body,baseRefName --limit 1
```

**0B — Get the diff:**
```bash
# Staged + unstaged against base branch
BASE=$(gh pr view --json baseRefName --jq '.baseRefName' 2>/dev/null || echo "staging")
git diff origin/$BASE...HEAD --stat
git diff origin/$BASE...HEAD
```

**0C — Read the linked issue:**
```bash
# Extract issue number from PR body ("Fixes #NNN", "Closes #NNN", "Resolves #NNN")
# Then:
gh issue view NNN --json title,body,comments
```

**0D — Read the changed files in full:**
For every file in the diff, read the current version. Don't work from the diff alone —
diffs hide what's NOT there.

**0E — Run linting:**
```bash
npx nx lint web 2>&1 | grep -E "error|local/" | head -30
npx nx typecheck web 2>&1 | grep "error TS" | head -20
```

---

### Phase 1: Issue resolution check

**Compare the issue's acceptance criteria against the implementation.**

Extract from the issue body:
- What specific problem was reported (exact symptom, steps to reproduce)
- What the expected behavior should be
- Any explicit acceptance criteria checklist

For each criterion, find the exact code that satisfies it. If you can't point to a
specific line, the criterion may not be met.

**Red flags:**
- Issue says "X doesn't work when Y" → check that code specifically handles the Y case
- Issue has multiple symptoms → check each one independently
- Issue was filed by a tester with repro steps → verify the fix handles the exact repro
- PR description says "fixed" but the implementation changes a different code path

**Output:** For each acceptance criterion: SATISFIED (file:line) or NOT SATISFIED (reason).

---

### Phase 2: Sibling form / sibling page audit

**The most common Figma→dev miss: adding something to one form but not its siblings.**

For every component, field, hook, or behavior added in the diff:

1. Is it a UI form field or component?
   → Search for all other forms that handle the same entity:
   ```bash
   # Items: check both new and edit
   grep -rn "form\.getInputProps\|<ComponentName" apps/web/src/app/items/
   # Look for the field in both items/new/page.tsx AND items/[id]/edit/page.tsx
   ```

2. Is it a dashboard page behavior (badge refresh, data reload)?
   → Check ALL dashboard pages that perform similar state changes.

3. Is it a hook or utility used in one place?
   → Search for all call sites that should also use it:
   ```bash
   grep -rn "similarPattern\|relatedCall" apps/web/src/
   ```

**Output:** List of sibling locations checked and whether they're in parity.

---

### Phase 3: Empty / placeholder element check

**Check for UI elements that are hollow — rendered but contain nothing meaningful.**

Scan the diff for:

```
# Placeholder text left in
grep -n "TODO\|FIXME\|coming soon\|placeholder text\|lorem\|example\.com\|test@\|dummy" <changed files>

# Empty states that return null/empty without explanation
# e.g. {items.length === 0 && null} — should have an empty state message

# Conditional renders that might be invisible on the happy path
# e.g. {isOwner && <OwnerPanel />} — what does a renter see?

# Hardcoded values that should be dynamic
grep -n '\"[A-Z][a-z]* [A-Z][a-z]*\"' <changed files>  # "John Doe", "Test Item" etc.
```

For each empty/placeholder found:
- Is it intentional (known limitation, noted in PR)?
- Or is it a missing implementation?

**Output:** List of hollow elements with verdict (intentional / missing).

---

### Phase 4: Assumption audit

**Assumptions baked into the code that may not hold in production.**

Check for:

**1. Data shape assumptions:**
```
# Accessing nested properties without null guards
grep -n "\?\." <changed files>  # are these all protected?
# Arrays assumed non-empty
grep -n "\[0\]\." <changed files>
```

**2. Environment assumptions:**
```bash
# New env vars referenced — are they in all 5 required places?
grep -n "process\.env\.\|configService\.get" <changed files>
# Check: env.schema.ts, check-env.js, render.yaml, .env.example, Render dashboard note in PR
```

**3. Auth / permission assumptions:**
```
# Is this code path reachable by a renter when only owners should see it?
# Is this code path reachable by an unauthenticated user?
grep -n "isApiReady\|@Public\|ClerkAuthGuard\|AdminGuard" <changed files>
```

**4. Browser API assumptions:**
```
# window.* called during SSR
grep -n "window\.\|document\.\|localStorage\." <changed files>
# Each should be inside useEffect or guarded by typeof window !== 'undefined'
```

**5. Timing assumptions:**
```
# Data fetched before auth is ready?
grep -n "useEffect.*\[\]" <changed files>  # empty dep array + API call = race condition
```

**Output:** List of assumptions found, risk level (HIGH/MED/LOW), and whether the code guards against failure.

---

### Phase 5: Pattern compliance

**Check that platform-specific patterns are used correctly.**

Run lint to confirm zero local rule errors:
```bash
npx nx lint web 2>&1 | grep "local/"
```

If any errors remain, list them and explain the fix.

Also manually check:

**isApiReady gate on every authenticated useEffect:**
```bash
grep -n "useEffect" <changed files> | grep -v "isApiReady" # candidates to inspect
```

**postDashboardRefresh vs raw CustomEvent:**
```bash
grep -n "dashboard-nav-refresh\|dispatchEvent" <changed files>
```

**useSearchParams + Suspense:**
```bash
grep -n "useSearchParams" <changed files>
# If present in a page.tsx: is Suspense imported and used?
```

**Mantine disabled Button inside Tooltip:**
```bash
grep -n "disabled.*Button\|Button.*disabled" <changed files>
# If yes: is there a wrapping <span> inside the Tooltip?
```

**Image lazy loading anti-pattern:**
```bash
grep -n 'display.*none\|loading="lazy"' <changed files>
# These should not co-occur
```

**Test–component consistency (two predicates introduced 2026-05-21):**

*Predicate A — changed text must update its tests:*
For every visible string changed or renamed in the diff (button labels,
empty-state messages, heading text, badge text):
```bash
# Get the OLD string from the diff (lines starting with -)
# Then check whether any test still asserts on it
OLD_STRING="No booking requests yet"   # example
grep -rn "$OLD_STRING" apps/web/src --include="*.test.*" --include="*.spec.*"
# If found in a toBeInTheDocument / toHaveTextContent / getByText assertion
# → that test MUST also be updated in this PR. If it isn't, flag as VIOLATION.
```

*Predicate B — removed selectors must not be asserted in tests:*
For every `data-testid`, `aria-label`, or text node REMOVED in the diff:
```bash
# Get removed selector from diff (lines starting with -)
REMOVED="aria-label=\"Settings\""   # example
grep -rn 'getByLabelText.*Settings\|getByTestId.*settings\|getByText.*Settings' \
  apps/web/src --include="*.test.*" --include="*.spec.*"
# If found → VIOLATION. Either restore the selector in the component
# or remove the test assertion in this PR.
```

Both predicates burned us 5 times in the 2026-05-21 dev-rebuild across:
- DashboardLayout aria-labels removed, tests not updated
- Dashboard empty-state text changed, test not updated
- Browse filter sidebar restructured, tests not updated
- Connected badge → green dot, test not updated
- Breadcrumb path changed, test not updated

**Output:** Each pattern: COMPLIANT or VIOLATION (file:line + fix).

---

### Phase 6: Test adequacy (if --strict)

For every new service method or hook added:

```bash
# Does a spec file exist?
ls <path-to-spec>

# Does it cover the new method?
grep -n "describe\|it(" <spec-file> | grep -i "<method-name>"
```

Minimum bar: happy path + not-found/empty case + one error case.

---

### Phase 7: Report

Output a structured report. Be specific — cite file:line for every finding.

```
## PR Check — [branch name] → [base]

### ✅ Issue Resolution
Linked: #NNN — [issue title]

| Criterion | Status | Evidence |
|-----------|--------|---------|
| [criterion 1] | ✅ SATISFIED | file.tsx:123 |
| [criterion 2] | ❌ NOT MET | reason |

### ✅/❌ Sibling Form Parity
| Component/Field | New-item form | Edit form | Status |
|----------------|--------------|-----------|--------|
| SubcategorySelect | items/new:884 | items/[id]/edit:476 | ✅ |

### ✅/❌ Empty / Placeholder Elements
[List or "None found"]

### ✅/❌ Assumptions
| Assumption | Risk | Guard present? |
|-----------|------|---------------|

### ✅/❌ Pattern Compliance
| Pattern | Status |
|---------|--------|
| isApiReady gates | ✅ |
| postDashboardRefresh | ✅ |
| useSearchParams + Suspense | ✅ |
| ESLint local rules | ✅ 0 errors |
| Changed text ↔ test assertions in sync (Predicate A) | ✅ |
| Removed selectors not asserted in tests (Predicate B) | ✅ |

### Overall Verdict
🟢 READY TO PUSH — no blocking issues found.
— or —
🔴 HOLD — N blocking issues found. Fix before pushing:
  1. [specific fix needed, file:line]
  2. ...
```

---

## What this skill catches that CI cannot

| Failure type | Why CI misses it | How this skill catches it |
|-------------|-----------------|--------------------------|
| Sibling form missing new field | Tests cover new form; edit form has no new test | Phase 2: explicit sibling search |
| Issue acceptance criteria only partially met | PR description says "fixed" | Phase 1: criterion-by-criterion check |
| Empty state not implemented | No test for empty state | Phase 3: grep for null returns, empty conditionals |
| `window.*` called during SSR | Works in browser test | Phase 4: grep for unguarded browser APIs |
| Wrong primitive (raw CustomEvent) | Compiles fine | Phase 5: lint + pattern check |
| Hardcoded test data shipped | Tests use same data | Phase 3: grep for placeholder strings |
| New env var missing from 5-place rule | API starts up in CI with test vars | Phase 4: env var assumption check |
| Auth not gated on correct role | Test user has all permissions | Phase 4: permission assumption check |
| Component text changed, test still asserts old string | CI passes if the text change is in a different PR | Phase 5: Predicate A — grep old string in test files |
| Element removed (aria-label/testid/text), test still asserts it | CI passes on the PR that removes it; only fails at merge | Phase 5: Predicate B — grep removed selectors in test files |

## U-Rent specific checks (always run)

**Five-place env var rule**: for every `process.env.NEXT_PUBLIC_*` or `configService.get('NEW_VAR')` added:
- [ ] `apps/api/src/config/env.schema.ts` — Zod schema entry
- [ ] `scripts/check-env.js` — required list
- [ ] `render.yaml` — declared under `envVars`
- [ ] `.env.example` — present with empty or example value
- [ ] PR description — notes that Render dashboard needs updating

**API types freshness**: if any `.controller.ts` or `.dto.ts` changed:
- `apps/web/src/lib/api/generated/api-types.ts` must also be in the diff

**Migration pairing**: if any `.entity.ts` changed:
- A migration file (`*-MigrationName.ts`) must also be in the diff
