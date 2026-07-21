---
name: daily-update
description: Set up or update a daily client email update system for any project. Generates a GitHub Actions workflow that commits a markdown update to the repo and emails it via Resend SMTP. Use when the user says "daily update", "daily email", "set up daily update", "client update email", or "daily-update".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# daily-update

Sets up a GitHub Actions workflow that runs on a daily schedule to:
1. Generate a markdown update (recent commits, PRs, API health, next roadmap items)
2. Commit it to the repo under `<docs-dir>/daily-updates/YYYY-MM-DD.md`
3. Email it via Resend SMTP — ready to forward to the client

---

## Instructions

<command-name>daily-update</command-name>

### Step 1: Gather project config

Read `CLAUDE.md` and any project memory files to extract:
- **Project name** — e.g. "DoGood Platform"
- **GitHub repo slug** — e.g. `owner/repo` (run `git remote get-url origin` if not in CLAUDE.md)
- **API base URL** — production API for health check (e.g. `https://myapp-api.onrender.com`)
- **Web URL** — production web URL for health check
- **Roadmap file** — most recent `ROADMAP-*.md` path (relative to repo root)
- **Docs output dir** — where to write daily updates (e.g. `platform/docs/daily-updates`)
- **Scripts dir** — where to write the generator script (e.g. `platform/scripts`)
- **Workflows dir** — `.github/workflows/` relative to repo root
- **Email: to** — ask user if not clear from CLAUDE.md; default to user's email
- **Email: from** — a verified Resend sender address; ask user if unknown
- **Cron schedule** — default `7 13 * * 1-5` (8:07 AM EST, weekdays only)
- **RESEND_API_KEY** — ask user for the key if not already set as a GitHub secret

If any critical config is missing (repo, email to/from, Resend key), ask the user before proceeding.

```bash
# Confirm the repo slug
git remote get-url origin

# Check if RESEND_API_KEY is already set
gh secret list | grep RESEND_API_KEY
```

---

### Step 2: Set RESEND_API_KEY GitHub secret (if not already set)

```bash
gh secret set RESEND_API_KEY --body "<key-from-user>"
```

Resend SMTP credentials are always:
- **Host:** `smtp.resend.com` / **Port:** `465`
- **Username:** `resend`
- **Password:** the Resend API key

