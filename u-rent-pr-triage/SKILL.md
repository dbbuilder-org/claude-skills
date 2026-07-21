---
name: u-rent-pr-triage
description: U-Rent specific PR triage skill. Ensures all open issues have PRs, re-assigns PRs by difficulty (easy-medium → Ransom, medium-hard + security/architecture → Peter), and adds Windows testing directive comments to Ransom's PRs. Use when the user says "pr-triage", "triage PRs", "assign PRs", "issue PR coverage", or "add testing comments".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
---

# u-rent-pr-triage

U-Rent specific triage for the open PR/issue queue. Runs three passes:
1. **Coverage audit** — every open issue must have an open PR with code
2. **Assignment triage** — re-sort and assign PRs by difficulty/type
3. **Directive comments** — add Windows testing plans to Ransom's PRs

## Team Assignments

| Person | GitHub | Role | Gets |
|--------|--------|------|------|
| **Ransom** | `@RansomSV` | Frontend/UX | Easy-medium frontend, UX polish, backend quality fixes, notifications |
| **Peter** | `@octavianorg` | Security + Infra | Security, auth, payments, architecture, CI/CD, infra, Dependabot |
| **Claude Code** | `@dbbuilder` | Feature dev | Assigned issues only, max 3 PRs per session |

## Step 1: Issue → PR Coverage Audit

```bash
# Fetch all open issues and PRs
gh issue list --state open --json number,title,assignees,labels --limit 100 > /tmp/issues.json
gh pr list --state open --json number,title,headRefName,assignees,body --limit 100 > /tmp/prs.json

python3 << 'EOF'
import json, re

issues = json.load(open('/tmp/issues.json'))
prs = json.load(open('/tmp/prs.json'))

def extract_issue_refs(body):
    if not body: return []
    nums = set()
    for p in [r'(?:closes?|fixes?|resolves?)\s+#(\d+)', r'#(\d+)']:
        for m in re.finditer(p, body, re.IGNORECASE):
            n = int(m.group(1))
            if 100 < n < 10000:
                nums.add(n)
    return list(nums)

covered = set()
for pr in prs:
    covered.update(extract_issue_refs(pr.get('body', '')))

print("=== ISSUES WITHOUT A PR ===")
for i in sorted(issues, key=lambda x: x['number']):
    if i['number'] not in covered:
        labels = [l['name'] for l in i.get('labels', [])]
        print(f"  #{i['number']} [{', '.join(labels)}]: {i['title']}")
EOF
```

For each uncovered issue:
- If it's a bug (`bug` label): create a PR immediately
- If it's an enhancement/ux-flow: note for next sprint planning
- If it's a UAT report (title starts with `E-`): create a PR if reproducible, else add `needs-reproduction` label

## Step 2: PR Assignment Triage

### Difficulty Classification

**Assign to Ransom only (`@RansomSV`)** — frontend exclusively:
- React components, pages, hooks (apps/web/ only)
- UX polish, skeleton screens, a11y, mobile layout
- Frontend-only config (tsconfig, next.config, fonts)
- Docs that are frontend-adjacent
- Excludes: anything touching apps/api/, DTOs, services, migrations

**Assign to BOTH (`@RansomSV` + `@octavianorg`)** — backend or mixed:
- Any PR touching apps/api/ (services, controllers, DTOs, guards, tests)
- PRs that change both API and web (DTO changes surfaced in frontend)
- Booking engine changes, payment logic, webhook handlers

**Assign to Peter only (`@octavianorg`)** — security + infrastructure:
- ANY auth, payment security, RBAC, or injection risk changes
- CI/CD pipeline changes (GitHub Actions workflows, build config)
- Infrastructure: Redis, render.yaml, Docker, deployment config
- Dependabot / dependency bumps (owns the security surface)
- Service decomposition / architectural refactors

### Triage Script

```bash
python3 << 'EOF'
import json, subprocess

prs = json.load(open('/tmp/prs.json'))

# PRs with no assignee — needs assignment
unassigned = [pr for pr in prs if not pr.get('assignees')]
print("=== UNASSIGNED PRs ===")
for pr in unassigned:
    print(f"  PR #{pr['number']}: {pr['title'][:70]}")

# PRs assigned to Ransom that might be too hard
ransom_prs = [pr for pr in prs if any(a['login'] == 'RansomSV' for a in pr.get('assignees', []))]
print(f"\n=== RANSOM PRs ({len(ransom_prs)}) ===")
for pr in sorted(ransom_prs, key=lambda x: x['number']):
    print(f"  PR #{pr['number']}: {pr['title'][:70]}")
EOF
```

### Re-assignment Commands

```bash
# Move to Peter (security/hard items)
gh pr edit <number> --add-assignee octavianorg --remove-assignee RansomSV

# Move to Ransom (operational/easy)
gh pr edit <number> --add-assignee RansomSV --remove-assignee octavianorg

# Assign unassigned PR
gh pr edit <number> --add-assignee RansomSV
# or
gh pr edit <number> --add-assignee octavianorg
```

## Step 2b: Apply Tier Labels

After assignment triage, apply tier + reviewer labels to all PRs.

**Ensure labels exist:**
```bash
for label_spec in \
  "tier:1-ready|Passes CI — merge this sprint|0E8A16" \
  "tier:2-security|Security/auth/payments — Peter reviews|B60205" \
  "tier:2-medium|Infra/frontend/backend — Ransom reviews|E4B429" \
  "tier:3-hold|Large feature PRs — hold until Tier 1+2 merged|BFD4F2" \
  "reviewer:peter|Route to Peter for review|0052CC" \
  "reviewer:ransom|Route to Ransom for review|5319E7"; do
  IFS='|' read -r lname ldesc lcolor <<< "$label_spec"
  gh label create "$lname" --description "$ldesc" --color "$lcolor" 2>/dev/null || \
    gh label edit "$lname" --description "$ldesc" --color "$lcolor" 2>/dev/null
done
```

