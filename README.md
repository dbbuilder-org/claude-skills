# Claude Code Skills

Custom slash commands (`/skill-name`) for [Claude Code](https://claude.ai/code).

## Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| `code-review` | `/code-review` | Comprehensive multi-document code review (security, architecture, tests, tech debt) |
| `code-review-quick` | `/code-review-quick` | Fast single-file TOON-format action plan |
| `review-and-fix` | `/review-and-fix` | Full review + roadmap reconciliation + execute all fixes in series |
| `reconcile-roadmap` | `/reconcile-roadmap` | Consolidate all TODO/roadmap docs into a single go-forward plan |
| `save-exit` | `/save-exit` | Save session context and register project in openprojects.md |
| `appstore-prep` | `/appstore-prep` | Generate App Store metadata, screenshots, and submission assets |
| `marp-generator` | `/marp-generator` | Generate Marp slide decks (PDF/PPTX/HTML) from Markdown |
| `cap` | `/cap` | Commit, add, push shorthand |

## Usage

Skills are picked up automatically by Claude Code from `~/.claude/skills/`.

Each skill directory contains a `skill.md` with frontmatter (`name`, `description`, `allowed-tools`) and the full skill instructions.

## Installation

```bash
git clone https://github.com/dbbuilder-org/claude-skills ~/.claude/skills
```