The **from address** must be a domain verified in the Resend account. Common patterns:
- `updates@servicevision.io` — default for servicevision.io projects (domain is Resend-verified)
- `updates@yourdomain.com` — if the domain is verified in Resend
- `onboarding@resend.dev` — Resend sandbox (testing only, doesn't look professional)

---

### Step 3: Write the generator script

Write `<scripts-dir>/daily-update.mjs` with the following structure. Substitute the project-specific values:

```javascript
#!/usr/bin/env node
/**
 * <PROJECT_NAME> — Daily Update Generator
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ─── Config ────────────────────────────────────────────────────────────────
const PROJECT_NAME = '<PROJECT_NAME>';
const API_BASE = '<API_BASE_URL>';
const WEB_URL = '<WEB_URL>';
const REPO = '<OWNER/REPO>';
const OUTPUT_DIR = '<docs-dir>/daily-updates';
const ROADMAP_FILE = '<roadmap-file-path>';  // relative to repo root

// ─── Helpers ───────────────────────────────────────────────────────────────
function exec(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch { return ''; }
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Data Collection ───────────────────────────────────────────────────────
function getRecentCommits() {
  const raw = exec('git log --since="25 hours ago" --format="%h|||%s|||%an|||%ar" --no-merges');
  return raw.split('\n').filter(Boolean).map(line => {
    const [hash, subject, author, time] = line.split('|||');
    return { hash, subject, author, time };
  });
}
function getOpenPRs() {
  const raw = exec('gh pr list --json number,title,author,createdAt,isDraft --state open --limit 20');
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}
function getMergedPRs() {
  const raw = exec('gh pr list --json number,title,mergedAt,author --state merged --limit 10');
  try {
    const prs = JSON.parse(raw || '[]');
    const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000);
    return prs.filter(pr => pr.mergedAt && new Date(pr.mergedAt) > cutoff);
  } catch { return []; }
}
function getLatestCIRuns() {
  const raw = exec('gh run list --limit 5 --json status,conclusion,name,createdAt,headBranch');
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}
async function checkHealth(url, path = '/') {
  try {
    const res = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(8000) });
    return res.ok ? { status: 'healthy' } : { status: `degraded (${res.status})` };
  } catch { return { status: 'unreachable' }; }
}
function getNextRoadmapItems(limit = 4) {
  const content = exec(`cat "${ROADMAP_FILE}" 2>/dev/null`);
  return content.split('\n')
    .filter(l => l.match(/^\s*-\s*\[\s*\]\s+/))
    .map(l => l.replace(/^\s*-\s*\[\s*\]\s+/, '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

// ─── Markdown Generation ───────────────────────────────────────────────────
function ciStatus(runs) {
  if (!runs.length) return '—';
  const last = runs[0];
  const icon = last.conclusion === 'success' ? '✅' : last.conclusion === 'failure' ? '❌' : '🔄';
  return `${icon} ${last.conclusion ?? last.status} (${last.name})`;
}

function generateMarkdown({ commits, mergedPRs, openPRs, ciRuns, apiHealth, webHealth, nextItems, date }) {
  const displayDate = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const lines = [];
  lines.push(`# ${PROJECT_NAME} — Daily Update\n**${displayDate}**\n`);

  lines.push(`## Activity (Last 24 Hours)\n`);
  if (!commits.length && !mergedPRs.length) {
    lines.push(`_No commits or merged PRs in the last 24 hours._\n`);
  } else {
    if (mergedPRs.length) {
      lines.push(`**Merged Pull Requests:**\n`);
      mergedPRs.forEach(pr => lines.push(`- [#${pr.number}](https://github.com/${REPO}/pull/${pr.number}) ${pr.title}`));
      lines.push('');
    }
    if (commits.length) {
      lines.push(`**Commits:**\n`);
      commits.forEach(c => lines.push(`- \`${c.hash}\` ${c.subject} _(${c.time})_`));
      lines.push('');
    }
  }

  lines.push(`## Platform Status\n`);
  lines.push(`| Service | Status |`);
  lines.push(`|---------|--------|`);
  lines.push(`| API | ${apiHealth.status === 'healthy' ? '✅ Healthy' : `⚠️ ${apiHealth.status}`} |`);
  lines.push(`| Web App | ${webHealth.status === 'healthy' ? '✅ Healthy' : `⚠️ ${webHealth.status}`} |`);
  lines.push(`| CI/CD | ${ciStatus(ciRuns)} |`);
  lines.push('');

  lines.push(`## Open Pull Requests\n`);
  const active = openPRs.filter(pr => !pr.isDraft);
  const drafts = openPRs.filter(pr => pr.isDraft);
  if (!openPRs.length) {
    lines.push(`_No open pull requests._\n`);
  } else {
    active.forEach(pr => lines.push(`- [#${pr.number}](https://github.com/${REPO}/pull/${pr.number}) ${pr.title} · _opened ${fmtDate(pr.createdAt)}_`));
    if (drafts.length) {
      lines.push(`\n**Drafts:**`);
      drafts.forEach(pr => lines.push(`- [#${pr.number}](https://github.com/${REPO}/pull/${pr.number}) ${pr.title} _(draft)_`));
    }
    lines.push('');
  }

  if (nextItems.length) {
    lines.push(`## Coming Up\n`);
    nextItems.forEach(item => lines.push(`- ${item}`));
    lines.push('');
  }

  lines.push(`---\n_Auto-generated · [View on GitHub](https://github.com/${REPO}/blob/main/${OUTPUT_DIR}/${date}.md)_`);
  return lines.join('\n');
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('Gathering data...');
  const [apiHealth, webHealth] = await Promise.all([checkHealth(API_BASE, '/api/v1/health'), checkHealth(WEB_URL)]);
  const commits = getRecentCommits();
  const openPRs = getOpenPRs();
  const mergedPRs = getMergedPRs();
  const ciRuns = getLatestCIRuns();
  const nextItems = getNextRoadmapItems(4);
  const today = new Date().toISOString().split('T')[0];
  const markdown = generateMarkdown({ commits, mergedPRs, openPRs, ciRuns, apiHealth, webHealth, nextItems, date: today });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = join(OUTPUT_DIR, `${today}.md`);
  writeFileSync(outPath, markdown, 'utf8');
  console.log(`Written: ${outPath}`);
  process.stdout.write('\n---EMAIL_BODY---\n' + markdown);
}
main().catch(err => { console.error(err); process.exit(1); });
```

---

### Step 4: Write the GitHub Actions workflow

Write `.github/workflows/daily-update.yml`. Key substitutions:
- `<scripts-dir>/daily-update.mjs` — path to the script
- `<docs-dir>/daily-updates/` — path to commit
- `<email-to>` — recipient
- `<email-from>` — verified Resend sender
- `<cron>` — default `7 13 * * 1-5` (8:07 AM EST weekdays)

```yaml
name: Daily Client Update

