# env-harden

Set up production-grade environment variable hardening for any project.
Implements the five-place rule: schema → pre-deploy validator → example file →
render.yaml/CI config → backup script. Prevents silent crashes, wipes, and
drift between sources. Adapted from the U-Rent and Story Magic reference implementations.

## Trigger Phrases

- `/env-harden`
- "harden env vars", "env var hardening", "setup env validation"
- "add env var backup", "five-place rule", "env var schema"
- "pre-deploy env check", "backup env vars to github"

---

## Instructions

<command-name>env-harden</command-name>

You are setting up environment variable hardening for the current project.
Work through each phase below in order. After completing all phases, update
the project memory with what was done.

---

### Phase 0: Discover the project

Read these files (they may not all exist — skip gracefully):
- `render.yaml` — are there `preDeployCommand` entries already?
- `scripts/check-env.js` — does a validator already exist?
- `scripts/backup-env.sh` — does a backup script exist?
- `.env.example` (root or per-service) — what vars are documented?
- `package.json` or the equivalent build file — what stack is this?

Also run:
```bash
ls scripts/ 2>/dev/null; ls .env* 2>/dev/null; head -5 render.yaml 2>/dev/null
```

Identify:
- **Stack**: Node.js/Next.js, .NET, Python, Vue, or mixed
- **Deployment target**: Render, Fly.io, Azure, Vercel, or local Docker
- **Existing env files**: list all `.env`, `.env.example`, `appsettings.json` etc.
- **Services**: how many Render/Fly services exist (web, api, worker, etc.)
- **Render service IDs**: check `~/.config/claude/credentials.md` for this project

Tell the user what you found before proceeding.

---

### Phase 1: Create `scripts/check-env.js` (pre-deploy validator)

If `scripts/check-env.js` already exists, enhance it instead.
For .NET-only projects with no Node.js at all, skip this phase and note it.

Create `scripts/check-env.js` using this template, adapted to the actual
vars this project needs:

```javascript
#!/usr/bin/env node
/**
 * Pre-deploy environment variable validator.
 *
 * Fails fast with a clear list of every missing/invalid variable.
 * Run as Render preDeployCommand before migrations.
 *
 * Usage:
 *   node scripts/check-env.js
 *   NODE_ENV=staging node scripts/check-env.js
 */
'use strict';

const env = process.env;
const errors = [];
const nodeEnv = env.NODE_ENV || 'development';
const isProdOrStaging = ['production', 'staging'].includes(nodeEnv);

console.log(`\n🔍  Checking environment variables  [NODE_ENV=${nodeEnv}]\n`);

// ── Helpers ──────────────────────────────────────────────────────────────────

function required(key, description) {
  if (!env[key] || env[key].trim() === '') {
    errors.push(`  ✗ ${key} — MISSING  (${description})`);
    return false;
  }
  return true;
}

function requiredInProd(key, description) {
  if (isProdOrStaging) required(key, description);
}

function mustStartWith(key, prefix, description) {
  if (env[key] && !env[key].startsWith(prefix)) {
    errors.push(`  ✗ ${key} must start with '${prefix}'  (${description})`);
  }
}

function mustBeFalseInProd(key, description) {
  if (isProdOrStaging && env[key] !== 'false') {
    errors.push(`  ✗ ${key} must be 'false' in ${nodeEnv}  (${description})`);
  }
}

function minLength(key, min, description) {
  if (env[key] && env[key].length < min) {
    errors.push(`  ✗ ${key} — must be at least ${min} chars  (${description})`);
  }
}

function warn(key, description) {
  if (!env[key] || env[key].trim() === '')
    console.warn(`  ⚠  ${key} — not set  (${description})`);
}

// ── Validation ───────────────────────────────────────────────────────────────

// ⬇⬇ CUSTOMIZE BELOW THIS LINE FOR YOUR PROJECT ⬇⬇

// Core
required('NODE_ENV', 'must be development | staging | production');

// Database
required('DATABASE_URL', 'primary database connection string');

// Auth (example — adjust to your auth provider)
requiredInProd('CLERK_SECRET_KEY', 'Clerk secret key for authentication');
if (env.CLERK_SECRET_KEY) mustStartWith('CLERK_SECRET_KEY', 'sk_', 'Clerk secret key format');

// ⬆⬆ CUSTOMIZE ABOVE THIS LINE FOR YOUR PROJECT ⬆⬆

// ── Result ───────────────────────────────────────────────────────────────────

if (errors.length > 0) {
  console.error(`\n❌  ${errors.length} error(s) found:\n`);
  errors.forEach(e => console.error(e));
  console.error('\nFix the above before deploying.\n');
  process.exit(1);
} else {
  console.log(`✅  All required env vars present  [${nodeEnv}]\n`);
}
```

