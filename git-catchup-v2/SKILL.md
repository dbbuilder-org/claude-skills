---
name: git-catchup-v2
description: Comprehensive PR/issue audit with solution completeness, TypeScript health, CI/CD status, test coverage gaps, and team readiness assessment. Extends git-catchup with merge-readiness scoring and Ransom/Peter assignment intelligence. Use when the user says "git-catchup-v2", "full audit", "team readiness", "PR completeness", or "are we ready for tomorrow".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
---

# git-catchup-v2

Comprehensive PR and issue audit. Produces a merge-readiness report covering:

1. **Coverage** — all issues have PRs with real implementations (not stubs)
2. **Solution completeness** — no TODO/FIXME/placeholder code in open PRs
3. **Test gaps** — service/controller changes without spec file updates
4. **TypeScript health** — error count trend across open PRs
5. **CI/CD status** — passing, failing, pending checks per PR
6. **Team readiness** — Ransom's PRs have testing directives; Peter's have review assignments
7. **Merge-readiness score** — per PR: 🔴 Blocked / 🟡 Needs work / 🟢 Ready to merge

## Trigger Phrases

- `/git-catchup-v2`
- "full audit", "team readiness", "are we ready for tomorrow"
- "PR completeness check", "solution audit"
- "check everything", "comprehensive catchup"

## Instructions

<command-name>git-catchup-v2</command-name>

---

### Step 1: Gather raw data (run in parallel)

```bash
gh issue list --state open --json number,title,assignees,labels --limit 100 > /tmp/v2_issues.json
gh pr list --state open --json number,title,headRefName,assignees,body,statusCheckRollup,reviewRequests --limit 100 > /tmp/v2_prs.json
gh pr list --state merged --json number,title,mergedAt,mergedBy --limit 30 > /tmp/v2_merged.json
```

---

### Step 2: Issue → PR coverage cross-reference

```bash
python3 << 'EOF'
import json, re

issues = json.load(open('/tmp/v2_issues.json'))
prs = json.load(open('/tmp/v2_prs.json'))

def extract_refs(body):
    if not body: return set()
    nums = set()
    for p in [r'(?:closes?|fixes?|resolves?)\s+#(\d+)', r'#(\d+)']:
        for m in re.finditer(p, body, re.IGNORECASE):
            n = int(m.group(1))
            if 100 < n < 10000:
                nums.add(n)
    return nums

covered = set()
for pr in prs:
    covered.update(extract_refs(pr.get('body', '')))

issue_map = {i['number']: i for i in issues}
uncovered = {n: i for n, i in issue_map.items() if n not in covered}

print("=== ISSUES WITHOUT PRS ===")
for n in sorted(uncovered):
    i = uncovered[n]
    labels = [l['name'] for l in i.get('labels', [])]
    assignees = [a['login'] for a in i.get('assignees', [])]
    print(f"  #{n} [{','.join(labels) or 'no-label'}] @{','.join(assignees) or 'unassigned'}: {i['title']}")

print(f"\nCoverage: {len(covered & set(issue_map))} covered / {len(uncovered)} uncovered / {len(issue_map)} total")
EOF
```

Classify each uncovered issue:

| Category | Criteria | Action |
|----------|----------|--------|
| **Production bug** | `bug` label + active failure description | Create PR this session |
| **UAT report** | Title starts with `E-` | Investigate → create PR or add `needs-reproduction` |
| **Admin gap** | "admin" in title/labels | Create PR if straightforward |
| **Enhancement/Feature** | `enhancement` or `ux-flow` label | Backlog — note only |
| **Infrastructure** | CI, deps, scaling | Backlog — note only |

---

### Step 3: PR solution completeness check

For each open PR, check the diff for red-flag patterns:

```bash
python3 << 'EOF'
import json, subprocess

prs = json.load(open('/tmp/v2_prs.json'))
problems = []

for pr in prs:
    branch = pr['headRefName']
    if branch.startswith('dependabot/'):
        continue

    # Get changed files
    result = subprocess.run(
        ['git', 'diff', '--name-only', f'main...origin/{branch}'],
        capture_output=True, text=True, timeout=20
    )
    if result.returncode != 0:
        # Try fetching branch first
        subprocess.run(['git', 'fetch', 'origin', branch, '--quiet'], capture_output=True, timeout=30)
        result = subprocess.run(
            ['git', 'diff', '--name-only', f'main...origin/{branch}'],
            capture_output=True, text=True, timeout=20
        )

    changed_files = [f for f in result.stdout.strip().splitlines() if f]
    if not changed_files:
        continue

    # Get the diff content
    diff_result = subprocess.run(
        ['git', 'diff', f'main...origin/{branch}', '--', *changed_files[:20]],
        capture_output=True, text=True, timeout=30
    )
    diff_text = diff_result.stdout

    # Red-flag patterns in added lines
    red_flags = []
    for line in diff_text.splitlines():
        if not line.startswith('+') or line.startswith('+++'):
            continue
        clean = line[1:]
        if any(p in clean for p in ['TODO:', 'FIXME:', 'HACK:', 'throw new Error(\'Not implemented', 'throw new Error("Not implemented', '// placeholder', '// stub', 'return null; // TODO', 'return undefined; // TODO']):
            red_flags.append(clean.strip()[:100])

    # Test coverage gap: changed service/controller without spec
    service_changed = any('.service.ts' in f or '.controller.ts' in f or 'hook' in f.lower() for f in changed_files if not f.endswith('.spec.ts'))
    spec_changed = any('.spec.ts' in f or '.test.ts' in f for f in changed_files)
    test_gap = service_changed and not spec_changed

    if red_flags or test_gap:
        problems.append({
            'pr': pr['number'],
            'title': pr['title'][:60],
            'branch': branch[:40],
            'assignees': [a['login'] for a in pr.get('assignees', [])],
            'red_flags': red_flags[:3],
            'test_gap': test_gap,
            'service_files': [f for f in changed_files if '.service.ts' in f or '.controller.ts' in f],
        })

print("=== COMPLETENESS ISSUES ===")
for p in problems:
    assignee_str = ','.join(p['assignees']) or 'unassigned'
    print(f"\nPR #{p['pr']} (@{assignee_str}): {p['title']}")
    if p['red_flags']:
        print(f"  🔴 Incomplete code:")
        for flag in p['red_flags']:
            print(f"    - {flag}")
    if p['test_gap']:
        print(f"  🟡 No test update for: {', '.join(p['service_files'][:3])}")

print(f"\nTotal PRs with completeness issues: {len(problems)}")
EOF
```

---

### Step 4: CI/CD status per PR

```bash
python3 << 'EOF'
import json

prs = json.load(open('/tmp/v2_prs.json'))

print("=== CI STATUS PER PR ===")
for pr in prs:
    if pr['headRefName'].startswith('dependabot/'):
        continue
    checks = pr.get('statusCheckRollup') or []
    failures = [c for c in checks if c.get('conclusion') in ('FAILURE', 'ERROR') or c.get('state') == 'FAILURE']
    pending = [c for c in checks if c.get('status') == 'IN_PROGRESS' or c.get('state') == 'PENDING']
    passing = [c for c in checks if c.get('conclusion') == 'SUCCESS' or c.get('state') == 'SUCCESS']

    if failures:
        fail_names = ', '.join(c.get('name','?') for c in failures)
        print(f"  🔴 PR #{pr['number']}: FAILING — {fail_names}")
    elif pending:
        print(f"  ⏳ PR #{pr['number']}: PENDING ({len(pending)} checks)")
    elif passing:
        print(f"  ✅ PR #{pr['number']}: All checks passing ({len(passing)} checks)")
    else:
        print(f"  ⚪ PR #{pr['number']}: No checks run")
EOF
```

---

### Step 5: Team readiness check

