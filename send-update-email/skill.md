---
name: send-update-email
description: Send a user-impact update email for any project. Auto-detects project name, branding, and app URL from the working directory. Reads git commits for a time period, translates them into plain-English benefit language (no code), and emails recipients via Resend. Use when the user says "/send-update-email", "send update email", "send a weekly update", "send a daily update", "email the team an update", or "send update to [name/email]".
allowed-tools:
  - Bash
  - Read
  - Write
---

# send-update-email

Sends a branded HTML update email to one or more recipients summarizing what changed in a project during a given period — written in product/PM language, not developer language. Works in any project directory.

---

## Trigger Phrases

- `/send-update-email`
- "send update email"
- "send a weekly update"
- "send a daily update"
- "email the team an update"
- "send update to [names/emails]"

---

## Instructions

<command-name>send-update-email</command-name>

### Step 1: Resolve inputs from the user's message

| Input | How to resolve |
|-------|----------------|
| **Period** | "daily" / "today" → since midnight today; "weekly" → last 7 days; "since [date]" → that date 00:00; if omitted → ask |
| **Recipients** | Emails or names in the message. If none given, ask before proceeding. Never assume. |

Convert period to a `--since` git date string:
- "daily" / "today" → `"$(date +'%Y-%m-%d') 00:00"`
- "weekly" → `"7 days ago"`
- "since April 14" → `"2026-04-14"`
- "since Monday" → compute the most recent Monday's date

---

### Step 2: Auto-detect project context

Run all of these in parallel:

```bash
# 1. Project name candidates
git remote get-url origin 2>/dev/null          # parse repo name from URL
cat package.json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('name',''))" 2>/dev/null
head -5 CLAUDE.md 2>/dev/null                  # first heading or description line

# 2. App / web URL
grep -Ei "(https?://[a-z0-9.-]+\.(io|net|com|app|dev))" CLAUDE.md 2>/dev/null | head -5

# 3. Brand color — look for primary Tailwind color or explicit mention
grep -Ei "primary|brand|color|#[0-9a-f]{6}" CLAUDE.md 2>/dev/null | head -5

# 4. Sender name — derive from project name
# 5. Stack hint — for jargon mapping
grep -Ei "stack|\.net|vue|react|next|rails|django|laravel" CLAUDE.md 2>/dev/null | head -3
```

**Derive these values:**

| Value | How |
|-------|-----|
| `PROJECT_NAME` | Prefer CLAUDE.md title; fallback to git repo name (titlecased); fallback to directory name |
| `APP_URL` | First `https://` URL in CLAUDE.md that looks like a production app (not localhost, not github.com) |
| `HEADER_COLOR_1` / `HEADER_COLOR_2` | If a primary brand color is found, derive a gradient pair. Default: `#4f46e5` / `#4338ca` (indigo) |
| `SUBTEXT_COLOR` | Light version of header color. Default: `#c7d2fe` |
| `FROM_NAME` | `{PROJECT_NAME} Updates` |

