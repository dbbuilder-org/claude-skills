# superllm-upstream-sync

Review and selectively adopt commits from the upstream AMPD repo (Mubarakodeh/AMPDCHATFINAL) into SuperLLM.

## Usage

```
/superllm-upstream-sync
/superllm-upstream-sync adopt <sha>
/superllm-upstream-sync diff <file-path>
```

## Trigger Phrases

- "superllm upstream sync", "sync from ampd", "check upstream"
- "what's new in ampd", "upstream changes", "pull from ampd into superllm"
- "review upstream commits", "ampd upstream"

## Context

SuperLLM (`dbbuilder-org/SuperLLM`) is built on top of AMPD Chat (`Mubarakodeh/AMPDCHATFINAL`).
The repos share no git history but share nearly identical `src/` and `supabase/functions/` structure.
The `ampd` remote is registered in SuperLLM's git config.
State is tracked in `.upstream-sync` at the repo root.

**Category rules:**
- **ADOPT** — Model catalog, video client, stream fixes, openrouter-client (low conflict)
- **REVIEW** — route-chat, ChatPage, billing, voice, migrations (SuperLLM has significant additions)
- **SKIP** — CORS (SuperLLM has origin allowlist, ampd has wildcard), docs, build config, branding

---

## Process

### Step 1: Run the check script

```bash
bash scripts/upstream-check.sh
```

This fetches `ampd/main`, finds all commits since `LAST_REVIEWED` in `.upstream-sync`,
categorizes them, and writes `docs/UPSTREAM-SYNC-<date>.md`.

### Step 2: Read the report

Read `docs/UPSTREAM-SYNC-<date>.md`. Focus on:
- All **ADOPT** commits — these are safe wins
- **REVIEW** commits in categories you care about (model catalog, route-chat patches)
- Ignore **SKIP** commits

### Step 3: For each ADOPT commit

1. Show the commit: `git show <sha> --stat`
2. For model catalog changes: diff our catalog vs theirs and produce a merge
3. For video/stream/openrouter fixes: check if the fix applies to our version of the file
4. Apply with: `bash scripts/upstream-check.sh --apply <sha>`
   OR manually copy the relevant changes

### Step 4: For REVIEW commits of interest

Run: `bash scripts/upstream-check.sh --full-diff <path>`
Compare the diff to our version. Identify:
- Bug fixes we want (extract the fix, apply manually)
- New features already in SuperLLM (skip)
- New features not yet in SuperLLM (evaluate effort, add to roadmap)

### Step 5: Update sync state

After reviewing all commits:

```bash
UPSTREAM_HEAD=$(git rev-parse ampd/main)
DATE=$(date +%Y-%m-%d)
sed -i '' "s/LAST_REVIEWED=.*/LAST_REVIEWED=$UPSTREAM_HEAD/" .upstream-sync
sed -i '' "s/LAST_REVIEWED_DATE=.*/LAST_REVIEWED_DATE=$DATE/" .upstream-sync
```

### Step 6: Commit

```bash
git add .upstream-sync docs/UPSTREAM-SYNC-*.md [any adopted files]
git commit -m "chore(upstream): sync review $DATE — N adopted, N skipped"
git push
```

---

## Model Catalog Merge Rules

The model catalog (`src/shared/models-catalog.ts`) is the highest-value sync target.

When upstream adds/changes models:
1. Read both files
2. For **new models** in upstream: add to SuperLLM catalog in the correct tier
3. For **model ID changes** (e.g. `gemini-2.5-flash` → `gemini-3-flash`): check if SuperLLM already has the new ID
4. For **model removals** in upstream: check if SuperLLM has the model — if yes, keep it
5. **Never** remove SuperLLM-curated models just because upstream removed them
6. After updating: MUST also update `supabase/functions/_shared/models-catalog.ts` (the mirror)

## Files to Always Sync (ADOPT)

| File | What to look for |
|------|-----------------|
| `src/shared/models-catalog.ts` | New models, updated IDs, removed deprecated models |
| `supabase/functions/_shared/gemini-video-client.ts` | Veo API fixes, polling improvements |
| `src/lib/streamChat.ts` | Streaming bug fixes, error handling |
| `supabase/functions/_shared/openrouter-client.ts` | API compatibility fixes |

## Files to SKIP

| File | Reason |
|------|--------|
| `supabase/functions/_shared/cors.ts` | SuperLLM has origin allowlist; ampd has wildcard |
| `src/pages/WelcomePage.tsx` | Different branding |
| `render.yaml` / `Dockerfile` | SuperLLM monorepo build |
| `supabase/migrations/` | Manual review only — schema diverged significantly |
| `.env*` / `mcp.json` | Never copy environment config |

## Rules

1. **Never force-merge** — all adoptions are selective cherry-picks or manual edits
2. **Check before applying** — always view the diff first
3. **Mirror after model catalog** — if you update `src/shared/models-catalog.ts`, update `supabase/functions/_shared/models-catalog.ts` too
4. **Commit sync state** — always commit `.upstream-sync` after review so future runs start from the right point
5. **Document skipped reasons** — note why REVIEW commits were skipped/adapted in the sync doc