```bash
python3 << 'EOF'
import json, subprocess

prs = json.load(open('/tmp/v2_prs.json'))

ransom_prs = [pr for pr in prs if any(a['login'] == 'RansomSV' for a in pr.get('assignees', []))]
peter_prs = [pr for pr in prs if any(a['login'] == 'octavianorg' for a in pr.get('assignees', []))]
unassigned_prs = [pr for pr in prs if not pr.get('assignees') and not pr['headRefName'].startswith('dependabot/')]

print(f"=== TEAM ASSIGNMENT ===")
print(f"Ransom (@RansomSV): {len(ransom_prs)} PRs")
print(f"Peter (@octavianorg): {len(peter_prs)} PRs")
print(f"Unassigned: {len(unassigned_prs)} PRs")

# Check Ransom's PRs for testing directives
print("\n=== RANSOM PRs — TESTING DIRECTIVE CHECK ===")
for pr in sorted(ransom_prs, key=lambda x: x['number']):
    comments_result = subprocess.run(
        ['gh', 'pr', 'view', str(pr['number']), '--comments'],
        capture_output=True, text=True, timeout=15
    )
    has_directive = 'Testing Directive' in comments_result.stdout or '🧪' in comments_result.stdout
    status = "✅ Has directive" if has_directive else "⚠️  MISSING directive"
    print(f"  PR #{pr['number']}: {pr['title'][:55]} — {status}")

# Check Peter's PRs for review assignments
print("\n=== PETER PRs — REVIEW ASSIGNMENT CHECK ===")
for pr in sorted(peter_prs, key=lambda x: x['number']):
    reviewers = pr.get('reviewRequests', [])
    reviewer_logins = [r.get('login') or r.get('name', '?') for r in reviewers]
    status = f"Reviewers: {', '.join(reviewer_logins)}" if reviewer_logins else "⚠️  No reviewers assigned"
    print(f"  PR #{pr['number']}: {pr['title'][:55]} — {status}")

# Unassigned PRs
if unassigned_prs:
    print("\n=== UNASSIGNED PRs ===")
    for pr in sorted(unassigned_prs, key=lambda x: x['number']):
        print(f"  PR #{pr['number']}: {pr['title'][:70]}")
EOF
```

---

### Step 6: Merge-readiness scoring

For each PR, compute a merge-readiness score:

```python
# Score breakdown (each item is pass/fail):
# ✅ CI passing
# ✅ No TODO/stub/incomplete code
# ✅ Has tests (or no service logic changed)
# ✅ Assigned + reviewer set
# ✅ Has testing directive (Ransom's PRs only)
# ✅ PR body references an issue

# 6/6 = 🟢 Ready to merge
# 4-5/6 = 🟡 Needs minor work
# <4/6 = 🔴 Blocked
```

```bash
python3 << 'EOF'
import json, subprocess, re

prs = json.load(open('/tmp/v2_prs.json'))
scores = []

for pr in prs:
    if pr['headRefName'].startswith('dependabot/'):
        continue

    score = 0
    notes = []

    # CI
    checks = pr.get('statusCheckRollup') or []
    failures = [c for c in checks if c.get('conclusion') in ('FAILURE', 'ERROR')]
    if not failures and checks:
        score += 1
    elif failures:
        notes.append(f"CI failing: {', '.join(c.get('name','?') for c in failures[:2])}")
    else:
        notes.append("No CI checks")

    # Issue reference
    body = pr.get('body') or ''
    has_ref = bool(re.search(r'#\d{3,}', body))
    if has_ref: score += 1
    else: notes.append("No issue reference in body")

    # Assigned
    assignees = pr.get('assignees', [])
    if assignees: score += 1
    else: notes.append("Unassigned")

    # Reviewer
    reviewers = pr.get('reviewRequests', [])
    if reviewers: score += 1
    else: notes.append("No reviewer assigned")

    # Ransom: check testing directive
    is_ransom = any(a['login'] == 'RansomSV' for a in assignees)
    if is_ransom:
        comments_result = subprocess.run(
            ['gh', 'pr', 'view', str(pr['number']), '--comments'],
            capture_output=True, text=True, timeout=15
        )
        has_directive = 'Testing Directive' in comments_result.stdout
        if has_directive: score += 1
        else: notes.append("Missing testing directive")
    else:
        score += 1  # Not applicable for non-Ransom PRs

    # Branch diff for completeness
    branch = pr['headRefName']
    diff_result = subprocess.run(
        ['git', 'diff', '--name-only', f'main...origin/{branch}'],
        capture_output=True, text=True, timeout=20
    )
    changed = diff_result.stdout.strip().splitlines()
    service_changed = any('.service.ts' in f or '.controller.ts' in f for f in changed if not f.endswith('.spec.ts'))
    spec_changed = any('.spec.ts' in f for f in changed)
    if not service_changed or spec_changed:
        score += 1
    else:
        notes.append("Service changed without tests")

    # Rating
    if score >= 5:
        rating = "🟢 Ready"
    elif score >= 3:
        rating = "🟡 Needs work"
    else:
        rating = "🔴 Blocked"

    assignee_str = ', '.join(f"@{a['login']}" for a in assignees) or '@unassigned'
    scores.append((score, pr['number'], rating, pr['title'][:55], assignee_str, notes))

scores.sort(key=lambda x: x[0])

print("=== MERGE READINESS SCORES ===")
print(f"{'PR':>5}  {'Score':>5}  {'Status':<15}  {'Assignee':<20}  Title")
print("-" * 100)
for score, num, rating, title, assignee, notes in scores:
    print(f"  #{num:<4}  {score}/6    {rating:<15}  {assignee:<20}  {title}")
    for note in notes:
        print(f"         {'':5}  {'':5}  → {note}")

blocked = sum(1 for s in scores if s[2].startswith('🔴'))
needs_work = sum(1 for s in scores if s[2].startswith('🟡'))
ready = sum(1 for s in scores if s[2].startswith('🟢'))
print(f"\nSummary: {ready} ready | {needs_work} need work | {blocked} blocked")
EOF
```

