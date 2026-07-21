---
name: sentry-to-issues
description: Sets up automated Sentry → GitHub Issues pipeline on any project. Detects the project's Sentry DSN, configures a GitHub Actions workflow that polls Sentry every 4 hours for new unresolved errors, uses Claude Haiku to write issue bodies with stacktrace context, and creates GitHub issues labeled 'bug' + 'sentry'. Supports DISCOVER_ONLY mode to seed state without creating issues. Triggered by "sentry-to-issues", "setup sentry automation", "automate sentry errors to issues".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# sentry-to-issues Skill

Automate Sentry error tracking → GitHub Issues on any project. One command sets up the full pipeline.

## Trigger Phrases

- `/sentry-to-issues`
- `/sentry-to-issues --project <slug> --org <org>`
- "setup sentry automation"
- "automate sentry errors to issues"
- "create github issues from sentry"

## Usage

```
/sentry-to-issues
/sentry-to-issues --project dogood-api --org servicevision
/sentry-to-issues --project upapply-api --discover-only
```

## What it Does

1. **Detects Sentry project** — reads DSN from .env, doppler config, or credentials.md
2. **Detects GitHub repo** — uses `gh repo view`
3. **Copies script templates** from DoGood reference implementation at `~/dev2/clients/DoGood/scripts/sentry-checker/`
4. **Adapts scripts** to the project's Sentry org + project slug
5. **Creates GitHub Actions workflow** at `.github/workflows/sentry-checker.yml`
6. **Sets GitHub secrets** — SENTRY_AUTH_TOKEN, confirms ANTHROPIC_API_KEY and RESEND_API_KEY are set
7. **Runs DISCOVER_ONLY** to seed `known-issues.json` with existing errors (so no flood of old issues)
8. **Commits everything** and reports the setup summary

---

## Step-by-Step Instructions

### Step 1: Parse Arguments

