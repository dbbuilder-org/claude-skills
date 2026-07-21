---
name: github-auto-rebase
description: Rebase all open PRs that are behind main, skipping PRs that are already up to date. Checks each PR's merge status, rebases only what needs it, and reports results. Use when the user says "auto-rebase", "rebase open PRs", "github-auto-rebase", or "rebase PRs that need it".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
---

# github-auto-rebase

Efficiently rebase all open PRs that are behind `main` (or the default branch). Skips PRs that are already up-to-date. Does NOT rebase if it would cause merge conflicts — those are reported for manual resolution.

## Strategy

1. **Check before rebasing** — Use GitHub's merge status API to find which PRs are actually behind. Only rebase those.
2. **Conflict detection** — If a rebase fails due to conflicts, abort cleanly and report the PR as needing manual resolution.
3. **No unnecessary work** — PRs that are already up-to-date (or ahead of main) are skipped entirely.
4. **Report clearly** — Output shows: rebased, already-up-to-date, conflicted, and skipped (draft/dependabot).

## Step 1: Identify Which PRs Need Rebasing

```bash
# Get all open PRs with their merge status
gh pr list --state open --json number,title,headRefName,mergeStateStatus,isDraft,author \
  --limit 100 > /tmp/rebase_prs.json

python3 << 'EOF'
import json

prs = json.load(open('/tmp/rebase_prs.json'))

# Skip dependabot and draft PRs
skip = {'dependabot[bot]', 'renovate[bot]'}

needs_rebase = []
already_ok = []
skipped = []

for pr in prs:
    author = pr.get('author', {}).get('login', '')
    if author in skip or pr.get('isDraft'):
        skipped.append(pr)
        continue

    # mergeStateStatus: CLEAN=up to date, BEHIND=needs rebase, DIRTY=conflicts, UNKNOWN=pending
    status = pr.get('mergeStateStatus', 'UNKNOWN')
    if status == 'BEHIND':
        needs_rebase.append(pr)
    elif status in ('CLEAN', 'HAS_HOOKS'):
        already_ok.append(pr)
    else:
        # DIRTY, UNKNOWN, BLOCKED — check later
        needs_rebase.append(pr)  # attempt rebase, will detect conflicts

print(f"Needs rebase: {len(needs_rebase)}")
for pr in needs_rebase:
    print(f"  #{pr['number']} [{pr['mergeStateStatus']}]: {pr['title'][:65]}")

print(f"\nAlready up-to-date: {len(already_ok)}")
print(f"Skipped (bot/draft): {len(skipped)}")

# Save lists for next step
with open('/tmp/rebase_needs.json', 'w') as f:
    json.dump(needs_rebase, f)
with open('/tmp/rebase_ok.json', 'w') as f:
    json.dump(already_ok, f)
EOF
```

## Step 2: Rebase Each PR That Needs It

