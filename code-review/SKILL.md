---
name: code-review
description: Perform a comprehensive code review of the current project. This skill should be used when the user asks to "review the codebase", "code review", "audit the code", "review code quality", or wants a full project assessment. Generates a multi-document review package covering security, architecture, code quality, testing, deployment, tech debt, and strengths. Output is saved to code-review/<date>/ in the project root.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
---

# Code Review Skill

Perform a comprehensive, structured code review of any codebase and produce a multi-document review package in `code-review/<YYYY-MM-DD>/`.

## Trigger Phrases

- "code review", "review the codebase", "audit the code"
- "review code quality", "full project assessment"
- "security review", "architecture review"

## Output Structure

All output goes to `code-review/<YYYY-MM-DD>/` relative to the project root:

```
code-review/YYYY-MM-DD/
├── 00-EXECUTIVE-SUMMARY.md
├── 01-SECURITY-REVIEW.md
├── 02-ARCHITECTURE-REVIEW.md
├── 03-CODE-QUALITY-REVIEW.md
├── 04-TESTING-REVIEW.md
├── 05-DEPLOYMENT-INFRA-REVIEW.md
├── 06-TECHNICAL-DEBT-BACKLOG.md
├── 07-STRENGTHS-AND-COMMENDATIONS.md
├── 08-UI-UX-REVIEW.md
├── 09-FEATURE-COMPLETENESS.md
├── APPENDIX-A-FILE-INVENTORY.md
├── APPENDIX-B-NPM-AUDIT.md (or APPENDIX-B-DEPENDENCY-AUDIT.md)
└── TODO_YYYY-MM-DD.md          ← TOON-optimized action plan
```

## Execution Process

### Phase 1: Discovery (Do This First)

Before writing any documents, thoroughly explore the codebase:

1. **Identify the tech stack** - Read `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Gemfile`, or equivalent. Read the main config files.
2. **Map the project structure** - Glob for source files, understand the directory layout, identify frameworks and patterns.
3. **Read key files** - Entry points, configuration, database schemas, CI/CD configs, deployment manifests, environment files.
4. **Count metrics** - Total source files, lines of code, test files, test counts, number of modules/components.
5. **Run diagnostics** - If applicable: `npm audit`, type checking output, lint output, test results.

Capture all discovery findings before proceeding to Phase 2.

### Phase 2: Deep Analysis (Serial, Context-Managed)

Write each document **one at a time** in the order listed below. Do NOT launch parallel agents — run each document in the main context to preserve findings and avoid context loss between documents.

**Document order:**
1. APPENDIX-A-FILE-INVENTORY.md — establish project metrics and key file list
2. APPENDIX-B-NPM-AUDIT.md — run audit, capture raw output
3. 01-SECURITY-REVIEW.md
4. 02-ARCHITECTURE-REVIEW.md
5. 03-CODE-QUALITY-REVIEW.md
6. 04-TESTING-REVIEW.md
7. 05-DEPLOYMENT-INFRA-REVIEW.md
8. 07-STRENGTHS-AND-COMMENDATIONS.md
9. 08-UI-UX-REVIEW.md
10. 09-FEATURE-COMPLETENESS.md
11. 06-TECHNICAL-DEBT-BACKLOG.md — consolidate findings from all documents above

**Context management rules:**
- After writing each document, record a 1-2 line finding summary in a running mental tally (counts per severity) before moving to the next document.
- Before writing 06-TECHNICAL-DEBT-BACKLOG.md, re-read all completed documents to extract every finding ID. Do not rely on memory alone.
- Keep each document write focused: read only the source files needed for that domain (security reads auth/config files; architecture reads module/service files; etc.).
- If context is getting long, write the current document to disk before reading more source files — don't hold large file contents and draft output simultaneously.

Every finding MUST include:
- Specific file paths and line numbers
- Actual code snippets from the source
- Severity rating (CRITICAL / HIGH / MEDIUM / LOW)
- Concrete recommendation with effort estimate

### Phase 3: Synthesis

Write the executive summary (00-EXECUTIVE-SUMMARY.md) last, after all other documents are complete. Re-read 06-TECHNICAL-DEBT-BACKLOG.md to pull accurate counts. Cross-reference findings across documents. Produce the final summary table.

