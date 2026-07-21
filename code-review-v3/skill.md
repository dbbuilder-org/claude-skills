---
name: code-review-v3
description: Execution-first code review. Extends v2 with active remediation: runs tsc to find real type errors, greps for tech debt patterns, identifies half-implemented features, and writes the fixes — tests, type corrections, and debt cleanup — rather than just listing them. Use when the user says "code-review-v3", "fix tech debt", "fix type errors", "complete features and tests", or "full cleanup review".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - Agent
---

# Code Review V3

**Execution-first review.** Extends v2 with four new dimensions:

1. **TypeScript error elimination** — runs `tsc --noEmit`, fixes real compiler errors (not just `any` warnings)
2. **Tech debt remediation** — greps for TODO/FIXME/HACK, dead code, console.log in production paths, over-complex patterns; fixes them
3. **Feature completion** — identifies half-implemented features (backend with no frontend, or vice versa) and writes the missing side
4. **Test generation** — for every service/controller/hook without a spec file, writes a meaningful test suite

The key difference from v2: v3 **implements**, not just identifies.

## Trigger Phrases

- `code-review-v3`, `/code-review-v3`
- "fix tech debt", "fix type errors", "complete features and tests"
- "full cleanup review", "execution review", "implementation review"

---

## Output Structure

All review docs go to `code-review/<YYYY-MM-DD>/` (same as v2).
All code changes go to a single PR per work area (max 3 PRs).

```
code-review/YYYY-MM-DD/
├── 00-EXECUTIVE-SUMMARY.md
├── 01-DELTA-REVIEW.md
├── 02-TYPESCRIPT-ERRORS.md        ← NEW: actual tsc output, categorized
├── 03-TECH-DEBT-REMEDIATION.md    ← NEW: what was fixed vs deferred
├── 04-FEATURE-COMPLETENESS.md     ← enhanced: what was completed this session
├── 05-TEST-GENERATION.md          ← NEW: tests written, coverage delta
├── 06-SECURITY-AND-QUALITY.md
├── SPRINT_PLAN.md
└── TODO_YYYY-MM-DD.md
```

---

## Execution Process

### Phase 0: Stack Detection

Identify tooling before running any commands — the right commands depend on the stack:

```bash
# Detect monorepo vs standalone
ls nx.json 2>/dev/null && echo "nx" || echo "standalone"
ls package.json | head -1 && cat package.json | python3 -c "
import json,sys; d=json.load(sys.stdin)
deps={**d.get('dependencies',{}),**d.get('devDependencies',{})}
print('vitest' if 'vitest' in deps else 'jest')
print('trpc' if '@trpc/server' in deps else 'nestjs' if '@nestjs/core' in deps else 'other')
print('drizzle' if 'drizzle-orm' in deps else 'prisma' if '@prisma/client' in deps else 'typeorm' if 'typeorm' in deps else 'other')
print('nextjs' if 'next' in deps else 'other')
"
```

Record: `runner` (nx|standalone), `test_runner` (vitest|jest), `api_pattern` (trpc|nestjs|other), `orm` (drizzle|prisma|typeorm|other), `frontend` (nextjs|other).

Use this to branch all subsequent commands:

| Stack | typecheck | test | find services | find controllers |
|-------|-----------|------|---------------|-----------------|
| NX monorepo | `npx nx typecheck api && npx nx typecheck web` | `npx nx test api && npx nx test web` | `apps/api/src/**/*.service.ts` | `apps/api/src/**/*.controller.ts` |
| Standalone Next.js | `npx tsc --noEmit` | `npm run test` (vitest) or `npx jest` | `src/server/routers/*.ts` (tRPC) or `src/**/*.service.ts` | N/A — use router files |
| Standalone non-NX Node | `npx tsc --noEmit` | `npm test` | `src/**/*.service.ts` | `src/**/*.controller.ts` |

---

### Phase 0.5: Data-Tier Audit

**Run `/code-review-data-tiers` before touching any code.** This catches schema drift that TypeScript will not — wrong column names in raw SQL, missing tables, Drizzle `.values()` key mismatches — before they become production bugs.

Detect schema source and run:

```bash
# Drizzle (Next.js + Supabase pattern)
if ls src/lib/db/schema.ts 2>/dev/null; then
  python3 /Users/admin/dev2/Scripts/data-tier-audit.py \
    --drizzle src/lib/db/schema.ts \
    --project src \
    --frontend src/app \
    --db-type postgres --no-live-db \
    --output code-review/$(date +%F)/00-DATA-TIER-AUDIT.md
fi

# Prisma
if ls prisma/schema.prisma 2>/dev/null; then
  python3 /Users/admin/dev2/Scripts/data-tier-audit.py \
    --prisma prisma/schema.prisma \
    --project src \
    --frontend src/app \
    --db-type postgres --no-live-db \
    --output code-review/$(date +%F)/00-DATA-TIER-AUDIT.md
fi

# NX monorepo — TypeORM entities
if ls apps/api/src/database/entities 2>/dev/null; then
  python3 /Users/admin/dev2/Scripts/data-tier-audit.py \
    --typeorm apps/api/src/database/entities \
    --migrations apps/api/src/database/migrations \
    --project apps/api/src \
    --frontend apps/web/src \
    --db-type postgres --no-live-db \
    --output code-review/$(date +%F)/00-DATA-TIER-AUDIT.md
fi
```

**If CRITICAL findings exist → fix them before proceeding.** Data-tier issues are always the highest priority because they cause silent data loss or 500 errors with no TypeScript warning.

Add `00-DATA-TIER-AUDIT.md` to the review directory and include a summary line in the executive summary.

---

### Phase 1: Anchor + TypeScript Baseline (parallel)

Run both in parallel:

```bash
# 1a: Find prior review
ls -td code-review/20*/ 2>/dev/null | head -5
ls -t code-review/*/TODO_*.md 2>/dev/null | head -1

# 1b: TypeScript error baseline — branch on stack
# NX monorepo:
npx nx typecheck api 2>&1 | tail -40
npx nx typecheck web 2>&1 | tail -60
# Standalone Next.js / Node:
npx tsc --noEmit 2>&1 | tail -60
```

Parse tsc output. Record:
- Total error count (api + web separately for NX; single count for standalone)
- Error file:line locations
- Error categories: `implicit any`, `null/undefined unsafe`, `missing property`, `type mismatch`, `unused variable`, `missing return type`, other

Write to `/tmp/ts_errors.json`:
```json
{
  "api": { "total": N, "errors": [{"file": "...", "line": N, "code": "TSxxxx", "message": "..."}] },
  "web": { "total": N, "errors": [...] }
}
```

---

### Phase 2: Tech Debt Scan

Adjust source paths based on stack detection (Phase 0):
- NX monorepo: `apps/api/src apps/web/src libs/`
- Standalone Next.js/Node: `src/`
- Use `--exclude="*.spec.ts" --exclude="*.test.ts"` for both

```bash
# TODO/FIXME/HACK in non-test source files
grep -rn "TODO\|FIXME\|HACK\|XXX\|TEMP\|NOCOMMIT" \
  <SRC_DIRS> \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
  --exclude="*.spec.ts" --exclude="*.test.ts" \
  2>/dev/null | head -80

# console.log/warn/error in production code (not tests, not logger wrappers)
grep -rn "console\.\(log\|warn\|error\|debug\)" \
  <SRC_DIRS> \
  --include="*.ts" --include="*.tsx" \
  --exclude="*.spec.ts" --exclude="*.test.ts" \
  --exclude-dir=node_modules --exclude-dir=.next \
  2>/dev/null | grep -v "// console\|Logger\|NestFactory\|ConsoleLogger\|logAndSwallow" | head -50

# Explicit `any` casts in production code
grep -rn ": any\b\|as any\b\|<any>" \
  <SRC_DIRS> \
  --include="*.ts" --include="*.tsx" \
  --exclude="*.spec.ts" --exclude="*.test.ts" \
  --exclude-dir=node_modules --exclude-dir=.next \
  2>/dev/null | grep -v "eslint-disable" | head -50

# Dead/empty catch blocks
grep -rn "catch" <SRC_DIRS> \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next -A 1 2>/dev/null \
  | grep -B1 "^--$\|{}" | head -30
```

Classify each hit:
- **Fix now** (SP ≤ 2): simple removal, replacement, or type annotation
- **Sprint 1** (SP 3–5): requires understanding context before fixing
- **Backlog** (SP > 5 or architectural): too large for this session

---

### Phase 3: Feature Completeness Scan