**Customize the validation section** based on:
- Vars found in `.env.example` or `render.yaml`
- Common patterns: `DATABASE_URL`, `CLERK_SECRET_KEY`, `STRIPE_SECRET_KEY`,
  `SENDGRID_API_KEY`, `SENTRY_DSN`, `REDIS_URL`, `JWT_SECRET`, etc.
- Apply `mustStartWith` for keys with known prefixes (e.g., `sk_` for Clerk/Stripe)
- Apply `minLength` for secrets that must be long enough to be secure
- Apply `mustBeFalseInProd` for any bypass flags (e.g., `AUTH_DISABLED`, `DB_SYNCHRONIZE`)

---

### Phase 2: Create or update `.env.example`

Find the primary `.env.example` location (root, or per-service e.g. `apps/api/.env.example`).

Create/update it with every env var the project uses, organized into sections:

```bash
# ── Core ──────────────────────────────────────────────────────────────
NODE_ENV=development

# ── Database ──────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb

# ── Authentication ────────────────────────────────────────────────────
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# ── Payments ──────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ── Email ─────────────────────────────────────────────────────────────
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=noreply@example.com

# ── Storage ───────────────────────────────────────────────────────────
# Optional: Cloudflare R2 (S3-compatible)
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET=
CLOUDFLARE_R2_PUBLIC_URL=

# ── Error Tracking ────────────────────────────────────────────────────
SENTRY_DSN=https://...@sentry.io/...
```

Rules for `.env.example`:
- Every var must have a placeholder value or be left empty (never real secrets)
- Group related vars with comment headers
- Comment out optional vars with `# VAR_NAME=`
- Include one line per var, even if the value is empty

---

### Phase 3: Create `scripts/backup-env.sh`

Create a backup script adapted to this project's Render services.
Read the service IDs from `~/.config/claude/credentials.md` for the current project.

```bash
#!/usr/bin/env bash
# ============================================================================
# {PROJECT_NAME} — Environment Variable Backup
#
# Pulls current env vars from Render, saves them locally (.env-backup/),
# and optionally uploads as GitHub encrypted secrets for offsite backup.
#
# Usage:
#   bash scripts/backup-env.sh              # local backup only
#   bash scripts/backup-env.sh --github     # local + GitHub secrets backup
#
# Output:
#   .env-backup/{service}-production.env    human-readable
#   .env-backup/{service}-production.json   raw Render API format
# ============================================================================

set -euo pipefail

RENDER_API_KEY="rnd_LCVBmWMcVfQeWT3gcrdlW7D8AuTN"
GITHUB_REPO="{owner}/{repo}"  # UPDATE THIS
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$REPO_ROOT/.env-backup"
UPLOAD_GITHUB=false

for arg in "$@"; do
  case "$arg" in --github) UPLOAD_GITHUB=true ;; esac
done

mkdir -p "$BACKUP_DIR"
echo ""
echo "📦  {PROJECT_NAME} — Environment Backup  ($(date '+%Y-%m-%d %H:%M'))"
echo ""

fetch_service() {
  local svc_id="$1"
  local svc_name="$2"
  local json_file="$BACKUP_DIR/${svc_name}.json"
  local env_file="$BACKUP_DIR/${svc_name}.env"

  echo "→  Fetching $svc_name ($svc_id)..."

  curl -sf \
    "https://api.render.com/v1/services/${svc_id}/env-vars?limit=100" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -o "$json_file"

  # Convert to .env format and show masked summary
  python3 - "$json_file" "$env_file" "$svc_name" << 'PYEOF'
import json, sys, os

json_file, env_file, svc_name = sys.argv[1:]
SECRETS = {'KEY','SECRET','TOKEN','PASSWORD','PASS','DSN','WEBHOOK','CREDENTIAL','PRIVATE'}

data = json.load(open(json_file))
lines = []
for item in data:
    ev = item.get('envVar') or item
    k, v = ev.get('key',''), ev.get('value','')
    if not k: continue
    lines.append(f'{k}={v}')
    is_secret = any(s in k.upper() for s in SECRETS)
    display = (v[:8] + '…[masked]') if is_secret and len(v) > 8 else (v or '(empty)')
    print(f'    {k:<40} {display}')

with open(env_file, 'w') as f:
    f.write('\n'.join(lines) + '\n')
print(f'  Saved {len(lines)} vars → {env_file}')
PYEOF

  if [ "$UPLOAD_GITHUB" = true ]; then
    echo "  Uploading to GitHub secrets as ENV_$(echo "$svc_name" | tr '[:lower:]-' '[:upper:]_')..."
    encoded=$(python3 -c "import base64; print(base64.b64encode(open('$json_file','rb').read()).decode())")
    gh secret set "ENV_$(echo "$svc_name" | tr '[:lower:]-' '[:upper:]_')" \
      --repo "$GITHUB_REPO" \
      --body "$encoded"
    echo "  ✅  GitHub secret updated"
  fi

  echo ""
}

# ── Services ─────────────────────────────────────────────────────────────────
# ADD YOUR SERVICES HERE:
# fetch_service "srv-xxxx"  "api-production"
# fetch_service "srv-yyyy"  "ui-production"
# fetch_service "srv-zzzz"  "api-staging"

echo "✅  Backup complete. Files in: $BACKUP_DIR"
echo ""
echo "To restore: use /render-env set KEY=VALUE ... or re-PUT the .json file."
```