### Phase 4: Distillation (Action Plan)

Create `TODO_YYYY-MM-DD.md` in TOON format - a token-optimized action plan that can be loaded into future sessions without loading the full review documents.

**TOON Format Rules:**
- No prose sentences - bullets and tables only
- Inline code paths, no separate code blocks
- Pipe-separated values for related items
- No "why" explanations - just "what" and "how"
- Priority tiers with SP estimates on same line
- Checkboxes for actionable items

---

## Document Specifications

### 00-EXECUTIVE-SUMMARY.md

```markdown
# Code Review: <Project Name>

| Field | Value |
|-------|-------|
| Date | YYYY-MM-DD |
| Reviewer | Chris Therriault |
| Repository | <repo-url or path> |
| Branch | <branch> |
| Commit | <short-sha> |

## Overall Rating: <GREEN / YELLOW / RED>

- **GREEN** = Production-ready with minor polish
- **YELLOW** = Solid foundation, needs targeted fixes before production
- **RED** = Significant issues must be resolved before production

## Summary

<2-3 paragraph executive overview>

## Findings by Severity

| Priority | Count | Story Points |
|----------|-------|-------------|
| CRITICAL | N | N SP |
| HIGH | N | N SP |
| MEDIUM | N | N SP |
| LOW | N | N SP |
| **Total** | **N** | **N SP** |

## Critical Items (Must-Fix)

<Numbered list of CRITICAL findings with document cross-references>

## Document Index

| # | Document | Findings | Rating |
|---|----------|----------|--------|
| 01 | Security Review | N findings | RED/YELLOW/GREEN |
| 02 | Architecture Review | N findings | ... |
| ... | ... | ... | ... |
```

### 01-SECURITY-REVIEW.md

Review for OWASP Top 10, secrets exposure, auth/authz gaps, input validation, injection risks, dependency vulnerabilities, infrastructure security.

**Finding format:**
```markdown
### SEC-NNN: <Title>

| Field | Value |
|-------|-------|
| Severity | CRITICAL / HIGH / MEDIUM / LOW |
| CWE | CWE-XXX |
| Location | `path/to/file.ts:LINE` |
| Status | Open |
| Effort | N SP |

**Code:**
\`\`\`typescript
// Actual code from the file
\`\`\`

**Risk:** <What can go wrong>

**Recommendation:** <Specific fix with code example>
```

### 02-ARCHITECTURE-REVIEW.md

Review module boundaries, dependency direction, separation of concerns, API design, database design, scalability patterns, error handling strategy, configuration management.

Finding IDs: `ARCH-NNN`

### 03-CODE-QUALITY-REVIEW.md

Review type safety (any/unknown usage, missing types), code duplication, naming conventions, dead code, error handling consistency, linting compliance, documentation quality.

Finding IDs: `CQ-NNN`

### 04-TESTING-REVIEW.md

Review test coverage metrics, test distribution (unit/integration/e2e), missing test areas, test quality (assertions, edge cases), CI test pipeline, mocking strategy.

Finding IDs: `TST-NNN`

### 05-DEPLOYMENT-INFRA-REVIEW.md

Review deployment configuration, environment management, CI/CD pipeline, infrastructure security, scaling configuration, monitoring/alerting, backup strategy.

Finding IDs: `INFRA-NNN`

### 06-TECHNICAL-DEBT-BACKLOG.md

Consolidate ALL findings from documents 01-05 plus 08-09 into a prioritized, ticket-ready backlog. Each item gets:

```markdown
### TD-NNN: <Title>

| Field | Value |
|-------|-------|
| Priority | CRITICAL / HIGH / MEDIUM / LOW |
| Story Points | N |
| Type | Security / Quality / Testing / Infra / UX / Feature |
| Source | SEC-001, ARCH-003 (cross-references) |
| Files | `path/to/file.ts` |

**Description:** <Actionable task description>

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
```

Group by priority tier. Include sprint allocation guidance.

### 07-STRENGTHS-AND-COMMENDATIONS.md

Identify 8-12 things the codebase does well. Pattern quality, good abstractions, test coverage wins, security foundations, documentation, developer experience.

