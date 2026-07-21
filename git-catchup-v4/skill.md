# git-catchup-v4

Everything in git-catchup-v3, plus **branch divergence detection** and **stale review flag detection**.

After the standard v3 board sync, v4 adds:
- Per-PR "commits behind staging" count via GitHub compare API
- Tiered alerts: 🟢 current / 🟡 drifting (3–9) / 🔴 stale (10+)
- Auto-sync nudge: flags whether `pr-auto-sync` workflow already handled it
- **Stale review flag detection**: finds CHANGES_REQUESTED reviews where new commits
  have been pushed since the review was left — the author already fixed things but the
  review status is still blocking. Auto re-requests review from the original reviewer.
- Adds both sections to the issue #649 body

## Trigger Phrases

- `/git-catchup-v4`
- "check divergence", "who's drifting", "branch sync status"
- "full audit + board + divergence"

## Instructions

<command-name>git-catchup-v4</command-name>

---

### Steps 1–7: Run all git-catchup-v3 steps unchanged

Execute Steps 1 through 7 (including Step 6.5 labels + board sync) from
git-catchup-v3 exactly as written. After Step 7 completes, continue with
Step 7.5 below.

---

### Step 7.5: Branch divergence detection

```bash
python3 << 'EOF'
import subprocess, json

prs = json.load(open('/tmp/v2_prs.json'))

rows = []
for pr in sorted(prs, key=lambda x: x['number']):
    branch = pr['headRefName']
    if branch.startswith('dependabot/'):
        continue

    # GitHub compare API: how many staging commits aren't in this branch?
    r = subprocess.run(
        ['gh', 'api',
         f'repos/dbbuilder-org/u-rent/compare/staging...{branch}',
         '--jq', '{behind_by,ahead_by,status}'],
        capture_output=True, text=True, timeout=10)

    try:
        data = json.loads(r.stdout)
        behind = data.get('behind_by', 0)
        ahead  = data.get('ahead_by', 0)
    except:
        behind, ahead = '?', '?'

    if behind == 0:
        icon = '✅'
        label = 'current'
    elif isinstance(behind, int) and behind < 10:
        icon = '🟡'
        label = f'{behind} behind'
    else:
        icon = '🔴'
        label = f'{behind} behind — STALE'

    rows.append({
        'num':    pr['number'],
        'branch': branch[:45],
        'behind': behind,
        'ahead':  ahead,
        'icon':   icon,
        'label':  label,
        'assignees': [a['login'] for a in pr.get('assignees', [])],
    })

print("=== BRANCH DIVERGENCE ===")
print(f"{'PR':>5}  {'Status':<22}  {'Assignee':<18}  Branch")
print("-" * 90)
for r in rows:
    assignee = ', '.join(f"@{a}" for a in r['assignees']) or '@unassigned'
    print(f"  #{r['num']:<4}  {r['icon']} {r['label']:<20}  {assignee:<18}  {r['branch']}")

stale  = [r for r in rows if isinstance(r['behind'], int) and r['behind'] >= 10]
drifting = [r for r in rows if isinstance(r['behind'], int) and 3 <= r['behind'] < 10]

print()
if stale:
    print(f"🔴 STALE ({len(stale)} PRs — 10+ commits behind, high conflict risk):")
    for r in stale:
        print(f"   PR #{r['num']}: {r['branch']} ({r['behind']} behind)")
        print(f"     # Rebase (if few feature commits): git fetch origin && git checkout {r['branch']} && git rebase origin/staging")
        print(f"     # Cherry-pick (if many merge commits already): git checkout -b {r['branch']}-clean origin/staging && git cherry-pick <sha> && git push --force-with-lease origin {r['branch']}-clean:{r['branch']}")

if drifting:
    print(f"🟡 DRIFTING ({len(drifting)} PRs — 3-9 commits behind):")
    for r in drifting:
        print(f"   PR #{r['num']}: {r['branch']} ({r['behind']} behind)")

print()
print("Note: pr-auto-sync.yml runs automatically on every push to staging.")
print("      Stale PRs above may already have a sync attempt or conflict comment.")

# Save for Step 8 report inclusion
json.dump({
    'stale':    [r['num'] for r in stale],
    'drifting': [r['num'] for r in drifting],
    'rows':     rows,
}, open('/tmp/v4_divergence.json', 'w'))
EOF
```

---

### Step 7.6: Stale review flag detection

A CHANGES_REQUESTED review blocks merge even after the author has pushed fixes.
This step identifies reviews that are stale — the review was left on an older commit
and new commits have been pushed since. Those PRs need a re-review request, not new code.

