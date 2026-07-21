---
name: code-review-opus
description: >
  Deep targeted code review using Opus. Spawns an Opus subagent that reads a specific
  selection of files/components/features and performs a surgical, high-confidence
  inspection — logic correctness, security, edge cases, race conditions, concurrency,
  data integrity, and type safety. Produces a severity-tiered findings report with
  exact file:line citations and minimal fixes. Use when the user says "opus review",
  "deep inspect", "code-review-opus", or points at a specific file/feature and asks
  for a thorough check. NOT a broad sweep — targets only what is specified.
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
---

# code-review-opus

**Surgical deep inspection using Opus.** One Opus subagent reads the target in full,
reasons through every branch and edge case, and returns high-confidence findings with
exact citations. No broad sweeps — only what is scoped.

## Trigger Phrases

- `/code-review-opus [target]`
- "opus review [file/feature/component]"
- "deep inspect [file/feature]"
- "have opus look at [X]"
- "deep code review", "thorough inspection"

---

## Instructions

<command-name>code-review-opus</command-name>

### Step 1 — Parse the target

Extract the target from the user's message. The target is one of:

| Target type | Example | What to read |
|-------------|---------|--------------|
| Explicit file(s) | `code-review-opus AuthService.cs` | Read those files directly |
| Feature name | `code-review-opus tenant resolution` | Grep + glob to find all relevant files |
| Component/view | `code-review-opus InspectionsView` | Find the .vue + composables + types |
| Recent changes | `code-review-opus latest commit` | `git diff HEAD~1..HEAD` → derive files |
| Unspecified | `/code-review-opus` (no args) | `git diff HEAD~5..HEAD --name-only` → prompt user to confirm top 5 changed files |

If target is ambiguous, list the candidate files and ask the user to confirm before proceeding.

---

### Step 2 — Collect context

Before spawning the Opus agent, gather everything it will need so it can reason
without tool calls (which are slower and cut context). Collect in parallel:

```bash
# 1. Full content of target files
# (use Read tool on each file — do NOT pass file paths alone)

# 2. Git blame / recent commit history for target
git log --oneline -10 -- <target-files>

# 3. Test files for the target (if any)
find . -name "*.spec.*" -o -name "*.test.*" | xargs grep -l "<TargetClass>" 2>/dev/null | head -5

# 4. Callers / consumers of the target
grep -rn "<ClassName>\|<FunctionName>" src/ --include="*.ts" --include="*.cs" --include="*.vue" \
  --exclude-dir=node_modules 2>/dev/null | grep -v "\.spec\.\|\.test\." | head -30

# 5. Sibling/related services (infer from imports)
grep -n "^using\|^import " <target-file> | head -20

# 6. Database schema or API contract if service touches data
# (read relevant migration, DTO, or SP file)
```

Read every file fully before passing to the agent. Truncated context = missed bugs.

---

### Step 3 — Spawn Opus subagent

Spawn a **single Opus subagent** with the full collected context embedded in the prompt.
The agent must **only read** — it must NOT edit files or run commands.

The prompt template:

```
You are performing a deep surgical code review as Claude Opus. You have been given
the full source of the target files below. Your job is to find real bugs — not style
issues. Focus on:

1. LOGIC CORRECTNESS — wrong conditions, off-by-one, missing branches, incorrect
   defaults, broken state machines, wrong operator precedence.

2. SECURITY — injection vectors, auth bypass, tenant/user data leakage across
   boundaries, missing input validation at system boundaries, credential exposure,
   insecure defaults, IDOR risks, timing attacks.

3. EDGE CASES & ERROR PATHS — what happens on null/empty input, on the Nth retry,
   when an external call throws, when a DB row doesn't exist, when two requests race.

4. RACE CONDITIONS & CONCURRENCY — shared mutable state, missing locks, double-write
   or double-read hazards, stale reads after async gaps, optimistic update collisions.

5. DATA INTEGRITY — FK violations, missing transactions, partial writes, incorrect
   cascades, silent truncation, lost updates.

6. TYPE SAFETY & CONTRACT VIOLATIONS — `as any` that hides real mismatches, nullable
   derefs, mismatched DTO-to-SP parameter counts, optional fields treated as required.

7. INCOMPLETE IMPLEMENTATION — TODO/FIXME still in code, dead branches that are
   never reachable, methods that do nothing, stubs returning placeholder data,
   features that exist on one side (API/frontend) but not the other.

8. OBSERVABLE SYMPTOMS — if a bug exists, describe what the user/operator would see.
   "The tenant picker shows data from the wrong tenant" is more useful than
   "filterLocationId not cleared."

## Rules
- Every finding MUST cite exact file:line.
- Every finding MUST include the minimal fix (code snippet or description).
- Do NOT report style issues, naming conventions, or minor polish unless they
  directly cause a correctness or security bug.
- Do NOT repeat things that are correct — only findings matter.
- Confidence: mark each finding HIGH / MEDIUM / LOW based on certainty that it
  is actually a bug (not just a smell).
- If you see something unusual that is NOT a bug, note it once as "Design Note"
  (not a finding).

## Severity
- CRITICAL: exploitable, data loss, auth bypass, tenant isolation broken
- HIGH: incorrect behavior observable by users, data corruption possible
- MEDIUM: edge case failure, unhandled error that silently does wrong thing
- LOW: minor but real correctness gap; low blast radius

## Output format
Return findings as:

---
### [SEVERITY] [CONFIDENCE] Title — file:line
**Issue:** one sentence, concrete.
**Scenario:** what sequence of events triggers it.
**Impact:** what the user/system observes.
**Fix:**
\`\`\`language
minimal fix here
\`\`\`
---

After all findings, a one-table summary:
| # | Severity | Confidence | Title | File:Line | Fix SP |
|---|----------|------------|-------|-----------|--------|

Then a **Design Notes** section (max 3 bullets) for unusual-but-correct patterns
the next reviewer might question.

## Target files and context

<INJECT_TARGET_CONTENT_HERE>

<INJECT_CALLERS_AND_TESTS_HERE>

<INJECT_GIT_HISTORY_HERE>
```