```bash
# Backend endpoints — what exists
grep -rn "@Get\|@Post\|@Patch\|@Delete\|@Put" \
  apps/api/src --include="*.controller.ts" \
  --exclude-dir=node_modules 2>/dev/null \
  | grep -oP "(?<=@(Get|Post|Patch|Delete|Put)\(')[^']*" \
  | sort > /tmp/api_routes.txt

# Frontend pages and API calls — what's wired up
find apps/web/src/app -name "page.tsx" | sort > /tmp/web_pages.txt
grep -rn "api\." apps/web/src/app --include="*.tsx" --include="*.ts" \
  --exclude-dir=node_modules 2>/dev/null | grep -oP "\bapi\.\w+" | sort | uniq > /tmp/web_api_calls.txt

# Services without frontend counterparts — grep for service methods not called from web
grep -rn "async \w\+(" apps/api/src --include="*.service.ts" \
  --exclude-dir=node_modules 2>/dev/null | grep -oP "async \K\w+" | sort > /tmp/api_methods.txt

cat /tmp/api_routes.txt
echo "---"
cat /tmp/web_pages.txt
```

Also read:
- `docs/DEMO-GUIDE.md` (what the product should demonstrate)
- `docs/ROADMAP-*.md` (latest, for committed scope)
- Open issues with `area:frontend` or `area:backend` labels:
  ```bash
  gh issue list --label "area:frontend" --state open --json number,title --limit 20
  gh issue list --label "area:backend" --state open --json number,title --limit 20
  ```

For each feature gap, classify:
- `IMPLEMENT` — clear enough to implement this session (SP ≤ 5)
- `DESIGN NEEDED` — needs architecture discussion (SP > 5)
- `EXTERNAL DEPENDENCY` — blocked on third-party API, credentials, etc.

---

### Phase 4: Test Coverage Scan

Branch on stack (Phase 0):

**NX monorepo (Jest):**
```bash
find apps/api/src -name "*.service.ts" -not -path "*/node_modules/*" | while read f; do
    spec="${f%.service.ts}.service.spec.ts"
    [ ! -f "$spec" ] && echo "MISSING: $f"
done
find apps/api/src -name "*.controller.ts" -not -path "*/node_modules/*" | while read f; do
    spec="${f%.controller.ts}.controller.spec.ts"
    [ ! -f "$spec" ] && echo "MISSING: $f"
done
# Baseline
npx nx test api --passWithNoTests 2>&1 | grep -E "Tests:|Test Suites:|PASS|FAIL" | tail -10
npx nx test web --passWithNoTests 2>&1 | grep -E "Tests:|Test Suites:|PASS|FAIL" | tail -10
```

**Standalone Next.js + tRPC (Vitest):**
```bash
# tRPC routers without a test file
find src/server/routers -name "*.ts" \
  -not -name "_app.ts" -not -path "*/__tests__/*" -not -path "*/node_modules/*" | while read f; do
    router=$(basename "$f" .ts)
    [ ! -f "src/server/routers/__tests__/${router}.test.ts" ] && echo "MISSING router test: $f"
done

# lib modules without a test
find src/lib -name "*.ts" \
  -not -path "*/__tests__/*" -not -path "*/node_modules/*" | while read f; do
    dir=$(dirname "$f"); base=$(basename "$f" .ts)
    [ ! -f "${dir}/__tests__/${base}.test.ts" ] && echo "MISSING lib test: $f"
done

# E2E coverage gaps (Playwright)
find e2e -name "*.test.ts" 2>/dev/null | sort
find src/app/api -name "route.ts" | while read f; do
    route=$(echo "$f" | sed 's|src/app/api/||;s|/route.ts||')
    echo "API route: $route — check e2e coverage"
done

# Baseline
npm run test 2>&1 | tail -15
```

For each missing spec file, classify:
- `WRITE NOW` — service is small (< 150 LOC) and self-contained; write this session
- `WRITE SPRINT 1` — service is critical (auth, payments, bookings) but complex; write next sprint
- `BACKLOG` — utility or helper; low risk

---

### Phase 5: Delta from Prior Review (same as v2 Phase 1–3)

Find and read the most recent prior code-review. Mark each prior open item:
- `RESOLVED` / `CARRYOVER` / `PARTIAL` / `SUPERSEDED`

