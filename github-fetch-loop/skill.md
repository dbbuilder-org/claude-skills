# github-fetch-loop

Set up a durable daily GitHub Action that fetches an external URL (Google Doc, Notion page, Airtable export, RSS feed, etc.), calls Claude Haiku to analyze/diff the content against a prior snapshot, writes output files to the repo, and commits only if something changed.

Replaces the session-only `/loop` cron with a permanent workflow that survives session restarts.

## Trigger Phrases

- `/github-fetch-loop`
- "set up a fetch loop", "daily sync", "auto-digest"
- "keep digesting this", "daily fetch from"
- "sync this doc daily", "auto-update from URL"
- "durable loop", "github action loop"

---

## What Gets Created

```
.github/workflows/{slug}-sync.yml     — GitHub Actions workflow (daily cron)
{scripts_dir}/fetch-{slug}.mjs        — Node.js fetch + Claude diff script
{output_dir}/{output_file}            — Updated on each run (persistent)
{output_dir}/{snapshot_file}-DATE.md  — Dated snapshots per run (optional)
```

Requires one GitHub secret: `ANTHROPIC_API_KEY` (set automatically if not present).

---

## Instructions

<command-name>github-fetch-loop</command-name>

### Step 0: Gather parameters

Ask for (or infer from context) the following. If already provided in the user's message, skip asking:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `url` | The URL to fetch daily | Google Doc export URL, RSS feed, Airtable CSV export |
| `slug` | Short kebab-case name for files | `feedback-digest`, `changelog-sync`, `competitor-watch` |
| `purpose` | What Claude should do with the content | "diff against prior digest and update roadmap items" |
| `output_dir` | Where to write output files | `platform/docs`, `docs`, `data` |
| `snapshot` | Whether to write dated snapshots | yes/no (default: yes for docs, no for data files) |
| `schedule` | Cron schedule | `daily` (8:07 AM UTC), `weekly` (Monday 8:07 AM), or custom cron |
| `scripts_dir` | Where to put the script | default: `platform/scripts` or `scripts` if no platform/ dir |

For Google Docs: automatically convert the edit URL to the export URL:
```
Edit URL:   https://docs.google.com/document/d/{ID}/edit
Export URL: https://docs.google.com/document/d/{ID}/export?format=txt
```

**Schedule → cron expression:**
| User says | Cron | Notes |
|-----------|------|-------|
| daily | `7 8 * * *` | 8:07 AM UTC |
| weekly | `7 8 * * 1` | Monday 8:07 AM UTC |
| twice daily | `7 8,20 * * *` | 8:07 AM + 8:07 PM UTC |
| custom | use as-is | validate 5-field format |

---

### Step 1: Check for existing ANTHROPIC_API_KEY secret

```bash
gh secret list 2>/dev/null | grep ANTHROPIC_API_KEY
```

If not found, read the key from `~/.config/claude/credentials.md`:
```bash
grep "Anthropic.*API Key\|sk-ant-api" ~/.config/claude/credentials.md | grep -v "local use\|UpApply\|SecondChance" | tail -1
```

Set it:
```bash
gh secret set ANTHROPIC_API_KEY --body "{KEY}"
```

---

### Step 2: Write the fetch script

Write `{scripts_dir}/fetch-{slug}.mjs` using the template below.

Customize the `CLAUDE_PROMPT` constant for the specific use case — this is the most important part. It should tell Claude:
- What the fetched content represents
- What the prior snapshot represents
- What output files to write
- The exact `===SECTION===` delimiters to use in its response

**Script template:**

```javascript
#!/usr/bin/env node
/**
 * fetch-{slug}.mjs
 * {purpose}
 *
 * Runs daily via .github/workflows/{slug}-sync.yml
 * Requires: ANTHROPIC_API_KEY env var
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '{relative_path_to_output_dir}');
const FETCH_URL = '{export_url}';
const today = new Date().toISOString().split('T')[0];

// ─── Fetch URL (follows redirects) ───────────────────────────────────────────

async function fetchContent() {
  const res = await fetch(FETCH_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

// ─── Read prior snapshot ──────────────────────────────────────────────────────

function getPriorSnapshot() {
  // Customize: read the most recent dated file, or a fixed file
  const files = readdirSync(OUTPUT_DIR)
    .filter(f => f.startsWith('{snapshot_prefix}') && f.endsWith('.md'))
    .sort().reverse();
  if (!files.length) return null;
  return { name: files[0], content: readFileSync(resolve(OUTPUT_DIR, files[0]), 'utf8') };
}

// ─── Call Claude Haiku ────────────────────────────────────────────────────────

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
  return (await res.json()).content[0].text;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`[fetch-{slug}] Running for ${today}…`);

// Skip if today's snapshot already exists
const todayFile = resolve(OUTPUT_DIR, `{snapshot_prefix}${today}.md`);
if (existsSync(todayFile)) {
  console.log(`[fetch-{slug}] Already ran today — skipping.`);
  process.exit(0);
}

const content = await fetchContent();
console.log(`[fetch-{slug}] Fetched ${content.length} chars`);

const prior = getPriorSnapshot();
console.log(`[fetch-{slug}] Prior snapshot: ${prior?.name ?? 'none'}`);

// ─── CUSTOMIZE THIS PROMPT ───────────────────────────────────────────────────
const CLAUDE_PROMPT = `{customize_this_prompt_for_your_use_case}

