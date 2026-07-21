---
name: u-rent-daily-update
description: Post a daily PR queue update to U-Rent GitHub issue #649 (Daily Order of Attack). Updates the issue body with today's date as a big H1 header + full priority plan, then minimizes all prior-day comments. Use when the user says "daily update", "update 649", "u-rent-daily-update", "morning update", or "monday kickoff".
allowed-tools:
  - Bash
  - Read
  - Write
---

# u-rent-daily-update

Refreshes issue #649 (Daily Order of Attack) for the start of a new workday. Three actions in sequence:
1. **Gather** current PR/issue state and CI status
2. **Overwrite the issue body** with today's date (big H1) + full priority plan
3. **Minimize all prior-day comments** so the thread is clean (history preserved, just collapsed)

---

## Instructions

<command-name>u-rent-daily-update</command-name>

### Step 1: Gather PR and CI data

```bash
cd /Users/admin/dev2/clients/U-Rent/u-rent-platform

gh pr list --state open \
  --json number,title,headRefName,baseRefName,assignees,statusCheckRollup,reviewRequests \
  --limit 100 > /tmp/daily_prs.json

gh pr list --state merged --json number,title,mergedAt,mergedBy --limit 20 \
  > /tmp/daily_merged.json

gh issue list --state open --json number,title,labels,assignees --limit 100 \
  > /tmp/daily_issues.json

echo "Data fetched"
```

### Step 2: Classify PRs and compute CI status

```bash
python3 << 'EOF'
import json

prs    = json.load(open('/tmp/daily_prs.json'))
merged = json.load(open('/tmp/daily_merged.json'))

peter_prs    = []
ransom_prs   = []
dependabot_prs = []

def ci_icon(pr):
    checks = pr.get('statusCheckRollup') or []
    failures = [c for c in checks if c.get('conclusion') in ('FAILURE', 'ERROR')]
    pending  = [c for c in checks if c.get('status') == 'IN_PROGRESS' or
                (c.get('conclusion') is None and c.get('status') != 'COMPLETED')]
    passing  = [c for c in checks if c.get('conclusion') == 'SUCCESS']
    if failures: return '🔴'
    if pending:  return '⏳'
    if passing:  return '✅'
    return '⚪'

for pr in sorted(prs, key=lambda x: x['number']):
    branch = pr['headRefName']
    if branch.startswith('dependabot/'):
        dependabot_prs.append(pr)
        continue
    reviewers = [r.get('login') or r.get('name','?') for r in pr.get('reviewRequests', [])]
    if 'octavianorg' in reviewers:
        peter_prs.append(pr)
    elif 'RansomSV' in reviewers:
        ransom_prs.append(pr)
    else:
        ransom_prs.append(pr)  # unassigned defaults to Ransom

with open('/tmp/daily_peter.json', 'w') as f: json.dump(peter_prs, f)
with open('/tmp/daily_ransom.json', 'w') as f: json.dump(ransom_prs, f)

print(f"Peter: {len(peter_prs)} | Ransom: {len(ransom_prs)} | Dependabot: {len(dependabot_prs)} | Merged: {len(merged)}")
EOF
```

### Step 3: Build the issue body and overwrite it

**Critical format rules:**
- **First line MUST be**: `# 📅 Weekday, Month D YYYY` — H1, no exceptions, biggest text GitHub renders
- **Second line**: blockquote with last-updated date
- **PR tables**: `| PR | CI | What it does | SP |` grouped by reviewer — tables NOT checkboxes
- **CI column**: `✅` / `⏳` / `🔴` / `⚪`
- Always include: Deployment Pipeline, Peter section, Ransom section, Eric UAT section, v1.0 Gate Checklist, PR Review Checklist

