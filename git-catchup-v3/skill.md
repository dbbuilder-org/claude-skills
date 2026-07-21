---
name: git-catchup-v3
description: Full PR/issue audit (v2) + agentic GitHub Projects v2 board sync. Scores every PR, writes Status and Priority fields on the Sprint 2026-03 PR Board, auto-adds new items, and posts the daily order-of-attack to issue #649. Use when the user says "git-catchup-v3", "sync the board", "update the project", or "full audit + board".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
---

# git-catchup-v3

Everything in git-catchup-v2, plus **agentic GitHub Projects v2 board sync**.

After scoring PRs, v3 writes back to the **Sprint 2026-03 / PR Board (project #3, view 10)**:
- Adds any PR not yet on the board
- Sets `PR Status` field based on CI + review state
- Sets `Priority` field (P0 / P1 / P2)
- Updates the issue body of #649 with the fresh board state

## Trigger Phrases

- `/git-catchup-v3`
- "sync the board", "update the project board", "full audit + board"
- "board sync", "project sync"

## Project constants

```
ORG:          dbbuilder-org
REPO:         u-rent
PROJECT_NUM:  3
PROJECT_ID:   PVT_kwDODmqj9M4BQ_g8

Field IDs (Sprint 2026-03):
  PR Status:  PVTSSF_lADODmqj9M4BQ_g8zg-9EB0
    Open:     d7a91005
    In Queue: 0e9ca88f
    Blocked:  fec0dae0
    Merged:   82a10391
    Closed:   a90c2a6f

  Priority:   PVTSSF_lADODmqj9M4BQ_g8zg-89Ps
    P0:       e982b032
    P1:       cf35fd76
    P2:       23b75298
```

## Instructions

<command-name>git-catchup-v3</command-name>

---

### Steps 1–6.5: Run all git-catchup-v2 steps unchanged

Execute Steps 1 through 6.5 from git-catchup-v2 exactly as written (gather data, cross-reference issues, completeness check, CI status, team readiness, merge-readiness scoring, label PRs, update daily plan issue).

After Step 6.5 completes and `/tmp/v2_prs.json` is populated, continue with Step 7 below.

---

### Step 7: Sync GitHub Projects v2 board

This step queries the current board state, then writes PR Status and Priority for every open PR.

#### 7a. Fetch current board items

```bash
python3 << 'EOF'
import subprocess, json

# Fetch all current items on the board
result = subprocess.run(['gh', 'api', 'graphql', '-f', 'query={\n  organization(login: "dbbuilder-org") {\n    projectV2(number: 3) {\n      items(first: 100) {\n        nodes {\n          id\n          content {\n            ... on PullRequest { number url }\n            ... on Issue { number url }\n          }\n          fieldValues(first: 10) {\n            nodes {\n              ... on ProjectV2ItemFieldSingleSelectValue {\n                optionId\n                field { ... on ProjectV2SingleSelectField { name } }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n}'],
    capture_output=True, text=True, timeout=30)

data = json.loads(result.stdout)
items = data['data']['organization']['projectV2']['items']['nodes']

board = {}  # pr_number -> {item_id, pr_status_option, priority_option}
for item in items:
    content = item.get('content') or {}
    num = content.get('number')
    if not num:
        continue
    fvs = {}
    for fv in item['fieldValues']['nodes']:
        if fv:
            fname = (fv.get('field') or {}).get('name', '')
            fvs[fname] = fv.get('optionId', '')
    board[num] = {
        'item_id': item['id'],
        'pr_status': fvs.get('PR Status', ''),
        'priority': fvs.get('Priority', ''),
    }

json.dump(board, open('/tmp/v3_board.json', 'w'))
print(f"Board has {len(board)} items")
for num in sorted(board):
    print(f"  #{num}: pr_status={board[num]['pr_status']} priority={board[num]['priority']}")
EOF
```

#### 7b. Compute desired state for each PR

```python
# PR Status mapping rules (in priority order):
#
# "Closed"   — PR is closed (not merged)
# "Merged"   — PR was merged
# "Blocked"  — CI failing OR has CHANGES_REQUESTED review
# "In Queue" — CI passing, reviewer assigned, no blockers
# "Open"     — everything else (in progress, no reviewer yet)
#
# Priority mapping:
#
# P0 — security/auth/payment/stripe/fraud/clerk keywords in title+branch
#       OR has label: tier:2-security
# P1 — active feature work (feat/ branch), bug fixes (fix/ branch)
# P2 — chore, deps, test, docs, refactor branches
```

```bash
python3 << 'EOF'
import json, subprocess, re

prs = json.load(open('/tmp/v2_prs.json'))
board = json.load(open('/tmp/v3_board.json'))

PROJECT_ID = 'PVT_kwDODmqj9M4BQ_g8'
PR_STATUS_FIELD = 'PVTSSF_lADODmqj9M4BQ_g8zg-9EB0'
PRIORITY_FIELD  = 'PVTSSF_lADODmqj9M4BQ_g8zg-89Ps'

PR_STATUS_OPTIONS = {
    'Open':     'd7a91005',
    'In Queue': '0e9ca88f',
    'Blocked':  'fec0dae0',
    'Merged':   '82a10391',
    'Closed':   'a90c2a6f',
}
PRIORITY_OPTIONS = {
    'P0': 'e982b032',
    'P1': 'cf35fd76',
    'P2': '23b75298',
}

SECURITY_KW = ['security', 'auth', 'payment', 'deposit', 'stripe', 'fraud',
               'guard', 'permission', 'jwt', 'clerk', 'critical']

def desired_pr_status(pr):
    checks = pr.get('statusCheckRollup') or []
    failures = [c for c in checks if c.get('conclusion') in ('FAILURE', 'ERROR')]
    passing  = [c for c in checks if c.get('conclusion') == 'SUCCESS']

    # Check for CHANGES_REQUESTED via gh API
    reviews_r = subprocess.run(
        ['gh', 'api', f'repos/dbbuilder-org/u-rent/pulls/{pr["number"]}/reviews',
         '--jq', '[.[] | select(.state == "CHANGES_REQUESTED")] | length'],
        capture_output=True, text=True, timeout=10)
    changes_requested = int(reviews_r.stdout.strip() or '0') > 0

    if failures or changes_requested:
        return 'Blocked'
    if passing and pr.get('reviewRequests'):
        return 'In Queue'
    return 'Open'

def desired_priority(pr):
    text = (pr['title'] + ' ' + pr['headRefName']).lower()
    labels = [l['name'] for l in pr.get('labels', [])] if pr.get('labels') else []
    if any(k in text for k in SECURITY_KW) or 'tier:2-security' in labels:
        return 'P0'
    branch = pr['headRefName'].lower()
    if branch.startswith('fix/') or branch.startswith('feat/'):
        return 'P1'
    return 'P2'

def add_to_project(pr_node_id):
    """Add a PR to the project and return the new item id."""
    r = subprocess.run(['gh', 'api', 'graphql', '-f', f'''query=mutation {{
      addProjectV2ItemById(input: {{projectId: "{PROJECT_ID}" contentId: "{pr_node_id}"}}) {{
        item {{ id }}
      }}
    }}'''], capture_output=True, text=True, timeout=15)
    try:
        data = json.loads(r.stdout)
        return data['data']['addProjectV2ItemById']['item']['id']
    except:
        return None

def set_field(item_id, field_id, option_id):
    subprocess.run(['gh', 'api', 'graphql', '-f', f'''query=mutation {{
      updateProjectV2ItemFieldValue(input: {{
        projectId: "{PROJECT_ID}"
        itemId: "{item_id}"
        fieldId: "{field_id}"
        value: {{ singleSelectOptionId: "{option_id}" }}
      }}) {{ projectV2Item {{ id }} }}
    }}'''], capture_output=True, text=True, timeout=15)

# Fetch PR node IDs (needed to add to project)
node_ids_r = subprocess.run(
    ['gh', 'api', 'graphql', '-f', '''query={
      repository(owner: "dbbuilder-org", name: "u-rent") {
        pullRequests(states: OPEN, first: 50) {
          nodes { number id }
        }
      }
    }'''], capture_output=True, text=True, timeout=20)
node_id_map = {}
try:
    nd = json.loads(node_ids_r.stdout)
    for pr_node in nd['data']['repository']['pullRequests']['nodes']:
        node_id_map[pr_node['number']] = pr_node['id']
except:
    pass

actions = []
for pr in prs:
    if pr['headRefName'].startswith('dependabot/'):
        continue

    num = pr['number']
    want_status   = desired_pr_status(pr)
    want_priority = desired_priority(pr)

    item_id = board.get(num, {}).get('item_id')

    # Add to project if missing
    if not item_id:
        node_id = node_id_map.get(num)
        if node_id:
            item_id = add_to_project(node_id)
            if item_id:
                actions.append(f'  ➕ Added PR #{num} to board')
            else:
                actions.append(f'  ⚠️  Could not add PR #{num} (no node id)')
                continue
        else:
            continue

    # Update PR Status if changed
    current_status_id = board.get(num, {}).get('pr_status', '')
    want_status_id    = PR_STATUS_OPTIONS[want_status]
    if current_status_id != want_status_id:
        set_field(item_id, PR_STATUS_FIELD, want_status_id)
        actions.append(f'  ✏️  PR #{num} PR Status → {want_status}')

    # Update Priority if not yet set (don't overwrite manual priority)
    current_priority_id = board.get(num, {}).get('priority', '')
    want_priority_id    = PRIORITY_OPTIONS[want_priority]
    if not current_priority_id:
        set_field(item_id, PRIORITY_FIELD, want_priority_id)
        actions.append(f'  ✏️  PR #{num} Priority → {want_priority} (auto-set, was empty)')

print("=== BOARD SYNC ACTIONS ===")
if actions:
    for a in actions:
        print(a)
else:
    print("  No changes needed — board is up to date")

print(f"\nSynced {len([p for p in prs if not p['headRefName'].startswith('dependabot/')])} PRs to project board")
EOF
```

---

### Step 8: Compile final report + update issue #649

Output the same report format as git-catchup-v2 Step 7, with one additional section appended:

```
---

### 🗂️ Project Board Sync
- Items added to board: N
- Status updated: N
- Priority auto-set: N
- Board: https://github.com/orgs/dbbuilder-org/projects/3/views/10
```

Then post to issue #649 and update its body exactly as in git-catchup-v2 Step 7.

---

## When to use v2 vs v3

| Situation | Use |
|-----------|-----|
| Quick morning check — just need scores | v2 |
| Need board kept current for team visibility | v3 |
| New sprint started, many PRs added | v3 |
| Ransom or Peter will reference the board today | v3 |

## Notes on board mutation safety

- **PR Status** is always overwritten by the computed state (CI + reviews are ground truth)
- **Priority** is only set if currently empty — manual overrides are preserved
- **Size / Iteration** fields are never touched (set manually by the team)
- Closed/merged PRs are NOT automatically removed from the board (do that manually at sprint close)