**Fill in the service IDs** from the credentials file for this project.
Add one `fetch_service` call per Render service.

---

### Phase 4: Update `render.yaml` to add `preDeployCommand`

For each Node.js-based Render service (type: web or worker), add:

```yaml
services:
  - type: web
    name: my-api
    # ... existing config ...
    preDeployCommand: node scripts/check-env.js && npm run db:migrate
```

If it's a .NET service, use:
```yaml
    preDeployCommand: dotnet scripts/check-env.dll  # or skip if no Node.js available
```

For pure .NET projects, you can't run `check-env.js` as a preDeployCommand.
In that case, note that validation happens at startup via the C# config binding
(which throws on missing required values).

**IMPORTANT**: Do NOT add preDeployCommand if it wasn't there before without
confirming with the user — it blocks deploys if the script errors.

---

### Phase 5: Add `.env-backup/` to `.gitignore`

Check if `.env-backup/` is already in `.gitignore`. If not, add it:

```bash
grep -q ".env-backup" .gitignore 2>/dev/null || echo '.env-backup/' >> .gitignore
```

Also ensure `.env` (without `.example`) is gitignored.

---

### Phase 6: Run the validator

After creating `scripts/check-env.js`, run it immediately to verify it works:

```bash
node scripts/check-env.js
```

If it fails on missing vars that ARE set in the project's `.env`, help the
user understand why. If it fails on vars that genuinely need to be added,
tell them what to set.

---

### Phase 7: Run the backup (optional)

If the user wants a backup right now:
```bash
bash scripts/backup-env.sh
```

If `--github` is requested and `gh` is not authenticated, prompt:
```
gh auth login
```

---

## What to Report When Done

At the end, summarize:

```
✅ Env var hardening complete

Files created/updated:
  • scripts/check-env.js      — pre-deploy validator (N vars checked)
  • scripts/backup-env.sh     — backup to .env-backup/ [+ GitHub secrets]
  • .env.example              — N vars documented
  • .gitignore                — .env-backup/ added

render.yaml:
  • preDeployCommand added to: [list of services, or "skipped — .NET only"]

Next steps:
  1. Commit these files: git add scripts/ .env.example .gitignore render.yaml
  2. Run the backup: bash scripts/backup-env.sh --github
  3. Review .env.example and fill in any missing vars
  4. Merge to main — preDeployCommand will run on next Render deploy
```

---

## Reference Implementations

| Pattern | Source |
|---------|--------|
| Joi schema + Five-place rule | `/Users/admin/dev2/clients/U-Rent/u-rent-platform/apps/api/src/config/env.schema.ts` |
| Pre-deploy validator | `/Users/admin/dev2/clients/U-Rent/u-rent-platform/scripts/check-env.js` |
| Sync checker (CI guard) | `/Users/admin/dev2/clients/U-Rent/u-rent-platform/scripts/verify-env-sync.js` |
| Backup to GitHub secrets | `/Users/admin/dev2/clients/ryanjae/story-magic/scripts/backup-env.sh` |
| Documentation | `/Users/admin/dev2/clients/U-Rent/u-rent-platform/docs/ENV-VARS.md` |

---

## Safety Rules (always enforce)

1. **NEVER commit real secrets** — `.env.example` gets placeholder values only.
2. **NEVER use `?limit=20`** — always `?limit=100` on Render API GETs.
3. **Always GET→splice→PUT** for any Render env var change (use `/render-env` skill).
4. **Back up before any write** — backup script runs read-only; `/render-env set` auto-backs up.
5. **Test the validator locally before wiring it as preDeployCommand** — a broken validator blocks all deploys.
