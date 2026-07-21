# u-rent-morning-update

Send personalized morning update emails to the U-Rent team: developers get their PR queue, testers get their UAT queue.

## Trigger Phrases

- `u-rent-morning-update`
- "send morning update"
- "morning emails"
- "send team update"
- "daily standup email"

## Recipients

| Person | Email | Gets |
|--------|-------|------|
| Peter | peter@servicevision.net | PRs needing his review + security items |
| Ransom | ransom@servicevision.net | PRs assigned to him + testing directives |
| Eric | eric@servicevision.net | Open issues needing UAT + recently fixed items to verify |
| Ryan | ryan@servicevision.net | Open issues needing UAT + recently fixed items to verify |

## Email Config

- **From:** `info@servicevision.io`
- **API Key:** vault → `~/.config/claude/credentials.md` → FireProof → "Resend API Key (update emails)" row (never hardcode — file is committed to GitHub)
- **API endpoint:** `https://api.resend.com/emails`

---

## Instructions

<command-name>u-rent-morning-update</command-name>

### Step 1: Gather data (parallel)

```bash
gh pr list --state open --json number,title,headRefName,assignees,reviewRequests,statusCheckRollup,body --limit 100 > /tmp/mu_prs.json
gh issue list --state open --json number,title,labels,assignees,body --limit 100 > /tmp/mu_issues.json
# Get recently merged PRs (last 48h) to surface fixes for testers to verify
gh pr list --state merged --json number,title,mergedAt,mergedBy,body --limit 20 > /tmp/mu_merged.json
```

### Step 2: Classify PRs by owner

```python
import json, subprocess

prs = json.load(open('/tmp/mu_prs.json'))
issues = json.load(open('/tmp/mu_issues.json'))
merged = json.load(open('/tmp/mu_merged.json'))

SECURITY_KEYWORDS = ['security', 'auth', 'payment', 'deposit', 'stripe', 'fraud',
                     'guard', 'permission', 'jwt', 'clerk', 'admin']

peter_prs = []    # PRs needing Peter's review
ransom_prs = []   # PRs assigned to Ransom
unassigned = []

for pr in prs:
    branch = pr['headRefName']
    if branch.startswith('dependabot/'):
        continue
    num = pr['number']
    title = pr['title']
    assignees = [a['login'] for a in pr.get('assignees', [])]
    reviewers = [r.get('login') or r.get('name','?') for r in pr.get('reviewRequests', [])]
    checks = pr.get('statusCheckRollup') or []
    failures = [c for c in checks if c.get('conclusion') in ('FAILURE', 'ERROR')]
    ci_status = '🔴 CI failing' if failures else ('🟢 Ready' if checks else '⚪ No CI')

    if 'octavianorg' in reviewers or any(k in (title + ' ' + branch).lower() for k in SECURITY_KEYWORDS):
        peter_prs.append({'num': num, 'title': title, 'branch': branch, 'ci': ci_status, 'assignees': assignees})
    elif 'RansomSV' in assignees or 'dbbuilder' in assignees:
        ransom_prs.append({'num': num, 'title': title, 'branch': branch, 'ci': ci_status})
    else:
        unassigned.append({'num': num, 'title': title, 'ci': ci_status})
```

### Step 3: Classify issues for testers

```python
import re
from datetime import datetime, timezone, timedelta

# Covered issues (have open PRs)
covered_by_pr = set()
for pr in prs:
    body = pr.get('body') or ''
    for m in re.finditer(r'#(\d+)', body):
        n = int(m.group(1))
        if 50 < n < 9999:
            covered_by_pr.add(n)

# Needs-UAT label = recently fixed, testers should verify on staging
needs_uat = [i for i in issues if any(l['name'] == 'needs-uat' for l in i.get('labels', []))]

# Open bugs without a PR (need investigation)
open_bugs = [i for i in issues
             if any(l['name'] in ('bug', 'uat-bug') for l in i.get('labels', []))
             and i['number'] not in covered_by_pr
             and not any(l['name'] == 'needs-uat' for l in i.get('labels', []))]

# Recently merged PRs (last 48h) that close issues → testers should verify
cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
recent_fixes = []
for pr in merged:
    merged_at_str = pr.get('mergedAt', '')
    if not merged_at_str:
        continue
    try:
        merged_at = datetime.fromisoformat(merged_at_str.replace('Z', '+00:00'))
    except:
        continue
    if merged_at > cutoff:
        body = pr.get('body') or ''
        refs = re.findall(r'(?:closes?|fixes?|resolves?)\s+#(\d+)', body, re.IGNORECASE)
        if refs:
            recent_fixes.append({'pr': pr['number'], 'title': pr['title'], 'issues': refs, 'merged_by': (pr.get('mergedBy') or {}).get('login', '?')})
```