```bash
# Use staging if it exists, otherwise fall back to the default branch (main)
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')
git fetch origin --quiet 2>/dev/null
if git ls-remote --exit-code origin staging >/dev/null 2>&1; then
  BASE_BRANCH="staging"
  echo "Using staging as rebase base (found in remote)"
else
  BASE_BRANCH="$DEFAULT_BRANCH"
  echo "Using $DEFAULT_BRANCH as rebase base (no staging branch)"
fi

# Ensure local base branch is up to date
git fetch origin $BASE_BRANCH
git checkout $BASE_BRANCH
git reset --hard origin/$BASE_BRANCH
echo "Base branch: $BASE_BRANCH @ $(git rev-parse --short HEAD)"
export BASE_BRANCH

python3 << 'EOF'
import json, subprocess, sys, os

prs = json.load(open('/tmp/rebase_needs.json'))
base_branch = os.environ.get('BASE_BRANCH', 'main')

rebased = []
conflicted = []
failed = []

for pr in prs:
    branch = pr['headRefName']
    number = pr['number']
    title = pr['title'][:60]

    print(f"\nProcessing PR #{number} ({branch})...")

    try:
        # Fetch the branch
        result = subprocess.run(
            ['git', 'fetch', 'origin', branch],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            print(f"  ❌ Could not fetch {branch}: {result.stderr.strip()}")
            failed.append({'pr': pr, 'reason': 'fetch failed'})
            continue

        # Check if branch is already up to date with the base branch
        behind = subprocess.run(
            ['git', 'rev-list', '--count', f'origin/{branch}..origin/{base_branch}'],
            capture_output=True, text=True, timeout=10
        )
        if behind.returncode == 0 and behind.stdout.strip() == '0':
            print(f"  ✅ Already up-to-date")
            rebased.append({'pr': pr, 'status': 'already-ok'})
            continue

        # Checkout and rebase onto the base branch
        subprocess.run(['git', 'checkout', branch], capture_output=True, timeout=10)
        subprocess.run(['git', 'reset', '--hard', f'origin/{branch}'], capture_output=True, timeout=10)

        rebase_result = subprocess.run(
            ['git', 'rebase', f'origin/{base_branch}'],
            capture_output=True, text=True, timeout=60
        )

        if rebase_result.returncode == 0:
            # Push the rebased branch
            push_result = subprocess.run(
                ['git', 'push', '--force-with-lease', 'origin', branch],
                capture_output=True, text=True, timeout=30
            )
            if push_result.returncode == 0:
                print(f"  ✅ Rebased and pushed")
                rebased.append({'pr': pr, 'status': 'rebased'})
            else:
                print(f"  ⚠️  Rebased but push failed: {push_result.stderr.strip()[:100]}")
                subprocess.run(['git', 'rebase', '--abort'], capture_output=True)
                failed.append({'pr': pr, 'reason': 'push failed'})
        else:
            # Rebase failed — likely conflicts
            subprocess.run(['git', 'rebase', '--abort'], capture_output=True)
            print(f"  ⚠️  Conflicts — needs manual resolution")
            conflicted.append({'pr': pr, 'error': rebase_result.stdout[:200]})

    except subprocess.TimeoutExpired:
        subprocess.run(['git', 'rebase', '--abort'], capture_output=True)
        failed.append({'pr': pr, 'reason': 'timeout'})
    except Exception as e:
        subprocess.run(['git', 'rebase', '--abort'], capture_output=True)
        failed.append({'pr': pr, 'reason': str(e)})

# Return to base branch
subprocess.run(['git', 'checkout', base_branch], capture_output=True)

# Summary
print("\n" + "="*50)
print("REBASE SUMMARY")
print("="*50)

actually_rebased = [r for r in rebased if r['status'] == 'rebased']
already_ok = [r for r in rebased if r['status'] == 'already-ok']

print(f"\n✅ Rebased ({len(actually_rebased)}):")
for r in actually_rebased:
    print(f"  PR #{r['pr']['number']}: {r['pr']['title'][:60]}")

print(f"\n⏭️  Already up-to-date ({len(already_ok)}):")
for r in already_ok:
    print(f"  PR #{r['pr']['number']}: {r['pr']['title'][:60]}")

if conflicted:
    print(f"\n⚠️  Needs manual rebase ({len(conflicted)}):")
    for c in conflicted:
        print(f"  PR #{c['pr']['number']}: {c['pr']['title'][:60]}")
        print(f"    Conflict hint: {c['error'][:100]}")

if failed:
    print(f"\n❌ Failed ({len(failed)}):")
    for f in failed:
        print(f"  PR #{f['pr']['number']}: {f['reason']}")
EOF
```

## Step 3: Report Results

Output the summary showing:
- How many PRs were rebased
- How many were already up-to-date (no action needed)
- Which PRs have conflicts requiring manual resolution
- Which PRs failed (network issues, push protection, etc.)

## Rules

1. **Never rebase without fetching first** — stale local data causes false conflicts
2. **Use `--force-with-lease` not `--force`** — prevents overwriting others' work
3. **Abort on any conflict** — don't attempt to resolve conflicts automatically
4. **Skip Dependabot** — dependency update branches should not be rebased (they're auto-managed)
5. **Skip draft PRs** — drafts are WIP and may not be ready for rebase
6. **Report before and after** — always show how many PRs needed action vs how many were clean
7. **Return to base branch** — always `git checkout $BASE_BRANCH` at the end to leave a clean state
8. **Batch limit** — if there are more than 20 PRs needing rebase, process in batches of 10 to avoid git state issues
9. **NEVER merge staging into a feature branch** — this creates merge commits that pollute history and make PR intent unreadable. Always use `git rebase origin/staging`. If a branch already has messy merge commits, use the cherry-pick approach instead: `git checkout -b <branch>-clean origin/staging && git cherry-pick <feature-sha> && git push --force-with-lease origin <branch>-clean:<branch>`

## When to Use

- After a large batch of PRs are merged to main and many branches are now behind
- Before a release to ensure all review-ready PRs are on top of latest main
- Weekly maintenance to keep the PR queue clean
- After a significant refactor that affects many files (to surface conflicts early)

## When NOT to Use

- When a PR was intentionally based on another PR (stacked PRs) — rebasing against main would remove the dependency
- For PRs with `depends on #N` in the description — check the dependency chain first
- For PRs with active review comments referring to specific line numbers — rebase changes line numbers