**Resend API key:** Read from `~/.config/claude/credentials.md`:
```bash
grep -i "resend" ~/.config/claude/credentials.md | grep -oP '`re_[^`]+`' | tr -d '`' | head -1
```
Fallback: FireProof section → "Resend API Key (update emails)" row in the same vault file. Never hardcode a key here — this file is committed to GitHub.

---

### Step 3: Gather commits for the period

```bash
# All non-merge commits in the window
git log --since="<RESOLVED_SINCE>" --format="%h|||%s|||%an|||%ad" --date=short --no-merges

# Merged PRs (GitHub projects only — skip gracefully if gh not available)
gh pr list --state merged --json number,title,mergedAt,body --limit 40 2>/dev/null \
  | python3 -c "
import json, sys
from datetime import datetime, timezone
try:
    prs = json.load(sys.stdin)
    cutoff = datetime.fromisoformat('<ISO_CUTOFF>').replace(tzinfo=timezone.utc)
    recent = [p for p in prs if p.get('mergedAt') and datetime.fromisoformat(p['mergedAt'].replace('Z','+00:00')) >= cutoff]
    print(json.dumps(recent, indent=2))
except: print('[]')
"
```

---

### Step 4: Translate commits to user-impact items

**Universal translation rules:**

| Commit type | User-impact framing |
|-------------|---------------------|
| `fix(auth)` / `fix(login)` / `fix(session)` | Reliability: "You stay logged in…" / "Login now works correctly when…" |
| `fix(dashboard)` / `fix(report)` | Accuracy: "The [metric] on your dashboard now shows the correct number…" |
| `fix(import)` / `fix(sync)` / `fix(migration)` | Data integrity: "Records that were previously missing are now visible…" |
| `feat(...)` / `add(...)` | New capability: "You can now…" |
| `fix(...)` (generic UI) | Usability: "The [screen] now correctly shows…" / "An error that appeared when [action] has been resolved." |
| `perf(...)` / `perf:` | Speed: "[Page/action] loads faster…" |
| `ci(...)` | **Skip** — no user impact |
| `chore(...)` | **Skip** — no user impact |
| `docs(...)` | **Skip** unless it affects user-visible help text or onboarding |
| `refactor(...)` | **Skip** unless it fixed a visible bug (check commit body) |
| `test(...)` | **Skip** — no user impact |
| `build(...)` | **Skip** — no user impact |
| `revert(...)` | Frame as: "An issue introduced recently has been corrected." |

**Hard blocklist — never use these words in the email:**
`API`, `endpoint`, `cookie`, `SameSite`, `JWT`, `token`, `middleware`, `CORS`, `async`, `await`, `null`, `undefined`, `stored procedure`, `SP`, `SQL`, `query`, `migration`, `schema`, `index`, `cache`, `Redis`, `localStorage`, `sessionStorage`, `webpack`, `vite`, `bundle`, `TypeScript`, `type error`, `interface`, `component`, `hook`, `ref`, `prop`, `emit`, `CI/CD`, `pipeline`, `workflow`, `Docker`, `container`, `Kubernetes`, `deploy`, `build`, `lint`, `test suite`, `spec`, `mock`, `stub`

**Plain-language substitutions:**
- "refresh token" / "access token" → "your login session"
- "stored procedure" / "SP" / "SQL query" → "the system" or "our records"
- "staging table" / "import pipeline" → "the import"
- "autocomplete dropdown" → "suggestions appear as you type"
- "router-link" / "hyperlink" / "anchor" → "link"
- "barcode" → keep as "barcode" (users understand this)
- "webhook" → "automatic notification"
- "cron job" / "scheduled task" → "automatic daily process"
- "environment variable" → "system configuration"
- "Render" / "Vercel" / "Azure" → "our servers" (unless audience is technical)

**Grouping rules:**
- Combine ≤ 3 closely related fixes into one bullet with a broader headline
- Max 6 bullets total — if more, group by theme
- Order: FIXED first, then NEW, then IMPROVED

**Badge classification:**
- `FIXED` — bugs resolved, errors corrected, numbers made accurate
- `NEW` — capabilities users didn't have before
- `IMPROVED` — existing things that now work better or faster

---

### Step 5: Write the email

**Subject:**
- Daily: `{PROJECT_NAME} Updates — {Month Day, Year}`
- Weekly: `{PROJECT_NAME} Weekly Update — Week of {Month Day, Year}`
- Since date: `{PROJECT_NAME} Updates — Since {Month Day, Year}`

**Intro line logic:**
- If recipients are all internal (no client emails detected): "Here's a summary of what shipped this [period]."
- If any recipient appears to be a client (non-servicevision.io/net domain): "Here's a plain-English summary of what's new and fixed in {PROJECT_NAME} [period framing]."
- Greet by first name if only one recipient and name is known.

**HTML template:**

```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">

  <div style="background: linear-gradient(135deg, {HEADER_COLOR_1}, {HEADER_COLOR_2}); padding: 32px 40px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 600;">{PROJECT_NAME} — {HEADING}</h1>
    <p style="color: {SUBTEXT_COLOR}; margin: 6px 0 0 0; font-size: 14px;">{SUBHEADING}</p>
  </div>

  <div style="background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 32px 40px;">

    <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">{INTRO_LINE}</p>

    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />

    {ITEMS_HTML}

    <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin-top: 24px;">
      All changes are live — no action needed on your end. Reply to this email with any questions.
    </p>

    <p style="color: #111827; font-size: 14px; margin-top: 24px;">
      — Chris &amp; the {PROJECT_NAME} team
    </p>

    <p style="font-size: 12px; color: #9ca3af; margin-top: 32px;">
      {PROJECT_NAME}{APP_URL_LINE}
    </p>

  </div>
</div>
```

Where `{APP_URL_LINE}` is: ` · <a href="{APP_URL}" style="color: #9ca3af;">{APP_URL}</a>` — or empty string if no URL found.

**Item block** (one per user-impact point):

```html
<div style="margin-bottom: 28px;">
  <div style="display: flex; align-items: center; margin-bottom: 8px;">
    <span style="background: {BADGE_BG}; color: {BADGE_FG}; font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 999px; margin-right: 10px;">{BADGE}</span>
    <h2 style="margin: 0; font-size: 17px; color: #111827;">{HEADLINE}</h2>
  </div>
  <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 0 80px;">
    {DETAIL}
  </p>
</div>
```

**Badge color pairs:**
- FIXED → `background: #d1fae5; color: #065f46`
- NEW → `background: #dbeafe; color: #1e40af`
- IMPROVED → `background: #ede9fe; color: #5b21b6`

**No user-facing changes:** If all commits were CI/chore/docs, still send — subject "No visible changes this [period]", body: "Nothing shipped to the app this [period] — the team focused on infrastructure and internal maintenance. Updates will resume as soon as new features or fixes are ready."

---

### Step 6: Send via Resend

**Always use curl via subprocess — never Python urllib/requests (blocked by Cloudflare).**

```python
import json, subprocess

RESEND_KEY = "<KEY_FROM_CREDENTIALS>"
TO         = ["{RECIPIENT_1}", "{RECIPIENT_2}"]   # list
SUBJECT    = "{SUBJECT}"
FROM       = "{FROM_NAME} <info@servicevision.io>"
BODY       = """{HTML_BODY}"""

payload = {"from": FROM, "to": TO, "subject": SUBJECT, "html": BODY}

with open('/tmp/send_email_payload.json', 'w') as f:
    json.dump(payload, f)

result = subprocess.run([
    'curl', '-s', '-X', 'POST', 'https://api.resend.com/emails',
    '-H', f'Authorization: Bearer {RESEND_KEY}',
    '-H', 'Content-Type: application/json',
    '-d', '@/tmp/send_email_payload.json'
], capture_output=True, text=True)

if result.returncode != 0:
    print(f"curl error: {result.stderr}")
else:
    try:
        resp = json.loads(result.stdout)
        if 'id' in resp:
            print(f"✅ Sent to {TO} — message ID: {resp['id']}")
        else:
            print(f"❌ Resend error: {resp.get('message', resp)}")
    except json.JSONDecodeError:
        print(f"Non-JSON response: {result.stdout[:300]}")
```

**Sender rules:**
- Always send FROM `info@servicevision.io` — this is the only verified domain in Resend
- `servicevision.net` is **not** verified — do not use it as a from address
- The display name (`FROM_NAME`) can be the project name

---

### Step 7: Report to user

```
✅ Update email sent.

Project:    {PROJECT_NAME}
Period:     {period description}
Recipients: {comma-separated list}
Subject:    {subject line}
Message ID: {id from Resend}

{N} user-facing items:
  FIXED:    {list of headlines}
  NEW:      {list of headlines}
  IMPROVED: {list of headlines}

{N} commits skipped (CI / chore / docs / internal only).
```

---

## Brand color defaults by project type

If no brand color is found in CLAUDE.md, use these defaults based on detected stack:

| Project type | Color 1 | Color 2 | Subtext |
|-------------|---------|---------|---------|
| FireProof / safety | `#dc2626` | `#b91c1c` | `#fecaca` |
| Healthcare / compliance | `#0369a1` | `#0284c7` | `#bae6fd` |
| Finance / payments | `#065f46` | `#047857` | `#a7f3d0` |
| Generic SaaS | `#4f46e5` | `#4338ca` | `#c7d2fe` |
| Education | `#7c3aed` | `#6d28d9` | `#ddd6fe` |

---

## Worked examples

### Example 1: daily update, client + internal
> `/send-update-email daily to cpayne4@kumc.edu and chris@servicevision.net`

- Period: since today 00:00
- Project detected from CWD (fireproof → FireProof, red brand)
- Recipients: both
- Intro: "Hi Charlotte — here's what changed in FireProof today."

### Example 2: weekly update, internal only
> `/send-update-email weekly to chris@servicevision.net`

- Period: last 7 days
- Intro: "Here's a summary of what shipped in {PROJECT_NAME} this week."

### Example 3: different project directory
> cd ~/dev2/UpApply && `/send-update-email since April 10 to ransom@servicevision.net`

- Project: UpApply (detected from package.json / CLAUDE.md)
- Period: since April 10
- Brand: generic SaaS indigo (no brand color in CLAUDE.md)

### Example 4: no recipients specified
> `/send-update-email weekly`

- **Ask the user**: "Who should receive this update email?"
- Do not proceed until at least one recipient is confirmed.

---

## Notes

- This skill works from whatever directory is active when invoked — it does not assume FireProof
- If `gh` CLI is unavailable or the project isn't on GitHub, skip the PR step gracefully and use commits only
- Keep the email scannable: 3–6 bullets is ideal. More than 6 → group by theme
- Never fabricate impact. If you can't write a clear user-facing sentence for a commit, skip it
- Merge commits (`Merge pull request #N`) are always skipped
- Revert commits should be translated as "An issue introduced recently has been corrected" without naming what was reverted
- If the same fix appears in both a commit and a merged PR, deduplicate — use the PR title as the source of truth (usually more descriptive)
