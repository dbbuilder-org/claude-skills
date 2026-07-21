---
name: doc-to-issues
description: Convert a review document (PDF, Markdown, or text) into GitHub issues with implementation plans, organized by area in predicate order. Optionally creates PRs for immediately implementable items. Use when the user has a review document (e.g., "Portal Review Ryan.pdf", "feedback.md", "UAT results") and wants it converted into tracked GitHub issues. Triggered by "doc-to-issues", "convert review to issues", "create issues from document", "turn this review into github issues".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - WebFetch
---

# doc-to-issues Skill

Convert any review/feedback document into GitHub issues with implementation plans, organized by area and predicate order, with PRs created for immediately actionable items.

## Trigger Phrases

- `/doc-to-issues <path-to-document>`
- "convert review to issues"
- "create issues from document"
- "turn this review into github issues"
- "make github issues from [document]"

## Usage

```
/doc-to-issues docs/Portal Review Ryan.pdf
/doc-to-issues docs/UAT-feedback.md
/doc-to-issues "path with spaces/review.pdf"
```

If no document path is provided, ask the user for one before proceeding.

## What it Does

1. **Reads the document** — extracts all feedback items, bugs, feature requests, and suggestions
2. **Organizes by area** — groups items by the feature area they affect (Dashboard, Settings, Rewards, etc.)
3. **Predicate ordering** — orders issues so that foundational work (schema changes, data models) comes before dependent features
4. **Creates GitHub issues** — one issue per feedback item, with structured body and implementation plan comment
5. **Creates PRs** — for items that are immediately implementable (no new schema, no major dependencies), creates branches, implements changes, and opens PRs

---

## Step-by-Step Instructions

### Step 1: Parse the Document

Read the document at the provided path. If it's a PDF, use the Read tool — it will return the text content.

Extract every feedback item. For each item capture:
- **Text**: the exact feedback text
- **Area**: which part of the product it affects (infer from context)
- **Type**: `bug` | `enhancement` | `feature` | `copy` | `schema`
- **Complexity**: `quick` (< 2 hrs, no schema) | `medium` (2–6 hrs) | `large` (> 6 hrs or needs schema)
- **Dependencies**: list any other items that must be done first

### Step 2: Group and Order

Group items by area. Common areas for web apps:
- Core / Data (schema changes — must come first)
- Copy & Labels (no-dependency text changes)
- Dashboard
- Authentication / Settings
- [Feature-specific areas from the document]
- Platform / Infrastructure

Within each group, order by predicate dependency:
1. Schema/data model changes first
2. API changes second
3. UI changes third
4. Large features last

### Step 3: Create GitHub Labels

Check existing labels with `gh label list`. Create any missing labels needed for the issues:
- Area labels: `dashboard`, `settings`, `rewards`, `inbox`, etc.
- Type labels: `bug`, `enhancement`, `feature`, `copy`, `schema`
- `good first issue` for quick copy/label changes

Use: `gh label create "<name>" --color "<hex>" --description "<desc>"`

### Step 4: Create Issues

For each feedback item, create a GitHub issue:

```bash
gh issue create \
  --title "<type-prefix> <concise title>" \
  --label "<labels>" \
  --body "<body>"
```

**Title format:**
- `[BUG][Area] <description>` — for bugs
- `[ENH][Area] <description>` — for enhancements
- `[FEAT] <description>` — for new features
- `[COPY] <description>` — for copy/label changes

**Body format:**
```markdown
<Original feedback text verbatim>

**Area:** <area>
**Type:** <bug|enhancement|feature|copy>
**Complexity:** <quick|medium|large>
**Depends on:** <issue numbers, or "none">
```

After creating each issue, immediately add a plan comment:

```bash
gh issue comment <number> --body "## Implementation Plan

**Files to update:**
- \`path/to/file.ts\` — description

**Steps:**
1. Step one
2. Step two
3. Step three

**Effort:** <estimate>"
```

**Do NOT assign issues to anyone.**

### Step 5: Create PRs for Quick Items

For items with complexity `quick` (pure copy changes, config updates, minor UI fixes with no schema changes):

1. Identify which quick items can be grouped into a single PR by area (e.g., all copy changes in one PR, all dashboard bug fixes in one PR)
2. For each PR group, use the Agent tool with `isolation: "worktree"` to:
   a. Read the relevant files
   b. Make the changes
   c. Commit on a new branch
   d. Push and create a PR that closes the relevant issues
3. PR title format: `fix: <description>` or `feat: <description>`
4. PR body must include `Closes #<n>` for each issue addressed

**Do NOT assign PRs to anyone.**

### Step 6: Report Results

After all issues and PRs are created, output a summary table:

```markdown
## Issues Created

| # | Area | Title | Type | Complexity | PR |
|---|------|-------|------|------------|----|
| #20 | Copy | Rename "Accept Meeting" → "Request Meeting" | copy | quick | #PR |
| #21 | Copy | Update points 500→2,000 | copy | quick | #PR |
| ... | ... | ... | ... | ... | pending |

## PRs Created

| PR | Issues | Branch | Status |
|----|--------|--------|--------|
| #42 | #20, #21 | fix/copy-label-updates | open |
| ... | ... | ... | ... |

## Deferred (require design/schema/dependencies)

| # | Title | Blocked by |
|---|-------|-----------|
| #37 | Initiatives page | new schema |
```

---

## Implementation Notes

### Reading Different Document Types

- **PDF**: Use `Read` tool — Claude can extract text from PDFs directly
- **Markdown**: Use `Read` tool
- **Text/HTML**: Use `Read` tool

### Handling Duplicate/Similar Items

If two feedback items are essentially the same issue, create one issue and note both in the body.

### Dependency Graph

Always check if a feedback item depends on another. Common patterns:
- UI changes that need new DB fields → depend on schema issue
- Filter features → depend on data model issue
- "Attach X to Y" features → depend on X existing in schema

Mark dependencies explicitly with `**Depends on:** #<n>` in the issue body.

### Predicate Order for PRs

Create PRs in this order so they can be merged without conflicts:
1. Schema migrations (no UI)
2. API/backend changes (no UI)
3. Quick UI fixes (no schema)
4. Feature UI (after schema+API)

### Repo Detection

Detect the GitHub repo automatically:
```bash
gh repo view --json nameWithOwner --jq '.nameWithOwner'
```

### Label Colors

Use these consistent colors:
- `bug`: `d73a4a` (red)
- `enhancement`: `a2eeef` (teal)
- `feature`: `0075ca` (blue)
- `copy`: `e4e669` (yellow)
- `schema`: `7057ff` (purple)
- Area labels: `bfd4f2` (light blue)

---

## Example Invocation

User: `/doc-to-issues docs/Portal Review Ryan.pdf`

Claude:
1. Reads `docs/Portal Review Ryan.pdf`
2. Extracts 20 feedback items across 7 areas
3. Creates necessary labels
4. Creates 20 issues (#20–#39) with plan comments
5. Identifies 6 quick/medium items for immediate PRs
6. Launches 5 parallel worktree agents to implement and open PRs
7. Reports the full summary table

---

## Constraints

- Never assign issues or PRs to specific users
- Never create issues for items that already have open issues (check with `gh issue list --search "<keyword>"` before creating)
- Always add implementation plan as a comment (not in the issue body)
- Always create PRs in isolated worktrees to avoid merge conflicts
- Maximum 5 PRs per session — defer additional work to future sessions
- If the document references external screenshots or tools (e.g., "see Sagetap screenshots"), note this in the issue as context but don't block on it