---

### Phase 6: REMEDIATE — Fix Type Errors

Fix TypeScript errors in priority order:
1. **Errors that break CI** — any `error TS` output from `npx nx typecheck`
2. **Unsafe null access** — `TS2531`, `TS18048`
3. **Implicit any** — `TS7006`, `TS7005`
4. **Missing properties** — `TS2339`, `TS2345`

**For each fixable error (SP ≤ 2):**
- Read the file containing the error
- Apply the minimal fix (add type annotation, null guard, proper type cast)
- Do NOT change business logic — type-only fixes
- Stage the change

**For errors requiring larger refactoring (SP > 2):**
- Document in `02-TYPESCRIPT-ERRORS.md` under "Deferred"
- Note the specific refactor needed

After all type fixes:
```bash
npx nx typecheck api 2>&1 | tail -10
npx nx typecheck web 2>&1 | tail -10
```

Record: before/after error counts.

---

### Phase 7: REMEDIATE — Tech Debt

For each "Fix now" tech debt item from Phase 2:

**console.log removal:**
```typescript
// Replace bare console.log with Logger or remove
// In NestJS services: this.logger.log(...) or this.logger.debug(...)
// In Next.js: remove entirely or use structured logging
```

**TODO/FIXME with trivial fix:**
- If the TODO describes something that's now implemented, remove the comment
- If the TODO describes a 1-liner fix, implement it and remove the comment
- If the TODO requires significant work, convert to a GitHub issue and remove the inline comment

**`any` cast replacement:**
- Add proper type or interface definition
- Use `unknown` + type guard instead of `any` where appropriate
- For third-party types, use the library's exported types

**Empty catch blocks:**
```typescript
// Bare: catch (e) {}
// Fix: catch (e) { this.logger.warn('Context message', e); }
// Or: catch { /* intentionally swallowed — reason: ... */ }
```

After tech debt fixes, document in `03-TECH-DEBT-REMEDIATION.md`:
- Items fixed (with file:line)
- Items deferred (with reason)
- TODOs converted to issues (with issue numbers)

---

### Phase 8: REMEDIATE — Generate Missing Tests

For each `WRITE NOW` module from Phase 4, write the spec file.

Use the right test structure for the detected stack:

**NestJS service (Jest):**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { <ServiceName> } from './<service-name>.service';

describe('<ServiceName>', () => {
  let service: <ServiceName>;
  const mockRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn(), create: jest.fn(), delete: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [<ServiceName>, { provide: getRepositoryToken(<Entity>), useValue: mockRepo }],
    }).compile();
    service = module.get<ServiceName>(<ServiceName>);
    jest.clearAllMocks();
  });

  it('returns expected when condition', async () => {
    mockRepo.findOne.mockResolvedValue(<fixture>);
    expect(await service.<method>(<args>)).<matcher>;
  });
  it('throws NotFoundException when not found', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    await expect(service.<method>(<args>)).rejects.toThrow(NotFoundException);
  });
});
```

**tRPC router (Vitest + createCaller pattern — Next.js / LaptopReturn stack):**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '@trpc/server';
import { <routerName>Router } from '../<router-name>';

// Mock the DB
vi.mock('@/lib/db', () => ({
  db: {
    query: { <table>: { findFirst: vi.fn(), findMany: vi.fn() } },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  },
}));

const createCaller = createCallerFactory(<routerName>Router);

function makeCtx(overrides = {}) {
  return {
    db: (await import('@/lib/db')).db,
    session: { userId: 'user-1', organizationId: 'org-1', role: 'admin' as const },
    ...overrides,
  };
}

describe('<routerName>Router', () => {
  beforeEach(() => vi.clearAllMocks());

  it('<procedure> happy path', async () => {
    const { db } = await import('@/lib/db');
    (db.query.<table>.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(<fixture>);
    const caller = createCaller(makeCtx());
    const result = await caller.<procedure>(<input>);
    expect(result).<matcher>;
  });

  it('<procedure> throws UNAUTHORIZED when not authenticated', async () => {
    const caller = createCaller(makeCtx({ session: null }));
    await expect(caller.<procedure>(<input>)).rejects.toThrow('UNAUTHORIZED');
  });

  it('<procedure> throws NOT_FOUND when record missing', async () => {
    const { db } = await import('@/lib/db');
    (db.query.<table>.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(caller.<procedure>(<input>)).rejects.toThrow('NOT_FOUND');
  });
});
```