---

### Step 6.5: Apply tier labels + update daily plan issue

After scoring, auto-label all open PRs and update the daily order-of-attack issue.

**Label tiers (create if missing):**

```bash
# Ensure tier labels exist
for label_spec in \
  "tier:1-ready|Passes CI — merge this sprint|0E8A16" \
  "tier:2-security|Security/auth/payments — Peter reviews|B60205" \
  "tier:2-medium|Infra/frontend/backend — Ransom reviews|E4B429" \
  "tier:3-hold|Large feature PRs — hold until Tier 1+2 merged|BFD4F2" \
  "reviewer:peter|Route to Peter for review|0052CC" \
  "reviewer:ransom|Route to Ransom for review|5319E7"; do
  IFS='|' read -r lname ldesc lcolor <<< "$label_spec"
  gh label create "$lname" --description "$ldesc" --color "$lcolor" 2>/dev/null || \
    gh label edit "$lname" --description "$ldesc" --color "$lcolor" 2>/dev/null
done
echo "Labels ready"
```

**Classify and label PRs:**

```python
# Classification rules:
#
# tier:2-security (→ reviewer:peter):
#   branch/title contains: security, auth, payment, deposit, stripe, fraud,
#   ownership, secret, guard, permission, jwt, clerk, rate-limit, sprint-1-critical
#
# tier:1-ready (→ reviewer:ransom or peter depending on security check):
#   CI passing AND ( newly created < 2 weeks ago OR no conflicts )
#   Most recently opened PRs that are clean
#
# tier:3-hold:
#   branch starts with feat/ AND PR has > 15 changed files AND age > 30 days
#   OR branch name matches known Tier 3 patterns (flow-*, listing-management, payout-dashboard)
#
# tier:2-medium (default):
#   everything else → reviewer:ransom
```

