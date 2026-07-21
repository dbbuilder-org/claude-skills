---
name: enhance-tests
description: Analyze test coverage gaps and write tests at the right layer — unit, component (with real-scale data), integration (route + DB mock), and E2E smoke. Specifically targets "prop not wired", "mock data in production", and "works at demo scale, breaks at real scale" bugs that unit-only suites miss.
trigger: /enhance-tests
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Edit
---

# Enhance Tests — Layered Coverage Strategy

Unit tests alone cannot catch the class of bugs clients find first: props not wired, mock data left in, components that break at real data volume. This skill adds the missing layers.

## The Four Layers

| Layer | What it tests | Tools | Catches |
|-------|---------------|-------|---------|
| **Unit** | Pure functions, formatters, business logic | Jest/Vitest | Wrong output, edge cases, exceptions |
| **Component** | React rendering with variant prop states | Jest + RTL | Unwired props, missing real data, scale failures |
| **Integration** | API route handler + Prisma mock together | Jest + msw/mockPrisma | Auth guards, error paths, response shape |
| **E2E Smoke** | Full user flow in a real browser | Playwright | End-to-end wiring, data visible after action |

---

## Trigger Phrases

- `/enhance-tests`
- `/enhance-tests [component or feature name]`
- "add layered tests", "improve test coverage", "add component tests", "add smoke tests"
- "tests miss real-world bugs", "tests don't catch wiring issues"

---

## Phase 1: Identify Current Layers

```bash
# What test runner is in use?
cat package.json | grep -E '"jest"|"vitest"|"playwright"' | head -10

# Count existing tests by type
find . -name "*.test.ts" -o -name "*.test.tsx" | grep -v node_modules | grep -v ".next" | wc -l
find . -name "*.spec.ts" -o -name "*.spec.tsx" | grep -v node_modules | wc -l
find . -name "*.e2e.ts" -o -name "e2e" -type d | grep -v node_modules | head -10

# What layers are missing? Check for component-level tests
find . -name "*.test.tsx" | grep -v node_modules | grep -v "__tests__/route" | head -20

# Existing E2E directory
ls -la apps/web-e2e/src/ apps/web/e2e/ e2e/ 2>/dev/null | head -20

# Playwright config
cat playwright.config.ts 2>/dev/null | head -30
```

Record: which layers exist, which are missing, current test count.

---

## Phase 2: Find Wiring & Scale Gaps (the bugs clients find first)

```bash
SRC="apps/web/src apps/web/app libs/ui/src"

# Components with mock fallback data — props not wired at call sites
grep -rn "?? mock\||| mock\|const mock[A-Z]" \
  $SRC --include="*.tsx" --include="*.ts" \
  --exclude="*.test.*" --exclude-dir=node_modules 2>/dev/null | head -20

# max-h constraints on dynamic list containers
grep -rn "max-h-\[" \
  $SRC --include="*.tsx" --exclude="*.test.*" \
  --exclude-dir=node_modules 2>/dev/null | head -20

# toLocaleString without options on financial values
grep -rn "\.toLocaleString()" \
  $SRC --include="*.tsx" --include="*.ts" \
  --exclude="*.test.*" --exclude-dir=node_modules 2>/dev/null | head -20

# Components rendered without their data props (spot check key components)
grep -rn "<FilterModal\|<DataTable\|<Select\b" \
  $SRC --include="*.tsx" --exclude="*.test.*" \
  --exclude-dir=node_modules 2>/dev/null | head -20
```

For each hit, determine which test layer catches it:
- Mock fallback (`?? mockX`) → **Component test** asserting real data shape
- `max-h` on list → **Component test** with 15+ item prop
- `toLocaleString()` without options → **Unit test** on the formatter
- Prop not passed at call site → **Component test** rendering from the parent context

---

## Phase 3: Find Integration Gaps