Today: ${today}
Source URL: {source_url}

## Current content:
${content}

## Prior snapshot (${prior?.name ?? 'none'}):
${prior?.content ?? '(none — treat all as new)'}

Output format — respond with EXACTLY this structure:
===SNAPSHOT===
(full content of {snapshot_prefix}${today}.md)
===PERSISTENT===
(full content of {persistent_output_file})
===END===`;
// ─────────────────────────────────────────────────────────────────────────────

const response = await callClaude(CLAUDE_PROMPT);

const snapshotMatch = response.match(/===SNAPSHOT===([\s\S]*?)===PERSISTENT===/);
const persistentMatch = response.match(/===PERSISTENT===([\s\S]*?)===END===/);

if (!snapshotMatch || !persistentMatch) {
  console.error('[fetch-{slug}] Unexpected Claude response format');
  console.error(response.slice(0, 500));
  process.exit(1);
}

writeFileSync(todayFile, snapshotMatch[1].trim(), 'utf8');
writeFileSync(resolve(OUTPUT_DIR, '{persistent_output_file}'), persistentMatch[1].trim(), 'utf8');

console.log(`[fetch-{slug}] ✅ Written ${today} snapshot + updated persistent file`);
```

---

### Step 3: Write the GitHub Actions workflow

Write `.github/workflows/{slug}-sync.yml`:

```yaml
name: {Title} Sync

on:
  schedule:
    - cron: '{cron_expression}'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Run sync script
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: node {scripts_dir}/fetch-{slug}.mjs

      - name: Commit if changed
        run: |
          git config user.name "DoGood Bot"
          git config user.email "noreply@servicevision.net"
          git add {output_dir}/
          if git diff --staged --quiet; then
            echo "No changes."
          else
            git commit -m "docs: auto-sync {slug} $(date +%Y-%m-%d)"
            git push
          fi
```

---

### Step 4: Commit and push

```bash
git add .github/workflows/{slug}-sync.yml {scripts_dir}/fetch-{slug}.mjs
git commit -m "feat(ops): daily GitHub Action to sync {slug} from {url_domain}"
git push
```

---

### Step 5: Test with a manual trigger

```bash
gh workflow run {slug}-sync.yml
sleep 8
gh run list --workflow={slug}-sync.yml --limit=1
```

Wait for completion, then:
```bash
gh run watch $(gh run list --workflow={slug}-sync.yml --limit=1 --json databaseId -q '.[0].databaseId')
```

---

### Step 6: Confirm to user

Report:
```
✅ GitHub Action set up: {slug}-sync

Schedule:  {human_readable_schedule} ({cron_expression})
Workflow:  .github/workflows/{slug}-sync.yml
Script:    {scripts_dir}/fetch-{slug}.mjs
Output:    {output_dir}/{snapshot_prefix}YYYY-MM-DD.md  (dated snapshots)
           {output_dir}/{persistent_output_file}  (updated in place)

Runs forever — no session needed.
Commits only when content changes.
Cost: ~$0.003/run (Claude Haiku).

Manual trigger: gh workflow run {slug}-sync.yml
```

---

## Notes & Patterns

### Google Docs
Convert edit URL → export URL automatically:
- `https://docs.google.com/document/d/{ID}/edit` → `https://docs.google.com/document/d/{ID}/export?format=txt`
- For spreadsheets: `export?format=csv&gid={sheet_id}`

### If only one output file is needed
If no dated snapshots are needed (e.g., overwriting a single `data.json`), simplify the script to skip the snapshot logic and just use a single `===OUTPUT===...===END===` delimiter.

### Idempotency
The script always skips if today's dated snapshot already exists — safe to re-run.

### Secret already exists
If `ANTHROPIC_API_KEY` is already set in the repo, skip Step 1.

### Git author
Default bot name: `DoGood Bot` / `noreply@servicevision.net`.
Customize to match the project's bot identity if different.

### Cost
Claude Haiku: ~$0.80 / 1M input tokens, ~$4.00 / 1M output tokens.
A typical 10K-token run costs ~$0.003. Monthly (daily runs): ~$0.09.
