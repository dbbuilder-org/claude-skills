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
| `build-prototype` | `/build-prototype` | Scaffold, build, deploy a prototype to `<name>.servicevision.io` (mirrors onsiteIT reference project) |
| `sql-compare` | `/sql-compare` | Diff SQL Server database objects between two DBs — name-level and/or code-level (definition diff). Azure SQL safe. |
| `nx-affected-ci` | `/nx-affected-ci` | Patch GitHub Actions CI to use `nx affected` so only touched projects are built/tested. Adds `nrwl/nx-set-shas`, `fetch-depth: 0`, and replaces `run-many`. |
| `ai-health-check` | `/ai-health-check` | Add scheduled AI API health checks (OpenAI, Gemini, Anthropic) to any backend — validates key + quota every 15 min, alerts on outage transitions. NestJS + Python FastAPI patterns. |
| `git-dev-merge` | `/git-dev-merge` | Rebuild `dev` integration branch nightly — resets to `staging`, merges all open PRs, resolves conflicts preserving both sides, force-pushes. Original PRs untouched. |
| `github-fetch-loop` | `/github-fetch-loop` | Set up a durable daily GitHub Action that fetches a URL (Google Doc, RSS, Airtable, etc.), calls Claude Haiku to diff/analyze, writes output files, and commits only on change. Replaces session-only `/loop` for permanent syncs. |
| `marketing-send-intro-debrief` | `/marketing-send-intro-debrief` | Send the SeniorProtect marketing intro + project debrief email. Covers three pillars, voice-first design, business model, M0–M10 milestones, and marketing angles. |
| `feature-docs` | `/feature-docs` | Generate or update dated Requirements, Roadmap, and UAT docs for any project. Modeled on U-Rent MVP Review Rubric Excel format (Req ID \| Feature \| Priority \| Status). |
| `feature-planner` | `/feature-planner` | Research competitors and market trends via live web searches, then produce a competitive feature roadmap with opportunity scoring (Now/Next/Later/Moonshot tiers). |
| `figma-to-dev` | `/figma-to-dev` | End-to-end nightly pipeline: Figma "Ready for Dev" → GitHub issues → code + tests → PRs targeting staging → typecheck/lint/patterns → merge into dev → Render deploy. Mirrors the Sunday manual workflow. Flags: `--scan-only`, `--implement-only`, `--skip-deploy`, `--no-dev-merge`, `--max-prs N`, `--issue N`. |
| `docs-maximize-roi` | `/docs-maximize-roi` | Identify a project's single highest-ROI deliverable and prove it: 4 gated phases → `docs/ROI/` folder with an ROI analysis (intended/potential/approachable triage), a delivery roadmap, an academically defensible LaTeX→PDF paper, and an HBR-style CFO/CTO article. |

## Usage

Skills are picked up automatically by Claude Code from `~/.claude/skills/`.

Each skill directory contains a `skill.md` with frontmatter (`name`, `description`, `allowed-tools`) and the full skill instructions.

## Installation

```bash
git clone https://github.com/dbbuilder-org/claude-skills ~/.claude/skills
```
