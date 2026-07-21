---
name: fireproof-update-email
description: Send a user-impact update email for the FireProof project. Reads git commits for a time period, translates them into plain-English benefit language (no code), and emails recipients via Resend. Use when the user says "send update email", "fireproof update", "weekly update", "daily update email", or "send the team an update".
allowed-tools:
  - Bash
  - Read
  - Write
---

# fireproof-update-email

Sends a branded HTML update email to one or more recipients summarizing what changed in FireProof during a given period — written in product/PM language, not developer language.

---

## Trigger Phrases

- `fireproof-update-email`
- "send update email"
- "send a weekly update"
- "send a daily update"
- "email the team an update"
- "send update to [name/email]"

---

## Instructions

<command-name>fireproof-update-email</command-name>

### Step 1: Resolve inputs

Extract from the user's message:

| Input | How to resolve |
|-------|---------------|
| **Period** | "daily" → since midnight today; "weekly" → last 7 days; "since [date]" → that date at 00:00; default = last 7 days |
| **Recipients** | Any emails in the message; if none given, ask. Common ones: `cpayne4@kumc.edu`, `chris@servicevision.net` |

Convert the period to a `--since` git date string:
- "daily" or "today" → `--since="$(date +'%Y-%m-%d') 00:00"`
- "weekly" → `--since="7 days ago"`
- "since April 14" → `--since="2026-04-14"`

### Step 2: Gather commits for the period

```bash
cd /Users/admin/dev2/fireproof

# Get commits in the period
git log --since="<resolved-since>" --format="%h|||%s|||%an|||%ad" --date=short --no-merges

# Also get merged PRs in the period (for richer context)
gh pr list --state merged --json number,title,mergedAt,body --limit 30 \
  | python3 -c "
import json, sys
from datetime import datetime, timezone
prs = json.load(sys.stdin)
cutoff = datetime.fromisoformat('<ISO_CUTOFF_DATE>').replace(tzinfo=timezone.utc)
recent = [p for p in prs if p['mergedAt'] and datetime.fromisoformat(p['mergedAt'].replace('Z','+00:00')) >= cutoff]
print(json.dumps(recent, indent=2))
"
```

### Step 3: Translate commits to user-impact items

For **each commit**, write a one-sentence plain-English impact statement using these rules:

| Commit prefix / pattern | Translation approach |
|------------------------|---------------------|
| `fix(auth)` / `fix(login)` | Frame as reliability: "You stay logged in…" |
| `fix(dashboard)` | Frame as accuracy: "The [metric] now shows the correct number…" |
| `fix(kumc)` / `fix(import)` | Frame as data integrity: "X inspections that were previously missing are now visible…" |
| `fix(inspections)` | Frame as usability: "The inspection list now correctly shows…" |
| `feat(...)` | Frame as a new capability: "You can now…" |
| `ci(...)` | Skip entirely — no user impact |
| `docs(...)` | Skip unless it affects something visible to users |
| `chore(...)` | Skip entirely |
| `refactor(...)` | Skip unless it fixed a visible bug |
| `perf(...)` | Frame as speed: "Pages load faster…" |