```bash
python3 << 'EOF'
import json
from datetime import datetime, timezone, timedelta

prs    = json.load(open('/tmp/daily_prs.json'))
merged = json.load(open('/tmp/daily_merged.json'))
peter  = json.load(open('/tmp/daily_peter.json'))
ransom = json.load(open('/tmp/daily_ransom.json'))

today   = datetime.now()
weekday = today.strftime('%A')
month   = today.strftime('%B')
day     = today.strftime('%-d')
year    = today.strftime('%Y')
ymd     = today.strftime('%Y-%m-%d')

def ci_icon(pr):
    checks = pr.get('statusCheckRollup') or []
    failures = [c for c in checks if c.get('conclusion') in ('FAILURE','ERROR')]
    pending  = [c for c in checks if c.get('status') == 'IN_PROGRESS' or
                (c.get('conclusion') is None and c.get('status') != 'COMPLETED')]
    passing  = [c for c in checks if c.get('conclusion') == 'SUCCESS']
    if failures: return '🔴'
    if pending:  return '⏳'
    if passing:  return '✅'
    return '⚪'

peter_rows = '\n'.join(
    f"| #{p['number']} | {ci_icon(p)} | {p['title'][:65]} | — |"
    for p in peter
) or '| — | — | No PRs in queue | — |'

ransom_rows = '\n'.join(
    f"| #{p['number']} | {ci_icon(p)} | {p['title'][:65]} | — |"
    for p in ransom
) or '| — | — | No PRs in queue | — |'

cutoff = datetime.now(timezone.utc) - timedelta(days=7)
recent = [m for m in merged
          if datetime.fromisoformat(m['mergedAt'].replace('Z','+00:00')) > cutoff]
merged_rows = '\n'.join(
    f"| #{m['number']} | {m['title'][:65]} | @{m['mergedBy']['login']} |"
    for m in recent
) or '| — | No merges in last 7 days | — |'

body = f"""# 📅 {weekday}, {month} {day} {year}

> **Last updated:** {ymd} by @dbbuilder · Auto-refreshed each morning via `/u-rent-daily-update`

---

## 🗺️ Deployment Pipeline

```
feature branch  ──►  staging  ──►  UAT (Eric validates)  ──►  main  ──►  production (Render)
```

| Stage | Who | Action | Gate |
|-------|-----|--------|------|
| **feature → staging** | Developer | Open PR targeting `staging` | CI green + 1 reviewer approval |
| **staging → UAT** | Ransom | Merge approved batch to `staging`, ping Eric | All PRs in batch CI-green |
| **UAT → main** | Peter | After Eric signs off in #725 | Eric comment "✅ verified" on issue |
| **main → production** | Auto (Render) | Push to `main` triggers deploy | — |

> **Rule:** No PR targets `main` directly. All changes flow through `staging` → UAT → `main`.

---

## 🔵 Peter (@octavianorg) — Security, Payments & Architecture

| PR | CI | What it does | SP |
|----|----|--------------|----|
{peter_rows}

---

## 🟠 Ransom (@RansomSV) — UI, Tests & Chores

| PR | CI | What it does | SP |
|----|----|--------------|----|
{ransom_rows}

---

## 🟡 Eric (@Eric-DevTest) — Waiting on Staging Deploy

🔔 Ransom will ping you when the UAT batch merges. Full UAT checklist in issue #725.

---

## ✅ Recently Merged (last 7 days)

| PR | Title | Merged by |
|----|-------|-----------|
{merged_rows}

---

## 🚪 v1.0 Gate Checklist

| Gate | Status |
|------|--------|
| CI green on staging | ⏳ |
| Security PRs merged | ⏳ |
| UAT batch merged to staging | ⏳ |
| Eric UAT sign-off in #725 | ⏳ Waiting |
| #812 staging→main | 🔒 After Eric sign-off |

---

## 📐 PR Review Checklist

**For Peter** — additionally check:
- [ ] Auth endpoints use `@UseGuards(ClerkAuthGuard)` or `@Public()`
- [ ] Numeric fields use `?? 0` not `|| 0` (`depositAmount ?? 0`, `bufferMinutes ?? 0`)
- [ ] Payment flows use `capture_method: 'manual'` and capture only on completion
- [ ] No new endpoints without rate limiting (`@Throttle`)

**For Ransom** — additionally check:
- [ ] `useEffect` API calls gated on `if (!isApiReady) return`
- [ ] Images use `OptimizedImage` not raw `<img>` or `next/image` directly
- [ ] No `display: none` + `loading="lazy"` combos
- [ ] XSS: user-generated content uses `xss` library, not custom sanitizer

---

*Single source of truth for daily work order. Updated each session by @dbbuilder. Run `/u-rent-daily-update` to refresh.*
"""

with open('/tmp/daily_body.md', 'w') as f:
    f.write(body)
print("Body written")
EOF

gh issue edit 649 --body-file /tmp/daily_body.md
echo "✅ Issue body updated"
```