```bash
python3 << 'EOF'
import json, subprocess, re
from datetime import datetime, timezone

prs = json.load(open('/tmp/v2_prs.json'))

SECURITY_KEYWORDS = ['security', 'auth', 'payment', 'deposit', 'stripe', 'fraud',
                     'ownership', 'secret', 'guard', 'permission', 'jwt', 'clerk',
                     'sprint-1-critical', 'critical']
HOLD_BRANCHES = ['feat/flow-', 'feat/td-067', 'feat/td-039', 'feat/td-040',
                 'listing-management', 'payout-dashboard', 'dual-checklist',
                 'request-to-book', 'dl-verification', 'voice']

def is_security(pr):
    text = (pr['title'] + ' ' + pr['headRefName']).lower()
    return any(k in text for k in SECURITY_KEYWORDS)

def is_hold(pr):
    branch = pr['headRefName'].lower()
    return any(k in branch for k in HOLD_BRANCHES)

def is_ready(pr):
    checks = pr.get('statusCheckRollup') or []
    failures = [c for c in checks if c.get('conclusion') in ('FAILURE', 'ERROR')]
    passing = [c for c in checks if c.get('conclusion') == 'SUCCESS']
    return not failures and len(passing) > 0

def label_pr(pr_num, *labels):
    for label in labels:
        subprocess.run(['gh', 'pr', 'edit', str(pr_num), '--add-label', label],
                      capture_output=True, timeout=15)

labeled = []
for pr in prs:
    branch = pr['headRefName']
    # Skip bot PRs — they get tier:2-medium reviewer:ransom automatically
    if branch.startswith('dependabot/') or branch in ('main', 'staging'):
        label_pr(pr['number'], 'tier:2-medium', 'reviewer:ransom')
        labeled.append((pr['number'], 'tier:2-medium', 'reviewer:ransom'))
        continue

    if is_hold(pr):
        label_pr(pr['number'], 'tier:3-hold')
        labeled.append((pr['number'], 'tier:3-hold', '-'))
    elif is_security(pr):
        if is_ready(pr):
            label_pr(pr['number'], 'tier:1-ready', 'tier:2-security', 'reviewer:peter')
            labeled.append((pr['number'], 'tier:1-ready+security', 'reviewer:peter'))
        else:
            label_pr(pr['number'], 'tier:2-security', 'reviewer:peter')
            labeled.append((pr['number'], 'tier:2-security', 'reviewer:peter'))
    elif is_ready(pr):
        label_pr(pr['number'], 'tier:1-ready', 'reviewer:ransom')
        labeled.append((pr['number'], 'tier:1-ready', 'reviewer:ransom'))
    else:
        label_pr(pr['number'], 'tier:2-medium', 'reviewer:ransom')
        labeled.append((pr['number'], 'tier:2-medium', 'reviewer:ransom'))

print(f"=== LABELED {len(labeled)} PRs ===")
for num, tier, reviewer in sorted(labeled, key=lambda x: x[0]):
    print(f"  #{num}: {tier} → {reviewer}")
EOF
```

**Update the daily order-of-attack issue (if it exists):**

After labeling, find the pinned "Daily Order of Attack" issue and add a comment with today's priority order:

```bash
# Find the daily plan issue
DAILY_ISSUE=$(gh issue list --state open --search "Daily Order of Attack PR Merge Queue" --json number --jq '.[0].number' 2>/dev/null)

if [ -n "$DAILY_ISSUE" ]; then
  echo "Updating daily plan issue #$DAILY_ISSUE"
  # The next step's report will be posted as a comment
  # Store for use in Step 7
  echo $DAILY_ISSUE > /tmp/daily_issue_num.txt
else
  echo "No daily plan issue found — create one at issue #NNN with title 'Daily Order of Attack'"
  echo "" > /tmp/daily_issue_num.txt
fi
```

---

### Step 7: Compile final report + update issue body

Output the full report in this format:

```
## git-catchup-v2 Report — [date]

### Queue Health
- Open issues: N | Open PRs: N | Issues without PRs: N
- PRs ready to merge: N 🟢 | Need work: N 🟡 | Blocked: N 🔴
- CI failing: N PRs | Test gaps: N PRs | Incomplete code: N PRs

---

### 🚨 IMMEDIATE: Issues with No PR (Production Bugs)
| # | Issue | Labels | Urgency |

### 🚨 IMMEDIATE: Blocked PRs
| PR | Branch | Blocker |

---

### 📋 MEDIUM: PRs Needing Work
| PR | Assignee | Gap | Action |

---

### ✅ READY TO MERGE (in recommended order)
| PR | Assignee | Title |

---

### 📝 ISSUES WITHOUT PRS (Non-urgent)
| # | Category | Issue |

---

### Recommended Action Order for Tomorrow
1. [Merge/unblock highest priority item]
2. [Next]
...
```

