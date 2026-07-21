---
name: spec
description: Generate a complete spec suite for a project from a description or existing codebase. Use when starting a new project, planning a significant feature, or when a project lacks base documentation. Triggered by "/spec", "write specs", "create spec suite", "generate docs for this project", or "write the base docs".
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Edit
  - Task
  - AskUserQuestion
  - ExitPlanMode
---

# /spec — Generate a Complete Spec Suite

Generate all base documentation files for a project following the ServiceVision spec standards
defined in `/Users/admin/dev2/spec-standards/`. Ask clarifying questions first, write specs,
then await approval before implementation begins.

## Trigger Phrases

- `/spec` — generate all base docs for the current project
- `write specs for [project]` — generate for a named project
- `create spec suite` — same as above
- `generate docs for this project` — same as above
- `write the base docs` — same as above
- `spec this out` — same as above

---

## What This Skill Produces

For a **new project** (no existing docs): all 7 base docs + 1 phase spec:

| File | Location | Purpose |
|------|----------|---------|
| `README.md` | project root | Entry point, quick links, quickstart |
| `REQUIREMENTS.md` | project root | Personas, FR/NFR codes, out of scope |
| `ARCHITECTURE.md` | project root | ASCII diagram, components, decisions |
| `DATAMODEL.md` | project root | Schema (DDL), entity diagram, conventions |
| `SETUP.md` | project root | Prerequisites, install steps, env vars |
| `ROADMAP.md` | project root | Phases, status, what's NOT building |
| `TODO.md` | project root | Active, near-term, backlog, completed |
| `docs/specs/PHASE-A-SPEC.md` | `docs/specs/` | First implementation phase |

For an **existing project missing docs**: audit which docs exist, generate only what's missing,
align content with the actual codebase.

For a **new phase spec only**: `docs/specs/PHASE-[X]-SPEC.md` only.

---

## Process

### Step 0: Read Standards

Before writing anything, read:

```
/Users/admin/dev2/spec-standards/CONVENTIONS.md
/Users/admin/dev2/spec-standards/TEMPLATES.md
/Users/admin/dev2/spec-standards/CHECKLIST.md
```

These define required sections, style rules, and quality gates. All generated docs must
pass the checklist before they're considered complete.

---

### Step 1: Explore (5 min)

**If a project description was provided as arguments:** use it directly. Skip to Step 2.

**If working on the current project directory:** explore the codebase to understand what exists.

```bash
# Project structure
ls -la
cat README.md 2>/dev/null || echo "no README"

# Check which base docs already exist
ls REQUIREMENTS.md ARCHITECTURE.md DATAMODEL.md SETUP.md ROADMAP.md TODO.md 2>/dev/null

# Tech stack indicators
ls package.json requirements.txt Cargo.toml go.mod pyproject.toml 2>/dev/null
cat package.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dependencies',{}))" 2>/dev/null | head -20

# Existing docs
find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" | head -20

# Existing specs
ls docs/specs/ 2>/dev/null

# CLAUDE.md for project context
cat CLAUDE.md 2>/dev/null || cat ../CLAUDE.md 2>/dev/null | head -50
```

Read any existing `REQUIREMENTS.md`, `ARCHITECTURE.md`, or `ROADMAP.md` to understand current state.

---

### Step 2: Ask Clarifying Questions

Ask **before writing any docs**. Use `AskUserQuestion` for the most important questions.
Limit to 4 questions maximum. Combine related questions.

**Questions to ask for a new project:**

1. **Project purpose:** "What does this system do and who uses it? (2–3 sentences)"
2. **Tech stack:** "What's the tech stack? (language, framework, database, deployment target)"
3. **Phase A scope:** "What's the first deliverable? What should work when Phase A is done?"
4. **Out of scope:** "What are you explicitly NOT building? (prevents scope creep)"

**Questions to ask for an existing project:**

1. **Missing context:** "I see [tech stack] but I'm unclear about [X]. Can you clarify?"
2. **Phase scope:** "What are you trying to spec out — full base docs, a specific feature, or both?"

**For a feature-only spec:** ask about scope, schema changes, and what's explicitly NOT in this phase.

Skip questions where the answer is obvious from the codebase or description.

---

### Step 3: Plan the Docs

Before writing, think through:

- **Personas**: who are the actual users? (admin, internal staff, external clients, developers)
- **Functional requirements**: what must the system DO? (not HOW it does it)
- **Non-functional requirements**: performance targets, reliability, security constraints — make them measurable
- **Architecture**: what are the components, how do they connect? Draw the ASCII diagram mentally first
- **Schema**: if there's a database, what are the tables? Write DDL, not prose
- **Phase A**: what's the smallest slice that proves the core value?
- **Out of scope**: what adjacent things are NOT being built?

---

### Step 4: Write the Docs

Write all docs to the project root (or `docs/specs/` for phase specs). Use the templates
from `TEMPLATES.md` as a starting point. Customize for the actual project.

**Writing order** (respects dependencies):

