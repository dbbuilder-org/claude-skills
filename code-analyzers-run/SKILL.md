---
name: code-analyzers-run
description: Check all code analysis tools for the current GitHub project — CI/CD (GitHub Actions), SonarCloud, Semgrep, Snyk, CodeRabbit, and code quality. Produces a unified status report with failures, warnings, and actionable fixes. Use when the user says "/code-analyzers-run", "check analyzers", "check ci/cd", "code quality status", or "check all scanners".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# code-analyzers-run

Check all code analysis and security scanning tools configured in the current project and produce a unified status report.

## Trigger Phrases

- `/code-analyzers-run`
- "check analyzers", "check all scanners"
- "check ci/cd" (comprehensive version)
- "code quality status", "what's failing in CI"
- "sonarcloud status", "semgrep status", "coderabbit findings"

## Instructions

<command-name>code-analyzers-run</command-name>

When invoked, execute the following steps:

---

### Step 1: Detect configured analyzers

Scan the project to identify which analyzers are configured:

```bash
# List GitHub workflow files
ls .github/workflows/ 2>/dev/null

# Check for analyzer configs
ls .coderabbit* .semgrep* .sonar* .snyk* sonar-project.properties 2>/dev/null

# Check workflow files for specific tools
grep -l "sonar\|semgrep\|snyk\|codeql\|coderabbit\|trivy\|checkov" .github/workflows/*.yml 2>/dev/null
```

---

### Step 2: Gather CI/CD run statuses (parallel)

Run these simultaneously:

```bash
# All recent workflow runs across all workflows
gh run list --limit 20 --json databaseId,status,conclusion,headBranch,workflowName,createdAt 2>/dev/null > /tmp/analyzer_runs.json

# Open PRs with check status
gh pr list --state open --json number,title,headRefName,statusCheckRollup --limit 20 2>/dev/null > /tmp/analyzer_prs.json

# Recent failed runs - get IDs for log inspection
gh run list --status failure --limit 5 --json databaseId,workflowName,headBranch 2>/dev/null > /tmp/analyzer_failures.json
```

---

### Step 3: Parse and categorize run results

```bash
python3 << 'EOF'
import json

runs = json.load(open('/tmp/analyzer_runs.json'))
prs = json.load(open('/tmp/analyzer_prs.json'))

# Group runs by workflow
from collections import defaultdict
by_workflow = defaultdict(list)
for r in runs:
    by_workflow[r['workflowName']].append(r)

print("=== WORKFLOW RUN SUMMARY ===")
for wf, wf_runs in sorted(by_workflow.items()):
    latest = wf_runs[0]
    status = latest.get('conclusion') or latest.get('status') or 'unknown'
    branch = latest.get('headBranch', '?')[:35]
    print(f"  {wf}: {status.upper()} ({branch})")

print("\n=== PR CHECK STATUS ===")
for pr in prs:
    checks = pr.get('statusCheckRollup') or []
    failures = [c for c in checks if c.get('state') == 'FAILURE' or c.get('conclusion') == 'FAILURE']
    pending = [c for c in checks if c.get('state') == 'IN_PROGRESS' or c.get('status') == 'IN_PROGRESS']
    if failures:
        names = ', '.join(c.get('name','?') for c in failures)
        print(f"  PR #{pr['number']} ({pr['headRefName'][:30]}): FAILING — {names}")
    elif pending:
        print(f"  PR #{pr['number']} ({pr['headRefName'][:30]}): PENDING ({len(pending)} checks in progress)")
    elif checks:
        print(f"  PR #{pr['number']} ({pr['headRefName'][:30]}): ✅ All checks passing")
    else:
        print(f"  PR #{pr['number']} ({pr['headRefName'][:30]}): no checks")
EOF
```

---

### Step 4: Investigate failures

For each failed workflow run, fetch the error logs:

```bash
python3 << 'EOF'
import json, subprocess

failures = json.load(open('/tmp/analyzer_failures.json'))
for f in failures[:3]:  # Check top 3 recent failures
    run_id = f['databaseId']
    wf = f['workflowName']
    branch = f['headBranch']
    print(f"\n=== FAILURE: {wf} on {branch} ===")
    result = subprocess.run(
        ['gh', 'run', 'view', str(run_id), '--log-failed'],
        capture_output=True, text=True, timeout=30
    )
    # Get last meaningful lines (skip boilerplate)
    lines = [l for l in result.stdout.split('\n') if l.strip() and
             not any(x in l for x in ['runner version', 'Runner Image', 'Prepare', 'Getting action', 'Complete job'])]
    # Find error lines
    error_lines = [l for l in lines if any(x in l.lower() for x in ['error', 'fail', 'warn', 'exit code'])]
    for line in error_lines[-15:]:
        print(line)
EOF
```

---

### Step 5: Check CodeRabbit findings on open PRs