**Grouping rules:**
- Group multiple related fixes into one bullet if they address the same screen or workflow
- Never use technical words: no "SameSite", "SP", "cookie", "async", "API", "null", "stored procedure", "middleware", "CORS", "JWT", "localStorage"
- Replace technical references with plain equivalents:
  - "refresh token" → "your login session"
  - "HttpOnly cookie" → "your login session"
  - "stored procedure" / "SP" → "the system"
  - "dashboard overdue count" → "the overdue extinguisher count on your dashboard"
  - "KFS barcode" → "KFS-prefix extinguishers"
  - "staging table" → "import"
  - "SameSite=None" → (don't mention — just say "your session now persists")
  - "autocomplete" → "as you type, matching options appear"
  - "router-link" → "link"

**Badge classification:**
- `FIXED` — bugs corrected, errors resolved, numbers made accurate
- `NEW` — features users didn't have before
- `IMPROVED` — existing features that work better/faster

### Step 4: Build the email

**Subject line format:**
- Daily: `FireProof Updates — [Month Day, Year]`
- Weekly: `FireProof Weekly Update — Week of [Month Day, Year]`
- Custom: `FireProof Updates — Since [Month Day, Year]`

**HTML template** (substitute `{{...}}` placeholders):

```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">

  <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 32px 40px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 600;">FireProof — {{HEADING}}</h1>
    <p style="color: #fecaca; margin: 6px 0 0 0; font-size: 14px;">{{SUBHEADING}}</p>
  </div>

  <div style="background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 32px 40px;">

    <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">{{INTRO_LINE}}</p>

    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />

    {{ITEMS_HTML}}

    {{CLOSING_SECTION_IF_ANY}}

    <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin-top: 24px;">
      All changes are live now — no action needed on your end.
    </p>

    <p style="color: #111827; font-size: 14px; margin-top: 24px;">
      — Chris &amp; the FireProof team
    </p>

    <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
      FireProof · <a href="https://fireproofapp.net" style="color: #9ca3af;">fireproofapp.net</a>
    </p>

  </div>
</div>
```

**Each item block** (repeat for each user-impact bullet):

```html
<div style="margin-bottom: 28px;">
  <div style="display: flex; align-items: center; margin-bottom: 8px;">
    <span style="background: {{BADGE_BG}}; color: {{BADGE_COLOR}}; font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 999px; margin-right: 10px;">{{BADGE}}</span>
    <h2 style="margin: 0; font-size: 17px; color: #111827;">{{HEADLINE}}</h2>
  </div>
  <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 0 80px;">
    {{DETAIL}}
  </p>
</div>
```

**Badge colors:**
- FIXED → `background: #d1fae5; color: #065f46`
- NEW → `background: #dbeafe; color: #1e40af`
- IMPROVED → `background: #ede9fe; color: #5b21b6`

If there are **no user-facing changes** in the period (only CI/docs/chore commits), send a brief "No visible changes this period" email rather than an empty one.

### Step 5: Send via Resend

Always use curl via subprocess — never Python urllib/requests (blocked by Cloudflare).

```python
import json, subprocess

TO      = [{{RECIPIENT_LIST}}]       # list of email strings
SUBJECT = "{{SUBJECT}}"
FROM    = "FireProof <info@servicevision.io>"
BODY    = """{{HTML_BODY}}"""

payload = {
    "from": FROM,
    "to": TO,
    "subject": SUBJECT,
    "html": BODY,
}

with open('/tmp/send_email_payload.json', 'w') as f:
    json.dump(payload, f)

result = subprocess.run([
    'curl', '-s', '-X', 'POST', 'https://api.resend.com/emails',
    '-H', f'Authorization: Bearer {RESEND_API_KEY}',  # from vault — see Resend Config below
    '-H', 'Content-Type: application/json',
    '-d', '@/tmp/send_email_payload.json'
], capture_output=True, text=True)

if result.returncode != 0:
    print(f"curl error: {result.stderr}")
else:
    try:
        resp = json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"Non-JSON response: {result.stdout[:300]}")
    else:
        if 'id' in resp:
            print(f"✅ Sent to {TO} — message ID: {resp['id']}")
        else:
            print(f"❌ Resend error: {resp.get('message', resp)}")
```

### Step 6: Report to user

After sending, report:

```
✅ Update email sent.

Period:     {{period description}}
Recipients: {{comma-separated recipients}}
Subject:    {{subject}}
Message ID: {{id}}

{{N}} user-facing items included:
  {{FIXED items}}
  {{NEW items}}
  {{IMPROVED items}}

{{N}} commits skipped (CI/chore/docs only).
```

---

## Resend Config

- **API Key:** read from `~/.config/claude/credentials.md` → FireProof section, "Resend API Key (update emails)" row — set as `RESEND_API_KEY` before building the curl call. Never hardcode it here (this file is committed to GitHub)
- **From:** `FireProof <info@servicevision.io>`
- **Endpoint:** `https://api.resend.com/emails`
- **`servicevision.net` is NOT verified** — always send from `info@servicevision.io`

---

## Examples

### Daily update, single recipient
> "send a daily fireproof update to cpayne4@kumc.edu"

→ Commits since today 00:00, email to `cpayne4@kumc.edu`
→ Subject: `FireProof Updates — April 16, 2026`

### Weekly update, two recipients
> "send the weekly fireproof update to cpayne4@kumc.edu and chris@servicevision.net"

→ Commits since 7 days ago, both recipients
→ Subject: `FireProof Weekly Update — Week of April 10, 2026`

### Since a specific date
> "send a fireproof update since April 12 to charlotte"

→ Commits since April 12, recipient `cpayne4@kumc.edu` (charlotte = Charlotte Payne at KUMC)
→ Subject: `FireProof Updates — Since April 12, 2026`

---

## Known Recipients (KUMC project)

| Name | Email |
|------|-------|
| Charlotte Payne (KUMC) | `cpayne4@kumc.edu` |
| Chris Therriault | `chris@servicevision.net` |

---

## Notes

- Skip any commits that are purely CI, chore, docs, or refactor with no visible user impact
- If the commit message is ambiguous, err on the side of skipping it rather than fabricating an impact
- Merge commits are always skipped
- Keep the email scannable: max ~6 items; if more, group related ones
- The intro line should reference the recipient context (e.g. "Hi Charlotte" for KUMC emails, "Hi team" for internal)
- For KUMC emails, always mention the KUMC context (inspections, extinguishers, scan imports) — not generic SaaS language
