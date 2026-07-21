# doyu-ux-sync

Full UX → Dev sync for U-Rent / DoYu.Rent. Pulls Jaclyn's Figma design frames AND
developer notes, cross-references against already-merged PRs, dedupes GitHub issues,
creates new issues, and updates the UX-Dev Digest document.

## Trigger Phrases

- `/doyu-ux-sync`
- "sync figma with dev", "pull jaclyn's notes", "ux dev sync", "figma sync"
- "update the ux digest", "check figma ready to dev"

## Constants

```
FIGMA_PAT:       vault → credentials.md → Figma → Token row (export as $FIGMA_PAT)
FIGMA_FILE_KEY:  BE7PLhsb0FoOtbTI9BhFoK
REPO:            dbbuilder-org/u-rent
DIGEST_PATH:     /Users/admin/dev2/clients/U-Rent/u-rent-platform/docs/UX-DEV-DIGEST-{date}.md

# Figma page / frame IDs — WHERE THE DESIGNS ACTUALLY LIVE
DESIGN_FRAMES_PRIMARY:    913:11798   # "Ready to Dev" standalone page (Jaclyn's new staging area)
DESIGN_FRAMES_SECONDARY:  288:3281    # WEB UI Design → "Ready to dev" section (original location)
UX_NOTES_PAGE:            1:3         # "User Flows & Logic" — developer annotation TEXT (NOT designs)

# Known frame → name mapping (from GET /v1/files?depth=3)
# Primary page 913:11797 children of 913:11798:
#   913:11799  Home
#   913:12019  Category page
#   913:12215  Explore all Items
#   913:12437  Product Single page
#   913:12876  Search state
#   913:12972  Search state (2nd variant)
#   913:13253  Product listing _Item Basics
#   913:13374  Product listing _ Photo & year
#   913:13530  Product listing_Pricing
#   913:13683  Product listing page 4
#   913:13836  Product Listing _ Location
#   913:13958  Product Listing_Preview
#   913:14091  Product Listing _ Success
#   913:14189  Product listing page step 3
#   913:14391  Product Single page (variant 2)
#   913:14582  Product Single page (variant 3)
#   913:14682  Dashboard - my rentals
#   913:14701  Dashboard - OverView
#   913:14801  Dashboard - my favourite
#   913:14845  Dashboard - my listing
#   913:14889  Dashboard - earning
#   913:15059  Dashboard - Messaging
#   913:15176  Referral page
#   913:15346  Referral page - no referral yet
#   913:15456–15737  Dashboard - AI listing (5 frames)
#   913:15775  Sign up
#   913:15810  Verify code
#   913:15839  Sign in
```

---

## Instructions

<command-name>doyu-ux-sync</command-name>

---

### Phase 1: Load context (parallel)

**1A — Get open GitHub issues with ux-flow label:**
```bash
gh issue list --repo dbbuilder-org/u-rent --label "ux-flow" --state open \
  --json number,title,labels --limit 50 \
  | python3 -c "import json,sys; [print(f'#{i[\"number\"]}: {i[\"title\"]}') for i in json.load(sys.stdin)]"
```

**1B — Get merged PRs from last 21 days:**
```bash
gh pr list --repo dbbuilder-org/u-rent --state merged --limit 50 \
  --json number,title,mergedAt,headRefName \
  | python3 -c "
import json, sys
from datetime import datetime, timedelta
prs = json.load(sys.stdin)
cutoff = datetime.now() - timedelta(days=21)
for p in prs:
    merged = datetime.fromisoformat(p['mergedAt'].replace('Z',''))
    if merged > cutoff:
        print(f'#{p[\"number\"]} {p[\"title\"]}')
"
```

---

### Phase 2: Pull design frames from Figma (the actual designs)

**CRITICAL:** The visual design frames live on the "Ready to Dev" page (id=913:11797) and
the "WEB UI Design" page "Ready to dev" section (id=288:3281). These are Figma FRAME nodes
showing what pages should look like — NOT text annotations.

