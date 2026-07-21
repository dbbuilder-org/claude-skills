---
name: linear-sync
description: Sync a project's markdown planning docs (ROADMAP-*.md, code-review TODO_*.md, sprint plans) to Linear issues via Chris's Linear API key — idempotent, marker-based, never deletes. Use when the user says "/linear-sync", "sync to linear", "push the roadmap/backlog to linear", "update linear" — and as the Step-10 hand-off after /reconcile-roadmap (or any skill that rewrites the planning docs) so Linear mirrors the new truth.
---

# linear-sync

Reconcile the project's markdown planning truth into Linear. Markdown stays the
source of truth; Linear mirrors it for visibility/mobile/assignment. Idempotent:
re-running never duplicates.

## Credentials & workspace

- Key: `~/.config/claude/credentials.md` § "Linear — Chris's API key". Extract:
  `LKEY=$(awk '/## Linear/,/^## [^L]/' ~/.config/claude/credentials.md | grep -oE 'lin_api_[A-Za-z0-9]+' | head -1)`
- Endpoint `https://api.linear.app/graphql`; header `Authorization: $LKEY`
  (personal key — **no** `Bearer` prefix). Always curl, JSON body `{"query":"...","variables":{...}}`.
- Workspace: Database Builder · team **ServiceVision** key `SER`
  id `98ce41bb-98ca-44a4-8601-44d6abd4f848` (verify at run time with `{ teams { nodes { id key name } } }` — don't trust this doc blindly).

## Model

- **One Linear project per repo** (e.g. "BuySellBlock"). Find by name via
  `{ projects(filter:{name:{eq:"<Name>"}}) { nodes { id } } }`; create with
  `projectCreate(input:{name, teamIds:[teamId]})` if missing.
- **One issue per planning item.** Stable identity = a marker line at the END of
  the issue description: `sync-id: <relative-doc-path>#<kebab-slug-of-item>`
  (e.g. `sync-id: code-review/2026-07-18-2/TODO_2026-07-18-2.md#s2-1-batch-createartifact-round-trips`).
  Lookup before create: `{ issues(filter:{description:{contains:"<marker>"}, team:{key:{eq:"SER"}}}, first:5) { nodes { id identifier state { name } } } }`.
- **State mapping:** `- [ ]` → Todo · `- [ ]` under a "Blocked/external" heading → Todo + label `blocked` · `- [x]` → Done. Get the team's workflow state ids once per run: `{ team(id:$id){ states { nodes { id name type } } } }`; map by `type` (`unstarted`→Todo, `completed`→Done), not by display name.
- Title = the item text (strip checkbox, SP annotations to a `[N SP]` suffix). Description = item context (source doc, sprint, SP) + the marker line LAST.

## Procedure

1. **Gather items**: newest `code-review/*/TODO_*.md` (unchecked + checked), plus `docs/ROADMAP-*.md` backlog tables if asked. Skip memory/notes files.
2. **Dry-run first**: print the plan — N creates, N updates (state changes), N unchanged — and ask before writing, unless the user said "yes"/"--yes" or is running autonomously (then proceed but cap at 30 mutations/run and report).
3. **Mutations** (one curl each; sequential is fine at this scale):
   - Create: `mutation($in: IssueCreateInput!){ issueCreate(input:$in){ issue { identifier url } } }` with `teamId`, `projectId`, `title`, `description`, `stateId`.
   - Update state: `mutation{ issueUpdate(id:"<id>", input:{stateId:"<done>"}) { success } }`.
4. **Write-back (optional but preferred)**: append the Linear identifier to the markdown line: `… · [SER-12]` — makes the link visible from the doc side. Commit doc changes with the usual style if the repo is clean about it.
5. **Report**: table of identifier · title · action · state, plus the project URL.

## Rules

- NEVER delete or archive Linear issues; orphaned issues (item removed from docs) get a comment `no longer in source docs (<date>)`, not deletion.
- Never put secrets/confidential Aaron material into Linear (working/ is confidential — don't sync it; sync only repo-committed planning docs).
- Marker line is load-bearing — never create an issue without one.
- Rate: fine at our scale; if a mutation fails, retry once then report.
- BuySellBlock defaults: project name "BuySellBlock"; sync the latest review TODO anchor. Other repos: use the repo dir name as project name unless told otherwise.

## Rich planning surfaces (added 2026-07-19 for sv-ai-2-class repos)

Repos whose planning truth is richer than checkbox TODOs (track tables, lane/wave plans,
DEC queues, gated/deferred ledgers) sync with these EXTENSIONS:

- **Additional sources**: roadmap TRACK TABLES (each row = one item; SP column → `[N SP]`
  title suffix — do NOT set Linear estimates, teams may have them disabled), wave-plan docs
  (each wave/lane = one item; per-row censuses like a 172-row TSV are NOT itemized — the
  ACTIVE wave's reports may be listed in the issue DESCRIPTION), DEC queues (each OPEN
  decision = one item labeled `decision`; DECIDED ones sync as Done for board truth),
  gated queues + horizon sections (each gate = one item, state Backlog, label `gated` or
  `deferred`).
- **Status glyph mapping** (beyond checkboxes): `✅` → Done · `🔄`/"in flight"/"NEXT" →
  In Progress (type `started`) · `⬜`/plain row → Todo · "gated"/"deferred"/"held" →
  Backlog (type `backlog`) + matching label.
- **Labels are first-class**: ensure-and-attach with `issueLabelCreate` when missing
  (query `team.labels` first; case-insensitive match). Standard set: `track:<name>`
  (e.g. `track:reporting`, `track:funding`, `track:cutover`, `track:m4-tail`),
  `gated`, `deferred`, `decision`, `wave:<id>`.
- **Granularity rule**: one issue per lane / wave / DEC / gate / roadmap-table row.
  Never one-per-census-row or one-per-report — Linear mirrors the PLAN, markdown holds
  the inventory.
- **Onboarding mode** (first full import of a repo): mutation cap raises 30 → 100 for
  that run; report per-batch. Still never delete/archive.
- **Write-back**: only into checkbox-style docs. Table rows and wave plans get NO
  `[SER-nn]` write-back (the sync-id marker in Linear is the join); this keeps
  generated/dense docs unchurned.
- **sv-ai-2 defaults**: project name `sv-ai-2`; sources = `docs/ROADMAP-*.md` (latest,
  track tables + gated + horizon), `docs/FUNDING-SMS-COMPLIANCE-*.md` (build lanes +
  DEC-FUND queue), `docs/reporting/STAGE3-WAVE-PLAN-*.md` (waves + wave log),
  `docs/REPORTING-PLATFORM-ANALYSIS-*.md` (DEC-RPT queue + stage statuses),
  `docs/reporting/SNAPSHOT-WRAP-WORKLIST-*.md` (wrap families rollup),
  `docs/CENSUS-TAIL-*.md` (§4 decisions). Skip: memory files, `rpt-triage.tsv`
  (inventory, not plan), OVERNIGHT-* (session logs).
