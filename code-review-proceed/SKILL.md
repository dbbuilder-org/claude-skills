---
name: code-review-proceed
description: Pick up the next non-deferred item from the most recent code review action plan and implement it. Reads the TODO_<date>.md produced by /code-review or /code-review-quick, finds the next unchecked sprint item (not deferred, not blocked by an open PR), implements the fix, marks it done in the TODO, and opens a PR. Use when the user says "code-review-proceed", "proceed with the review", "work on the next review item", or "continue the review fixes".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
---

# code-review-proceed

Pick up the next actionable item from the most recent code review action plan and implement it.

## Trigger Phrases

- `code-review-proceed`, `/code-review-proceed`
- "proceed with the review", "work on the next review item"
- "continue the review fixes", "next fix from the review"
- "implement the next TD item"

## Instructions

<command-name>code-review-proceed</command-name>

When invoked, execute the following steps:

---

### Step 1: Locate the most recent TODO file

```bash
# Find the most recent code-review TODO
ls -t code-review/*/TODO_*.md 2>/dev/null | head -1
```

If no TODO file exists, report "No code review found. Run /code-review first." and stop.

---

### Step 2: Parse the TODO — find the next actionable item

Read the TODO file and identify:
- The **first unchecked item** (`- [ ]`) in Sprint 1, then Sprint 2, etc.
- Skip items that are:
  - Already checked (`- [x]`)
  - Tagged `DEFERRED` or `BLOCKED`
  - Have a corresponding open PR (check with `gh pr list --search "TD-NNN"`)

Extract from the item line:
- **ID**: e.g., `TD-006`
- **SP**: story points
- **Title**: description
- **Source ref**: e.g., `SEC-001`, `CQ-022`
- **File location**: path and line number hint

Also note which sprint it belongs to.

---

### Step 3: Read the source finding for context

The TODO items reference finding IDs (e.g., `SEC-001`, `CQ-022`). Find the corresponding document:

```bash
# Map finding prefix to document
# SEC-NNN → 01-SECURITY-REVIEW.md
# ARCH-NNN → 02-ARCHITECTURE-REVIEW.md
# CQ-NNN → 03-CODE-QUALITY-REVIEW.md
# TST-NNN → 04-TESTING-REVIEW.md
# INFRA-NNN → 05-DEPLOYMENT-INFRA-REVIEW.md
# UX-NNN → 08-UI-UX-REVIEW.md
# FC-NNN → 09-FEATURE-COMPLETENESS.md

grep -A 20 "### <FINDING_ID>" code-review/<date>/<document>.md
```

Read the full finding to understand:
- What the problem is
- Where exactly in the code it lives
- The recommended fix

---

### Step 4: Check for existing work

```bash
# Check if a PR already addresses this item
gh pr list --state open --search "TD-NNN" --json number,title,headRefName

# Check if the file is already modified on any open branch
git branch -r | head -20
```

If a PR already exists for this item, skip to Step 2 and find the next item.

---

### Step 5: Implement the fix

1. Read the affected files
2. Implement the minimum change described in the finding
3. Do not refactor surrounding code
4. Do not add features not described in the finding

Create a branch:
```bash
git checkout main && git pull
git checkout -b fix/td-NNN-short-description
```

---

### Step 6: Verify

```bash
# Type check the affected app
npx nx typecheck <app>   # api or web

# Run relevant tests if they exist
npx nx test <app> --testPathPatterns=<affected-service>
```

If typecheck fails on YOUR changed files (not pre-existing failures), fix before proceeding.

---

### Step 7: Commit and open PR

```bash
git add <changed files>
git commit -m "fix(<scope>): <description> (TD-NNN)"

git push -u origin fix/td-NNN-short-description

gh pr create \
  --title "fix(<scope>): <description> (TD-NNN)" \
  --body "..." \
  --label "priority:high" \
  --assignee RansomSV
```

PR body should include:
- Which TD item this addresses
- What the problem was (from the finding)
- What was changed
- Test plan checklist

---

### Step 8: Mark item as done in TODO

Update the TODO file:
```bash
# Change "- [ ]" to "- [x]" for the completed item
# Add PR number reference: "- [x] **TD-NNN** ... | PR #NNN"
```

Commit the TODO update:
```bash
git add code-review/<date>/TODO_*.md
git commit -m "docs: mark TD-NNN complete (PR #NNN)"
git push
```

---

### Step 9: Report to user

Output a brief summary:
```
✅ TD-NNN complete — PR #NNN opened

Item: <title>
Sprint: Sprint N
Files changed: <list>
Next item: TD-NNN — <title> (Sprint N)
```

---

## Notes

- **Max 1 TD item per invocation** unless the items are trivially small (< 1 SP each) and clearly related
- **Never amend commits** — always create new commits
- **Never push to main** — always use feature branches
- **Pre-existing type errors** in files you didn't touch are not your responsibility; document them but don't fix them unless the TODO item specifically targets them
- **If blocked**: report why (missing dependency, unclear spec, requires architectural decision) and suggest the next available item instead