```bash
# API routes without test files
find apps/web/app/api -name "route.ts" | grep -v node_modules | while read f; do
  dir=$(dirname "$f")
  testfile=$(find "$dir" -name "route.test.ts" -o -name "*.test.ts" 2>/dev/null | head -1)
  [ -z "$testfile" ] && echo "NO TEST: $f"
done | head -20

# Routes that do auth but have no test asserting 401 on unauthenticated request
grep -rn "auth()\|currentUser()\|getAuth(" \
  apps/web/app/api --include="route.ts" -l 2>/dev/null | while read f; do
  dir=$(dirname "$f")
  testfile=$(find "$dir/__tests__" -name "*.test.ts" 2>/dev/null | head -1)
  [ -z "$testfile" ] && echo "AUTH NO TEST: $f"
  [ -n "$testfile" ] && grep -q "401\|Unauthorized\|unauthenticated\|not authenticated" "$testfile" 2>/dev/null || echo "AUTH TEST MISSING 401: $f"
done | head -20
```

---

## Phase 4: Write Component Tests (Layer 2)

Component tests live alongside the component file in `__tests__/ComponentName.test.tsx`.

**Pattern for "prop not wired / mock data" scenario:**
```typescript
// ComponentName.test.tsx
import { render, screen } from '@testing-library/react'
import { ComponentName } from '../ComponentName'

const REAL_DATA = [
  { id: 'uuid-1', name: 'Real Practitioner A' },
  { id: 'uuid-2', name: 'Real Practitioner B' },
]

const MOCK_NAMES = ['Dr. Sarah Chen', 'Emma Rodriguez', 'Dr. Michael Park', 'Lisa Thompson']

describe('ComponentName', () => {
  it('shows real data when availableFilters is provided', () => {
    render(<ComponentName availableFilters={{ practitioners: REAL_DATA }} ... />)
    expect(screen.getByText('Real Practitioner A')).toBeInTheDocument()
    // Confirm no mock names leak through
    MOCK_NAMES.forEach(name => {
      expect(screen.queryByText(name)).not.toBeInTheDocument()
    })
  })

  it('hides practitioner filter when no availableFilters provided', () => {
    render(<ComponentName ... />)
    // Section should be absent, not showing mock data
    expect(screen.queryByText('Dr. Sarah Chen')).not.toBeInTheDocument()
  })
})
```

**Pattern for "real-data scale" scenario:**
```typescript
const LARGE_LIST = Array.from({ length: 15 }, (_, i) => ({
  id: `uuid-${i}`,
  name: `Practitioner ${i + 1}`,
  revenue: 1234.56 * (i + 1),
}))

it('renders all 15 items without truncation', () => {
  render(<NavItem items={LARGE_LIST} isExpanded={true} ... />)
  // All items must be in the DOM (not clipped by CSS-only truncation)
  expect(screen.getAllByRole('link')).toHaveLength(15)
})

it('formats revenue without cents', () => {
  render(<NavItem items={[{ id: '1', name: 'Test', revenue: 1234.56 }]} isExpanded={true} ... />)
  expect(screen.getByText('$1,235')).toBeInTheDocument()
  expect(screen.queryByText('$1,234.56')).not.toBeInTheDocument()
})
```

**Pattern for "parent wires props to child" scenario:**

When the bug is that a parent doesn't pass a prop, test the parent rendering, not just the child:
```typescript
// DashboardPage.test.tsx — tests the wiring, not the child in isolation
it('passes real practitioners to FilterModal', async () => {
  // Mock usePractitioners to return known data
  vi.mocked(usePractitioners).mockReturnValue({
    data: { practitioners: [{ id: 'p-1', name: 'Jane Doe', revenue: 5000 }] },
    isLoading: false,
  })

  render(<DashboardPage />)
  await userEvent.click(screen.getByRole('button', { name: /filter/i }))

  // FilterModal opened — should show real name, not mock
  expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  expect(screen.queryByText('Dr. Sarah Chen')).not.toBeInTheDocument()
})
```

---

## Phase 5: Write Integration Tests (Layer 3)

Integration tests live in `app/api/[route]/__tests__/route.test.ts`.

**Standard route test pattern (Next.js App Router + Prisma + Clerk):**
```typescript
import { NextRequest } from 'next/server'
import { GET, POST } from '../route'

// Mock auth
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}))
// Mock Prisma
jest.mock('@/lib/prisma', () => ({ prisma: mockDeep<PrismaClient>() }))

const mockAuth = auth as jest.MockedFunction<typeof auth>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('GET /api/[route]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null } as any)
    const res = await GET(new NextRequest('http://localhost/api/route'))
    expect(res.status).toBe(401)
  })

  it('returns data for authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' } as any)
    mockPrisma.model.findMany.mockResolvedValue([{ id: '1', name: 'Test' }])
    const res = await GET(new NextRequest('http://localhost/api/route'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
  })

  it('validates required query params', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' } as any)
    const res = await GET(new NextRequest('http://localhost/api/route?invalid=true'))
    expect(res.status).toBe(400)
  })
})
```

