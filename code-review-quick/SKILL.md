---
name: code-review-quick
description: Fast code review that produces a single TOON-format action plan covering security, feature completeness, test coverage, technical debt, UI/UX, and type-safety. Use when the user wants a "quick review", "fast audit", "quick code check", or needs a lightweight assessment without full documentation. Outputs a single TODO file to code-review/<date>/. For comprehensive reviews with full documentation, use /code-review instead.
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Task
---

# Code Review Quick

Lightweight code review producing a single TOON-format action plan. Descendant of `/code-review` - same analysis methodology, minimal output.

## Trigger Phrases

- "quick review", "fast audit", "quick code check"
- "lightweight review", "rapid assessment"
- "just give me the action items"

## Output

Single file: `code-review/<YYYY-MM-DD>/TODO_<YYYY-MM-DD>.md`

## Review Categories (All Required)

| Category | Focus Areas |
|----------|-------------|
| Security | Creds, auth bypass, injection, disabled features |
| Feature Completeness | Stubs, TODOs, placeholder code, unimplemented APIs |
| Test Coverage | CI execution, untested controllers, coverage gaps |
| Technical Debt | Dead code, architecture violations, naming |
| UI/UX | Accessibility, error states, loading states, responsive |
| Type Safety | `as any`, nullable, strict mode, untyped returns |

---

## Process

### Step 1: Discovery (5 min)

```bash
# Stack + counts
ls package.json *.csproj requirements.txt 2>/dev/null
find . -name "*.ts" -o -name "*.cs" -o -name "*.vue" 2>/dev/null | wc -l

# Config + CI
ls .env* appsettings* .github/workflows/ 2>/dev/null
```

### Step 2: Security Scan (5 min)

| Pattern | Risk |
|---------|------|
| `password=` `secret=` `api_key=` in config | Credential exposure |
| `[AllowAnonymous]` `@Public` without gate | Auth bypass |
| `continue-on-error` in CI | Pipeline safety |
| `TEMP DISABLED` `SKIP` | Deferred security |
| Missing rate limiting, HTTPS, headers | API hardening gaps |

### Step 3: Feature Completeness Scan (5 min)

| Pattern | Risk |
|---------|------|
| `TODO:` `FIXME:` `HACK:` | Incomplete work |
| `throw new Error('not implemented')` | Stub code |
| `return null as any` `return {} as any` | Placeholder returns |
| `console.warn('...not implemented')` | Frontend stubs |
| Mock/placeholder in service names | Fake implementations |

### Step 4: Test Coverage Scan (5 min)

| Check | Issue |
|-------|-------|
| CI workflow test steps | Are they echo-only or real? |
| Controllers without test files | Coverage gaps |
| Test files that import stubs | False confidence |
| E2E/Playwright configs | Are they wired to CI? |
| `skip_tests` flags in CI | Bypassed validation |

### Step 5: Technical Debt Scan (5 min)

| Pattern | Debt Type |
|---------|-----------|
| Layer violations (Infra→App) | Architecture |
| Dead EF/unused packages | Dead code |
| `NoWarn` in csproj | Suppressed warnings |
| Duplicate files (.disabled, .bak, .old) | Clutter |
| Mixed naming (camelCase/PascalCase) | Consistency |
| 20+ files with same pattern | Duplication |

### Step 6: UI/UX Scan (3 min)

| Pattern | Issue |
|---------|-------|
| Missing loading/error/empty states | UX gaps |
| No aria-* attributes | Accessibility |
| Hardcoded colors/sizes (no tokens) | Design system |
| `display: none` + `loading="lazy"` | Performance bug |
| Missing form validation feedback | User experience |

### Step 7: Type Safety Scan (3 min)

| Pattern | Risk |
|---------|------|
| `as any` count | Type erosion |
| `// @ts-ignore` `// @ts-expect-error` | Suppressed errors |
| `return null as any` | Null safety bypass |
| `NoWarn` CS8600-CS8625 | Nullable disabled |
| Missing return types on functions | Implicit any |

### Step 8: Generate TODO (5 min)

Consolidate all findings into single TOON-format file.

---

## TOON Format Template

```markdown
# TODO: <Project> Quick Review
Date: YYYY-MM-DD | Rating: RED/YELLOW/GREEN | Debt: ~N SP | Items: N

---

## SECURITY (N SP)
- [ ] **SEC-01** (N SP): <Issue> | `path:line`
- [ ] **SEC-02** (N SP): <Issue> | `path:line`

## FEATURE COMPLETENESS (N SP)
- [ ] **FC-01** (N SP): <Issue> | `path:line`
- [ ] **FC-02** (N SP): <Issue> | `path:line`

## TEST COVERAGE (N SP)
- [ ] **TST-01** (N SP): <Issue> | `path:line`

## TECHNICAL DEBT (N SP)
- [ ] **DEBT-01** (N SP): <Issue> | `path:line`

## UI/UX (N SP)
- [ ] **UX-01** (N SP): <Issue> | `path:line`

## TYPE SAFETY (N SP)
- [ ] **TS-01** (N SP): <Issue> | `path:line`

---

## QUICK REF
| Category | Items | SP |
|----------|-------|-----|
| Security | N | N |
| Features | N | N |
| Tests | N | N |
| Debt | N | N |
| UI/UX | N | N |
| Types | N | N |
| **Total** | **N** | **N** |

Full review: `/code-review` for 12-document package
```

---

## Severity Criteria

| Level | Definition | Examples |
|-------|-----------|----------|
| CRITICAL | Exploitable now or data loss | Creds in repo, auth bypass, no tests in CI, stub payments |
| HIGH | Significant risk | Type safety gaps, disabled security, unimplemented features |
| MEDIUM | Should fix eventually | Naming, duplication, missing docs, console.logs |
| LOW | Polish | Comments, emojis in logs, minor UX |

## SP Estimates

| SP | Scope |
|----|-------|
| 1 | One-liner, config change |
| 2 | Single file, < 2 hours |
| 3 | 2-3 files, < 1 day |
| 5 | Cross-cutting, 1-2 days |
| 8 | Large refactor, 3-5 days |
| 13 | Epic, 1-2 weeks |

## Rules

1. **Cover all 6 categories** - Never skip a category
2. **Read before reporting** - Every finding must cite a real file/line
3. **No prose** - Bullets and tables only
4. **Inline paths** - `file:line` format, no separate code blocks
5. **Estimate everything** - Every item gets SP
6. **Prioritize ruthlessly** - Critical means "fix before deploy"
7. **~35 min total** - Quick but comprehensive
8. **Point to full review** - If issues warrant depth, recommend `/code-review`

## When to Recommend Full Review

Escalate to `/code-review` if:
- More than 5 CRITICAL findings in any category
- Security concerns need detailed documentation
- Architecture issues require diagrams/explanations
- Client/stakeholder needs formal deliverable
- Feature gaps require implementation planning
