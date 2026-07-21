---
name: roadmap-proceed
description: Pick up the next non-deferred item from the project roadmap and implement it. Reads the most recent ROADMAP-*.md (or equivalent planning doc), finds the next unchecked priority item with no open PR, implements it, marks it done, and opens a PR. Use when the user says "roadmap-proceed", "proceed with the roadmap", "work on the next roadmap item", "next feature", or "continue roadmap work".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
---

# roadmap-proceed

Pick up the next actionable item from the project roadmap and implement it.

## Trigger Phrases

- `roadmap-proceed`, `/roadmap-proceed`
- "proceed with the roadmap", "next roadmap item"
- "work on the next feature", "continue roadmap work"
- "implement the next planned item"

## Instructions

<command-name>roadmap-proceed</command-name>

When invoked, execute the following steps:

---

### Step 1: Locate the roadmap

Search for planning documents in priority order:

```bash
# Priority order:
# 1. Most recent reconciled roadmap
ls -t docs/ROADMAP-*.md 2>/dev/null | head -1

# 2. Project TODO/CorePlan files
ls CorePlan/TODO.md CorePlan/MustHaves.md docs/TODO.md 2>/dev/null

# 3. Root-level planning files
ls TODO.md ROADMAP.md PLAN.md 2>/dev/null
```

Read the highest-priority file found. If multiple exist, prefer the most recently dated one.

---

### Step 2: Parse the roadmap — find the next actionable item

Read the roadmap and identify:
- The **first incomplete/unchecked item** with the highest priority
- Skip items that are:
  - Already marked complete (`[x]`, `✅`, `~~strikethrough~~`, status `done`/`complete`/`merged`)
  - Tagged `DEFERRED`, `BLOCKED`, `FUTURE`, `WON'T DO`, or `LOW PRIORITY`
  - Have a corresponding open PR (check with `gh pr list --search "<item keyword>"`)

Look for priority indicators:
- Numbered lists (1, 2, 3) or explicit priority (P0, P1, P2)
- Sprint assignments (Sprint 1 before Sprint 2)
- Status columns in tables (TODO/In Progress > Pending)
- Labels like MUST HAVE, SHOULD HAVE, NICE TO HAVE

Extract:
- **Item title/description**
- **Relevant files** (if mentioned)
- **Acceptance criteria** (if listed)
- **Any issue/ticket number** (if referenced)

---

### Step 3: Check for existing work

```bash
# Search for open PRs related to this item
gh pr list --state open --search "<item keyword>" --json number,title,headRefName

# Check relevant issue
gh issue list --search "<item keyword>" --state open --json number,title,assignees
```

If a PR already exists and is open, skip this item and find the next one.
If an issue exists and is assigned to someone else, skip this item.

---

### Step 4: Read context

Before implementing:
1. Read the CLAUDE.md for project conventions
2. Read the relevant source files mentioned in the roadmap item
3. If the item mentions an issue number, read it: `gh issue view <number>`
4. Check if related tests exist that document expected behavior

---

### Step 5: Implement the item

Apply the same discipline as any feature implementation:
- Create a branch: `git checkout -b feat/<short-description>` or `fix/<short-description>`
- Make minimal changes required to fulfill the acceptance criteria
- Do not refactor surrounding code
- Do not add features beyond what the item specifies

For U-Rent projects specifically:
- Gate authenticated API calls on `isApiReady`
- Add `@ApiProperty()` decorators to new DTOs
- Run `npm run generate:api-types` if any DTO/controller changed

---

### Step 6: Verify

```bash
# Type check
npx nx typecheck <app>

# Unit tests for affected module
npx nx test <app> --testPathPatterns=<module>

# If DTO changed, regenerate and verify types
npx nx serve api &   # start API in background if needed
npm run generate:api-types
npx nx build web     # verify no type errors in web
```

---

### Step 7: Commit and open PR

```bash
git add <changed files>
git commit -m "feat(<scope>): <description>"
# or: fix(<scope>): ...

git push -u origin feat/<description>

gh pr create \
  --title "feat(<scope>): <description>" \
  --body "..."
```

PR body should include:
- Which roadmap item this addresses (with link to roadmap doc)
- Acceptance criteria from the roadmap
- Test plan checklist
- Screenshots for UI changes (if applicable)

---

### Step 8: Update the roadmap

Mark the item as complete in the roadmap document:

```bash
# For checkbox items: change "- [ ]" to "- [x]"
# For table rows: update status column to "Done" or "Merged"
# Add PR reference: "- [x] Item description | PR #NNN"
```

Commit and push:
```bash
git add <roadmap-file>
git commit -m "docs: mark <item> complete in roadmap (PR #NNN)"
git push
```

---

### Step 9: Report to user

Output a brief summary:
```
✅ Roadmap item complete — PR #NNN opened

Item: <title>
Roadmap: <filename>
Files changed: <list>
Next item: <next item title> (<priority>)
```

---

## Notes

- **Max 1 roadmap item per invocation** unless items are trivially small (config changes, one-liners)
- **Never push to main** — always use feature branches and PRs
- **If item is ambiguous**: do not guess at requirements. Report the ambiguity to the user and ask which interpretation is correct before writing code
- **Architectural decisions** (which approach to use, schema changes, new dependencies): comment on the relevant issue first and wait for approval rather than deciding unilaterally
- **If blocked**: clearly explain why (missing dependency, unclear requirement, needs architectural decision) and suggest the next available item instead
- **Stale roadmaps**: if the roadmap appears more than 30 days old with no updates, note this and suggest running `/reconcile-roadmap` first
