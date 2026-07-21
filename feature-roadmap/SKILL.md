---
name: feature-roadmap
description: Melds the latest competitive feature roadmap (FEATURE-ROADMAP-*.md) with the current working roadmap (ROADMAP-*.md) and requirements (REQUIREMENTS-*.md) into a single authoritative, execution-ready implementation roadmap. Breaks down new features into backend+frontend tasks with SP estimates, team assignments, sprint slots, and creates GitHub issues. Supersedes the prior ROADMAP. Run after /feature-planner produces a new FEATURE-ROADMAP, or whenever you want to plan next sprint execution from competitive research.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - WebSearch
  - WebFetch
---

# feature-roadmap

Melds a competitive feature roadmap (produced by `/feature-planner`) with the current working sprint roadmap and requirements into a single, execution-ready consolidated document.

**What this does:**
1. Reads the latest FEATURE-ROADMAP (competitive analysis + priority scores)
2. Reads the current ROADMAP (sprint state, PR queue, team assignments)
3. Reads the current REQUIREMENTS (REQ-* feature inventory)
4. Reads open PRs + issues (dedup — don't create issues that already exist)
5. Reconciles: which new features are net-new vs. already in-flight
6. Builds full implementation plans (backend → frontend → tests → migration) for Now/Next tier
7. Assigns to team + sprint slots
8. Creates GitHub issues for net-new features
9. Adds REQ-* entries to REQUIREMENTS for new features
10. Writes a new consolidated ROADMAP-YYYY-MM-DD.md
11. Commits everything

## Trigger Phrases

- `/feature-roadmap`
- "build the implementation roadmap"
- "consolidate feature roadmap with sprint plan"
- "meld competitive roadmap into execution plan"
- "plan out the new features"
- "implement the feature roadmap"

## Arguments (optional)

- `--tier [now|next|later|all]` — default `now+next`; `all` includes later/moonshot planning stubs
- `--sprint [name]` — name the output sprint (e.g., `v1.2-A`); defaults to inferring from prior roadmap
- `--dry-run` — write plan doc but do NOT create GitHub issues or commit

---

## Instructions

<command-name>feature-roadmap</command-name>

---

### Phase 1: Load all context (parallel)

Run all of these in parallel:

**1A — Find and read the latest FEATURE-ROADMAP:**
```bash
ls -t docs/FEATURE-ROADMAP-*.md 2>/dev/null | head -1
```
Read it in full. Extract:
- Product name + competitive positioning summary
- Now-tier features (score ≥18) with their implementation sketches and SP estimates
- Next-tier features (score 14–17)
- "What NOT to Build" list
- Pricing recommendations

**1B — Find and read the latest ROADMAP:**
```bash
ls -t docs/ROADMAP-*.md 2>/dev/null | head -2
```
Read the most recent. Extract:
- Current version label (e.g., v1.1, v1.2)
- Sprint name and dates
- All in-flight PRs with status (open/merged/needs-changes)
- All planned sprint items with owner + SP
- Post-launch backlog
- .hold items (Ransom manages — do NOT touch)
- Team assignments (who owns what)
- Go/No-Go criteria if present
- Next major milestones (mobile launch, etc.)

**1C — Find and read the latest REQUIREMENTS:**
```bash
ls -t docs/REQUIREMENTS-*.md 2>/dev/null | head -1
```
Read it. Extract:
- Highest existing REQ number by section (to know where to append new ones)
- Which features are marked `🔮 Deferred` — these are candidates if now in FEATURE-ROADMAP
- Which features are marked `💡 Competitive` — already flagged as competitive gaps

**1D — Load open GitHub issues and PRs:**
```bash
# Open PRs
gh pr list --repo dbbuilder-org/u-rent --state open --json number,title,headRefName,assignees,labels --limit 100 \
  | python3 -c "import json,sys; [print(f'PR #{p[\"number\"]}: {p[\"title\"]} [{p[\"headRefName\"]}]') for p in json.load(sys.stdin)]"

# Open issues by label
gh issue list --repo dbbuilder-org/u-rent --state open --label "enhancement" --json number,title,labels --limit 50 \
  | python3 -c "import json,sys; [print(f'#{i[\"number\"]}: {i[\"title\"]}') for i in json.load(sys.stdin)]"
```

**1E — Recent commits (understand what's recently shipped):**
```bash
git log --oneline -20
```

---

### Phase 2: Reconcile — classify each feature roadmap item

For each Now/Next tier item from the FEATURE-ROADMAP, classify it as one of:

| Status | Criteria | Action |
|--------|----------|--------|
| `ALREADY_IN_FLIGHT` | Existing open PR with matching keyword | Note PR #, skip issue creation |
| `ALREADY_PLANNED` | In current ROADMAP sprint items without a PR yet | Add competitive context, upgrade priority if needed |
| `DEFERRED_REACTIVATED` | Marked `🔮 Deferred` in REQUIREMENTS but now in FEATURE-ROADMAP Now tier | Move to active sprint, update REQ status |
| `NET_NEW` | No PR, no issue, not in ROADMAP | Create issue, write implementation plan, assign to sprint |

**Keyword matching strategy:**
- Push notifications → search PRs/issues for "push", "fcm", "notification", "web-push"
- Delivery integration → search for "delivery", "courier", "uber-direct", "roadie", "doordash"
- Similar items → search for "similar", "recommendation", "embedding", "vector"
- Map view → search for "map", "leaflet", "mapbox"
- Etc.

```bash
# Example dedup check
gh pr list --search "push notification" --state open --json number,title | python3 -c "import json,sys; prs=json.load(sys.stdin); print('FOUND' if prs else 'NOT_FOUND', [p['number'] for p in prs])"
```

---

### Phase 3: Build implementation plans for NET_NEW items

For each NET_NEW Now/Next tier feature, build a full implementation plan.

**Implementation plan template:**

```
### Feature: [Name] (Score: N/25 — [Tier])

**Competitive signal:** [1-2 sentences from FEATURE-ROADMAP on why this matters]
**Issue:** [Will be created in Phase 4]

#### Architecture overview
[Which existing modules this extends; new modules needed; data flow]

#### Backend tasks (SP: N)
Module: `apps/api/src/modules/<feature>/`

- [ ] Entity: `<Name>Entity` — columns: [...]; migration: `migration:generate -- <Name>`
- [ ] DTO: `dto/create-<name>.dto.ts` — fields + class-validator decorators
- [ ] Service: `<name>.service.ts` — method list with signatures
- [ ] Controller: `<name>.controller.ts` — endpoints (HTTP verb + path + guard)
- [ ] Module: `<name>.module.ts` — providers, imports, exports
- [ ] Tests: `<name>.service.spec.ts` — happy path + not-found + error cases
- [ ] Wire into `app.module.ts`

Key guard/decorator notes (U-Rent specific):
- Protected endpoints: `@UseGuards(ClerkAuthGuard)`
- Owner-only: add `userId` check in service
- Admin-only: `@UseGuards(ClerkAuthGuard, AdminGuard)`
- Rate-limited: `@Throttle('strict')` for sensitive endpoints
- Public: `@Public()` decorator

#### Frontend tasks (SP: N)
- [ ] API client: `apps/web/src/lib/api/<feature>.ts` — functions matching controller endpoints
- [ ] Export from: `apps/web/src/lib/api/index.ts`
- [ ] Types: add to `apps/web/src/lib/api/types.ts` if not generated
- [ ] Hook: `apps/web/src/hooks/use<Feature>.ts` — wraps API calls + `isApiReady` gate
- [ ] Component(s): `apps/web/src/components/<feature>/` — Mantine v8 components
- [ ] Page integration: which existing page(s) get new component
- [ ] Tests: component test for primary component

Critical rules (applied to every frontend task):
- ALL authenticated calls: `const { isApiReady } = useApiReady(); useEffect(() => { if (!isApiReady) return; ... }, [isApiReady])`
- XSS: `xss` library only for `dangerouslySetInnerHTML`. Plain text: React handles it.
- Images: NEVER `display: none` + `loading="lazy"` — use `opacity: 0/1`
- Mantine v8 DatePicker: ISO strings not Date objects
- Use `??` not `||` for numeric fields

#### Migration
```bash
# After entity created:
npm run migration:generate -- <FeatureName>
# Review generated SQL before committing
npm run migration:run
```

#### API types
```bash
# After controller endpoints added (API must be running):
npm run generate:api-types
# Commit generated file with same PR
```

#### Estimate
| Layer | SP |
|-------|----|
| Entity + migration | 1 |
| Service + tests | 2 |
| Controller + DTO | 1 |
| Frontend hook + client | 1 |
| Frontend component | 2 |
| Integration + polish | 1 |
| **Total** | **N** |

#### Team assignment
- Owner: [Claude Code | Peter | Ryan | Ransom]
- Reviewer: [who reviews this type of work]
- Sprint slot: [v1.X Week N]

#### Dependencies
- Must ship before: [list]
- Must ship after / requires: [list]
- Blocks: [list of features that need this first]

#### Branch name: `feat/<feature-name>`
#### Labels: `enhancement, area:backend, area:frontend, priority:high|medium|low`
```

---

### Phase 4: Create GitHub issues for NET_NEW features

For each NET_NEW feature (not `--dry-run`):

```bash
gh issue create \
  --repo dbbuilder-org/u-rent \
  --title "feat: [Feature Name]" \
  --label "enhancement,area:backend,area:frontend,priority:high" \
  --assignee dbbuilder \
  --body "$(cat <<'EOF'
## Feature: [Name]

**Source:** Competitive feature roadmap 2026-05-04 — Priority Score: N/25 (Tier: Now/Next)
**Competitive signal:** [Why: which competitors have this, what user demand signal]

## What to Build
[Concrete description — not vague]

## Backend
- Module: `apps/api/src/modules/<feature>/`
- New endpoints:
  - `[VERB] /[path]` — [description]
- New entity: `[Name]Entity` with columns: [list]
- Migration: generate after entity

## Frontend
- Hook: `apps/web/src/hooks/use[Feature].ts`
- Component: `apps/web/src/components/[feature]/[Name].tsx`
- Integrates into: [existing page(s)]

## Acceptance Criteria
- [ ] [Specific testable outcome]
- [ ] [Specific testable outcome]
- [ ] [Specific testable outcome]
- [ ] API types regenerated (`npm run generate:api-types`)
- [ ] Service spec with ≥3 test cases (happy path, not-found, error)

## Estimate
SP: N (Backend: N + Frontend: N)

## Dependencies
[list or "None"]

## Related
- Competitive roadmap: `docs/FEATURE-ROADMAP-YYYY-MM-DD.md`
- Implementation plan: `docs/ROADMAP-YYYY-MM-DD.md`
EOF
)"
```

After creating, record: `Issue #NNNN created for [Feature Name]`

---

### Phase 5: Add REQ-* entries to REQUIREMENTS

For each NET_NEW feature, append new REQ-* items to the appropriate section of the latest REQUIREMENTS file.

**Append pattern:**
```markdown
### [N+1]. [Feature Name]

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| REQ-[SECTION]-[NNN] | [Concrete requirement statement] | 📋 Planned | Issue #NNNN — competitive gap (score N/25) |
| REQ-[SECTION]-[NNN+1] | [Sub-requirement] | 📋 Planned | |
```

Section mapping:
- User/auth features → Section 1 (REQ-UM-*)
- Item/listing features → Section 2 (REQ-IL-*)
- Booking/payment → Section 3 (REQ-BK-*)
- Messages/notifications → Section 4 (REQ-MSG-*)
- Admin → Section 5 (REQ-ADM-*)
- New sections: add as Section N with new prefix (e.g., REQ-DL-* for delivery)

---

### Phase 6: Write the consolidated ROADMAP

Write `docs/ROADMAP-YYYY-MM-DD.md`. This file SUPERSEDES the prior ROADMAP.

**Structure:**

```markdown
# [Product Name] Platform — Consolidated Roadmap

**Date:** YYYY-MM-DD
**Author:** Chris Therriault
**Status:** [Sprint Name] — [days into sprint / target date]
**Supersedes:** [prior ROADMAP filename]
**Sources merged:**
- [prior ROADMAP filename] — sprint state, PR queue, team assignments
- [FEATURE-ROADMAP filename] — competitive analysis, N new features added

---

## Document Changelog (what's new vs. [prior ROADMAP])

| Change | Detail |
|--------|--------|
| + N new features added | [list: Push Notifications, Delivery Integration, ...] |
| N deferred items reactivated | [list] |
| N items updated with competitive context | [list] |
| PR queue carried forward | [count] PRs unchanged |

---

## Health Scorecard

[Carry forward from prior ROADMAP, update any fields that changed]

---

## Version History

[Carry forward + add new milestone row for the new sprint]

---

## NEW — Competitive Feature Sprint: [Sprint Name] ([dates])

> Features added from competitive analysis (FEATURE-ROADMAP-YYYY-MM-DD.md).
> Now-tier: N features. Next-tier: N features. Total new SP: ~N.

### 🟢 Now — Priority Implementation ([sprint dates])

For each Now-tier NET_NEW feature: full implementation plan (Phase 3 format)

### 🟡 Next — [sprint dates]

For each Next-tier NET_NEW feature: abbreviated plan (architecture + SP + owner + dependencies, no line-item task breakdown)

### 🔵 Later / Moonshot — Tracked, Not Scheduled

[Table format: Feature | Score | Why | When to revisit]

---

## Existing Sprint: [Prior Sprint Name] — Carried Forward

### In-Flight PRs (unchanged from [prior ROADMAP date])

[Full PR table carried forward — do not modify PR statuses unless you checked GH and they changed]

| PR | Title | Owner | Status |
|----|-------|-------|--------|
[carry from prior ROADMAP]

### Existing Sprint Items (not yet PRs)

[Carry forward unchanged]

### Post-Launch Backlog

[Carry forward + add any FEATURE-ROADMAP Later-tier items]

### .hold Items (Ransom manages — DO NOT TOUCH)

[Carry forward unchanged]

---

## Team Capacity + Sprint Assignment

| Team Member | Current Assignments | New Feature Assignments | Total SP This Sprint |
|-------------|--------------------|-----------------------|----------------------|
| Claude Code (@dbbuilder) | [existing PRs open] | [new features: push notifs (8SP), delivery (13SP)] | ~21 SP |
| Peter (@octavianorg) | [PR review queue] | [security review of new endpoints] | — |
| Ryan (@RyanJ0894) | [existing] | [frontend component work if assigned] | ~N SP |
| Ransom (@RansomSV) | [DevOps/CI] | [none — new features are feature dev] | — |

**Claude Code session rule:** Max 3 PRs per session. For sprints with >3 features, batch related work.
Batching strategy for this sprint:
- PR 1: [Feature A + Feature B] — both [backend|infrastructure|similar scope]
- PR 2: [Feature C] — standalone
- PR 3: [Feature D] — standalone

---

## Mobile App Timeline (carried from prior roadmap)

[Carry forward mobile launch schedule unchanged]

---

## Dependency Graph

[Mermaid or plain-text dependency tree for new features]

Example:
```
Push Notifications (now)
  └─ Required by: Delivery Integration (now) [notify on pickup/delivery status]

Delivery Integration (now)
  └─ Required by: Bundle Rentals (next) [bundles can also be delivered]

Built-in Protection (now)
  └─ No upstream dependencies

AI Similar Items (next)
  └─ Requires: pgvector extension (add to DB)

Map View (next)
  └─ Already has: PostGIS, react-leaflet — no blockers
```

---

## Go/No-Go Criteria for [Next Major Milestone]

[Carry forward existing + add new feature gates if relevant]

---

## Quick Reference

| Resource | Location |
|----------|----------|
| This roadmap | `docs/ROADMAP-YYYY-MM-DD.md` |
| Competitive analysis | `docs/FEATURE-ROADMAP-YYYY-MM-DD.md` |
| Requirements | `docs/REQUIREMENTS-YYYY-MM-DD.md` |
| Prior roadmap | [prior filename] |
| Team dashboard | https://github.com/dbbuilder-org/u-rent/issues/649 |
```

---

### Phase 7: Prepend supersession notice to prior ROADMAP

```bash
# Prepend supersession header to old roadmap (do not delete it)
PRIOR=$(ls -t docs/ROADMAP-*.md 2>/dev/null | head -2 | tail -1)
# Read prior content, prepend notice, write back
python3 - <<'EOF'
import sys
prior = open('/path/to/prior/roadmap.md').read()
notice = f"""---
> ⚠️ **SUPERSEDED** — This document has been replaced by `docs/ROADMAP-YYYY-MM-DD.md`
> which incorporates competitive feature planning from `docs/FEATURE-ROADMAP-YYYY-MM-DD.md`.
> This file is kept for historical reference only.
---

"""
open('/path/to/prior/roadmap.md', 'w').write(notice + prior)
EOF
```

---

### Phase 8: Commit everything

```bash
git add \
  docs/ROADMAP-YYYY-MM-DD.md \
  docs/REQUIREMENTS-*.md \
  docs/FEATURE-ROADMAP-*.md  # may add a "planned" marker

git commit -m "docs(roadmap): consolidated ROADMAP YYYY-MM-DD — merge competitive features

Merges FEATURE-ROADMAP-YYYY-MM-DD.md into ROADMAP-YYYY-MM-DD.md.

New features added (N total):
- Now tier (score ≥18): [list]
- Next tier: [list]

GitHub issues created: #NNNN, #NNNN, ...
REQ-* items added: N new requirements

Sprint: [name] | Team: Claude Code (primary feature dev)
Supersedes: docs/ROADMAP-[prior-date].md

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Phase 9: Update MEMORY.md

Update the roadmap pointer in the project memory:

```markdown
- **Roadmap**: `docs/ROADMAP-YYYY-MM-DD.md` — supersedes ROADMAP-[prior-date].md. N new competitive features: [list]. Sprint: [name].
```

---

### Phase 10: Report to user

```
✅ feature-roadmap — YYYY-MM-DD

Merged:
  FEATURE-ROADMAP-YYYY-MM-DD.md (N features scored)
  ROADMAP-[prior-date].md (sprint state + PR queue)
  REQUIREMENTS-[date].md (REQ-* inventory)

Classification:
  ALREADY_IN_FLIGHT:      N features (linked to existing PRs)
  ALREADY_PLANNED:        N features (upgraded with competitive context)
  DEFERRED_REACTIVATED:   N features
  NET_NEW:                N features → N GitHub issues created

New issues: #NNNN [Feature], #NNNN [Feature], ...

Implementation plans written:
  🟢 Now tier:  N features (~N SP total)
  🟡 Next tier: N features (~N SP total)
  🔵 Later:     N features (stubs only)

Sprint batching for Claude Code (max 3 PRs/session):
  PR 1: [Feature A + B] (~N SP)
  PR 2: [Feature C] (~N SP)
  PR 3: [Feature D] (~N SP)

Files:
  docs/ROADMAP-YYYY-MM-DD.md          ← New authoritative roadmap
  docs/REQUIREMENTS-[date].md         ← Updated with N new REQ-* items
  docs/FEATURE-ROADMAP-YYYY-MM-DD.md  ← Source (unchanged)

Next: run /roadmap-proceed to start implementing Now-tier features.
```

---

## Quality Rules

### Reconciliation rules
- **Never modify .hold items** — Ransom manages these. Carry forward unchanged.
- **Never touch PR statuses** unless you ran `gh pr view` to verify current state.
- **Dedup before creating issues** — always search GH before `gh issue create`.
- **Competitive context, not replacement** — ALREADY_PLANNED items get a "Competitive signal" note added, not a priority reset.
- **Respect sprint capacity** — don't assign 50 SP to Claude Code in one sprint. Spread across sessions.

### Implementation plan rules
- **Backend first, then frontend** — never write frontend tasks without backend plan
- **Every entity change needs a migration** — never `synchronize: true`
- **Every new service needs a spec** — minimum 3 test cases
- **Every controller change triggers api-types regeneration** — list it explicitly
- **isApiReady on every authenticated hook** — list it explicitly in frontend tasks
- **U-Rent column name rule** — always `@Column({ name: 'snake_case_name' })` on entity
- **bcrypt vs SHA-256** — bcrypt for passwords only; token hashing = SHA-256

### Sprint rules
- **Max 3 PRs per Claude Code session** — group related work
- **One issue = one PR** — don't bundle unrelated features
- **Stack PRs that touch same file** — list explicitly in plan
- **Peter reviews all auth/payment/security work** — note in team assignment

### Document rules
- **Always supersede, never delete** — add header to old ROADMAP, keep file
- **Date all docs** — ROADMAP-YYYY-MM-DD.md, never ROADMAP.md (undated)
- **One source of truth** — the new ROADMAP file is THE plan; all other docs defer to it

---

## U-Rent Specific Context

### Team
- **Claude Code (@dbbuilder):** Feature dev. Max 3 PRs/session. Backend + frontend.
- **Peter (@octavianorg):** Security review. Reviews Claude Code's PRs. Auth/payment/guard work.
- **Ransom (@RansomSV):** DevOps/CI. Manages `.hold` label. Never modifies without his input.
- **Ryan (@RyanJ0894):** Frontend only.
- **Eric (@Eric-DevTest):** UAT tester only. Files bugs. Does not write code.

### Active milestones
- **v1.2:** Push notifications, charity round-up, map view (per ROADMAP-2026-04-19.md)
- **Mobile:** App Store + Google Play submission (end of May 2026)
- Competitive features from FEATURE-ROADMAP slot into v1.2 sprint

### Critical U-Rent patterns (always apply)
- `isApiReady` gate on every authenticated API call
- `@Column({ name: 'snake_case_name' })` on all entity columns
- `migration:generate` → review SQL → `migration:run` → commit both
- `generate:api-types` after any controller change
- `xss` library only for `dangerouslySetInnerHTML`
- `??` not `||` on numeric fields
- Rebase only: `git rebase origin/staging`; never `git merge staging`

### Already-built infrastructure that new features can leverage
- **AI:** OpenAI + Gemini clients in `apps/api/src/modules/ai-listing/`
- **Storage:** Multi-provider blob storage (`STORAGE_PROVIDER` env)
- **Payments:** Stripe Connect + PaymentIntent in `apps/api/src/modules/payments/`
- **Notifications:** In-app `NotificationsService` + `NotificationsGateway` (WebSocket)
- **Delivery APIs:** Uber Direct, DoorDash, Roadie keys in env (not yet user-facing)
- **Location:** PostGIS `geography` type + react-leaflet in codebase (PR #1593)
- **Vector search:** PostGIS DB — add `pgvector` extension for embeddings
- **Protection plan:** Arden integration exists at checkout (upgrade to built-in)

---

## When to Use

- After `/feature-planner` produces a new FEATURE-ROADMAP
- Before sprint planning to sync competitive analysis → backlog
- When Bob/stakeholders ask "what are we building next and why"
- Quarterly roadmap refresh (run `/feature-planner` then `/feature-roadmap`)
- When a new competitor ships a major feature ("we need to respond to X")