**lib utility (Vitest):**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { <functionName> } from '../<module>';

describe('<functionName>', () => {
  it('returns expected for valid input', () => {
    expect(<functionName>(<validInput>)).toEqual(<expected>);
  });
  it('throws for invalid input', () => {
    expect(() => <functionName>(<badInput>)).toThrow();
  });
});
```

**Drizzle integration test (Vitest + real DB, skip if no TEST_DATABASE_URL):**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const hasTestDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasTestDb)('<feature> integration', () => {
  let db: Database;
  beforeAll(async () => { db = await getTestDb(); });
  afterAll(async () => { await cleanupTestDb(); });

  it('persists and retrieves correctly', async () => {
    await db.insert(<table>).values(<fixture>);
    const result = await db.query.<table>.findFirst({ where: eq(<table>.id, <fixture>.id) });
    expect(result).<matcher>;
  });
});
```

For each test written:
- Aim for ≥ 3 test cases per procedure/function (happy path, not-found, unauthorized/error)
- Cover the most critical paths (credit mutations, address changes, webhook processing)
- After writing: `npx vitest run <path>` (Vitest) or `npx nx test api -- --testPathPatterns=<name>` (Jest) to confirm passing

---

### Phase 9: IMPLEMENT — Feature Completion

For each `IMPLEMENT` feature gap from Phase 3 (SP ≤ 5), implement the missing side.

**Priority order:**
1. Missing frontend for existing API endpoint (higher visibility)
2. Missing API endpoint for existing frontend route (causes 404/500 in production)
3. Missing wiring (service method exists, not called from controller)

**Implementation rules:**
- Follow existing module patterns exactly (same file structure, same import style)
- Match UI patterns: Mantine components, same spacing/color tokens as adjacent pages
- Always add `isApiReady` guard on authenticated calls
- Add `@ApiProperty()` decorators to any new DTOs; regenerate api-types if controller changes
- Write tests alongside any new service logic (use WRITE NOW threshold: SP ≤ 2)

After each implementation, run:
```bash
npx nx build web 2>&1 | grep -E "error|Error" | head -20
```

---

### Phase 10: Write Review Documents

Write in order:

#### 02-TYPESCRIPT-ERRORS.md
```markdown
# TypeScript Error Report — YYYY-MM-DD

## Before / After
| App | Before | After | Fixed | Deferred |
|-----|--------|-------|-------|---------|
| API | N | N | N | N |
| Web | N | N | N | N |

## Fixed This Session
| File:Line | Error | Fix Applied |
|-----------|-------|------------|

## Deferred (SP > 2)
| File:Line | Error | Why Deferred | Estimated Fix |
```

#### 03-TECH-DEBT-REMEDIATION.md
```markdown
# Tech Debt Remediation — YYYY-MM-DD

## Summary
- console.log removed: N
- TODOs resolved: N (N implemented, N converted to issues)
- `any` casts replaced: N
- Empty catches hardened: N
- Deferred: N items

## Fixed
| File:Line | Pattern | Resolution |

## Converted to GitHub Issues
| Issue # | Title | Original TODO location |

## Deferred
| File:Line | Pattern | Reason | Sprint |
```

#### 04-FEATURE-COMPLETENESS.md (enhanced)
```markdown
# Feature Completeness — YYYY-MM-DD

## Completed This Session
| Feature | What Was Missing | What Was Added | PR |

## Still Incomplete
| Feature | Backend | Frontend | Tests | Gap | Priority |

## Design Needed (not implemented)
| Feature | Missing Side | Why Deferred |
```

#### 05-TEST-GENERATION.md
```markdown
# Test Generation Report — YYYY-MM-DD

## Coverage Delta
| App | Before (suites) | After (suites) | New Tests Added |
|-----|-----------------|----------------|-----------------|

## Tests Written This Session
| File | Tests Added | Methods Covered | Pass/Fail |

## Still Uncovered (deferred)
| Module | Reason | Sprint |
```

#### 06-SECURITY-AND-QUALITY.md
Same content as v2's `02-SECURITY-AND-QUALITY.md`. Focus on changed/new code since prior review.

