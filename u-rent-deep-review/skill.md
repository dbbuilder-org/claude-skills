---
name: u-rent-deep-review
description: >
  Full pre-merge code review for U-Rent using parallel Opus 1M sessions.
  Rebuilds the code-review integration branch (all open PRs merged onto staging),
  packs diff + curated context into separate files, runs 5 parallel Opus subagent
  review tracks, synthesizes findings into a severity-tiered report, and writes it
  to code-review/YYYY-MM-DD/REPORT.md.
  Tracks: A=API Logic, B=Web/Frontend, C=Mobile, D=Integration (contract), E=Architecture.
  Use when the user says "deep review", "run the code review", "u-rent-deep-review",
  "review all PRs", or "code review branch".
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
---

# u-rent-deep-review

**Full pre-merge review of every open U-Rent PR in a single session.**

Five parallel Opus subagents — one per domain — each reading curated context files
in sequence using explicit pagination, then returning structured findings.

## Trigger Phrases

- `/u-rent-deep-review`
- "deep review", "run the code review", "review all PRs"
- "code review branch", "full pre-merge review"

## Constants

```
REPO_PATH:      /Users/admin/dev2/clients/U-Rent/u-rent-platform
BASE_BRANCH:    origin/staging
REVIEW_BRANCH:  code-review
PACK_SCRIPT:    code-review/pack-for-review.sh
```

## Instructions

<command-name>u-rent-deep-review</command-name>

---

### Step 1 — Rebuild the code-review branch

```bash
cd /Users/admin/dev2/clients/U-Rent/u-rent-platform

git fetch origin --quiet

# Get all open non-dependabot PR branches, staging-targeting first
STAGING_BRANCHES=$(gh pr list --limit 60 \
  --json number,headRefName,baseRefName \
  --jq '.[] | select(.state=="OPEN" and .baseRefName=="staging") | .headRefName' \
  | grep -v "dependabot")

STACKED_BRANCHES=$(gh pr list --limit 60 \
  --json number,headRefName,baseRefName \
  --jq '.[] | select(.state=="OPEN" and .baseRefName!="staging") | .headRefName' \
  | grep -v "dependabot")

echo "Staging PRs: $(echo "$STAGING_BRANCHES" | grep -c . || true)"
echo "Stacked PRs: $(echo "$STACKED_BRANCHES" | grep -c . || true)"

# Rebuild from current staging
git checkout -B code-review origin/staging

SUCCESS=0; CONFLICT=0
for branch in $STAGING_BRANCHES $STACKED_BRANCHES; do
  result=$(git merge --no-ff --no-edit "origin/$branch" 2>&1)
  if [ $? -eq 0 ]; then
    SUCCESS=$((SUCCESS+1))
  else
    git merge --abort 2>/dev/null
    git merge --no-ff --no-edit -X theirs "origin/$branch" 2>/dev/null \
      && SUCCESS=$((SUCCESS+1)) \
      || { git merge --abort 2>/dev/null; CONFLICT=$((CONFLICT+1)); }
  fi
done

echo "Merged: $SUCCESS | Could not merge (skipped): $CONFLICT"
git push origin code-review --force
```

Note any branches that could not be merged — they will be missing from the review.

---

### Step 2 — Run contract extraction + validation

```bash
cd /Users/admin/dev2/clients/U-Rent/u-rent-platform
DATE=$(date +%Y-%m-%d)
OUT="code-review/$DATE"
mkdir -p "$OUT/contracts"

echo "2a/2  Extracting contracts..."
npx ts-node --project tsconfig.scripts.json code-review/contracts/extract.ts \
  --out "$OUT/contracts"

echo "2b/2  Validating cross-layer contracts..."
npx ts-node --project tsconfig.scripts.json code-review/contracts/validate.ts \
  --contracts "$OUT/contracts" \
  --out "$OUT/VIOLATIONS.md"

FAIL_COUNT=$(grep -c '^🔴' "$OUT/VIOLATIONS.md" 2>/dev/null || echo 0)
WARN_COUNT=$(grep -c '^🟡' "$OUT/VIOLATIONS.md" 2>/dev/null || echo 0)
echo "   ✓ Contract violations: $FAIL_COUNT FAIL, $WARN_COUNT WARN → $OUT/VIOLATIONS.md"
```

Verify:
- `VIOLATIONS.md` was written and has a non-zero FAIL/WARN count
- Contract JSON files written to `code-review/$DATE/contracts/`

---

### Step 3 — Pack the review context