on:
  schedule:
    - cron: '<cron>'
  workflow_dispatch:

jobs:
  daily-update:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Generate daily update markdown
        id: generate
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          output=$(node <scripts-dir>/daily-update.mjs 2>&1)
          echo "$output"
          email_body=$(echo "$output" | awk '/---EMAIL_BODY---/{found=1; next} found{print}')
          echo "$email_body" > /tmp/email-body.md
          echo "date=$(date +'%b %d, %Y')" >> $GITHUB_OUTPUT
          echo "today=$(date +'%Y-%m-%d')" >> $GITHUB_OUTPUT

      - name: Commit and push markdown
        run: |
          git config user.name "<Project> Bot"
          git config user.email "noreply@servicevision.net"
          git add <docs-dir>/daily-updates/
          if git diff --staged --quiet; then
            echo "No changes to commit."
          else
            git commit -m "docs: daily update ${{ steps.generate.outputs.today }}"
            git push
          fi

      - name: Send email via Resend
        uses: dawidd6/action-send-mail@v3
        with:
          server_address: smtp.resend.com
          server_port: 465
          username: resend
          password: ${{ secrets.RESEND_API_KEY }}
          subject: "<PROJECT_NAME> — Update · ${{ steps.generate.outputs.date }}"
          to: <email-to>
          from: "<PROJECT_NAME> Updates <<email-from>>"
          body: file:///tmp/email-body.md
          convert_markdown: true
```

---

### Step 5: Test the workflow

```bash
# Trigger manually to verify everything works
gh workflow run daily-update.yml
sleep 10
gh run list --workflow=daily-update.yml --limit 3
```

Watch the run and confirm:
- Markdown file committed to `<docs-dir>/daily-updates/YYYY-MM-DD.md`
- Email received at `<email-to>`

---

### Step 6: Report to user

```
✅ Daily update set up.

Files created:
  <scripts-dir>/daily-update.mjs
  .github/workflows/daily-update.yml

Schedule: <cron> (<human-readable time>), weekdays only
Email: <email-from> → <email-to>
Subject: "<PROJECT_NAME> — Update · [date]"
Markdown saved to: <docs-dir>/daily-updates/YYYY-MM-DD.md

GitHub secret: RESEND_API_KEY ✅

To trigger manually: gh workflow run daily-update.yml
To update config (email, schedule, content): edit <scripts-dir>/daily-update.mjs
```

---

## Notes

- The `from` address must be a domain verified in the Resend dashboard. If the user doesn't have one, use `onboarding@resend.dev` for testing but note it looks unprofessional.
- `dawidd6/action-send-mail@v3` with `convert_markdown: true` renders the markdown as clean HTML. No separate HTML template needed.
- The `---EMAIL_BODY---` delimiter separates console logs from the email body in the script output.
- Set `fetch-depth: 0` on checkout so `git log --since` can see the full commit history.
- `workflow_dispatch` lets the user trigger manually from the GitHub Actions UI at any time.
- To add more sections (e.g. Sentry errors, test counts, user metrics), extend the `generateMarkdown()` function in the script.
- To update the **from address** or **recipient**, edit the workflow YAML directly.
- To change the **schedule**, edit the `cron` expression. Use [crontab.guru](https://crontab.guru) to check timing. Remember GitHub Actions runs in UTC.

## Resend SMTP Quick Reference

| Field | Value |
|-------|-------|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) |
| Username | `resend` |
| Password | Resend API key |
| From domain | Must be verified in Resend dashboard |
