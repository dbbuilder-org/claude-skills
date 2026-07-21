# git-dev-merge

Rebuilds the `dev` integration branch nightly — resets it to `staging`, merges every open PR targeting `staging` into it, resolves conflicts preserving all changes, and reports results. The original PRs are never touched; `dev` is a read-only preview/test surface.

**Purpose**: give QA and the team a single branch with everything in-flight, so they can run integration tests or deploy to a dev environment without waiting for each PR to be individually reviewed and merged.

## Trigger Phrases

- `/git-dev-merge`
- "rebuild dev branch"
- "merge all PRs into dev"
- "nightly dev integration"

## Instructions

<command-name>git-dev-merge</command-name>

---

### Configuration (edit per project)

```
BASE_BRANCH=staging          # the branch dev is based on
TARGET_BRANCH=dev            # the integration branch to build
REPO=dbbuilder-org/u-rent    # GitHub owner/repo
PR_BASE=staging              # PRs must target this base to be included
```

---

### Step 1: Fetch current open PRs

```bash
gh pr list \
  --repo dbbuilder-org/u-rent \
  --state open \
  --base staging \
  --json number,headRefName,title \
  --limit 100 \
  > /tmp/dev_merge_prs.json

python3 -c "
import json
prs = json.load(open('/tmp/dev_merge_prs.json'))
print(f'Found {len(prs)} open PRs targeting staging')
for p in prs:
    print(f'  #{p[\"number\"]} {p[\"headRefName\"]}')
"
```

Skip dependabot PRs — they are auto-merged separately and often conflict with everything:

```bash
python3 -c "
import json
prs = json.load(open('/tmp/dev_merge_prs.json'))
filtered = [p for p in prs if not p['headRefName'].startswith('dependabot/')]
json.dump(filtered, open('/tmp/dev_merge_prs.json', 'w'))
print(f'After filtering dependabot: {len(filtered)} PRs remain')
"
```

---

### Step 2: Reset dev branch to staging

```bash
git fetch origin

# If dev exists locally, delete it first
git branch -D dev 2>/dev/null || true

# Create fresh from staging
git checkout -b dev origin/staging

echo "dev branch created from origin/staging at $(git rev-parse --short HEAD)"
```

If `dev` already exists on the remote, force-push will overwrite it at the end — that's intentional.

---

### Step 3: Merge all PRs in order

Sort PRs by number ascending (oldest work first — minimises conflicts since newer PRs likely rebased on top of older ones):

```python
# /tmp/do_merge.py
import subprocess, json, sys

prs = sorted(json.load(open('/tmp/dev_merge_prs.json')), key=lambda x: x['number'])

results = {'merged': [], 'conflicted': [], 'skipped': []}

for pr in prs:
    num = pr['number']
    branch = pr['headRefName']

    # Check remote branch still exists
    check = subprocess.run(
        ['git', 'ls-remote', '--exit-code', 'origin', branch],
        capture_output=True
    )
    if check.returncode != 0:
        print(f'⚠️  #{num} {branch} — remote branch gone, skipping')
        results['skipped'].append({'num': num, 'branch': branch, 'reason': 'remote branch missing'})
        continue

    r = subprocess.run(
        ['git', 'merge', '--no-ff', '-m',
         f'Merge PR #{num} ({branch}) into dev',
         f'origin/{branch}'],
        capture_output=True, text=True
    )
    if r.returncode == 0:
        print(f'✅ #{num} {branch}')
        results['merged'].append({'num': num, 'branch': branch})
    else:
        print(f'❌ #{num} {branch} — CONFLICT')
        print(r.stderr[:400])
        subprocess.run(['git', 'merge', '--abort'], capture_output=True)
        results['conflicted'].append({'num': num, 'branch': branch})

json.dump(results, open('/tmp/dev_merge_results.json', 'w'))
print(f"\n✅ {len(results['merged'])} merged | ❌ {len(results['conflicted'])} conflicted | ⚠️ {len(results['skipped'])} skipped")
```

Run: `python3 /tmp/do_merge.py`

---

### Step 4: Resolve conflicts

For each conflicted PR from `/tmp/dev_merge_results.json`:

1. Re-attempt the merge: `git merge --no-ff -m "Merge PR #NNN (branch) into dev" origin/<branch>`
2. Find conflict markers: `grep -rn "<<<<<<\|======\|>>>>>>" <conflicted-files>`
3. Read the conflicting sections and determine which PR introduced which change
4. Resolution strategy — **always preserve changes from both sides**:
   - New imports on both sides → keep all imports
   - New code blocks (tests, components, methods) → keep both blocks
   - Same line changed differently → apply both changes (e.g. `disabled={a || b || c}`)
   - Comments changed → use the more descriptive version
   - **Never discard functional code from either side**