1. `REQUIREMENTS.md` — establishes what and why
2. `ARCHITECTURE.md` — establishes how
3. `DATAMODEL.md` — establishes schema (only if DB involved)
4. `SETUP.md` — establishes how to run it
5. `ROADMAP.md` — establishes phases
6. `TODO.md` — establishes active work
7. `README.md` — links everything together
8. `docs/specs/PHASE-A-SPEC.md` — first implementation spec

**Style rules to enforce:**

- Every NFR must be measurable (not "the system will be fast")
- Every schema change needs full DDL with column types, NOT NULL, CHECK, FK behavior
- Every ACL rule is a decision table, not prose
- Every spec has an explicit Out of Scope section
- Architecture diagram is ASCII, not a reference to an external tool
- Named exact files in implementation order (`auth.py:can_access()`, not "the auth module")

---

### Step 5: Run the Checklist

After writing, self-check against `CHECKLIST.md`:

**Base docs:**
- [ ] README.md has quick links to all other docs, quickstart, tech stack line
- [ ] REQUIREMENTS.md has personas, FR codes, measurable NFRs, Out of Scope
- [ ] ARCHITECTURE.md has ASCII diagram, every component named, decisions table
- [ ] DATAMODEL.md has DDL (not prose), naming conventions
- [ ] SETUP.md has prerequisites table, numbered steps, env var table
- [ ] ROADMAP.md has status legend, phase deliverables, Not Building section
- [ ] TODO.md has concrete items (file names, not vague tasks)

**Phase spec (if written):**
- [ ] Objective is 1–3 sentences with user-visible outcome
- [ ] Scope table has explicit IN/OUT for every item
- [ ] Schema changes have full DDL
- [ ] ACL/routing is a decision table
- [ ] Every new file listed with change type
- [ ] Test scenarios cover happy path, external user, admin, missing data, error states
- [ ] Non-Goals explains WHY excluded

Fix anything that fails the checklist before delivering.

---

### Step 6: Create docs/ Directory

```bash
mkdir -p docs/specs
```

Create `docs/specs/` even if no phase spec is written yet — it signals the project
follows the spec-first workflow.

---

### Step 7: Report

After writing all docs, give the user a summary:

```
Spec suite generated:

Files written:
  README.md             — entry point, quickstart, links
  REQUIREMENTS.md       — N personas, N FRs, N NFRs, N out-of-scope items
  ARCHITECTURE.md       — ASCII diagram, N components, decisions table
  DATAMODEL.md          — N tables with full DDL
  SETUP.md              — prerequisites, install steps, env var table
  ROADMAP.md            — N phases, not-building section
  TODO.md               — N active items
  docs/specs/PHASE-A-SPEC.md — first phase scope + schema + test scenarios

Review the docs. When you're ready to implement:
  - Approve Phase A spec → implementation begins
  - Any changes to requirements → update REQUIREMENTS.md first, then the spec
  - Spec is the source of truth; code is the implementation
```

---

## Rules

1. **Ask before writing** — clarifying questions prevent 2+ hours of wrong docs
2. **No implementation without approval** — specs go into plan mode; ExitPlanMode for approval
3. **DDL not prose** — every schema change has SQL, not a description of SQL
4. **Decision tables not prose** — ACL/routing logic is always a table
5. **Measurable NFRs** — "< 200ms at p99" not "fast"
6. **Out of scope is mandatory** — every doc must name what is NOT being built
7. **Pass the checklist** — self-check before delivering
8. **Align with existing code** — for existing projects, docs describe what IS, not what should be
9. **Base docs at root** — REQUIREMENTS.md, ARCHITECTURE.md, etc. live at project root, not in docs/

---

## Spec Standards Reference

All standards live at `/Users/admin/dev2/spec-standards/`:

| File | Purpose |
|------|---------|
| `CONVENTIONS.md` | Naming, required sections, style rules |
| `TEMPLATES.md` | Copy-paste starters for each doc type |
| `PROCESS.md` | Workflow for new projects and features |
| `CHECKLIST.md` | Quality gate before implementation |
| `ANTI-PATTERNS.md` | What NOT to do in specs |

---

## Anti-Patterns to Avoid

- Requirements that are really implementation details (`FR-1: Use Redis for caching`)
- NFRs without numbers (`The system will be highly available`)
- Schema described in prose instead of DDL
- ACL logic in prose instead of a decision table
- Speccing and implementing in the same unreviewed pass
- No Out of Scope section
- Storing feature specs in CLAUDE.md (they belong in `docs/specs/`)

---

## When to Use /spec vs Writing a Phase Spec Only

| Situation | What to Generate |
|-----------|-----------------|
| New project, no docs | All 7 base docs + Phase A spec |
| Existing project, missing base docs | Audit first, generate missing docs only |
| Adding a significant feature (touches >3 files) | Phase spec only (`docs/specs/PHASE-X-SPEC.md`) |
| Adding a new DB table or column | Phase spec with DDL section |
| Auth or ACL change | Phase spec with decision table |
| Bug fix, single file, no schema change | No spec needed |