### Step 4: Build email HTML

Use these helper blocks in all four emails:

```python
HEADER_STYLE = """
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 680px; margin: 0 auto; padding: 24px; }
h2 { font-size: 18px; margin-top: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 14px; }
th { background: #f3f4f6; padding: 7px 10px; text-align: left; font-size: 12px; color: #6b7280; }
td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
a { color: #2563eb; text-decoration: none; }
.badge { padding: 2px 7px; border-radius: 4px; font-size: 12px; font-weight: 500; }
.green { background: #d1fae5; color: #065f46; }
.red { background: #fee2e2; color: #991b1b; }
.gray { background: #f3f4f6; color: #374151; }
.note { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 10px 14px; margin: 10px 0; font-size: 14px; border-radius: 0 4px 4px 0; }
"""

GH_BASE = "https://github.com/dbbuilder-org/u-rent"
STAGING = "https://u-rent-web-staging.onrender.com"

def pr_link(num, title):
    return f'<a href="{GH_BASE}/pull/{num}">#{num}</a> {title[:60]}'

def issue_link(num, title=''):
    return f'<a href="{GH_BASE}/issues/{num}">#{num}</a> {title[:60]}'
```

**Peter's email** (security reviewer — his PR review queue):

```python
peter_rows = ''.join(
    f'<tr><td>{pr_link(p["num"], p["title"])}</td>'
    f'<td><span class="badge {"green" if "Ready" in p["ci"] else "red"}">{p["ci"]}</span></td>'
    f'<td>{"Assigned to: " + ", ".join(p["assignees"]) if p["assignees"] else "—"}</td></tr>'
    for p in peter_prs
)
peter_html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{HEADER_STYLE}</style></head><body>
<p>Good morning Peter,</p>
<p>Here are the PRs waiting on your review today.</p>
<h2>🔍 Your Review Queue ({len(peter_prs)} PRs)</h2>
<table><tr><th>PR</th><th>CI</th><th>Owner</th></tr>{peter_rows if peter_rows else '<tr><td colspan="3">Nothing in queue 🎉</td></tr>'}</table>
{'<div class="note">⚠️ ' + str(len([p for p in peter_prs if "failing" in p["ci"]])) + ' PR(s) have CI failures — check before merging.</div>' if any("failing" in p["ci"] for p in peter_prs) else ''}
<p>Staging: <a href="{STAGING}">{STAGING}</a> · Issues: <a href="{GH_BASE}/issues">{GH_BASE}/issues</a></p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
<p style="color:#9ca3af;font-size:12px">U-Rent Morning Update · Sent automatically · {datetime.now().strftime('%B %-d, %Y')}</p>
</body></html>"""
```

**Ransom's email** (his PR queue + testing directives):

```python
ransom_rows = ''.join(
    f'<tr><td>{pr_link(p["num"], p["title"])}</td>'
    f'<td><span class="badge {"green" if "Ready" in p["ci"] else "red"}">{p["ci"]}</span></td></tr>'
    for p in ransom_prs
)
ransom_html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{HEADER_STYLE}</style></head><body>
<p>Good morning Ransom,</p>
<p>Here's your queue for today — PRs assigned to you, and any that need your test pass before merging.</p>
<h2>📋 Your Active PRs ({len(ransom_prs)})</h2>
<table><tr><th>PR</th><th>CI</th></tr>{ransom_rows if ransom_rows else '<tr><td colspan="2">Nothing active 🎉</td></tr>'}</table>
<div class="note">For each PR: click the PR link → read the Testing Directive comment → test on staging → approve if green.</div>
<p>Staging: <a href="{STAGING}">{STAGING}</a> · PRs: <a href="{GH_BASE}/pulls">{GH_BASE}/pulls</a></p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
<p style="color:#9ca3af;font-size:12px">U-Rent Morning Update · Sent automatically · {datetime.now().strftime('%B %-d, %Y')}</p>
</body></html>"""
```