5. After resolving: `git add <files> && git commit -m "Merge PR #NNN (...) into dev — <brief conflict note>"`

Common conflict patterns and how to handle them:

| Conflict type | Resolution |
|---------------|-----------|
| Two PRs add imports to same file | Keep all imports from both |
| Two PRs add new test `describe` blocks | Keep both blocks |
| PR A changes a line, PR B adds code near it | Keep both the line change and the new code |
| Same boolean expression modified independently | Combine with `&&`/`\|\|` as appropriate |
| Two PRs change a comment on the same line | Use the most complete/accurate comment |
| PR refactored a section that another PR also modified | Apply the other PR's logic inside the refactored structure |

**Important special case — refactors**: If PR A moved code into a sub-component and PR B modified the original location, move PR B's changes into the sub-component. Example: PR #1493 moved results into `GarageExplorerResultsState.tsx`; PR #1510 added a disclaimer to the original location → disclaimer was moved into the component.

---

### Step 5: Push to remote

```bash
git push --force-with-lease origin dev
```

`--force-with-lease` is safe here: `dev` is a nightly rebuild branch with no one committing directly to it. If someone pushed to it manually since the last run (unlikely), the push will be rejected and you should investigate.

---

### Step 6: Report

```python
# Print final summary
import json
results = json.load(open('/tmp/dev_merge_results.json'))
prs = json.load(open('/tmp/dev_merge_prs.json'))

total = len(prs)
merged = len(results['merged'])
conflicted = len(results['conflicted'])
skipped = len(results['skipped'])

print(f"""
=== dev branch rebuild complete ===

✅ Merged:     {merged}/{total} PRs
❌ Conflicted: {conflicted} (resolved manually above)
⚠️  Skipped:   {skipped} (branch missing on remote)

All {total} original PRs remain open, targeting staging.
dev is a nightly integration snapshot — do not merge it.
""")

if results['conflicted']:
    print("Resolved conflicts:")
    for r in results['conflicted']:
        print(f"  #{r['num']} {r['branch']}")
```

Also post a comment on the daily standup issue (issue #649 for U-Rent) with the summary. Use `gh issue comment 649 --body "..."`.

---

### Step 7: Set up as a nightly cron (optional)

To run this automatically each night, use the `/schedule` skill to create a nightly trigger, or add a GitHub Actions workflow:

```yaml
# .github/workflows/rebuild-dev.yml
name: Rebuild dev integration branch
on:
  schedule:
    - cron: '0 3 * * *'   # 3am UTC nightly
  workflow_dispatch:

jobs:
  rebuild-dev:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Configure git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Fetch all PR branches
        run: git fetch origin '+refs/heads/*:refs/remotes/origin/*'

      - name: Get open PRs
        run: |
          gh pr list --state open --base staging --json number,headRefName,title --limit 100 \
            | python3 -c "
          import json,sys
          prs = json.load(sys.stdin)
          prs = [p for p in prs if not p['headRefName'].startswith('dependabot/')]
          json.dump(prs, open('/tmp/dev_merge_prs.json','w'))
          print(f'Found {len(prs)} PRs')
          "
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Reset dev to staging
        run: |
          git checkout -b dev origin/staging || git checkout dev && git reset --hard origin/staging

      - name: Merge all PRs
        run: python3 /tmp/do_merge.py    # copy the script from Step 3 here
        # Note: conflicts that can't be auto-resolved will cause this step to fail.
        # Check the Actions log to see which PRs conflicted.

      - name: Push dev
        run: git push --force-with-lease origin dev

      - name: Post summary to issue #649
        run: |
          # Post results to standup issue
          gh issue comment 649 --body "🔄 **dev branch rebuilt** — $(date -u '+%Y-%m-%d %H:%M UTC')\n\nSee Actions run for details."
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Note**: The GitHub Actions workflow handles clean auto-merges well, but complex conflicts need human resolution. If conflicts occur in CI, the job fails and the previous `dev` state is preserved. Run `/git-dev-merge` manually to resolve conflicts interactively.

---

## Notes

- `dev` is **never merged into `staging`** — it's a preview-only branch. Individual PRs are merged into staging through normal review.
- Force-push to `dev` is expected and safe — don't be alarmed by it.
- If a PR branch has been deleted (merged or abandoned), it's automatically skipped.
- Dependabot PRs are excluded — they conflict constantly and are handled separately.
- After conflicts are resolved, note the resolution in the commit message so future runs have context (e.g. `— disclaimer moved into GarageExplorerResultsState`).
- The `dev` branch will always be ahead of `staging` by N merge commits (one per open PR).
