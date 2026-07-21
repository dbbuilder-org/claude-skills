---
name: nx-affected-ci
description: Switch an Nx monorepo's GitHub Actions CI from `nx run-many` to `nx affected` so only projects touched by a change are built/tested. Reads the existing workflow, patches each job that runs Nx targets, adds nrwl/nx-set-shas, sets fetch-depth 0, and opens a PR. Use when the user says "nx affected", "nx-affected-ci", "speed up CI with affected", or "add nx affected to CI".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# nx-affected-ci

Upgrade a GitHub Actions workflow to use `nx affected` so CI only runs targets for projects that are actually touched by a change.

## Trigger Phrases

- "nx affected", "nx-affected-ci", "add nx affected"
- "speed up CI", "skip unaffected projects in CI"
- "add nrwl/nx-set-shas"

---

## Process

### Step 1 — Verify this is an Nx repo

```bash
cat nx.json 2>/dev/null | head -5
ls .github/workflows/*.yml 2>/dev/null
```

If `nx.json` is missing, stop and tell the user this skill requires an Nx workspace.

### Step 2 — Discover workflow files

Find every workflow file that calls Nx:

```bash
grep -rl "nx run-many\|nx build\|nx test\|nx lint" .github/workflows/
```

If multiple files match, ask the user which one to patch (or patch all if they say so). Default to `ci.yml` if it exists.

### Step 3 — Read the target workflow

Read the full file. Identify:

1. Every job that runs an `nx` command
2. Whether each job already has `fetch-depth: 0` on its checkout
3. Whether `nrwl/nx-set-shas` is already present in any job
4. The nx command style used: `nx run-many -t <target>` or `nx <target> <project>`

### Step 4 — Plan the patches

For each Nx job identified in Step 3, the changes are:

**A. Checkout — add `fetch-depth: 0`**
```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
```

**B. Add `nrwl/nx-set-shas@v4` after `pnpm install` (or after `npm ci` / `yarn install`)**
```yaml
- uses: nrwl/nx-set-shas@v4
```

**C. Replace `nx run-many -t <target>` with `nx affected -t <target>`**
- Keep all existing flags (`--parallel`, `--coverage`, etc.)
- `nx run-many -t lint --parallel=3` → `nx affected -t lint --parallel=3`

**D. Replace targeted single-project builds if appropriate**
- `nx build web` → `nx affected -t build` ONLY if the intent is "build whatever changed"
- Leave alone if the command is a deliberate single-project build unrelated to what changed (e.g. a deploy step that always builds `web`)
- When in doubt, replace it and add a comment explaining the behavior

**Do NOT touch:**
- Jobs that don't call `nx` (Python, Docker, SonarCloud, Semgrep, etc.)
- `typecheck` jobs that call `tsc --noEmit` directly (not via Nx)
- E2E jobs that intentionally always run

### Step 5 — Apply edits

Use the Edit tool for surgical replacements. For each job:

1. Add `fetch-depth: 0` to checkout if missing
2. Insert `- uses: nrwl/nx-set-shas@v4` after the install step
3. Replace `run-many` with `affected` on Nx target lines

### Step 6 — Verify

```bash
# Confirm no run-many remains in patched jobs
grep -n "nx run-many" .github/workflows/ci.yml

# Confirm nx-set-shas appears in each patched job
grep -n "nx-set-shas" .github/workflows/ci.yml

# Confirm fetch-depth appears in patched jobs
grep -n "fetch-depth" .github/workflows/ci.yml
```

If any `nx run-many` lines remain, fix them before continuing.

### Step 7 — Commit and open PR

Branch name: `ci/nx-affected-builds`

```bash
git checkout -b ci/nx-affected-builds
git add .github/workflows/ci.yml   # or whichever file(s) were patched
git commit -m "ci: switch to nx affected for faster builds"
git push -u origin ci/nx-affected-builds
gh pr create --title "ci: switch to nx affected for faster builds" --body "..."
```

PR body must include:
- One-sentence summary of what changed
- Table showing the before/after for each patched job
- Expected impact table (scraper-only change, UI lib change, first run)
- Test plan with checkboxes

---

## Expected Impact Table (include in PR body)

```markdown
| Scenario | Before | After |
|----------|--------|-------|
| Scraper-only change | Runs all JS targets | Skips all JS projects |
| Shared lib change | Runs all projects | Runs lib + all dependents |
| Single-file fix | Full run | Only affected project |
| Lockfile change | Full run | Full run (expected) |
```

---

## Edge Cases

| Situation | Handling |
|-----------|----------|
| Workflow already uses `nx affected` | Report "already using affected" and stop |
| `nx-set-shas` already present in some jobs but not all | Add only to the missing jobs |
| Workflow uses `npm ci` or `yarn install` instead of `pnpm` | Still works — `nx-set-shas` is install-manager agnostic |
| Monorepo has no CI file yet | Offer to scaffold a minimal CI from the AestheticIQ pattern (lint + typecheck + test + build jobs) |
| Multiple workflow files | Patch all files that contain `nx run-many`, noting which files were changed in the PR body |
| `--base` / `--head` flags already hardcoded | Remove them — `nx-set-shas` sets `NX_BASE`/`NX_HEAD` env vars automatically |

---

## Rules

1. **Read before editing** — always read the full workflow file before making changes
2. **Surgical edits** — use Edit tool, not Write, to avoid clobbering unrelated jobs
3. **Preserve flags** — keep `--parallel`, `--coverage`, and all other existing flags
4. **Don't touch non-Nx jobs** — SonarCloud, Semgrep, Python, Docker are out of scope
5. **Always open a PR** — never commit directly to main/staging
6. **Verify with grep** — confirm no `run-many` remains before committing