#### 01-DELTA-REVIEW.md
Same as v2. Include v3-specific delta: TS errors fixed, debt removed, tests added.

#### SPRINT_PLAN.md
Same structure as v2 but:
- Sprint 1 only contains items NOT fixed this session (already fixed = done)
- Each sprint item references whether tests are included in its SP estimate
- Tech debt and type errors fixed this session are listed under "Completed" header at top

#### TODO_YYYY-MM-DD.md
Same TOON format as v2, plus:
```
## Completed This Session (v3 Remediation)
- [x] Fixed N TypeScript errors (api: N, web: N)
- [x] Removed N console.log statements
- [x] Resolved N TODOs (N implemented, N → issues)
- [x] Replaced N `any` casts
- [x] Added N test suites (N new tests)
- [x] Implemented N feature gaps
```

---

### Phase 11: Create PRs

Group all code changes into ≤ 3 PRs:

**PR 1: `fix/type-errors-tech-debt-YYYYMMDD`**
- All TypeScript error fixes
- Tech debt removals (console.log, TODO cleanup, any casts)
- No new features, no new tests

**PR 2: `test/coverage-YYYYMMDD`**
- All new test files
- No production code changes

**PR 3: `feat/feature-completion-YYYYMMDD`** (if any features implemented)
- New frontend/backend for identified gaps
- Tests for the new code

Each PR:
```bash
git checkout -b <branch>
git add <specific files>
git commit -m "fix(type-safety): eliminate TS errors and tech debt

- Fixed N TypeScript errors (api: N, web: N)
- Removed N console.log statements
- Converted N TODOs to issues (#NNN, #NNN)
- Replaced N explicit any casts

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

gh pr create \
  --title "fix(type-safety): eliminate TS errors and tech debt — <date>" \
  --body "..." \
  --assignee dbbuilder \
  --reviewer octavianorg \
  --base staging
```

---

### Phase 12: Commit Review Docs + Report

```bash
git add code-review/YYYY-MM-DD/
git commit -m "docs: code-review-v3 YYYY-MM-DD — <rating change>

TS errors: N→N | Tech debt: N fixed | Tests: +N suites | Features: N completed
PRs: #NNN (type-safety), #NNN (tests), #NNN (features)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Report format:
```
Code Review V3 complete.

Rating: PRIOR → THIS

Remediation summary:
  TypeScript errors: N → N (fixed N, deferred N)
  Tech debt: N items fixed (N TODOs, N console.logs, N any-casts)
  Tests added: N suites, N new tests
  Features completed: N

Since last review:
  ✅ N resolved  |  🆕 N new  |  ↩️ N carried over

PRs opened:
  #NNN fix/type-errors-tech-debt
  #NNN test/coverage
  #NNN feat/feature-completion (if applicable)

Key files:
  code-review/YYYY-MM-DD/SPRINT_PLAN.md
  code-review/YYYY-MM-DD/TODO_YYYY-MM-DD.md
```

---

## Rules

All v2 rules apply, plus:

1. **Fix before documenting.** Don't write a finding and leave it unfixed if SP ≤ 2.
2. **Type-only changes.** When fixing TS errors, never change business logic. Type annotations only.
3. **Tests must pass before committing.** Run `npx nx test` after writing each test file.
4. **Minimum 3 tests per new spec file.** Happy path + not-found + error case.
5. **No gold-plating.** Fix what's broken, don't refactor what works. Fix → move on.
6. **Convert TODOs, don't delete them.** If a TODO describes real work, open a GitHub issue first, then replace with `// see #NNN`. Don't silently erase valid debt.
7. **api-types must stay in sync.** Any new controller endpoint → regenerate `api-types.ts` in the same PR.
8. **3 PRs max.** Type+debt in one, tests in one, features in one. Never mix categories.
9. **Document deferred items.** Anything SP > 2 that wasn't fixed goes into the sprint plan, not dropped.
10. **Update MEMORY.md.** After the session: test counts, TS error counts, and sprint plan pointer.

## When to Use Which Review Skill

| Need | Skill |
|------|-------|
| First review of a new project | `/code-review` |
| Continuing from last review, sprint planning only | `/code-review-v2` |
| Fix type errors + tech debt + tests + features | `/code-review-v3` ← this |
| Quick sanity check | `/code-review-quick` |
| Pick up next item from existing action plan | `/code-review-proceed` |
