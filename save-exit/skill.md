---
name: save-exit
description: Save session context to a markdown document and register the project in openprojects.md. Use when ending a work session to capture context for future resumption. Creates a context file in the project's docs/ folder and adds/updates the project entry in ~/dev2/openprojects.md.
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# save-exit

Save session context to documentation and track in open projects list.

## Usage

```
/save-exit [optional summary]
```

## What it does

1. **Writes session context** to `SESSION_CONTEXT_<date>.md` in the project's `docs/` directory (creates if needed)
2. **Updates `~/dev2/openprojects.md`**:
   - Adds/updates project in the "Open Projects" table if not present
   - Appends session entry to "Recent Sessions" log
3. **Shows summary** of what was saved

## Instructions

<command-name>save-exit</command-name>

When this command is invoked:

### Step 1: Determine project info
- **Project root**: Current working directory or nearest dir with CLAUDE.md, package.json, or .git
- **Project name**: From CLAUDE.md title, package.json name, or directory name
- **Summary**: User-provided argument OR generate from conversation context

### Step 2: Write session context document

Create `<project-root>/docs/SESSION_CONTEXT_<YYYY-MM-DD>.md` with:

```markdown
# Session Context - <YYYY-MM-DD>

**Project:** <project-name>
**Path:** <project-path>

## Summary

<1-2 paragraph summary of work done>

## Files Modified

- `path/to/file1.ts` - description
- `path/to/file2.md` - description

## Current State

<bullet points of where things stand>

## Next Steps

- [ ] Task 1
- [ ] Task 2

## Open Questions / Blockers

<any decisions needed or blockers>
```

### Step 3: Update ~/dev2/openprojects.md

The file has two sections:

**Section 1: Open Projects table** (add project if not present)
```markdown
| Project | Path | Description |
|---------|------|-------------|
| <name> | `<path>` | <description> |
```

**Section 2: Recent Sessions log** (append new entry at top)
```markdown
## Recent Sessions

| Date | Project | Summary |
|------|---------|---------|
| 2026-02-01 | Story Magic | Code review completed, 9 docs written |
```

### Step 4: Report to user

```
✓ Session saved:
  - Context: docs/SESSION_CONTEXT_2026-02-01.md
  - Project: Added to ~/dev2/openprojects.md
  - Session: Logged to Recent Sessions

Summary: <summary>
```

## Example

User runs: `/save-exit`

Output:
```
✓ Session saved:
  - Context: docs/SESSION_CONTEXT_2026-02-01.md
  - Project: Story Magic (already in open projects)
  - Session: Logged to Recent Sessions

Summary: Comprehensive code review and documentation reorganization - 9 review documents written, master docs synced, roadmap updated for MVP 1.0 launch
```
