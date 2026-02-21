# cap (Commit, Add, Push)

Quick commit-add-push shortcut for the current project.

## Usage

```
/cap [optional commit message]
```

## Instructions

<command-name>cap</command-name>

When this command is invoked:

### Step 1: Review changes

Run these in parallel:
- `git status` (no `-uall` flag) to see modified and untracked files
- `git diff` to see staged and unstaged changes
- `git log --oneline -5` to see recent commit message style

### Step 2: Stage relevant files

- Stage all modified and untracked files that are part of the current work
- Do NOT stage files that likely contain secrets (`.env`, `credentials.json`, etc.)
- Prefer `git add <specific files>` over `git add -A`

### Step 3: Commit

- If the user provided a commit message argument, use it
- Otherwise, generate a concise commit message summarizing the changes (1-2 sentences, focus on "why" not "what")
- Follow the repository's existing commit message style
- Always include the co-author trailer:
  ```
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
  ```
- Use a HEREDOC for the commit message to ensure proper formatting

### Step 4: Push

- Push to the current branch's remote tracking branch
- If no upstream is set, use `git push -u origin <branch>`

### Step 5: Confirm

Report to the user:
```
Pushed <commit-hash> to <remote>/<branch>
<commit message summary>
<N> files changed
```