Check the invocation for:
- `--project <slug>` — Sentry project slug (e.g. `dogood-api`, `upapply-api`)
- `--org <slug>` — Sentry org slug (default: `servicevision`)
- `--discover-only` — skip the discover run (useful if secrets aren't set yet)
- `--schedule <cron>` — override the default `0 */4 * * *` cron (e.g. `0 */6 * * *`)

### Step 2: Detect Sentry DSN and Project Slug

If `--project` not provided, search for the Sentry DSN in this order:

1. **Grep for DSN** in project files:
   ```bash
   grep -r "sentry.io" . --include="*.env" --include="*.env.*" --include="*.yaml" --include="*.yml" -l 2>/dev/null | head -5
   grep -r "SENTRY_DSN\|sentry.io/.*/" . --include="*.ts" --include="*.js" --include="*.py" -l 2>/dev/null | head -5
   ```

2. **Parse the DSN** — Sentry DSN format: `https://<key>@o<orgid>.ingest.<region>.sentry.io/<project-id>`
   The project **slug** is NOT in the DSN (DSN has project ID). To get the slug:
   ```bash
   curl -s "https://sentry.io/api/0/projects/<org-slug>/<project-id-number>/" \
     -H "Authorization: Bearer <token>" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('slug',''))"
   ```
   But it's easier to grep for the project slug in README, CLAUDE.md, or credentials.md first.

3. **Check credentials.md** at `~/.config/claude/credentials.md`:
   - Look for a section matching the current project name
   - Extract the `Sentry | Project` row value (e.g. `dogood-api`)
   - Extract the `Sentry | DSN` row to confirm it's the right org

4. **Ask the user** if not found:
   ```
   I couldn't find a Sentry DSN in this project. Please provide:
   - Sentry org slug (e.g. servicevision)
   - Sentry project slug (e.g. dogood-api)
   ```

**Extract org slug from DSN**: The org is NOT in the DSN URL. Use the known default `servicevision` unless overridden by `--org`.

### Step 3: Get Sentry Auth Token

Check in this order:
1. Is `SENTRY_AUTH_TOKEN` already a GitHub secret? `gh secret list --repo <repo>` — if present, skip
2. Read from `~/.config/claude/credentials.md`:
   - Look for `## Sentry Error Tracking` section
   - Use `Admin R/W Token` value (long `sntryu_…` value — never copy it into this file)
3. If a project-specific token exists in credentials.md (e.g. `FireProof PAT`), prefer it for that project

### Step 4: Detect GitHub Repo

```bash
gh repo view --json nameWithOwner --jq '.nameWithOwner'
```

Also check if `DOGOOD_GITHUB_PAT` is already set as a secret (reused across projects):
```bash
gh secret list --repo <repo> | grep -E "DOGOOD_GITHUB_PAT|PAT"
```

### Step 5: Read Template Scripts

Read the reference implementation from DoGood:
```
~/dev2/clients/DoGood/scripts/sentry-checker/check.mjs
```

This is the canonical template. Adapt it for the new project by changing:
- `SENTRY_ORG` constant → new org slug
- `SENTRY_PROJECT` constant → new project slug
- `NOTIFY_EMAIL` → keep as `chris@servicevision.net` (or use project-specific email if known)
- `FROM_EMAIL` → keep as `noreply@servicevision.net`

### Step 6: Write Files to Project

Create these files in the **current working directory** (the project root):

1. `scripts/sentry-checker/check.mjs` — adapted from template
2. `scripts/sentry-checker/known-issues.json` — empty state:
   ```json
   {
     "issues": [],
     "lastCheck": null
   }
   ```
3. `.github/workflows/sentry-checker.yml` — read from DoGood template:
   `~/dev2/clients/DoGood/.github/workflows/sentry-checker.yml`
   No changes needed (all config is in the script constants).

### Step 7: Set GitHub Secrets

Set the required secrets on the repo:

```bash
# Sentry auth token
echo "<token>" | gh secret set SENTRY_AUTH_TOKEN --repo <repo>

# Confirm ANTHROPIC_API_KEY is set (needed for Claude issue generation)
gh secret list --repo <repo> | grep ANTHROPIC_API_KEY
# If missing: look up in ~/.config/claude/credentials.md and set it

# Confirm RESEND_API_KEY is set
gh secret list --repo <repo> | grep RESEND_API_KEY
# If missing: look up in credentials.md for the project's Resend key and set it

# Confirm DOGOOD_GITHUB_PAT or equivalent PAT is set
gh secret list --repo <repo> | grep -E "PAT|GITHUB_PAT"
# If missing: use `gh auth token` as a fallback, or look up in credentials.md
```

If a PAT secret with a different name is already set (e.g. `GITHUB_PAT`, `REPO_PAT`), update the workflow's `DOGOOD_GITHUB_PAT` env var reference to match — or just set `DOGOOD_GITHUB_PAT` as an alias pointing to the same value.

### Step 8: Commit

```bash
git add scripts/sentry-checker/ .github/workflows/sentry-checker.yml
git commit -m "feat(sentry-checker): automated Sentry → GitHub Issues pipeline

Polls ${SENTRY_ORG}/${SENTRY_PROJECT} every 4 hours.
New unresolved errors → GitHub issues (bug + sentry labels) with
Claude-generated body from Sentry event stacktrace.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push
```

### Step 9: Seed State (DISCOVER_ONLY)

Unless `--discover-only` was passed as a skip flag:

```bash
gh workflow run sentry-checker.yml --repo <repo> -f discover_only=true
```

Then wait ~30s and check:
```bash
gh run list --repo <repo> --workflow=sentry-checker.yml --limit 1
```

If it succeeds, pull the updated `known-issues.json` from the remote:
```bash
git pull --rebase
```

Report how many existing issues were seeded.

### Step 10: Report

Output a summary:

```markdown
## Sentry → GitHub Issues — Setup Complete

**Project:** servicevision/dogood-api
**Repo:** RBDoGood/dogood
**Schedule:** Every 4 hours (`0 */4 * * *`)

### Secrets Configured
- ✅ SENTRY_AUTH_TOKEN
- ✅ ANTHROPIC_API_KEY
- ✅ RESEND_API_KEY
- ✅ DOGOOD_GITHUB_PAT

### Files Created
- `scripts/sentry-checker/check.mjs`
- `scripts/sentry-checker/known-issues.json` (13 existing issues seeded)
- `.github/workflows/sentry-checker.yml`

### Next Scheduled Run
The workflow runs every 4 hours. Any new Sentry issue will automatically
get a GitHub issue created with labels `bug` + `sentry`.

To trigger manually: `gh workflow run sentry-checker.yml --repo <repo>`
```

---

## Edge Cases

### Project has no Sentry yet
If no DSN found anywhere, tell the user:
> "No Sentry DSN found. Add Sentry to this project first, then re-run `/sentry-to-issues --project <slug>`."

### Org-level GitHub Actions restrictions
If `GITHUB_TOKEN` can't create issues (403), the workflow uses `DOGOOD_GITHUB_PAT`.
Check if the org has this restriction:
```bash
gh api repos/<owner>/<repo> --jq '.permissions.push'
```
If PAT is needed, confirm `DOGOOD_GITHUB_PAT` is set.

### Multiple Sentry projects for one repo
If the codebase has multiple DSNs (e.g. `dogood-api` + `dogood-worker`), create separate checker instances:
- `scripts/sentry-checker-api/` + `scripts/sentry-checker-worker/`
- Two workflow files with different names
- Each with its own `known-issues.json`

Ask the user if they want both or just one.

### Custom schedule
Default is every 4 hours. For high-traffic APIs, consider every 2 hours (`0 */2 * * *`).
For low-traffic projects, every 12 hours (`0 */12 * * *`) is fine.

---

## Constraints

- Never assign GitHub issues to specific users
- Never create issues for Sentry items already in `known-issues.json`
- Always run DISCOVER_ONLY before the first scheduled run to avoid issue floods
- Always commit `known-issues.json` as part of the setup (even if empty — the workflow needs the file to exist)
- Do not hardcode API keys in script files — they are passed via GitHub secrets / env vars