---

## Phase 6: Write E2E Smoke Tests (Layer 4)

E2E tests live in `apps/web-e2e/src/` or `e2e/`. Use the Playwright pattern already established in the project.

**Target: one smoke test per critical user path.** Not every edge case — just the path a new client would walk on day one.

Priority paths to cover:
1. Login → dashboard loads with real data visible
2. Open filter modal → see real practitioner names (not mock)
3. Apply practitioner filter → data changes
4. Open AI insight → response appears
5. Navigate to a key sub-page → page renders without error

**Pattern:**
```typescript
// e2e/dashboard-filter.spec.ts
import { test, expect } from '@playwright/test'

test('filter modal shows real practitioners', async ({ page }) => {
  await page.goto('/dashboard-v8')
  await page.waitForLoadState('networkidle')

  // Open filter
  await page.getByRole('button', { name: /filter/i }).click()

  // Practitioner dropdown should not contain mock names
  const select = page.getByLabel('Practitioner')
  const options = await select.locator('option').allTextContents()

  expect(options).not.toContain('Dr. Sarah Chen')
  expect(options).not.toContain('Emma Rodriguez')
  // Should contain at least "All Practitioners" + one real option
  expect(options.length).toBeGreaterThan(1)
})

test('sidebar practitioner revenues show no cents', async ({ page }) => {
  await page.goto('/dashboard-v8')
  await page.waitForLoadState('networkidle')

  // Expand practitioners in sidebar
  await page.getByLabel('Expand Practitioners section').click()

  // All revenue values must be whole-dollar formatted
  const revenues = page.locator('[data-testid="practitioner-revenue"]')
  for (const el of await revenues.all()) {
    const text = await el.textContent()
    expect(text).toMatch(/^\$[\d,]+$/) // e.g. "$12,345" — no decimal
  }
})
```

---

## Phase 7: Run and Verify

```bash
# Run new component/unit tests
npx jest --testPathPatterns="ComponentName|feature-name" 2>&1 | tail -20

# Run full suite to confirm no regressions
npx jest 2>&1 | tail -10

# Run E2E smoke (requires running app)
npx playwright test e2e/dashboard-filter.spec.ts --headed 2>&1 | tail -20
```

All tests must pass before reporting done.

---

## Output

After writing tests, report:

```
## Enhance Tests Report — YYYY-MM-DD

### Tests Added
| File | Layer | Tests | What It Catches |
|------|-------|-------|-----------------|
| ComponentName.test.tsx | Component | 3 | Mock data leak, scale |
| DashboardPage.test.tsx | Component | 1 | Prop wiring |
| route.test.ts | Integration | 4 | Auth, validation |
| dashboard-filter.spec.ts | E2E | 2 | End-to-end wiring |

### Coverage Delta
Before: N tests / N suites
After: N tests / N suites

### Gaps Still Open (deferred)
| Gap | Why Deferred | Sprint |
```

---

## Rules

1. **Layer first, then write** — determine the right layer before writing. The test layer is determined by where the bug lives: formatting bug → unit; prop not wired → component; auth bypass → integration; end-to-end wiring → E2E. Don't write unit tests for wiring bugs or E2E tests for formatting bugs.
2. **Real data shapes in component tests** — never use single-item or 1-2 item arrays. Use 10–15 items to surface `max-h` and truncation bugs.
3. **Assert absence of mock data, not just presence of real data** — always include a `queryByText('Dr. Sarah Chen')` → `toBeNull()` assertion alongside the real-data assertion.
4. **Parent tests for wiring bugs** — if the bug is that a parent doesn't pass a prop, test the parent, not the child. Testing the child in isolation only proves the child works when given good props.
5. **One E2E smoke test per critical path** — don't duplicate unit/component logic in E2E. E2E tests should only verify that the full stack is wired together, not every edge case.
6. **All new tests must pass before reporting done** — run after every file written.
