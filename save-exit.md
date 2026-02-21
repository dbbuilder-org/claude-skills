# save-exit

Save session context and log project to open projects list before exiting.

## Instructions

When the user invokes `/save-exit`, perform these steps:

1. **Write context document**: Write a context summary to `docs/PROJECT-CONTEXT.md` in the current project directory. The context should include:
   - Current date/time
   - Summary of what was worked on in this session
   - Current state of the project
   - Next steps or open questions
   - Any important decisions made

2. **Log to open projects**: Append a line to `~/dev2/openprojects.md` with:
   - The current project path
   - Today's date
   - A brief note about what was worked on

   Format: `- {date} | {project_path} | {brief_note}`

3. **Confirm completion**: Tell the user both files have been updated.

4. **Exit**: Run `/exit` to close the session.

## Example

If working in `/Users/admin/dev2/myproject` on authentication features:

1. Create/update `docs/PROJECT-CONTEXT.md`:
```markdown
# Project Context

**Last Updated:** 2026-02-06 14:30

## Session Summary
- Implemented user authentication flow
- Added JWT token validation

## Current State
- Auth endpoints complete
- Tests passing

## Next Steps
- Add password reset flow
- Implement rate limiting
```

2. Append to `~/dev2/openprojects.md`:
```
- 2026-02-06 | /Users/admin/dev2/myproject | Implemented authentication
```

3. Exit the session.