**Label classification:**

| Tier | Criteria | Reviewer label |
|------|----------|---------------|
| `tier:1-ready` | CI green + recently created (< 2 weeks) | `reviewer:ransom` or `reviewer:peter` |
| `tier:2-security` | Title/branch contains: security, auth, payment, deposit, stripe, fraud, guard | `reviewer:peter` |
| `tier:2-medium` | Frontend, UX, backend quality (non-infra) | `reviewer:ransom` |
| `tier:2-medium` (infra) | CI/CD, render.yaml, Redis, Dependabot, workflow changes | `reviewer:peter` |
| `tier:3-hold` | Branch contains: feat/flow-, listing-management, payout-dashboard, dual-checklist, request-to-book, dl-verification, voice | (no reviewer — not ready) |

```bash
python3 << 'EOF'
import json, subprocess

prs = json.load(open('/tmp/prs.json'))

SECURITY_KEYWORDS = ['security', 'auth', 'payment', 'deposit', 'stripe', 'fraud',
                     'ownership', 'secret', 'guard', 'permission', 'jwt', 'clerk', 'critical']
HOLD_BRANCHES = ['feat/flow-', 'listing-management', 'payout-dashboard',
                 'dual-checklist', 'request-to-book', 'dl-verification', 'voice']

def add_label(pr_num, label):
    subprocess.run(['gh', 'pr', 'edit', str(pr_num), '--add-label', label],
                  capture_output=True, timeout=15)

for pr in prs:
    branch = pr['headRefName'].lower()
    title = pr['title'].lower()
    text = title + ' ' + branch

    is_hold = any(k in branch for k in HOLD_BRANCHES)
    is_security = any(k in text for k in SECURITY_KEYWORDS)

    if is_hold:
        add_label(pr['number'], 'tier:3-hold')
        print(f"  #{pr['number']}: tier:3-hold")
    elif is_security:
        add_label(pr['number'], 'tier:2-security')
        add_label(pr['number'], 'reviewer:peter')
        print(f"  #{pr['number']}: tier:2-security → reviewer:peter")
    else:
        add_label(pr['number'], 'tier:2-medium')
        add_label(pr['number'], 'reviewer:ransom')
        print(f"  #{pr['number']}: tier:2-medium → reviewer:ransom")
EOF
```

## Step 3: Windows Testing Directive Comments

For each PR assigned to Ransom, add a comment with:
- **Prerequisites**: which other PRs must be merged first (check PR body for "depends on" or stacked branches)
- **Windows setup**: exact PowerShell/CMD commands to start the dev environment
- **Test steps**: numbered list of exactly what to do in the UI or API to verify the change
- **What passes**: what success looks like
- **Dependents**: which other PRs depend on this one being merged

### Comment Template

```
## 🧪 Testing Directive (Windows)

**Prerequisites** (merge/apply these first):
- PR #N — <title> (required because <reason>)

**Start dev environment:**
```powershell
cd u-rent-platform
docker compose -f docker/docker-compose.yml up -d
# Wait ~10 seconds for postgres and redis
npx nx serve api          # Terminal 1 — wait for "Application is running"
npx nx dev web            # Terminal 2 — wait for "Ready on http://localhost:11001"
```

**Test steps:**
1. Navigate to <URL>
2. Do <action>
3. Verify: <what to see/not see>

**Acceptance criteria:**
- [ ] <criterion 1>
- [ ] <criterion 2>

**Do NOT merge until:** <condition or "no dependencies">

**After merging this, proceed to:** PR #N — <title>
```

### Posting Comments

```bash
gh pr comment <number> --body "$(cat <<'COMMENT'
## 🧪 Testing Directive (Windows)
...
COMMENT
)"
```

## Rules

1. **Never assign a PR to someone already assigned to a conflicting PR** — check if the person has >5 open PRs already with `gh pr list --assignee <login>`
2. **Security items always go to Peter**, regardless of SP count
3. **Stacked PRs** — if PR B depends on PR A, assign both to the same person
4. **Claude Code's PRs** (`@dbbuilder`) — leave assigned to Claude Code for now; add Peter as reviewer
5. **Dependabot PRs** — assign to Ransom if trivial deps bump, Peter if security advisory
6. **Do not add comments to PRs that already have a testing directive** — check comment history first with `gh pr view <number> --comments | grep "Testing Directive"`

## U-Rent Specific Context

### Windows Dev Environment Notes
- Docker Desktop required (not WSL docker)
- Port 11000 = API, 11001 = Web, 11002 = PostgreSQL, 6380 = Redis
- Use `npx nx serve api` not `nx serve api` directly
- `.env` files needed: `apps/api/.env` and `apps/web/.env.local`
- Database migrations: `npm run migration:run` (run in powershell from u-rent-platform/)
- To reset DB: `npm run db:reset:confirm`

### Merge Order Dependencies
The sprint PRs must merge in this order to avoid conflicts:
1. #568 (sprint 1 critical — foundational)
2. #569 (sprint 1 remaining)
3. #570 (deposit hold)
4. #571 (storage/reviews)
5. #572 (infra/auth)
6. #574 (tests)
7. #575-#595 (can be in any order after above)
8. New sprint PRs (#596, #597) — independent

### Common Issues on Windows
- `ENOENT: husky not found` — run `npm install` from `u-rent-platform/`
- `Error: Cannot find module 'ajv/dist/...'` — fixed in PR #555
- Redis not connecting — ensure Docker Desktop running; check port 6380 not 6379
- API not starting — check `apps/api/.env` exists with all required vars
- Clerk auth error — ensure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `apps/web/.env.local`
