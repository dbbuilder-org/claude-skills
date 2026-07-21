---
name: git-catchup
description: Full PR and issue audit for a GitHub project. Checks every open issue for a corresponding PR, checks every open PR for bugs, and produces a prioritized action report. Use when the user says "git-catchup", "catchup", "PR audit", "issue audit", or "what's the status of our queue".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
---

# git-catchup

Perform a comprehensive PR queue and issue audit. Produces a prioritized list of:
1. Issues with no PR (gaps)
2. Bugs found in existing PRs
3. A recommended action order

## Trigger Phrases

- `/git-catchup`
- "git catchup", "catchup", "catch up on PRs"
- "PR audit", "issue audit", "queue status"
- "what's left", "what remains", "check the queue"

## Instructions

<command-name>git-catchup</command-name>

When invoked, execute the following steps in order:

---

### Step 1: Gather raw data (parallel)

Run these simultaneously:

**A. All open issues:**
```bash
gh issue list --state open --json number,title,assignees,labels --limit 100 > /tmp/catchup_issues.json
```

**B. All open PRs with bodies:**
```bash
gh pr list --state open --json number,title,headRefName,assignees,body --limit 100 > /tmp/catchup_prs.json
```

**C. Recently merged PRs (last 14 days for context):**
```bash
gh pr list --state merged --json number,title,mergedAt,mergedBy --limit 20 > /tmp/catchup_merged.json
```

---

### Step 2: Cross-reference issues against PRs

Write a Python script to:
1. Parse all PR bodies and extract issue references (regex: `closes?|fixes?|resolves?\s+#(\d+)` plus bare `#(\d+)`)
2. Build a set of `issues_with_prs`
3. Identify `issues_without_prs = all_open_issues - issues_with_prs`

```bash
python3 << 'EOF'
import json, re

issues = json.load(open('/tmp/catchup_issues.json'))
prs = json.load(open('/tmp/catchup_prs.json'))

issue_nums = {i['number']: i['title'] for i in issues}

def extract_issues(body):
    if not body: return []
    nums = set()
    for p in [r'(?:closes?|fixes?|resolves?)\s+#(\d+)', r'#(\d+)']:
        for m in re.finditer(p, body, re.IGNORECASE):
            n = int(m.group(1))
            if 100 < n < 10000:
                nums.add(n)
    return list(nums)

pr_coverage = {}
issues_with_prs = set()
for pr in prs:
    refs = extract_issues(pr.get('body',''))
    pr_coverage[pr['number']] = {'title': pr['title'], 'branch': pr['headRefName'], 'assignees': [a['login'] for a in pr.get('assignees',[])], 'issues': refs}
    issues_with_prs.update(refs)

uncovered = {n: t for n, t in issue_nums.items() if n not in issues_with_prs}

print("=== ISSUES WITHOUT PRS ===")
for n in sorted(uncovered.keys()):
    labels = next((i['labels'] for i in issues if i['number']==n), [])
    label_str = ','.join(l['name'] for l in labels) if labels else 'no-label'
    print(f"  #{n} [{label_str}]: {uncovered[n]}")
print(f"\nTotal open: {len(issue_nums)} | Covered: {len(issues_with_prs & set(issue_nums))} | Uncovered: {len(uncovered)}")
EOF
```

---

### Step 3: Categorize uncovered issues

For each issue without a PR, classify it:

| Category | Criteria | Action |
|----------|----------|--------|
| **Production bug** | Label `bug` + short description suggesting active failure | Needs PR this session |
| **Enhancement/Feature** | Label `enhancement` or `ux-flow` | Note for backlog |
| **Infrastructure** | Deps, CI, scaling, test coverage | Note, low priority |
| **UAT report** | Title starts with `E-NN` (Eric's reports) | Needs investigation |
| **Admin gap** | Title contains "admin ability" | Needs PR |

---

### Step 4: Bug-check all open PRs

For every open PR, use parallel Task agents (group into batches of 6):

**Agent prompt template:**
```
Review these PRs in [repo-path] for bugs. For each PR:
1. git diff main...{branch} --name-only
2. Read changed files
3. Check for: || vs ?? on numeric values, missing isApiReady guards,
   async/await gaps, auth bypass, inverted boolean logic,
   missing null checks on nullable fields, timezone-unaware dates

PRs: [list]

Format: PR #N — branch — ✅ Clean | 🟢 Low | 🟡 Medium | 🔴 High
Bug: file:line — description
```

Skip:
- Dependabot PRs (branch starts with `dependabot/`)
- CI-only PRs (branch starts with `dependabot/github_actions`)

---

### Step 5: Compile and output the report

Output a structured report in this format:

```
## git-catchup Report — [date]

### Queue Summary
- Open issues: N
- Open PRs: N
- Issues without PRs: N (X production bugs, Y features, Z infra)
- PRs with bugs found: N

---

### 🚨 IMMEDIATE ACTION REQUIRED

#### Issues with No PR — Production Bugs
| # | Issue | Why Urgent |
|---|-------|------------|

#### PR Bugs — High Severity
| PR | Branch | Bug |
|----|--------|-----|

---

### 📋 MEDIUM PRIORITY

#### Issues with No PR — Admin Gaps / UAT Failures
| # | Issue |
|---|-------|

#### PR Bugs — Medium Severity
| PR | Branch | Bug |
|----|--------|-----|

---

### 📝 LOW PRIORITY / BACKLOG

#### Issues with No PR — Features / Infrastructure
| # | Issue | Category |
|---|-------|----------|

#### PR Bugs — Low Severity
| PR | Branch | Bug |
|----|--------|-----|

---

### ✅ CLEAN PRs (no bugs found)
[comma-separated list of PR numbers]

---

### Recommended Action Order
1. [Highest priority fix]
2. [Next]
...
```

---

## Notes

- **isApiReady pattern**: Every `useEffect` that calls an authenticated API must check `isApiReady` first. Missing guards cause silent 401 failures on page load.
- **|| vs ??**: `value || 0` fires when `value === 0`, which is wrong for financial amounts. Use `value ?? 0`.
- **Auth bypass**: `GET /resource/:id` endpoints must verify the requesting user owns or is party to the resource.
- **Timezone dates**: `new Date()` in date pickers should be validated against UTC if the backend uses UTC comparisons.
- **Migration vs DTO gaps**: If a column exists in the entity but causes "column does not exist" errors, check `npm run migration:show` — the migration likely exists but hasn't been applied to production.

## U-Rent Specific Context

When running on u-rent-platform:
- Check `gh pr list --assignee RansomSV` and `--assignee dbbuilder` separately
- Auth guard pattern: `useApiReady()` hook, gate all authenticated API calls on `isApiReady`
- Status maps must cover all enum values (missing `disputed` from some maps was a recurring issue)
- Backend owner checks: use `ForbiddenException` with a `{ statusCode, error, message }` body for structured errors
- Migration issues: run `npm run migration:show` to check pending migrations before claiming a column is missing code