This step creates the context files for subagent reading. Since `pack-for-review.sh` does not yet exist as a file (it's described in CONTRACTS-PLAN.md as a future step), pack the context manually:

```bash
cd /Users/admin/dev2/clients/U-Rent/u-rent-platform
DATE=$(date +%Y-%m-%d)
OUT="code-review/$DATE"

# Generate diff
git diff origin/staging...code-review > "$OUT/diff.patch"
echo "diff.patch: $(wc -l < "$OUT/diff.patch") lines"

# API source context (all TS in apps/api/src, excluding spec files)
find apps/api/src -name "*.ts" ! -name "*.spec.ts" \
  ! -path "*/node_modules/*" ! -path "*/.claude/*" \
  | sort | xargs -I{} sh -c 'echo "### {}" && cat "{}"' \
  > "$OUT/ctx-api-source.md"
echo "ctx-api-source.md: $(wc -l < "$OUT/ctx-api-source.md") lines"

# Web source context (all TSX/TS in apps/web/src, excluding spec files)
find apps/web/src -name "*.ts" -o -name "*.tsx" \
  | grep -v ".spec." | grep -v node_modules | grep -v ".claude" \
  | sort | xargs -I{} sh -c 'echo "### {}" && cat "{}"' \
  > "$OUT/ctx-web-source.md"
echo "ctx-web-source.md: $(wc -l < "$OUT/ctx-web-source.md") lines"
```

Verify:
- `diff.patch` has a non-zero line count (if zero, the code-review branch is identical to staging)
- `ctx-api-source.md` is non-empty
- `ctx-web-source.md` is non-empty

---

### Step 4 — Run five parallel review tracks

**CRITICAL MODEL REQUIREMENT:** Every subagent MUST use `model: "opus"`.
Sonnet does not have a 1M context window and cannot hold the full context.

**CRITICAL READING REQUIREMENT:** Each subagent's instruction file tells it to
read multiple large context files using explicit limit=2000 pagination. The subagent
MUST follow those instructions exactly — reading each file completely before proceeding
to the next, incrementing offset by 2000 per call until a call returns fewer than 2000 lines.

Launch all five subagents simultaneously:

```
SUBAGENT A — model: opus
Prompt:
"You are performing Track A (API Logic) of the U-Rent deep code review.

FIRST — read the pre-proved contract violations (single Read call, ~400 lines):
  /Users/admin/dev2/clients/U-Rent/u-rent-platform/code-review/[DATE]/VIOLATIONS.md

This file contains machine-extracted cross-layer findings already confirmed by
structural analysis. Treat every FAIL as a proven finding — include it in your
output with severity escalation if appropriate. Do not re-derive these from source.

SECOND — read your instruction file (single Read call — it is under 400 lines):
  /Users/admin/dev2/clients/U-Rent/u-rent-platform/code-review/[DATE]/instructions-track-A.md

The instruction file tells you exactly which context files to load and in what order,
with precise line counts and Read call counts for each file. Follow those instructions
exactly — do not skip any file or start reviewing before completing all file loads.

After reading all context, execute the Track A review task as specified.
Return your complete findings in the output format specified in the instructions."

SUBAGENT B — model: opus
Prompt: [same structure, instructions-track-B.md]

SUBAGENT C — model: opus
Prompt: [same structure, instructions-track-C.md]
Note: if mobile changes = 0, this subagent will report "No mobile changes" and finish quickly.

SUBAGENT D — model: opus
Prompt: [same structure, instructions-track-D.md]

SUBAGENT E — model: opus
Prompt: [same structure, instructions-track-E.md]
```

Collect all five sets of findings.

---

### Step 5 — Synthesise findings

After all five subagents return, synthesise in the main session:

1. **Deduplicate** — same file, same issue flagged by multiple tracks → one finding
2. **Escalate** — Track A P1 + Track D P1 representing the same broken end-to-end flow → P0
3. **Downgrade** — Track E confirms an architectural mitigation that makes a Track A P1 a P2
4. **Map to PRs** — for each P0/P1: `git log --oneline origin/staging..code-review -- <file>`
   to identify which PR introduced the finding
5. **Build routing table** — which findings block which specific PRs, and who owns them

---

### Step 6 — Write the report

Write to `code-review/[DATE]/REPORT.md`:

```markdown
# U-Rent Deep Code Review — [DATE]
**Branch:** code-review ([N] PRs merged onto staging)
**Tracks run:** A (API) · B (Web) · C (Mobile — [N files / skipped]) · D (Integration) · E (Architecture)
**Files changed:** [N] TS/TSX files | **Diff size:** ~[N]K lines
**Risk level:** [Critical / High / Medium / Low]

---

## Executive Summary
[3-5 sentences: what was reviewed, overall risk, the most critical findings]

## 🔴 P0 — Block merge immediately
[Each: title | file:line | proof | fix | which PR]

## 🟠 P1 — Fix before sprint closes
...

## 🟡 P2 — Fix before merge to main
...

## 🔵 P3 — Nits
...

## ✅ Verified Clean
[Areas explicitly checked across all tracks and found correct]

## 📋 PR Routing Table
| Finding | Severity | Introduced by PR | Assignee | Action |
|---------|----------|-----------------|----------|--------|
| ...     | P0       | #NNNN           | @handle  | Block PR / New fix PR |

## 🔗 Integration Layer Summary (Track D)
[Key findings from the API↔Web contract review]

## 🧪 Test Coverage Gaps
[Gaps that increase risk but aren't bugs]

## 📊 Stats
- PRs reviewed: N
- Files changed: N
- Total findings: P0=N P1=N P2=N P3=N
- Verified clean areas: [list]
```

---

### Step 7 — Commit report and post summary

```bash
cd /Users/admin/dev2/clients/U-Rent/u-rent-platform
git add code-review/
git commit -m "chore(code-review): [DATE] deep review — P0=N P1=N P2=N"
git push origin code-review
```

Output to the user: P0/P1 findings + PR routing table.
Full report is in `code-review/[DATE]/REPORT.md`.

---

## Notes

- `model: "opus"` is not optional. Sonnet will fail or silently truncate on these file sizes.
- Instruction files are ~300-400 lines — one Read call loads them completely.
- Context files (foundation, api-source, web-source) are 5K–15K lines — subagents paginate
  using explicit limit=2000 with incrementing offset until fewer than 2000 lines returned.
- Track C (Mobile) self-reports as skipped when there are no mobile changes in the diff.
- Track D (Integration) is the most likely to find P1s missed by individual PR review —
  it specifically looks for the gap between what the API returns and what the web expects.
- The `-X theirs` fallback is intentional for the integration branch. Track E catches
  the structural conflicts that `-X theirs` might mask.
- Re-run `pack-for-review.sh` and re-run affected tracks when new PRs open or update.