```bash
python3 << 'EOF'
import json, subprocess

prs = json.load(open('/tmp/analyzer_prs.json'))
print("=== CODERABBIT FINDINGS ===")
found = False
for pr in prs[:5]:
    result = subprocess.run(
        ['gh', 'api', f"repos/:owner/:repo/issues/{pr['number']}/comments",
         '--jq', '[.[] | select(.user.login | contains("coderabbitai")) | {body: .body[:500]}] | .[0]'],
        capture_output=True, text=True, timeout=15
    )
    if result.returncode == 0 and result.stdout.strip() and result.stdout.strip() != 'null':
        found = True
        body = result.stdout.strip()
        # Extract just the summary section
        if 'actionable' in body.lower() or 'issue' in body.lower() or 'warning' in body.lower():
            print(f"\nPR #{pr['number']} ({pr['headRefName'][:30]}):")
            print(body[:300])
if not found:
    print("  No recent CodeRabbit findings (or rate limited)")
EOF
```

---

### Step 6: Check SonarCloud status (if configured)

```bash
# Check if sonar-project.properties exists
if [ -f "sonar-project.properties" ] || grep -q "SONAR_TOKEN" .github/workflows/*.yml 2>/dev/null; then
    echo "=== SONARCLOUD ==="
    # Check recent sonarcloud workflow runs
    gh run list --workflow=ci.yml --limit 5 --json status,conclusion,headBranch,createdAt \
        2>/dev/null | python3 -c "
import json,sys
runs = json.load(sys.stdin)
for r in runs:
    print(f'  {r[\"headBranch\"][:35]}: {r.get(\"conclusion\") or r.get(\"status\")} ({r[\"createdAt\"][:10]})')
    " 2>/dev/null || echo "  Could not fetch SonarCloud status"
else
    echo "  SonarCloud: not configured"
fi
```

---

### Step 7: Check Semgrep status (if configured)

```bash
if [ -f ".github/workflows/semgrep.yml" ]; then
    echo "=== SEMGREP ==="
    gh run list --workflow=semgrep.yml --limit 3 --json status,conclusion,headBranch,createdAt \
        2>/dev/null | python3 -c "
import json,sys
runs = json.load(sys.stdin)
for r in runs:
    status = r.get('conclusion') or r.get('status') or 'unknown'
    print(f'  {r[\"headBranch\"][:35]}: {status.upper()} ({r[\"createdAt\"][:10]})')
    " 2>/dev/null || echo "  Could not fetch Semgrep status"
else
    echo "  Semgrep: not configured"
fi
```

---

### Step 8: Check Snyk / security workflow

```bash
if [ -f ".github/workflows/security.yml" ]; then
    echo "=== SNYK / SECURITY SCAN ==="
    gh run list --workflow=security.yml --limit 3 --json status,conclusion,headBranch,createdAt \
        2>/dev/null | python3 -c "
import json,sys
runs = json.load(sys.stdin)
for r in runs:
    status = r.get('conclusion') or r.get('status') or 'unknown'
    print(f'  {r[\"headBranch\"][:35]}: {status.upper()} ({r[\"createdAt\"][:10]})')
    " 2>/dev/null || echo "  Could not fetch security scan status"
else
    echo "  Snyk/Security: not configured"
fi
```

---

### Step 9: Compile and output report

Output a structured report:

```
## code-analyzers-run Report — [date]

### 🔴 FAILURES

| Tool | Branch/PR | Error |
|------|-----------|-------|

### 🟡 WARNINGS / PENDING

| Tool | Status |
|------|--------|

### ✅ PASSING

| Tool | Last Run |
|------|----------|

---

### 🤖 CodeRabbit Findings
[Summary of recent CodeRabbit comments on open PRs]

---

### Recommended Fixes
1. [Highest priority fix]
2. [Next]
...
```

---

## Tool Detection Guide

| Tool | Config File | Workflow |
|------|------------|---------|
| **GitHub Actions CI** | `.github/workflows/ci.yml` | All PRs |
| **SonarCloud** | `sonar-project.properties` | After CI on main |
| **Semgrep** | `.github/workflows/semgrep.yml` | PRs + weekly |
| **Snyk** | `.github/workflows/security.yml` | Main + weekly |
| **CodeRabbit** | `.coderabbit.yaml` | All PRs (bot comments) |
| **CodeQL** | `.github/workflows/codeql.yml` | If present |

## Common Failure Patterns

- **check-api-types fails**: DTO or controller changed without regenerating `api-types.ts` → run `npm run generate:api-types` with API running
- **npm audit fails**: New vuln not in accepted list → add to `acceptedPrefixes` in `ci.yml`
- **SonarCloud fails on Dependabot PRs**: `SONAR_TOKEN` not in Dependabot secrets — expected, merge with `--admin`
- **Semgrep security finding**: Real vulnerability in code — needs targeted fix
- **CodeRabbit rate limited**: Wait 5-10 min, then `@coderabbitai review` in PR comment