**Eric and Ryan's email** (UAT testers — identical content, different greeting):

```python
def tester_email(first_name):
    uat_rows = ''.join(
        f'<tr><td>{issue_link(i["number"], i["title"])}</td>'
        f'<td>{"Staged fix — please verify" if any(l["name"]=="needs-uat" for l in i.get("labels",[]))  else "Needs reproduction"}</td></tr>'
        for i in (needs_uat + open_bugs)[:15]
    )
    recent_rows = ''.join(
        f'<tr><td>PR <a href="{GH_BASE}/pull/{f["pr"]}">#{f["pr"]}</a> — {f["title"][:50]}</td>'
        f'<td>{", ".join(issue_link(n) for n in f["issues"][:3])}</td></tr>'
        for f in recent_fixes
    )
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{HEADER_STYLE}</style></head><body>
<p>Good morning {first_name},</p>
<p>Here's your UAT queue for today. The top section is fixes that were merged recently and need your sign-off on staging. Below that are open bugs that still need reproduction steps.</p>
{"<h2>✅ Recently Fixed — Please Verify on Staging</h2><table><tr><th>PR Merged</th><th>Closes</th></tr>" + recent_rows + "</table>" if recent_fixes else ""}
{"<h2>🐛 Open Issues Needing Attention (" + str(len(needs_uat) + len(open_bugs)) + ")</h2><table><tr><th>Issue</th><th>Action</th></tr>" + uat_rows + "</table>" if needs_uat or open_bugs else "<p>No open UAT issues! 🎉</p>"}
<div class="note">To verify a fix: visit the URL from the issue on <a href="{STAGING}">staging</a>, follow the original steps, confirm the bug is gone. Leave a comment "Verified fixed on staging [date]" and close the issue.</div>
<p>Staging: <a href="{STAGING}">{STAGING}</a> · All issues: <a href="{GH_BASE}/issues">{GH_BASE}/issues</a></p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
<p style="color:#9ca3af;font-size:12px">U-Rent Morning Update · Sent automatically · {datetime.now().strftime('%B %-d, %Y')}</p>
</body></html>"""
```

### Step 5: Send all four emails

```python
import requests

RESEND_KEY = '<read from vault: credentials.md → FireProof → Resend API Key (update emails)>'
FROM = 'U-Rent Team <info@servicevision.io>'
TODAY = datetime.now().strftime('%B %-d, %Y')

emails = [
    ('peter@servicevision.net', f'U-Rent Morning Update — {TODAY} (your review queue)', peter_html),
    ('ransom@servicevision.net', f'U-Rent Morning Update — {TODAY} (your PR queue)', ransom_html),
    ('eric@servicevision.net',   f'U-Rent UAT Update — {TODAY} (issues needing attention)', tester_email('Eric')),
    ('ryan@servicevision.net',   f'U-Rent UAT Update — {TODAY} (issues needing attention)', tester_email('Ryan')),
]

results = []
for to, subject, html in emails:
    resp = requests.post(
        'https://api.resend.com/emails',
        headers={'Authorization': f'Bearer {RESEND_KEY}', 'Content-Type': 'application/json'},
        json={'from': FROM, 'to': [to], 'subject': subject, 'html': html}
    )
    status = '✅ sent' if resp.status_code == 200 else f'❌ {resp.status_code}: {resp.json().get("message","")}'
    results.append(f'{to}: {status}')
    print(results[-1])
```

### Step 6: Report results

Print a concise summary:

```
Morning Update sent — [DATE]
  peter@servicevision.net: ✅ sent (N PRs in queue)
  ransom@servicevision.net: ✅ sent (N PRs in queue)
  eric@servicevision.net: ✅ sent (N items)
  ryan@servicevision.net: ✅ sent (N items)
```

---

## Notes

- **Domain:** `servicevision.io` is verified in Resend. Do NOT use `servicevision.net` (not verified).
- **Resend key:** vault → FireProof → "Resend API Key (update emails)" row
- **Repo:** `dbbuilder-org/u-rent` (all `gh` commands run against this repo)
- **Testers:** Eric and Ryan get identical content with different greeting. If Ryan has no issues yet, still send with the open bugs list.
- **If no PRs / issues:** Still send — "Nothing in queue today 🎉" is a valid and useful email.