---

### Step 4 — Receive and post-process findings

When the Opus subagent returns:

1. **Triage** — separate CRITICAL/HIGH from MEDIUM/LOW
2. **Verify** — for every HIGH+ finding, do a quick grep or Read to confirm the
   cited line still matches (Opus can occasionally mis-cite line numbers)
3. **Write report** to `code-review/<YYYY-MM-DD>/OPUS-<target-name>.md`
4. **Present to user** — inline in conversation, grouped by severity

---

### Step 5 — Offer to fix

After presenting findings, ask the user:

> "Want me to apply the HIGH+ fixes now, or review first?"

If user says yes, apply the minimal fix for each HIGH+ finding using Edit tool,
then run the relevant build/test command to verify:
- `.cs` changes → `dotnet build` + `dotnet test --filter`
- `.vue`/`.ts` changes → `npm run build` + `npx vitest run <spec>`
- Mixed → both

Commit with message referencing the review:
```
fix(<scope>): Opus review findings — <N> HIGH, <N> MEDIUM fixed

<bullet per fix: what + file:line>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## Report Format

`code-review/<YYYY-MM-DD>/OPUS-<target-name>.md`:

```markdown
# Opus Deep Review — <Target Name>
**Date:** YYYY-MM-DD
**Target:** <files reviewed>
**Model:** Claude Opus (via subagent)
**Callers examined:** N
**Test files examined:** N
**Git commits reviewed:** last N

---

## Summary Table
| # | Severity | Confidence | Title | File:Line | Fix SP |
|---|----------|------------|-------|-----------|--------|

---

## Findings

### [CRITICAL] ...
### [HIGH] ...
### [MEDIUM] ...
### [LOW] ...

---

## Design Notes

---

## Disposition
- Applied this session: N findings (N SP)
- Deferred to sprint: N findings
- Accepted risk: N findings (with reason)
```

---

## Rules

1. **Read before spawning** — collect ALL context before the Opus call. The agent
   must not need to reach back for more files.
2. **One agent, full context** — do not split into multiple Opus calls for the same
   target. One call with all context is cheaper and more coherent.
3. **Verify citations** — before presenting findings, spot-check HIGH+ line numbers.
4. **Only fix what's confirmed** — do not apply MEDIUM/LOW fixes without user approval.
5. **No style police** — if it's not a correctness or security bug, it's not a finding.
6. **Minimal fix only** — the Fix snippet must be the smallest change that closes
   the vulnerability. Do not refactor surrounding code.
7. **Report always** — write the `.md` file even if there are zero findings.
   A clean bill of health is a useful record.
8. **~20 min total** — context gathering + Opus call + triage + presentation.

---

## When to Use vs Other Review Skills

| Situation | Use |
|-----------|-----|
| Suspicious logic in one service/component | `/code-review-opus <file>` |
| New feature just implemented | `/code-review-opus <feature name>` |
| "Something feels off" about auth/tenant scoping | `/code-review-opus TenantResolutionMiddleware` |
| After Opus suggests a fix | `/code-review-opus` the changed files |
| Broad codebase health | `/code-review-full` |
| Quick pass before commit | `/code-review-quick` |
| Just need a to-do list | `/code-review-v3` |