```bash
python3 << 'EOF'
import subprocess, json

prs = json.load(open('/tmp/v2_prs.json'))

stale_reviews = []
current_reviews = []

for pr in sorted(prs, key=lambda x: x['number']):
    # Get reviews + current head commit
    result = subprocess.run(
        ['gh', 'pr', 'view', str(pr['number']),
         '--repo', 'dbbuilder-org/u-rent',
         '--json', 'reviews,headRefOid,headRefName'],
        capture_output=True, text=True
    )
    try:
        data = json.loads(result.stdout)
    except:
        continue

    head_oid = data.get('headRefOid', '')
    branch   = data.get('headRefName', '')
    blocking = [r for r in data.get('reviews', []) if r['state'] == 'CHANGES_REQUESTED']

    for rev in blocking:
        review_commit = rev.get('commit', {}).get('oid', '')
        reviewer      = rev['author']['login']
        review_date   = rev.get('submittedAt', '')
        body_preview  = rev.get('body', '')[:120].replace('\n', ' ')

        if review_commit and review_commit != head_oid:
            # New commits pushed after the review — review is stale
            stale_reviews.append({
                'num':      pr['number'],
                'branch':   branch,
                'reviewer': reviewer,
                'review_date': review_date,
                'review_commit': review_commit[:8],
                'head_commit':   head_oid[:8],
                'body':     body_preview,
            })
        else:
            # Review is on the current commit — changes still need addressing
            current_reviews.append({
                'num':      pr['number'],
                'reviewer': reviewer,
                'review_date': review_date,
                'body':     body_preview,
            })

print("=== STALE REVIEW FLAGS (reviewed on old commit — fixes pushed since) ===")
if stale_reviews:
    for r in stale_reviews:
        print(f"  🔴 PR #{r['num']} ({r['branch']})")
        print(f"     Reviewer: @{r['reviewer']} at {r['review_date']}")
        print(f"     Reviewed commit: {r['review_commit']} → current HEAD: {r['head_commit']}")
        print(f"     Original comment: {r['body']}")
        print()
else:
    print("  ✅ None — all CHANGES_REQUESTED reviews are on the current commit")

print()
print("=== CURRENT REVIEW FLAGS (review is on HEAD — action still needed) ===")
if current_reviews:
    for r in current_reviews:
        print(f"  🟡 PR #{r['num']} — @{r['reviewer']} at {r['review_date']}")
        print(f"     {r['body']}")
else:
    print("  ✅ None")

# Auto re-request review for stale ones
if stale_reviews:
    print()
    print("Re-requesting reviews for stale flags...")
    for r in stale_reviews:
        subprocess.run(
            ['gh', 'pr', 'edit', str(r['num']),
             '--repo', 'dbbuilder-org/u-rent',
             '--add-reviewer', r['reviewer']],
            capture_output=True
        )
        print(f"  → Re-requested @{r['reviewer']} on PR #{r['num']}")

json.dump({
    'stale':   stale_reviews,
    'current': current_reviews,
}, open('/tmp/v4_stale_reviews.json', 'w'))
EOF
```

**Interpretation:**
- 🔴 **Stale** — review was left on commit X, but commit Y (and beyond) has been pushed since.
  The author already addressed the feedback; the reviewer just needs to re-review.
  The script automatically re-requests their review.
- 🟡 **Current** — review is on the HEAD commit. Feedback is still outstanding; author needs to push a fix.

---

### Step 8: Compile final report + update issue #649

Same format as git-catchup-v3 Step 8, with one additional section inserted
before the board sync section:

```
---

### 🔴 Stale Review Flags (fixes pushed — re-review requested)
| PR | Reviewer | Reviewed At | Review Commit | Current HEAD |
|----|----------|-------------|---------------|--------------|
| #NNN | @reviewer | date | abc1234 | def5678 |

N stale flags auto-cleared — re-review requested from each reviewer.

### 🟡 Active Review Flags (feedback outstanding — author must fix)
| PR | Reviewer | Reviewed At | Issue |
|----|----------|-------------|-------|
| #NNN | @reviewer | date | brief description |

---

### 🔄 Branch Sync Status
| PR | Branch | Behind | Status |
|----|--------|--------|--------|
| #NNN | branch-name | N | ✅ / 🟡 / 🔴 |

- Stale (10+ behind): N PRs — conflict risk if not synced before merge
- Drifting (3–9 behind): N PRs — auto-sync will handle on next staging push
- pr-auto-sync.yml: active — runs on every push to staging
```

Post to issue #649 and update its body exactly as in git-catchup-v3 Step 8.

---

## When to use v3 vs v4

| Situation | Use |
|-----------|-----|
| Standard morning audit + board sync | v3 |
| After a hotfix or large batch lands on staging | v4 |
| Ransom reports merge friction | v4 |
| Sprint close — want to know who needs to rebase | v4 |
| "Why is this PR still blocked?" — stale review check | v4 |
| PRs show CHANGES_REQUESTED but fixes were pushed | v4 |

## Notes

- The divergence check uses the GitHub compare API, not local git — no fetch needed
- `behind_by` = commits in `staging` that aren't in the PR branch
- `ahead_by`  = commits in the PR branch that aren't in `staging` (the PR's own work)
- A branch with `behind_by = 0` is either up to date or was recently auto-synced
- Closed/merged PRs are skipped (they're filtered out of `/tmp/v2_prs.json` by v2)