**After posting the comment, also update the issue #649 body** so the "live today" view reflects the current date and queue summary. The body is what team members see when they first open the issue — comments are historical record only.

```bash
# Derive today's date label (weekday + date)
TODAY_LABEL=$(python3 -c "
from datetime import datetime
d = datetime.now()
print(d.strftime('%A, %B %-d %Y'))
")

# Build Peter and Ransom queue tables from scored PRs
# (use /tmp/v2_prs.json and scores already computed in Step 6)
python3 << 'PYEOF'
import json, subprocess, re
from datetime import datetime

prs = json.load(open('/tmp/v2_prs.json'))
today = datetime.now().strftime('%A, %B %-d %Y')
date_iso = datetime.now().strftime('%Y-%m-%d')

# Classify PRs into queues
peter_prs = []
ransom_prs = []
pending_ci = []
hold_prs = []

SECURITY_KEYWORDS = ['security', 'auth', 'payment', 'deposit', 'stripe', 'fraud',
                     'guard', 'permission', 'jwt', 'clerk', 'admin', 'critical']

for pr in sorted(prs, key=lambda x: x['number'], reverse=True):
    branch = pr['headRefName']
    if branch.startswith('dependabot/'):
        continue

    num = pr['number']
    title = pr['title'][:65]
    reviewers = [r.get('login') or r.get('name','?') for r in pr.get('reviewRequests', [])]
    checks = pr.get('statusCheckRollup') or []
    failures = [c for c in checks if c.get('conclusion') in ('FAILURE', 'ERROR')]
    passing = [c for c in checks if c.get('conclusion') == 'SUCCESS']

    # Verify CI with gh run list if stale
    ci_ok = not failures and len(passing) > 0
    if failures:
        run_r = subprocess.run(['gh', 'run', 'list', '--branch', branch, '--limit', '1',
                                '--json', 'status,conclusion'], capture_output=True, text=True, timeout=10)
        try:
            runs = json.loads(run_r.stdout)
            if runs:
                if runs[0].get('conclusion') == 'success': ci_ok = True
                elif runs[0].get('status') == 'in_progress': ci_ok = None  # pending
        except: pass

    # #812 is always hold
    if num == 812:
        hold_prs.append((num, title, '🔒 Hold — Eric UAT sign-off required'))
        continue

    if ci_ok is None:
        pending_ci.append((num, title, branch[:35]))
        continue

    is_security = any(k in (title + ' ' + branch).lower() for k in SECURITY_KEYWORDS)
    if 'octavianorg' in reviewers or is_security:
        peter_prs.append((num, title, '🟢 Ready' if ci_ok else '🔴 CI failing'))
    else:
        ransom_prs.append((num, title, '🟢 Ready' if ci_ok else '🔴 CI failing'))

# Count totals
total_prs = len([p for p in prs if not p['headRefName'].startswith('dependabot/')])
ready_count = len(peter_prs) + len(ransom_prs)
pending_count = len(pending_ci)

def pr_table(rows):
    if not rows: return '| — | — | — |\n'
    return ''.join(f'| #{n} | {t} | {s} |\n' for n, t, s in rows)

body = f"""# 📅 {today}

> **Last updated:** {date_iso} by @dbbuilder · Auto-refreshed each session via `/git-catchup-v2`

---

## 🚦 v1.0 Gate Status

| Gate | Status |
|------|--------|
| Eric UAT #725 (full checklist) | ⏳ Awaiting Eric |
| Eric UAT #834 (Stripe Connect) | ⏳ Awaiting Eric |
| Eric UAT #835 (Dispute E2E) | ⏳ Awaiting Eric |
| Eric UAT #615 (calendar flow) | ⏳ Awaiting Eric |
| #812 staging→main | 🔒 Hold until all 4 above signed off |

**v1.0 ETA:** ~Mar 18–20. All technical work complete. Blocked on Eric sign-off only.

---

## 📊 Queue Health

- **Open PRs:** {total_prs} | **Ready:** {ready_count} 🟢 | **CI pending:** {pending_count} ⏳ | **Blocked:** {len(hold_prs)}
- **Open issues:** {len(json.load(open('/tmp/v2_issues.json')))} | **Without PRs:** 5 (all Eric UAT — no code needed)

---

## ✅ Peter's Merge Queue (priority order)

| PR | Title | Status |
|----|-------|--------|
{pr_table(peter_prs)}
---

## ✅ Ransom's Test & Merge Queue (priority order)

| PR | Title | Status |
|----|-------|--------|
{pr_table(ransom_prs)}"""

if pending_ci:
    body += f"""
---

## ⏳ CI In Progress

| PR | Branch | Note |
|----|--------|------|
{pr_table(pending_ci)}"""

body += """

---

## 👥 Team

| Person | Current Focus |
|--------|--------------|
| @octavianorg (Peter) | Review & merge Peter's queue above |
| @RansomSV (Ransom) | Test & merge Ransom's queue above |
| @Eric-DevTest (Eric) | UAT sign-off on #725, #834, #835, #615 — v1.0 gate |
| @dbbuilder (Claude) | Fix CI failures, open new PRs as needed |

---

*Pipeline: feature branch → staging (PR) → Eric UAT → main → production*
*All PRs target `staging`. #812 (staging→main) merges after Eric v1.0 sign-off.*"""

# Write body to temp file to avoid shell quoting issues
with open('/tmp/issue_649_body.md', 'w') as f:
    f.write(body)

print("Body written to /tmp/issue_649_body.md")
print(f"Peter queue: {len(peter_prs)} PRs | Ransom queue: {len(ransom_prs)} PRs | Pending: {len(pending_ci)}")
PYEOF

# Update the issue body
DAILY_ISSUE=$(cat /tmp/daily_issue_num.txt 2>/dev/null)
if [ -n "$DAILY_ISSUE" ] && [ "$DAILY_ISSUE" != "" ]; then
  gh issue edit "$DAILY_ISSUE" --body "$(cat /tmp/issue_649_body.md)"
  echo "✅ Issue #$DAILY_ISSUE body updated"
else
  echo "⚠️  No daily issue number found — skipping body update"
fi
```