**2A — Primary: Standalone "Ready to Dev" page (Jaclyn's current staging area):**
```bash
curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/BE7PLhsb0FoOtbTI9BhFoK/nodes?ids=913:11798&depth=3" \
  | python3 - << 'PYEOF'
import json, sys

data = json.load(sys.stdin)
node = data['nodes']['913:11798']['document']
frames = []
for child in node.get('children', []):
    frames.append({
        'id': child['id'],
        'name': child['name'],
        'source': 'ready-to-dev-page'
    })
    print(f"[{child['id']}] {child['name']}")

import json as j
j.dump(frames, open('/tmp/uxsync_primary_frames.json', 'w'))
print(f"\nTotal: {len(frames)} design frames")
PYEOF
```

**2B — Secondary: WEB UI Design "Ready to dev" section (original location):**
```bash
curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/BE7PLhsb0FoOtbTI9BhFoK/nodes?ids=288:3281&depth=3" \
  | python3 - << 'PYEOF'
import json, sys

data = json.load(sys.stdin)
node = data['nodes']['288:3281']['document']
frames = []
for child in node.get('children', []):
    frames.append({
        'id': child['id'],
        'name': child['name'],
        'source': 'web-ui-design-page'
    })

import json as j
j.dump(frames, open('/tmp/uxsync_secondary_frames.json', 'w'))
print(f"Secondary: {len(frames)} design frames")
PYEOF
```

**2C — Developer annotation notes (functional requirements, NOT visual specs):**
```bash
curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/BE7PLhsb0FoOtbTI9BhFoK/nodes?ids=1:3&depth=6" \
  | python3 - << 'PYEOF'
import json, sys

data = json.load(sys.stdin)
node = data['nodes']['1:3']['document']

def extract_text(node):
    results = []
    if node.get('type') == 'TEXT':
        chars = node.get('characters', '').strip()
        if chars and len(chars) > 20:
            results.append({'text': chars, 'id': node.get('id',''), 'source': 'ux-notes'})
    for child in node.get('children', []):
        results.extend(extract_text(child))
    return results

texts = extract_text(node)
seen, unique = set(), []
for t in texts:
    key = t['text'][:80]
    if key not in seen:
        seen.add(key)
        unique.append(t)

import json as j
j.dump(unique, open('/tmp/uxsync_notes.json', 'w'))
print(f"Developer notes: {len(unique)} unique annotations")
PYEOF
```

**2D — Unresolved Figma comments (catch anything outside the design frames):**
```bash
curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/BE7PLhsb0FoOtbTI9BhFoK/comments" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
unresolved = [c for c in data.get('comments',[]) if not c.get('resolved_at') and c.get('message','').strip()]
for c in unresolved:
    print(f'[COMMENT #{c[\"id\"]}] {c.get(\"message\",\"\")[:200]}')
print(f'Total unresolved: {len(unresolved)}')
"
```

---

### Phase 3: Classify each design frame against existing work

For each frame from `/tmp/uxsync_primary_frames.json`:

Use this authoritative coverage map (update after each sync):

| Figma Frame Name | Frame ID | Status | PR(s) | Notes |
|-----------------|----------|--------|-------|-------|
| Home | 913:11799 | ❌ NOT STARTED | — | White bg, simplified nav, new hero |
| Category page | 913:12019 | ❌ NOT STARTED | — | Card grid with images + badges |
| Explore all Items | 913:12215 | 🟡 PARTIAL | #1638, #1649 | Filters built; visual chip style differs |
| Product Single page | 913:12437, 913:14391, 913:14582 | ❌ NOT STARTED | — | Sidebar, calendar, mobile layout |
| Search state (⌘K) | 913:12876, 913:12972 | ✅ BUILT | #1657 | |
| Product listing _Item Basics | 913:13253 | 🟡 PARTIAL | #1640 | Wizard built; visual styling not matched |
| Product listing _ Photo & year | 913:13374 | 🟡 PARTIAL | #1640, #1650 | Photo grid built |
| Product listing_Pricing | 913:13530 | 🟡 PARTIAL | #1640 | Step exists |
| Product listing page 4 | 913:13683 | 🟡 PARTIAL | #1640 | Step exists |
| Product Listing _ Location | 913:13836 | 🟡 PARTIAL | #1640 | Step exists |
| Product Listing_Preview | 913:13958 | 🟡 PARTIAL | #1656 | Review step grouped |
| Product Listing _ Success | 913:14091 | ✅ BUILT | #1647 | |
| Product listing page step 3 | 913:14189 | 🟡 PARTIAL | #1640 | Step exists |
| Dashboard - my rentals | 913:14682 | 🟡 PARTIAL | — | Tab structure exists |
| Dashboard - OverView | 913:14701 | 🟡 PARTIAL | #1654 | Balance card done |
| Dashboard - my favourite | 913:14801 | 🟡 PARTIAL | #1654 | Subtitle added |
| Dashboard - my listing | 913:14845 | 🟡 PARTIAL | — | Exists; visual redesign pending |
| Dashboard - earning | 913:14889 | 🟡 PARTIAL | #1654 | Withdraw button |
| Dashboard - Messaging | 913:15059 | 🟡 PARTIAL | #1655 | Tabs + search |
| Referral page | 913:15176, 913:15346 | 🟡 PARTIAL | #1626 | Open PR |
| Dashboard - AI listing (5 frames) | 913:15456–15737 | ❌ NOT STARTED | — | Full Garage Explorer redesign |
| Sign up | 913:15775 | ❌ NOT STARTED | — | Custom Clerk auth UI |
| Verify code | 913:15810 | ❌ NOT STARTED | — | Custom Clerk auth UI |
| Sign in | 913:15839 | ❌ NOT STARTED | — | Custom Clerk auth UI |

**Classification rules:**
- `✅ BUILT` — shipped in merged PR, visually matches Figma
- `🟡 PARTIAL` — feature exists but visual design doesn't match Figma frame
- `❌ NOT STARTED` — no PR exists, Figma frame not implemented at all
- `🔴 BLOCKED` — depends on design decision or upstream work

**For each NOT STARTED or PARTIAL frame, check for existing issues:**
```bash
gh issue list --repo dbbuilder-org/u-rent --search "<frame-name>" \
  --state open --json number,title --limit 5
```

---

### Phase 4: Create GitHub issues for untracked work

For each `NOT STARTED` or `PARTIAL` frame that has no open issue:

```bash
gh issue create \
  --repo dbbuilder-org/u-rent \
  --title "[UX] <frame name — concise description>" \
  --label "enhancement,ux-flow,area:frontend,priority:high,ui" \
  --assignee dbbuilder \
  --body "$(cat <<'EOF'
## UX Design Frame — Figma

**Source:** Figma "Ready to Dev" page — design frame
**Figma Frame ID:** `<id>`
**Status:** NOT STARTED / PARTIAL
**Priority:** High (visual redesign — Jaclyn demo pending)

### What the Figma Design Shows
<describe the visual design from the frame name and context>

### What's Currently Built
<describe current state on dev.doyu.rent>

### Gap
<what needs to change to match Figma>

### Implementation Notes
<technical approach>

### Related
- Figma node: `<id>`
- Figma page: Ready to Dev (913:11797)
EOF
)"
```

---

### Phase 5: Generate / Update the UX-Dev Digest

Create `docs/UX-DEV-DIGEST-{YYYY-MM-DD}.md` in the u-rent-platform repo.

```markdown
# UX ↔ Dev Digest — {date}
**Jaclyn's Figma design frames vs. what dev has shipped**

---

## TL;DR
<2-3 sentences: X of Y frames built, Z not started, dev.doyu.rent current state>

---

## Figma "Ready to Dev" — Frame Status

| Screen | Figma Frame | PR | Status |
|--------|------------|-----|--------|
| Home | 913:11799 | — | ❌ NOT STARTED |
...

---

## Functional Notes (User Flows & Logic page)

| Jaclyn's Note | Issue | Status |
|--------------|-------|--------|
...

---

## What's on dev.doyu.rent (as of today)

| Feature | PR | Merged |
|---------|-----|--------|
...

---

## Not Yet Started (Visual Redesign Priority)

Ordered by client visibility:
1. Homepage (frame 913:11799) — white bg, simplified nav
2. Category page (913:12019) — card grid
...

---

## Open Questions for Jaclyn

1. ...

---

## Recommended Sprint Plan

**Sprint 1 (highest visibility):**
1. ...
```

---

### Phase 6: Report

Print:
```
DoYu UX Sync — {date}

Design Frames (Ready to Dev page):
  ✅ BUILT:       N frames
  🟡 PARTIAL:     N frames (functional, needs visual polish)
  ❌ NOT STARTED: N frames
  Total:          N frames

New issues created: #NNNN, #NNNN, ...
Existing issues confirmed: #NNNN, #NNNN, ...

Digest: docs/UX-DEV-DIGEST-{date}.md

Priority order for next sprint:
  1. Homepage redesign (highest client visibility)
  2. ...
```

---

## Notes

- **CRITICAL:** The visual design frames live in the "Ready to Dev" page (id=913:11797) and
  the "WEB UI Design" page (id=21:86), NOT in "User Flows & Logic" (id=1:3). Page 1:3
  contains developer annotation notes only — they tell you WHAT to build, not HOW it should look.
- Jaclyn's actual mockups are Figma FRAME nodes. The REST API call to get them is:
  `GET /v1/files/{key}/nodes?ids=913:11798&depth=3` (primary) and `?ids=288:3281&depth=3` (secondary)
- Issue deduplication: search GitHub before creating. Key: `ux-flow` label + keyword match.
- The digest replaces the previous week's digest (new filename per date). Keep last 4 weeks.
- After each sync, update the coverage map in this skill's Phase 3 table.

## Prior Digests
- `docs/UX-DEV-DIGEST-2026-05-02.md` — Week 1+2, pre-gap-analysis
- `docs/UX-DEV-DIGEST-2026-05-10.md` — Gap analysis complete, 32 SP outstanding
