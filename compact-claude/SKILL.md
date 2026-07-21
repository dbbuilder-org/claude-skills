# /compact-claude — Workflow-Aware Context Optimizer

Compress session context and CLAUDE.md files using phase-aware rules.
Understands the docs → code → tests → docs cycle and what's safe to archive at each transition.

## Trigger
`/compact-claude` | "compress context" | "reduce tokens" | "slim down context" | "compact session"

---

## Phase 0: Detect Workflow Phase

Before doing anything, determine where the current session sits in the cycle:

| Phase | Signals | Safe to compress |
|-------|---------|-----------------|
| **Planning/Docs** | PM plans, feedback docs, roadmap work, no open PRs | Nothing yet — this phase produces the anchors |
| **Code** | Open feature PR, active edits, no new tests yet | Compress planning docs to file pointers |
| **Tests** | Code committed/PR open, writing test files | Compress implementation details to git refs |
| **Review/Docs** | Tests green, writing PR description, updating roadmap | Compress test details to pass count + commit |
| **Idle/Cleanup** | No active PR, catching up | Full audit — archive everything stale |

Report the detected phase before proceeding:
```
Detected phase: Code (open PR #112, 3 edited files, 0 new tests)
Safe to compress: Planning docs from this session → file pointers
```

---

## Phase 1: CLAUDE.md Audit

### Files to check
- `~/CLAUDE.md` (global)
- `./CLAUDE.md` (project)
- `./CLAUDE.local.md` (if present)

### Report format
```
File               Lines   Est. Tokens   Status
~/CLAUDE.md          72       900        ✓ healthy
./CLAUDE.md         180     2,200        ⚠ 3 bloat patterns found
```

### TOON rules (apply to each file)
- Bullets/phrases over full sentences
- Inline commands: `Dev: npm run dev` not fenced code blocks
- Tables for paths, credentials, structured data
- No "why" explanations — keep "what" and "how"
- No example values when the pattern is obvious
- IMPORTANT/CRITICAL/⚠️ reserved for genuinely destructive pitfalls
- Ephemeral status → PROGRESS.md, not CLAUDE.md
- Completed items → remove or git ref, not kept as context

### What belongs where
| Content | Correct location |
|---------|-----------------|
| Commands + rules | CLAUDE.md |
| Current sprint state | PROGRESS.md |
| Credentials / API keys | `~/.config/claude/credentials.md` |
| Framework gotchas | `~/.config/claude/patterns.md` |
| Project conventions | `~/.config/claude/{project}.md` |
| Architecture decisions | `docs/ADR/` or `ARCHITECTURE.md` |
| Completed work | Git commit message — not CLAUDE.md |

---

## Phase 2: Session Artifact Audit

### Working directory (`working/`)
- PDFs and AI comparison docs are read-once reference material
- If the session already extracted the relevant decisions: suggest `.claudeignore` entry or move to `docs/`
- Flag any `working/` files >30 days old with no recent reference

### Code review sessions (`code-review/`)
- Each session is a snapshot in time; only the latest TODO file matters
- Older sessions: compress to one line in MEMORY.md index (`code-review/2026-04-20 — GREEN, 153 suites, action plan: TODO_2026-04-20.md`)
- Never keep full prior-session review docs in active context

### Session context docs (`docs/SESSION_CONTEXT_*.md`, `docs/FIXES_*.md`)
- These should be single-session artifacts, not persistent context
- After the session they document is complete: move key decisions to MEMORY.md, delete or archive the file
- Flag any that are >7 days old

### Memory system (`memory/MEMORY.md`)
- Check if MEMORY.md index is approaching 200-line limit (truncation threshold)
- Identify entries that are now stale (code they reference may have changed)
- Consolidate related single-line entries into topic files where they exist
- Verify pointers in MEMORY.md still point to existing files

---

## Phase 3: Phase-Transition Compression

Apply these rules based on the detected phase:

### Planning → Code transition
- PM plan written, now implementing: compress plan reference to `(see docs/FEATURE-NAME-PLAN.md)`
- Feedback response docs: verify they're committed, then they're git history — not session context
- Keep: file paths of files to be created/modified, API contracts from Addenda

### Code → Tests transition
- Implementation complete, PR open: compress code details to `(PR #N, commit abc1234)`
- The code is now in git — no need to keep implementation notes in context
- Keep: test file paths to create, coverage gaps identified

### Tests → Review/Docs transition
- Tests passing: compress to `N suites / N tests — all green (commit abc1234)`
- Keep: PR description draft, items for MEMORY.md, roadmap updates needed

### Review → Idle transition
- PR merged: compress everything to git ref + MEMORY.md entry
- Archive or delete SESSION_CONTEXT docs
- Update PROGRESS.md to reflect new baseline

---

## Phase 4: `.claudeignore` Recommendations

Suggest entries based on project type:

```
# Always ignore
node_modules/
.next/
dist/
*.tsbuildinfo

# Large generated output
code-review/20*/0[2-9]-*.md    # Keep only 00-EXECUTIVE-SUMMARY and TODO from old reviews
working/*.pdf                  # PDFs are read-once; don't re-load every session
backups/

# Test artifacts
coverage/
playwright-report/
```

---

## Phase 5: PROGRESS.md Sync

Ensure `PROGRESS.md` exists and is current (< 50 lines):

```markdown
# PROGRESS — YYYY-MM-DD

## Current State
- Branch: [branch] → [target]
- Open PRs: #N ([title])
- Tests: N suites / N tests

## Next Actions (ordered)
1. ...
2. ...

## Known Issues
- [issue] — [workaround]

## Recently Completed (last 7 days)
- [item] — commit [hash]
```

---

## Phase 6: Report

```
## Compact-Claude Report — YYYY-MM-DD
Phase detected: [phase]

### CLAUDE.md
Before: N lines / ~N tokens
After:  N lines / ~N tokens  (N% reduction)

### Session Artifacts
- Archived: [list]
- Flagged for deletion: [list]
- .claudeignore entries added: [N]

### Memory System
- MEMORY.md: N lines (limit 200) — [healthy / ⚠ approaching limit]
- Stale entries updated: [N]

### PROGRESS.md
[created / updated / already current]

### Recommended next action
[one sentence]
```

---

## Key Principle

**Git is the best compressor.** Once work is committed, replace all in-context notes about it with a commit hash. A 2000-token implementation discussion compresses to `feat(dashboard-v9): last-active-day fallback (commit 3bb04b6)` — 10 tokens, full fidelity via `git show`.

Auto-loaded files contain only what's needed in *every* session. Everything else: reference files (on-demand), PROGRESS.md (current state), or git (completed work).