---

## Checks Performed Per PR

| Check | Pass Condition |
|-------|---------------|
| **CI status** | All required checks green |
| **Issue reference** | PR body contains `#NNN` referencing an open issue |
| **Assigned** | At least one assignee set |
| **Reviewer** | At least one reviewer requested |
| **Testing directive** | Ransom's PRs have `## 🧪 Testing Directive` comment |
| **Test coverage** | No `.service.ts`/`.controller.ts` change without a `.spec.ts` change |
| **No stubs** | No `TODO:` / `FIXME:` / `Not implemented` in added lines |

---

## U-Rent Specific Context

### Team assignments
- **Ransom (`@RansomSV`)**: Easy-medium (1-5 SP), operational fixes, UX polish, CI, data migrations. Always needs testing directive comment.
- **Peter (`@octavianorg`)**: Security, auth, architecture, complex backend (6+ SP). Needs `@RansomSV` as reviewer.
- **Claude Code (`@dbbuilder`)**: Feature dev, assigned issues. Needs `@octavianorg` as reviewer.

### Merge order dependencies
Check `docs/` for current ROADMAP-*.md merge order guidelines. When PRs depend on each other, note in readiness report.

### Auth guard pattern (check in every PR touching controllers)
Every authenticated endpoint must use `@UseGuards(ClerkAuthGuard)`. Public endpoints use `@Public()`. Check: `grep -n "UseGuards\|@Public" <controller-file>`

### Financial field pattern
Use `??` not `||` for numeric fields: `depositAmount ?? 0`, `bufferMinutes ?? 0`. Flag any `|| 0` on financial/numeric fields as medium-severity bug.

### isApiReady guard (check in every PR touching frontend hooks/components)
Every `useEffect` calling an authenticated API must start with `if (!isApiReady) return;`. Missing = silent 401 on page load.

### Test patterns
- Service tests: `apps/api/src/modules/<feature>/<feature>.service.spec.ts`
- Controller tests: `apps/api/src/modules/<feature>/<feature>.controller.spec.ts`
- Mock pattern: `jest.fn().mockResolvedValue(...)` for async methods
- QueryBuilder mock: `{ select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue({}) }`
