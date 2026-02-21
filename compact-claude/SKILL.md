# /compact-claude - Session & CLAUDE.md Token Optimizer

Analyze and optimize CLAUDE.md files AND session context using TOON format. Designed to minimize what carries between sessions in chatty, long-running projects.

## Trigger
User invokes `/compact-claude` or asks to optimize/compact context, reduce tokens, or "keep only what we need."

## Behavior

### Phase 1: CLAUDE.md Optimization

1. **Discover all CLAUDE.md files in scope:**
   - Global: `~/CLAUDE.md`
   - Project: `./CLAUDE.md` (current working directory)
   - Local: `./CLAUDE.local.md`
   - Parent dirs: Walk up from CWD checking each for CLAUDE.md
   - Reference files: `~/.config/claude/*.md`

2. **Analyze each file:**
   - Count lines and estimate tokens (~1.3 tokens/word average)
   - Identify bloat categories:
     - Multi-line code blocks (>3 lines) that could be inline or referenced
     - Full sentences where bullets/phrases suffice
     - Duplicate information across files (global vs project vs local)
     - "Why" explanations (keep only "what" and "how")
     - Ephemeral status that belongs in PROGRESS.md/TODO.md
     - Credentials that belong in `~/.config/claude/credentials.md`
     - Project-specific content sitting in global file
     - Completed tasks still listed as pending
     - Verbose examples when a pattern is obvious

3. **Report findings:**
   ```
   File                    Lines   Est. Tokens   Bloat %
   ~/CLAUDE.md              870      8,500         78%
   ./CLAUDE.md              441      3,500         65%
   ../CLAUDE.md             200      1,600         40%
   Total auto-loaded       1,511    13,600
   ```

4. **Apply TOON formatting rules:**
   - Bullets/phrases over full sentences
   - Inline commands: `Dev server: npm run dev` (not code blocks)
   - Tables for structured data (credentials, paths, resources)
   - Pipe-separated values for related items on one line
   - No code examples > 3 lines (reference external files instead)
   - Remove "why", keep "what" and "how"
   - Remove example values when pattern is obvious
   - IMPORTANT/CRITICAL only for genuinely dangerous pitfalls
   - Ephemeral status -> reference PROGRESS.md or TODO.md
   - Completed items -> remove or archive to CHANGELOG.md
   - Deduplicate across file hierarchy (keep in most specific scope)

5. **Move content to reference files:**
   - Credentials -> `~/.config/claude/credentials.md`
   - Framework patterns -> `~/.config/claude/patterns.md`
   - Project conventions -> `~/.config/claude/{project}.md`
   - Architecture decisions -> project `docs/ADR/` or `ARCHITECTURE.md`

6. **Show before/after comparison:**
   ```
   File                Before (tokens)   After (tokens)   Reduction
   ~/CLAUDE.md              8,500            1,800           79%
   ./CLAUDE.md              3,500              900           74%
   Total auto-loaded       12,000            2,700           78%
   ```

### Phase 2: Session Context Compaction

For chatty/long-running projects, also optimize what persists between sessions:

7. **Audit project state files:**
   - Check for `PROGRESS.md`, `TODO.md`, `openprojects.md` entries
   - Identify stale status (completed work still marked pending)
   - Flag verbose session logs that should be summarized
   - Check `docs/` for redundant or outdated documentation

8. **Create/update PROGRESS.md** (project root):
   - Current state: what's working, what's not
   - Next steps: ordered, actionable items only
   - Key decisions made (1-line each, not full rationale)
   - Known issues: bug + workaround, no backstory
   - Remove anything already reflected in code/commits

9. **Prune session artifacts:**
   - Suggest removing large generated reports from CLAUDE.md context (reference file paths instead)
   - Suggest `.claudeignore` entries for large data dirs, logs, generated output
   - Identify files that auto-load into context but rarely change

10. **Generate `.claudeignore`** if beneficial:
    - Large data directories (data/, logs/, node_modules/, dist/)
    - Generated reports (docs/reports/*.md if >50 files)
    - Binary files, images, PDFs
    - Test fixtures and snapshots

### Phase 3: Cross-Session Bridge

11. **Ensure session continuity without bloat:**
    - PROGRESS.md has current state (< 50 lines)
    - CLAUDE.md has commands + rules only (no status)
    - Reference files have domain knowledge (loaded on demand)
    - `.claudeignore` excludes noise from context
    - `openprojects.md` entry is current

## TOON Quick Reference

| Pattern | Before | After |
|---------|--------|-------|
| Command docs | ```\nnpm run dev\n``` | `Dev: npm run dev` |
| Status | "We completed the migration of..." | `Migration: done` |
| Paths | Full paragraph explaining location | Table: `Project \| Path \| Stack` |
| Decisions | 3-paragraph rationale | `Auth: JWT (not sessions) — stateless API` |
| Code samples | 20-line example | `Pattern: see src/lib/auth.ts:45` |
| Warnings | "IMPORTANT: You must never..." | `NEVER: force-push to main` |

## Key Principle
Auto-loaded files should contain only what's needed in EVERY session. Everything else: reference files (on-demand), PROGRESS.md (current state), or code itself (the best documentation).

## Reference File Locations
- `~/.config/claude/credentials.md` - API keys, tokens, connection strings
- `~/.config/claude/patterns.md` - Framework gotchas and patterns
- `~/.config/claude/schoolvision.md` - SchoolVision conventions
- Project `PROGRESS.md` - Current state and next steps
- Project `.claudeignore` - Exclude noisy dirs from context
