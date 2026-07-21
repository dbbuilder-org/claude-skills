# u-rent-health-check

Run a fast health check on the U-Rent codebase: TypeScript errors, npm audit drift, CI status, and open PRs with problems. Produces a prioritized issue list.

## Trigger Phrases

- `/u-rent-health-check`
- "health check", "check for issues", "what's broken"
- "check the codebase health", "run health check"
- "any new problems", "check for drift"

## Instructions

<command-name>u-rent-health-check</command-name>

When invoked, run the following checks in parallel, then compile a report.

---

### Step 1: Run all checks in parallel

**A. TypeScript — web app**
```bash
cd /Users/admin/dev2/clients/U-Rent/u-rent-platform
npx nx typecheck web 2>&1 | grep -E "^src/.*error TS" | grep -v node_modules | wc -l
npx nx typecheck web 2>&1 | grep -E "^src/.*error TS" | grep -v node_modules | head -20
```

**B. TypeScript — API**
```bash
cd /Users/admin/dev2/clients/U-Rent/u-rent-platform
npx nx typecheck api 2>&1 | grep -E "^src/.*error TS" | grep -v node_modules | wc -l
npx nx typecheck api 2>&1 | grep -E "^src/.*error TS" | grep -v node_modules | head -10
```

**C. npm audit drift**
```bash
cd /Users/admin/dev2/clients/U-Rent/u-rent-platform
npm audit --json 2>&1 > /tmp/urent_audit.json
node << 'SCRIPT'
const d = JSON.parse(require('fs').readFileSync('/tmp/urent_audit.json','utf8'));
const vulns = d.vulnerabilities || {};
const acceptedPrefixes = [
  'tar','cacache','expo','@expo/','react-native','@react-native','nativewind',
  'ajv','eslint','@eslint','@typescript-eslint/','@angular-devkit/','@nestjs/',
  '@nx/','schema-utils','fork-ts-checker',
  'jest','@jest/','create-jest','babel-jest','ts-jest','jest-circus','jest-cli',
  'jest-config','jest-expo','jest-resolve','jest-runner','jest-runtime','jest-snapshot',
  'jest-watch','babel-plugin-istanbul','babel-preset-expo','test-exclude',
  '@sentry/','@storybook/','@swc/','@rollup/','@joshwooding/','@redocly/',
  'minimatch','glob','rimraf','del','jscodeshift','sucrase','openapi-typescript',
  'ejs','jake','filelist','node-dir','temp','tempy','chromium-edge-launcher',
  'webpack','@webpack-cli/','@module-federation/',
  'babel-loader','copy-webpack-plugin','css-loader','css-minimizer-webpack-plugin',
  'less-loader','mini-css-extract-plugin','postcss-loader','sass-loader',
  'source-map-loader','style-loader','terser-webpack-plugin','ts-loader','serialize-javascript',
  'typeorm','multer',
];
const accepted = new Set(['qs','bn.js','nx']);
const isAccepted = (n) => accepted.has(n) || acceptedPrefixes.some(p => n === p || n.startsWith(p));
const unaccepted = Object.keys(vulns).filter(k => !isAccepted(k));
console.log('NEW_COUNT=' + unaccepted.length);
unaccepted.forEach(k => console.log('  ' + vulns[k].severity.padEnd(8) + k));
SCRIPT
```

**D. CI status — recent failures**
```bash
gh run list --branch main --limit 5 --json status,conclusion,workflowName,createdAt 2>/dev/null
gh run list --status failure --limit 5 --json databaseId,workflowName,headBranch,createdAt 2>/dev/null
```

**E. Open PRs with failing checks**
```bash
gh pr list --state open --json number,title,headRefName,statusCheckRollup --limit 30 2>/dev/null | \
  python3 -c "
import json,sys
prs = json.load(sys.stdin)
for pr in prs:
    checks = pr.get('statusCheckRollup') or []
    failures = [c.get('name','?') for c in checks if c.get('conclusion') == 'FAILURE' or c.get('state') == 'FAILURE']
    if failures:
        print(f'PR #{pr[\"number\"]} ({pr[\"headRefName\"][:40]}): FAILING — {chr(44).join(failures[:3])}')
"
```

**F. Schema drift check**
```bash
cd /Users/admin/dev2/clients/U-Rent/u-rent-platform
npm run schema:check 2>&1 | tail -20
```

**G. Check for TODO/FIXME/HACK in recently changed files**
```bash
cd /Users/admin/dev2/clients/U-Rent/u-rent-platform
git diff --name-only HEAD~10..HEAD 2>/dev/null | \
  xargs grep -l "TODO\|FIXME\|HACK\|XXX" 2>/dev/null | head -10
```

---

### Step 2: Compile report

Output in this format:

```
## U-Rent Health Check — [date]

### 🔴 CRITICAL
- [items that block CI, break production, or are security issues]

### 🟡 WARNINGS
- TypeScript: N errors in web, M errors in API
- npm audit: N new unaccepted packages (list them)
- Schema drift: [summary]

### ✅ PASSING
- CI on main: [status]
- npm audit: N known/accepted packages

---

### TypeScript Errors (web)
[top 10 errors with file:line]

### npm Audit — New Packages
[list with severity and package name]

### CI Failures
[failed runs with workflow name and branch]

### Open PRs with Failing Checks
[list]

---

### Recommended Actions (priority order)
1. [highest priority]
2. ...
```

---

## Notes

- **TypeScript errors on main** are pre-existing debt. Note them but don't count them as regressions unless they're in files recently changed.
- **npm audit drift** means new CVEs were published against existing deps since the last `acceptedPrefixes` update. These need to be triaged: upgrade if fix exists, add to accepted list with rationale if no fix or not exploitable.
- **Schema drift** means entity files and the database are out of sync. Fix with `npm run migration:generate -- MigrationName && npm run migration:run`.
- **Pre-push hook** at `.husky/pre-push` catches TypeScript errors before push. If it fires, fix the errors before pushing. Use `--no-verify` only in genuine emergencies.
- Keep `acceptedPrefixes` in **both** `ci.yml` and `nightly-audit.yml` in sync. When adding a new accepted package, update both files in the same commit.