Finding IDs: `S-NN`

### 08-UI-UX-REVIEW.md

Review frontend components for:
- Accessibility (ARIA, keyboard navigation, screen reader support)
- Responsive design and mobile support
- Loading states, error states, empty states
- Form validation and user feedback
- Navigation consistency
- Design system usage and consistency
- Performance (bundle size, lazy loading, image optimization)

Finding IDs: `UX-NNN`

If no frontend exists, note this and skip.

### 09-FEATURE-COMPLETENESS.md

Review the codebase for:
- TODO/FIXME/HACK comments and their implications
- Stub implementations or placeholder code
- Incomplete CRUD operations (create without delete, etc.)
- Missing error handling paths
- Unimplemented routes or endpoints
- Feature flags referencing unreleased features
- Database columns/tables not used by any code
- API endpoints without corresponding frontend calls (and vice versa)

Finding IDs: `FC-NNN`

### APPENDIX-A-FILE-INVENTORY.md

- Project statistics (file counts, LOC, models, modules, components, tests)
- Technology stack with versions
- Key file paths organized by category
- Database schema summary

### APPENDIX-B-NPM-AUDIT.md (or DEPENDENCY-AUDIT.md)

- Full dependency audit output
- Vulnerability details with advisory links
- Remediation recommendations
- Raw audit output as code block

### TODO_YYYY-MM-DD.md (TOON Format Action Plan)

Token-optimized distillation of all findings into an actionable checklist. Load this file in future sessions instead of full review docs.

```markdown
# TODO: <Project> Code Review Actions
Date: YYYY-MM-DD | Rating: RED/YELLOW/GREEN | Debt: N SP

## Sprint 1: Critical (N SP)
- [ ] **TD-001** (5 SP): Rotate DB creds | `appsettings.json:15` | SEC-001
- [ ] **TD-002** (3 SP): Gate MockAuthController | `Controllers/MockAuthController.cs` | SEC-003

## Sprint 2: Security (N SP)
- [ ] **TD-010** (8 SP): Re-enable rate limiting | `Program.cs:220` | INFRA-006

## Sprint 3+: Quality (N SP)
- [ ] **TD-020** (5 SP): Fix type safety | 32 files, 88 `as any` | CQ-002

## Backlog
| ID | SP | Title | Files |
|----|-----|-------|-------|
| TD-030 | 2 | Fix naming | `services/*.ts` |

## Quick Ref
- Critical: N items, N SP
- High: N items, N SP
- Docs: `code-review/YYYY-MM-DD/`
```

**TOON Rules Applied:**
- One line per item: checkbox + ID + SP + title + path + source ref
- Sprint grouping by priority tier
- Backlog as compact table
- Quick reference stats at bottom
- No prose, no explanations, no code examples

---

## Severity Rating System

| Level | Definition | Response |
|-------|-----------|----------|
| CRITICAL | Exploitable vulnerability or data loss risk | Fix before any deployment |
| HIGH | Significant risk or major quality issue | Fix within current sprint |
| MEDIUM | Moderate risk or notable improvement needed | Schedule within 2 sprints |
| LOW | Minor improvement or best practice gap | Address when convenient |

## Story Point Scale

| SP | Scope |
|----|-------|
| 0.5 | Config change, one-liner |
| 1 | Single file, < 30 min |
| 2 | 2-3 files, < 2 hours |
| 3 | Small feature or multi-file refactor, < 1 day |
| 5 | Cross-cutting change, 1-2 days |
| 8 | Large feature or architectural change, 3-5 days |
| 13 | Epic-level effort, 1-2 weeks |

## Rules

1. **Every finding must cite a specific file and line number.** No vague observations.
2. **Every code snippet must be copied from the actual source.** Never fabricate code.
3. **Read before you write.** Do not review files you haven't read.
4. **Cross-reference between documents.** Security issues in 01 should appear as tickets in 06.
5. **Be constructive.** Pair every criticism with a specific, actionable recommendation.
6. **Strengths matter.** Document what works well to preserve good patterns during refactoring.
7. **Use the project's conventions.** Recommendations should match the existing style.
8. **Date format:** Always YYYY-MM-DD for the directory name and document headers.