> **Note**: Always build the body as a Python string and write to `/tmp/daily_body.md`, then post with `gh issue edit 649 --body-file`. Avoid heredocs for multi-section markdown — quoting issues cause silent truncation.

---

### Step 4: Minimize all prior-day comments

```bash
# Fetch all comment node IDs
gh api graphql -f query='
{
  repository(owner: "dbbuilder-org", name: "u-rent") {
    issue(number: 649) {
      comments(first: 100) {
        nodes { id databaseId createdAt }
      }
    }
  }
}' > /tmp/daily_comments.json

# Minimize everything older than today (UTC)
python3 << 'EOF'
import json, subprocess
from datetime import datetime, timezone

data = json.load(open('/tmp/daily_comments.json'))
comments = data['data']['repository']['issue']['comments']['nodes']

today_date = datetime.now(timezone.utc).date()
minimized = 0
skipped = 0

for c in comments:
    created = datetime.fromisoformat(c['createdAt'].replace('Z', '+00:00'))
    if created.date() < today_date:
        node_id = c['id']
        result = subprocess.run(
            ['gh', 'api', 'graphql', '-f',
             f'query=mutation {{ minimizeComment(input: {{subjectId: "{node_id}", classifier: OUTDATED}}) {{ minimizedComment {{ isMinimized }} }} }}'],
            capture_output=True, text=True
        )
        if '"isMinimized":true' in result.stdout:
            minimized += 1
        else:
            print(f"  ⚠️  Failed: {c['databaseId']} — {result.stderr[:80]}")
    else:
        skipped += 1

print(f"✅ Minimized {minimized} old comments, kept {skipped} today's comment(s)")
EOF
```

---

### Step 5: Report back to user

```
✅ Issue #649 updated for {Weekday, Month D}:
   - Issue body: big date header + {N} PRs (Peter: N, Ransom: N)
   - Minimized {N} prior-day comments
   - https://github.com/dbbuilder-org/u-rent/issues/649
```

---

## Format Reference

### Date header (always first line — no exceptions)
```markdown
# 📅 Monday, March 16 2026
```

### CI icons
| Icon | Meaning |
|------|---------|
| ✅ | All checks passing |
| ⏳ | Checks pending/running |
| 🔴 | One or more checks failing |
| ⚪ | No checks configured |

### SP estimates (if not in PR body)
| Type | SP |
|------|----|
| One-file bug fix | 1 |
| Cross-component fix | 2–3 |
| Unit test suite | 2–3 |
| Small feature | 3–5 |
| Large feature / refactor | 8 |

### Emoji label legend
| Emoji | Meaning |
|-------|---------|
| 🔐 | Security or auth |
| 💳 | Payments / Stripe |
| 🧪 | Tests |
| 🐛 | Bug fix |
| 🏗️ | Infrastructure / architecture |
| 🎨 | UI / styling |
| 🧹 | Chore / cleanup |
| 🚀 | Large feature |

---

## U-Rent Context

- **Issue #649**: Daily Order of Attack — `dbbuilder-org/u-rent`
- **Working dir**: `/Users/admin/dev2/clients/U-Rent/u-rent-platform`
- **Peter** (`@octavianorg`): Security, auth, payments, architecture, complex features. Reviews Claude Code PRs.
- **Ransom** (`@RansomSV`): UI fixes, tests, chores, ops. Always needs a testing directive comment on his PRs.
- **Eric** (`@Eric-DevTest`): UAT only — not a developer. Files bugs, validates fixes on staging.
- **All PRs target `staging`** — never `main` directly (except #812 staging→main)
- **Dependabot PRs**: Peter handles; retarget to `staging` if they're pointing at `main`
- **Comment minimization**: Uses GitHub GraphQL `minimizeComment` mutation with `classifier: OUTDATED`
