# figma-to-dev

End-to-end nightly pipeline: Figma "Ready for Dev" → GitHub issues → code + tests → PRs targeting staging → typecheck/lint/pattern CI → merge into dev → Render deploy.

Designed to run nightly (or on demand) and advance the full Figma-to-production pipeline
without manual intervention. Mirrors the Sunday manual workflow that produced PRs #1638–#1660.

**Looping:** The skill processes up to `--max-prs` issues per run (default 3) and saves
state to `/tmp/ftd_state.json`. On subsequent runs it picks up where it left off —
run `/figma-to-dev --continue` (or use `/loop /figma-to-dev --continue`) to keep going
until all NET_NEW issues are implemented. The dev merge and deploy happen only on the
**final** run (when the queue empties), not after every batch.

## Trigger Phrases

- `/figma-to-dev`
- "run the figma pipeline", "nightly figma sync"
- "figma to dev", "pull figma and build"
- "process figma ready for dev"
- `/figma-to-dev --continue` — resume from saved state (no Figma re-scan)

## Arguments (optional)

- `--continue` — Skip Phases 0–3; read saved state and implement next batch from queue
- `--scan-only` — Run Phases 0–3 (scan + dedup + issues) and save state; stop before code
- `--implement-only` — Skip Figma scan; load open `ux-flow` issues into queue and implement
- `--no-dev-merge` — Skip the git-dev-merge phase (useful when PRs need review first)
- `--skip-deploy` — Skip Render deploy at the end
- `--max-prs [N]` — Override per-run PR limit (default 3); use with `/loop` for full automation
- `--issue [N]` — Implement a specific issue number only; bypasses scan and queue

---

## Constants

```
FIGMA_PAT:      vault → credentials.md → Figma → Token row (export as $FIGMA_PAT)
FIGMA_FILE_KEY: BE7PLhsb0FoOtbTI9BhFoK
REPO:           dbbuilder-org/u-rent
BASE_BRANCH:    staging
DEV_BRANCH:     dev
DEV_API_SVC:    srv-d7qeu9jeo5us73c58l9g
DEV_WEB_SVC:    srv-d7qetrreo5us73c585fg
STANDUP_ISSUE:  649
UX_REVIEWER:    octavianorg
PLATFORM_PATH:  /Users/admin/dev2/clients/u-rent/u-rent-platform
STATE_FILE:     /tmp/ftd_state.json

# Figma page/frame IDs — ALWAYS scan both design sources, not just text annotations
DESIGN_FRAMES_PRIMARY:    913:11798   # "Ready to Dev" standalone page — Jaclyn's current staging area
DESIGN_FRAMES_SECONDARY:  288:3281    # WEB UI Design → "Ready to dev" section (original)
UX_NOTES_PAGE:            1:3         # "User Flows & Logic" — FUNCTIONAL notes (text), NOT visual designs

# CRITICAL: The mistake that caused "5% done" perception:
# We were scanning only UX_NOTES_PAGE (1:3) which has text annotations like "add a slider".
# The actual Figma design frames (showing what pages should LOOK LIKE) are in DESIGN_FRAMES_PRIMARY.
# Always scan DESIGN_FRAMES_PRIMARY first to get visual specs, then UX_NOTES_PAGE for functional notes.
```

---

## State File Schema

All progress is persisted to `/tmp/ftd_state.json` across runs. This is the
single source of truth for loop continuation.

```json
{
  "run_date": "YYYY-MM-DD",
  "queue": [
    { "issue": 1680, "title": "[UX] ...", "figma_node": "1:234", "status": "pending" },
    { "issue": 1681, "title": "[UX] ...", "figma_node": "1:235", "status": "implemented", "pr": 1690 },
    { "issue": 1682, "title": "[UX] ...", "figma_node": "1:236", "status": "pending" }
  ],
  "opened_prs": [1690],
  "batch": 1,
  "phase": "implementing",
  "all_done": false
}
```

`status` values: `pending` → `implementing` → `implemented` | `failed`
`phase` values: `scanning` | `implementing` | `merging` | `done`

Helper to read/write state:
```python
# /tmp/ftd_helpers.py
import json, os

STATE = '/tmp/ftd_state.json'

def load_state():
    if os.path.exists(STATE):
        return json.load(open(STATE))
    return None

def save_state(state):
    json.dump(state, open(STATE, 'w'), indent=2)

def pending(state):
    return [q for q in state['queue'] if q['status'] == 'pending']

def implemented(state):
    return [q for q in state['queue'] if q['status'] == 'implemented']
```

---

## Instructions

<command-name>figma-to-dev</command-name>

---

### Start: Detect mode

```python
import json, os, sys

STATE = '/tmp/ftd_state.json'
args = ' '.join(sys.argv[1:])  # parse from user message in practice

is_continue  = '--continue'       in args
is_scan_only = '--scan-only'      in args
is_impl_only = '--implement-only' in args
specific_issue = None  # parse --issue N if present
max_prs = 3            # parse --max-prs N if present

state = json.load(open(STATE)) if os.path.exists(STATE) else None

if is_continue and state:
    remaining = [q for q in state['queue'] if q['status'] == 'pending']
    print(f'CONTINUE mode — {len(remaining)} issues remaining in queue')
    print(f'Batch {state["batch"]+1} of ~{(len(state["queue"]) + max_prs - 1) // max_prs}')
    # Skip directly to Phase 4
elif state and state.get('phase') == 'implementing' and not is_continue:
    # Auto-detect: state exists from today → offer to continue
    remaining = [q for q in state['queue'] if q['status'] == 'pending']
    if remaining:
        print(f'⚠️  Saved state found ({len(remaining)} issues pending).')
        print(f'    Run with --continue to resume, or without it to re-scan Figma.')
        # Proceed with fresh scan unless --continue
```

**Branch on mode:**
- `--continue` or state exists + `phase == implementing`: **skip to Phase 4** (use saved queue)
- `--scan-only`: run Phases 0–3 then stop
- `--implement-only`: run Phase 3b (load open issues into queue) then Phase 4+
- Normal: run all phases in order

---

### Phase 0: Load context (all in parallel)

Skip this phase if `--continue`.

**0A — Figma file structure:**
```bash
curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/BE7PLhsb0FoOtbTI9BhFoK?depth=2" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for p in data['document']['children']:
    print(f'Page: {p[\"name\"]} (id={p[\"id\"]})')
    for f in p.get('children', [])[:8]:
        print(f'  Frame: {f[\"name\"]} (id={f[\"id\"]})')
"
```

**0B — Open PRs targeting staging:**
```bash
gh pr list --repo dbbuilder-org/u-rent --state open --base staging \
  --json number,title,headRefName,labels,assignees,body --limit 100 \
  > /tmp/ftd_open_prs.json
python3 -c "import json; prs=json.load(open('/tmp/ftd_open_prs.json')); print(f'{len(prs)} open PRs')"
```

**0C — Open issues with ux-flow label:**
```bash
gh issue list --repo dbbuilder-org/u-rent --state open --label "ux-flow" \
  --json number,title,labels,body --limit 100 \
  > /tmp/ftd_ux_issues.json
python3 -c "import json; i=json.load(open('/tmp/ftd_ux_issues.json')); print(f'{len(i)} open ux-flow issues')"
```

**0D — Merged PRs last 21 days:**
```bash
gh pr list --repo dbbuilder-org/u-rent --state merged --limit 50 \
  --json number,title,mergedAt,headRefName \
  | python3 -c "
import json, sys
from datetime import datetime, timedelta
prs = json.load(sys.stdin)
cutoff = datetime.now() - timedelta(days=21)
recent = [p for p in prs if datetime.fromisoformat(p['mergedAt'].replace('Z','')) > cutoff]
json.dump(recent, open('/tmp/ftd_merged_prs.json', 'w'))
print(f'{len(recent)} PRs merged in last 21 days')
"
```

---

### Phase 1: Scan Figma

Skip if `--continue` or `--implement-only`.

**⚠️ CRITICAL API PATTERN — read before writing any Figma curl commands:**
```
NEVER: curl ... | python3 << 'PYEOF'  ← heredoc overrides stdin; curl data silently discarded
ALWAYS: curl ... -o /tmp/file.json && python3 << 'PYEOF'  ← then use open('/tmp/file.json')
```
The `<<` here-document redirects stdin for the Python process, which means the pipe from curl
is discarded and `sys.stdin` in the script reads from the heredoc (already consumed = EOF).
Use `-o file` to save curl output, then read the file inside the heredoc.

**1A — UX annotations (TEXT nodes on page 1:3):**
```bash
curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/BE7PLhsb0FoOtbTI9BhFoK/nodes?ids=1:3&depth=6" \
  -o /tmp/ftd_ux_notes_raw.json

python3 << 'PYEOF'
import json
data = json.load(open('/tmp/ftd_ux_notes_raw.json'))
node = data['nodes']['1:3']['document']

def extract_text(node, path=''):
    results = []
    if node.get('type') == 'TEXT':
        chars = node.get('characters', '').strip()
        if chars and len(chars) > 20:
            results.append({'text': chars, 'name': node.get('name',''), 'id': node.get('id',''), 'path': path})
    for child in node.get('children', []):
        results.extend(extract_text(child, f'{path}/{node.get("name","")}'))
    return results

texts = extract_text(node)
seen, unique = set(), []
for t in texts:
    k = t['text'][:80]
    if k not in seen:
        seen.add(k)
        unique.append(t)

json.dump(unique, open('/tmp/ftd_figma_notes.json', 'w'))
print(f'{len(unique)} unique annotations')
PYEOF
```

**1B — Design frames from BOTH "Ready to Dev" sources (CRITICAL: scan design frames, not just text):**
```bash
# ALWAYS scan both sources. The visual design frames are Figma FRAME nodes — they show
# what pages should LOOK LIKE. Text annotations on page 1:3 only describe functionality.
# Note: 913:11797 is the CANVAS (page); its first child is SECTION 913:11798.
# Request the canvas, then walk into the section's children for frames.
curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/BE7PLhsb0FoOtbTI9BhFoK/nodes?ids=913:11797,288:3281&depth=3" \
  -o /tmp/ftd_design_frames_raw.json

python3 << 'PYEOF'
import json

data = json.load(open('/tmp/ftd_design_frames_raw.json'))
all_frames = []

for node_id, node_data in data['nodes'].items():
    doc = node_data['document']
    source = 'ready-to-dev-page' if '913' in node_id else 'web-ui-design-page'
    
    # CANVAS → SECTION → FRAME (one level of unwrapping needed)
    children = doc.get('children', [])
    if doc.get('type') == 'CANVAS' and children:
        # Unwrap the SECTION
        section = children[0]
        children = section.get('children', [])
    
    for child in children:
        t = child.get('type','')
        if t in ('FRAME', 'SECTION'):
            bb = child.get('absoluteBoundingBox', {})
            w = int(bb.get('width', 0))
            all_frames.append({
                'id': child['id'], 'name': child['name'],
                'type': t, 'source': source, 'width': w,
            })
            print(f"  [{source}] [{child['id']}] {child['name']} ({w}w)")

json.dump(all_frames, open('/tmp/ftd_ready_frames.json', 'w'))
print(f'\nTotal: {len(all_frames)} design frames across both sources')
PYEOF
```

**1C — Unresolved comments:**
```bash
curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/BE7PLhsb0FoOtbTI9BhFoK/comments" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
u = [c for c in data.get('comments',[]) if not c.get('resolved_at') and c.get('message','').strip()]
json.dump(u, open('/tmp/ftd_figma_comments.json', 'w'))
print(f'{len(u)} unresolved comments')
"
```

**1D — Three-Layer Component and Icon Audit:**

RTD frames only render the **Default** state of each component. All interaction states
(Hover, Pressed, Disabled, Error) and status variants (Booked, Paused, Popular) are defined
on the **Component page** (16:621). The **Icon page** (16:33) shows which icons are in-spec.
Run this audit to find visual gaps the frame scan cannot see.

Run all three downloads in parallel:
```bash
# Layer 2: Component page — all variant definitions
curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/BE7PLhsb0FoOtbTI9BhFoK/nodes?ids=16:621&depth=4" \
  -o /tmp/ftd_component_page.json &

# Layer 3: Icon page — icon inventory
curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/BE7PLhsb0FoOtbTI9BhFoK/nodes?ids=16:33&depth=4" \
  -o /tmp/ftd_icon_page.json &

# Prototype flows in RTD page
curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/BE7PLhsb0FoOtbTI9BhFoK/nodes?ids=913:11797&depth=4" \
  -o /tmp/ftd_rtd_deep.json &

wait
echo "All three downloaded"
```

Extract component variants and cross-reference against codebase:
```bash
python3 << 'PYEOF'
import json, subprocess

data = json.load(open('/tmp/ftd_component_page.json'))
root = data['nodes']['16:621']['document']

COMPONENT_SETS = []

def walk(n):
    if n.get('type') == 'COMPONENT_SET':
        props = n.get('componentPropertyDefinitions', {})
        variants = {}
        for pname, pdata in props.items():
            if pdata.get('type') == 'VARIANT':
                variants[pname] = pdata.get('variantOptions', [])
        if variants:
            COMPONENT_SETS.append({
                'name': n.get('name'), 'id': n.get('id'), 'variants': variants
            })
    for child in n.get('children', []):
        walk(child)

walk(root)
json.dump(COMPONENT_SETS, open('/tmp/ftd_component_sets.json', 'w'), indent=2)

# Key component sets to cross-reference with code
KEY_CHECKS = {
    'Card Component': {
        'states': ['Default', 'Hover'],
        'grep': 'hovered.*useState\|onMouseEnter',
        'file': 'ItemCard.tsx',
    },
    'Favourite': {
        'states': ['Default', 'Favourite'],
        'grep': 'IconHeartFilled\|isFavorited',
        'file': 'FavoriteButton.tsx',
    },
    'Card status (item)': {
        'states': ['Default', 'Booked', 'Paused', 'Under repair', 'Popular'],
        'grep': 'paused.*badge\|under.repair\|isPaused',
        'file': 'ItemCard.tsx',
    },
    'Card status (booking)': {
        'states': ['Pending', 'ongoing', 'completed', 'cancelled', 'disputed'],
        'grep': "color.*'yellow'\|color.*'blue'\|color.*'green'",
        'file': 'bookings',
    },
    'Trust section card': {
        'states': ['Default', 'Hover'],
        'grep': 'hovered\|onMouseEnter',
        'file': 'page.tsx (trust band section)',
    },
    'Message thread': {
        'states': ['Messaged', 'Seen', 'Active'],
        'grep': 'unreadCount\|isOnline\|activeUsers',
        'file': 'ConversationListPanel.tsx',
    },
    'Garage listing card (Mobile)': {
        'states': ['Default', 'Mobile'],
        'grep': "cols.*base.*1\|base.*12",
        'file': 'explore/page.tsx',
    },
}

PLATFORM_SRC = '/Users/admin/dev2/clients/u-rent/u-rent-platform/apps/web/src'

print("=== COMPONENT VARIANT AUDIT ===\n")
gaps = []
for name, check in KEY_CHECKS.items():
    result = subprocess.run(
        ['grep', '-rn', check['grep'], PLATFORM_SRC,
         '--include=*.tsx', '--include=*.ts', '-l'],
        capture_output=True, text=True
    )
    found = bool(result.stdout.strip())
    status = '✅' if found else '⚠️ GAP'
    if not found:
        gaps.append({'component': name, 'states': check['states'], 'grep': check['grep']})
    print(f"  {status} {name}")
    print(f"     States: {check['states']}")
    if not found:
        print(f"     Pattern not found: {check['grep']}")
    print()

json.dump(gaps, open('/tmp/ftd_component_gaps.json', 'w'), indent=2)
print(f"Gaps found: {len(gaps)}")
PYEOF
```

Extract icon inventory and map to Tabler:
```bash
python3 << 'PYEOF'
import json

data = json.load(open('/tmp/ftd_icon_page.json'))
root = data['nodes']['16:33']['document']

figma_icons = []
def walk(n, depth=0):
    t = n.get('type','')
    name = n.get('name','')
    if t in ('COMPONENT', 'COMPONENT_SET') and ':' in name:
        figma_icons.append(name)
    for child in n.get('children',[]):
        walk(child, depth+1)

walk(root)

# Known mapping: Figma icon library → Tabler equivalent
# Figma uses 24 Iconify libraries; we use @tabler/icons-react (single library)
# This is a DESIGN DECISION, not a bug. Only flag true semantic mismatches.
TABLER_MAP = {
    'akar-icons:search': 'IconSearch',
    'boxicons:message-bubble-reply': 'IconMessage',
    'charm:cross': 'IconX',
    'icon-park-outline:setting-two': 'IconSettings',
    'mdi:heart': 'IconHeart',
    'mdi:heart-outline': 'IconHeart (outline)',
    'mi:notification': 'IconBell',
    'pepicons-pop:list': 'IconList',
    'radix-icons:dashboard': 'IconLayoutDashboard',
    'streamline-ultimate:filter-1-bold': 'IconFilter',
    'streamline-ultimate:headphones-customer-support-question-bold': 'IconHeadset',
    'uil:wallet': 'IconWallet',
    'si:star-fill': 'IconStarFilled',
    'carbon:location-filled': 'IconMapPin',
    'lets-icons:time-atack-fill': 'IconClock',
    'iconamoon:shield-yes': 'IconShieldCheck',
    'ic:round-plus': 'IconPlus',
    'fluent:people-12-regular': 'IconUsers',
    'qlementine-icons:menu-dots-16': 'IconDotsVertical',
    'material-symbols:box-outline-rounded': 'IconPackage',
    'hugeicons:legal-02': 'IconGavel',
    'ri:camera-ai-2-line': 'IconCamera',
    'ri:search-ai-line': 'IconSearch',
    'ep:arrow-down-bold': 'IconChevronDown',
}

print("=== ICON AUDIT ===")
print(f"Figma Icon page: {len(figma_icons)} named icons")
print(f"Our library: @tabler/icons-react (Tabler)")
print()
print("NOTE: Icon style difference is intentional design decision.")
print("Figma uses filled variants; Tabler defaults to stroke.")
print("FavoriteButton already corrects this (IconHeartFilled when favorited).")
print()

libraries = set(ic.split(':')[0] for ic in figma_icons if ':' in ic)
print(f"Figma icon libraries in use: {sorted(libraries)}")
print()

no_mapping = [ic for ic in figma_icons if ic not in TABLER_MAP]
if no_mapping:
    print(f"Icons without a Tabler mapping ({len(no_mapping)}) — review manually:")
    for ic in no_mapping:
        print(f"  {ic}")
PYEOF
```

Extract prototype interactions from RTD frames:
```bash
python3 << 'PYEOF'
import json

data = json.load(open('/tmp/ftd_rtd_deep.json'))
root = data['nodes']['913:11797']['document']

protos = []
def walk(n, path=''):
    for ix in n.get('interactions', []):
        for act in ix.get('actions', []):
            dest = act.get('destinationId', '?')
            protos.append({
                'node': n.get('name', '?'),
                'path': path,
                'trigger': ix.get('trigger',{}).get('type','?'),
                'dest': dest,
            })
    for child in n.get('children', []):
        walk(child, path + '/' + n.get('name',''))

walk(root)

print("=== PROTOTYPE INTERACTIONS IN RTD ===")
print(f"Total: {len(protos)}")
for p in protos:
    print(f"  {p['path']} → {p['node']}")
    print(f"    trigger={p['trigger']} dest={p['dest']}")

if not protos:
    print("  None found — RTD frames have no prototype navigation flows beyond standard page links.")
PYEOF
```

**Audit result key from 2026-05-12 session (update after each run):**

| Component | States | Status | Notes |
|---|---|---|---|
| Primary/Secondary/Tertiary Button | Default/Hover/Pressed/Disable | ✅ | Mantine handles all |
| Input fields | Default/Active/Error | ✅ | Mantine handles all |
| Card Component | Default/Hover | ✅ | `hovered` state + View Details overlay |
| Favourite | Default/Favourite | ✅ | IconHeart/IconHeartFilled + pink color |
| Garage listing card | Default/Mobile | ✅ | `SimpleGrid cols={{ base:1, sm:3 }}` |
| Booking status badge | Pending/Ongoing/Completed/Cancelled/Disputed | ✅ | Colors match Figma spec |
| Search save | Default/Hover/Pressed | ✅ | Mantine |
| Trust section card | Default/**Hover** | ⚠️ P2 | Static Paper — no hover lift |
| ItemCard status | Default/Booked/Paused/**Under repair**/**Popular** | ⚠️ P1 | "Paused" has no badge; "Under repair" not in entity |
| Message thread | Messaged/Seen/**Active** | ⚠️ P2 | `unreadCount` works; online "Active" dot absent |

**Mobile / Dark mode / Prototype findings from 2026-05-12:**
- Mobile-width frames in RTD: **0** — RTD is desktop-only; mobile is a separate native app (430px iPhone frames on page `673:6456`)
- Dark mode: **None** — no dark variants in Figma file
- Prototype interactions in RTD: **2** (Product Single → Home; Sign up → Verify code) — both implemented

---

### Phase 2: Dedup — classify each Figma item

Skip if `--continue` or `--implement-only`.

| Status | Criteria | Action |
|--------|----------|--------|
| `ALREADY_BUILT` | Merged PR in last 21 days has matching keywords | Skip |
| `ISSUE_EXISTS` | Open issue with `ux-flow` label has matching keywords | Skip (already queued) |
| `IN_FLIGHT_PR` | Open PR has matching keywords | Skip |
| `NET_NEW` | No match | → Phase 3 |

**Coverage map (update after each run):**

| Figma Area | Merged PR(s) | Status |
|-----------|-------------|--------|
| Browse filter sidebar | #1638, #1648, #1649 | ✅ |
| Header search popup | #1639 | ✅ |
| Listing wizard | #1640 | ✅ |
| Date range picker | #1641 | ✅ |
| Booking success page | #1647 | ✅ |
| Price histogram + popular tags | #1648 | ✅ |
| Filter polish | #1649 | ✅ |
| Sortable photo grid | #1650 | ✅ |
| Post-verification redirect | #1651 | ✅ |
| Dashboard balance card | #1654 | ✅ |
| Messages chats panel | #1655 | ✅ |
| Listing review step grouped | #1656 | ✅ |
| ⌘K search modal | #1657 | ✅ |
| Report user modal | #1658 | ✅ |
| Message reactions + image sharing | #1659 | ✅ |
| Distance unit toggle | #1660 | ✅ |
| How DOYU Works gradient + Footer bg + Browse CTA band + Pricing panel + Pro Tip amber + NavLink color | #1736 | ✅ |

Classify each design frame (from `/tmp/ftd_ready_frames.json`).
Note: frames are classified by frame NAME, not text content — they are visual design frames,
not text annotations. Use the frame name as the primary matching key.

```python
import json, subprocess

frames = json.load(open('/tmp/ftd_ready_frames.json'))
issues = json.load(open('/tmp/ftd_ux_issues.json'))
merged = json.load(open('/tmp/ftd_merged_prs.json'))
prs    = json.load(open('/tmp/ftd_open_prs.json'))

# Use the authoritative built-coverage list from doyu-ux-sync skill Phase 3 table.
# Frame IDs confirmed built (update this list as PRs merge):
BUILT_FRAME_IDS = {
    '913:12876', '913:12972',   # Search state — PR #1657
    '913:14091',                # Product Listing Success — PR #1647
}

# Frame names that map to partial/built work (keyword match):
PARTIAL_COVERAGE = {
    'explore all items': ['#1638', '#1649'],
    'dashboard - overview': ['#1654'],
    'dashboard - messaging': ['#1655'],
    'dashboard - earning': ['#1654'],
    'dashboard - my favourite': ['#1654'],
    'referral page': ['#1626'],
    'product listing': ['#1640', '#1650', '#1656'],
}

def keywords(name): return [w.lower() for w in name.replace('-','').replace('_','').split() if len(w) > 3]

classified = []
for frame in frames:
    fid   = frame['id']
    fname = frame['name']
    fkws  = keywords(fname)
    status = 'NET_NEW'

    if fid in BUILT_FRAME_IDS:
        status = 'ALREADY_BUILT'
    elif any(any(k in fname.lower() for k in pk.split()) for pk in PARTIAL_COVERAGE):
        status = 'PARTIAL'  # functional exists, visual redesign needed
    else:
        for p in merged:
            if any(k in p['title'].lower() for k in fkws):
                status = 'ALREADY_BUILT'; break
        if status == 'NET_NEW':
            for i in issues:
                if any(k in i['title'].lower() for k in fkws):
                    status = 'ISSUE_EXISTS'; break
        if status == 'NET_NEW':
            for p in prs:
                if any(k in p['title'].lower() for k in fkws):
                    status = 'IN_FLIGHT_PR'; break

    classified.append({**frame, 'status': status})

json.dump(classified, open('/tmp/ftd_classified.json', 'w'))
net_new = [c for c in classified if c['status'] == 'NET_NEW']
partial = [c for c in classified if c['status'] == 'PARTIAL']
print(f'NET_NEW: {len(net_new)} | PARTIAL: {len(partial)} | BUILT: {sum(1 for c in classified if c["status"]=="ALREADY_BUILT")} | ISSUE: {sum(1 for c in classified if c["status"]=="ISSUE_EXISTS")} | PR: {sum(1 for c in classified if c["status"]=="IN_FLIGHT_PR")}')
print(f'\nNET_NEW frames (highest priority):')
for c in net_new: print(f'  [{c["id"]}] {c["name"]}')
```

---

### Phase 3: Create issues + build queue

Skip if `--continue`.

**3A — Create GitHub issues for NET_NEW items (max 10/run):**

```bash
for each NET_NEW note (up to 10):
  ISSUE_NUM=$(gh issue create \
    --repo dbbuilder-org/u-rent \
    --title "[UX] <title>" \
    --label "enhancement,ux-flow,area:frontend,priority:medium,ui" \
    --assignee dbbuilder \
    --body "..." | grep -oP '#\d+' | head -1)
  echo "Created $ISSUE_NUM"
```

**3B — Build the full queue and save state:**

This is the critical step — write ALL net-new issues to state now, not just the first batch.
The queue drives all subsequent loop iterations.

```python
import json, os
from datetime import datetime

net_new = [c for c in json.load(open('/tmp/ftd_classified.json')) if c['status'] == 'NET_NEW']

# Also pull any pre-existing open ux-flow issues not yet in a PR (--implement-only path)
existing_issues = json.load(open('/tmp/ftd_ux_issues.json'))
open_pr_branches = {p['headRefName'] for p in json.load(open('/tmp/ftd_open_prs.json'))}

# Priority order: Figma annotation order = UX priority order
# Bump any note with "priority", "p1", "critical" in text to front
def priority_score(note):
    text = note.get('text','').lower()
    if any(w in text for w in ['priority', 'p1', 'critical', 'blocker']): return 0
    if any(w in text for w in ['booking', 'listing', 'browse', 'search']): return 1
    return 2

queue_items = []
for note in sorted(net_new, key=priority_score):
    queue_items.append({
        'issue': note.get('created_issue'),  # set during 3A
        'title': note['text'][:80],
        'figma_node': note['id'],
        'figma_path': note.get('path',''),
        'status': 'pending',
        'pr': None,
    })

state = {
    'run_date': datetime.now().strftime('%Y-%m-%d'),
    'queue': queue_items,
    'opened_prs': [],
    'batch': 0,
    'phase': 'implementing' if queue_items else 'merging',
    'all_done': len(queue_items) == 0,
}

json.dump(state, open('/tmp/ftd_state.json', 'w'), indent=2)
print(f'Queue saved: {len(queue_items)} issues total')
print(f'Will take ~{(len(queue_items) + 2) // 3} batches of 3 to complete')
```

**Stop here if `--scan-only`.**

Print to user:
```
📋 Scan complete — {N} issues queued.
Run /figma-to-dev --continue (or /loop /figma-to-dev --continue) to implement them.
```

---

### Phase 3C: Determine this batch

At the start of every run (fresh or continued):

```python
import json

state = json.load(open('/tmp/ftd_state.json'))
pending = [q for q in state['queue'] if q['status'] == 'pending']
max_prs = 3  # or from --max-prs arg

this_batch = pending[:max_prs]
remaining_after = pending[max_prs:]

print(f'This run: implementing issues {[q["issue"] for q in this_batch]}')
print(f'After this run: {len(remaining_after)} issues still pending')
print(f'Batch {state["batch"] + 1} of ~{(len(state["queue"]) + max_prs - 1) // max_prs}')

is_final_batch = len(remaining_after) == 0
print(f'Final batch: {is_final_batch} — {"dev merge + deploy will run" if is_final_batch else "dev merge deferred until queue is empty"}')
```

**Rule: dev merge and Render deploy only run on the final batch.**
On non-final batches, skip Phases 8–10 so the dev branch isn't rebuilt after every 3 PRs.

---

### Phase 4: Get Figma design context per issue

For each issue in `this_batch`:

**4A — Measure BEFORE coding (mandatory — run this before any code is written):**

Pull exact layout properties from Figma API. Do not write code until this is complete.

```python
import requests

PAT      = '<vault: credentials.md → Figma → Token>'
FILE_KEY = 'BE7PLhsb0FoOtbTI9BhFoK'
node_id  = '<figma_node from queue>'

r = requests.get(
    f'https://api.figma.com/v1/files/{FILE_KEY}/nodes?ids={node_id}&depth=4',
    headers={'X-Figma-Token': PAT}, timeout=20
)
doc = r.json()['nodes'][node_id]['document']

def extract_spec(node, depth=0):
    indent = "  " * depth
    name = node.get('name', '')
    typ  = node.get('type', '')
    bb   = node.get('absoluteBoundingBox', {})
    w, h = round(bb.get('width', 0)), round(bb.get('height', 0))

    pad_t = node.get('paddingTop')
    gap   = node.get('itemSpacing')
    lm    = node.get('layoutMode', '')
    chars = node.get('characters', '') if typ == 'TEXT' else ''

    if w or h or pad_t is not None or gap is not None or chars:
        print(f"{indent}[{typ}] {name}")
        if w and h: print(f"{indent}  size: {w}×{h}px")
        if pad_t is not None:
            pads = [node.get(k, 0) for k in ('paddingTop','paddingRight','paddingBottom','paddingLeft')]
            if len(set(pads)) == 1:
                print(f"{indent}  padding: {pads[0]}px  → p={{{pads[0]}}}")
            else:
                print(f"{indent}  padding: {pads[0]}px {pads[1]}px {pads[2]}px {pads[3]}px")
        if gap is not None:
            print(f"{indent}  gap: {gap}px ({lm})  → gap={{{gap}}}")
        if chars:
            print(f"{indent}  text: \"{chars[:80].replace(chr(10),' ')}\"")

    # Print children in y-order for section-level frames (reveals correct JSX order)
    children = node.get('children', [])
    if depth == 0 and len(children) > 2:
        sorted_children = sorted(children, key=lambda c: c.get('absoluteBoundingBox', {}).get('y', 0))
        print(f"\n{indent}── children (y-order, = JSX order) ──")
        for i, c in enumerate(sorted_children):
            cbb = c.get('absoluteBoundingBox', {})
            print(f"{indent}  {i+1}. [{c.get('type')}] {c.get('name')} y={round(cbb.get('y',0))} h={round(cbb.get('height',0))}")
        print()
        for c in sorted_children:
            extract_spec(c, depth + 1)
    else:
        for c in children:
            extract_spec(c, depth + 1)

extract_spec(doc)
```

**Output = spec sheet. Every value in the code must trace to a line in this output.**
Use the children y-order to set JSX section order. Never assume section order from memory.

**4A-content — Content key audit (run when issue involves text or content/*.ts):**

```python
import subprocess, re

def collect_text_nodes(node, results=None):
    if results is None: results = []
    if node.get('type') == 'TEXT':
        chars = node.get('characters', '').strip()
        if chars and len(chars) > 5:
            results.append(chars)
    for c in node.get('children', []):
        collect_text_nodes(c, results)
    return results

figma_texts = collect_text_nodes(doc)
result = subprocess.run(
    ['grep', '-rn', '--include=*.ts', '-E', r'"[^"]{5,}"',
     'apps/web/src/content'],
    capture_output=True, text=True, cwd='/Users/admin/dev2/clients/u-rent/u-rent-platform'
)
content_strings = re.findall(r'"([^"]{5,})"', result.stdout)

phantom = [cs for cs in content_strings
           if not any(cs[:40] in ft for ft in figma_texts)]
if phantom:
    print("⚠️  PHANTOM content keys (in code but not in Figma — remove or document):")
    for p in phantom[:10]:
        print(f"  - \"{p[:70]}\"")
```

**4B — Identify the Figma frame:**
- Read `figma_node` from the queue item (already done above in 4A)
- If null: search `/tmp/ftd_ready_frames.json` for a frame matching the issue title keywords

**4C — Pull design context via Figma MCP (visual confirmation):**
```
Use mcp__figma__get_design_context:
  fileKey: BE7PLhsb0FoOtbTI9BhFoK
  nodeId:  <figma_node from queue> (convert - to : if from URL format)
```

The MCP context confirms the gestalt; the spec sheet (4A) drives the numbers.

**4D — Screenshot for visual reference:**
```
Use mcp__figma__get_screenshot:
  fileKey: BE7PLhsb0FoOtbTI9BhFoK
  nodeId:  <figma_node>
```

**4E — Find files to modify:**
```bash
# Search for existing components related to this frame
grep -rn "<keyword>" \
  /Users/admin/dev2/clients/u-rent/u-rent-platform/apps/web/src/ \
  --include="*.tsx" --include="*.ts" -l | head -10

# Sibling form check if a form field is involved
grep -rn "form\.getInputProps\|<FieldName" \
  /Users/admin/dev2/clients/u-rent/u-rent-platform/apps/web/src/app/items/ \
  --include="*.tsx" | head -10
```

---

### Phase 5: Implement each issue

For each issue in `this_batch`:

**5A — Mark as in-progress in state:**
```python
state = json.load(open('/tmp/ftd_state.json'))
for q in state['queue']:
    if q['issue'] == issue_num:
        q['status'] = 'implementing'
json.dump(state, open('/tmp/ftd_state.json', 'w'), indent=2)
```

**5B — Create branch from staging:**
```bash
cd /Users/admin/dev2/clients/u-rent/u-rent-platform
git fetch origin
git checkout -b feat/ux-<slug> origin/staging
```
Branch naming: `feat/ux-<issue-slug>` (kebab-case title, max 40 chars)

**5C — Implement the changes (platform rules — enforced):**

```
AUTHENTICATED API CALLS:
  const { isApiReady } = useApiReady();
  useEffect(() => { if (!isApiReady) return; /* fetch */ }, [isApiReady]);

CROSS-TAB REFRESH:
  import { postDashboardRefresh } from '../../lib/utils/broadcast-refresh';
  // NEVER window.dispatchEvent(new CustomEvent('dashboard-nav-refresh'))

IMAGES: opacity: 0/1 — NEVER display:none + loading="lazy"
MANTINE v8 DATES: ISO strings — NEVER Date objects
XSS: xss() for dangerouslySetInnerHTML only — NEVER plain text
NUMERICS: value ?? 0 — NEVER value || 0
DISABLED BUTTON IN TOOLTIP: <Tooltip><span><Button disabled /></span></Tooltip>
useSearchParams IN PAGES: always <Suspense> wrapper in the page file
SIBLING FORMS: field added to items/new → also add to items/[id]/edit
```

**5D — API types (if DTO/controller changed):**
```bash
npm run generate:api-types  # API must be running on port 11000
```

**5E — Write the test (minimum 3 cases):**
- Renders without crashing
- Shows key visual element (by data-testid)
- Handles user interaction (click / input)

---

### Phase 6: Validate (per PR, before commit)

**6A — TypeScript — zero errors required:**
```bash
npx nx typecheck web 2>&1 | grep "error TS"
```

Common merge-artifact fixes:
- `TS2300` duplicate identifier → remove second export/import
- `TS6133` unused → remove the unused import
- `TS2304` cannot find name → add prop to interface or rename to existing handler
- `TS2345` type mismatch → check Mantine v8 ISO string vs Date

**6B — Lint — zero `local/` violations:**
```bash
npx nx lint web 2>&1 | grep -E "error|local/"
```

**6C — Pattern compliance grep:**
```bash
# isApiReady gate on every authenticated useEffect
grep -n "useEffect" <changed-files>  # any API call inside must be gated

# No raw CustomEvent
grep -n "dispatchEvent\|new CustomEvent" <changed-files>  # must be empty

# No display:none + lazy
grep -n "display.*none\|loading=\"lazy\"" <changed-files>  # must not co-occur

# Sibling form parity
grep -rn "newFieldName" apps/web/src/app/items/ --include="*.tsx"
# Must appear in BOTH new/page.tsx AND [id]/edit/page.tsx

# useSearchParams → Suspense
grep -n "useSearchParams" <changed-files>  # if present, Suspense must also be in file
```

**6D — API types freshness:**
```bash
git diff --name-only HEAD origin/staging | grep -E "\.dto\.ts|\.controller\.ts"
# If any: api-types.ts must also be in the diff
```

**6E — Migration pairing:**
```bash
git diff --name-only HEAD origin/staging | grep "\.entity\.ts"
# If any: a migration file must also be in the diff
```

**Fix all violations before proceeding. Do not commit with known errors.**

---

### Phase 7: Commit, push, open PR; update state

**7A — Commit:**
```bash
git add <specific changed files>
git commit -m "$(cat <<'EOF'
feat(ux): <description matching issue title>

Implements #NNNN. <1-2 sentence summary of what changed and why.>

- <specific change 1>
- <specific change 2>
- Tests: N cases (renders, key element, user interaction)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

**7B — Push:**
```bash
git push -u origin feat/ux-<slug>
```

**7C — Open PR targeting staging:**
```bash
PR_URL=$(gh pr create \
  --repo dbbuilder-org/u-rent \
  --base staging \
  --title "feat(ux): <description>" \
  --assignee octavianorg \
  --label "enhancement,ux-flow,area:frontend,ui" \
  --body "...")
PR_NUM=$(echo $PR_URL | grep -oP '\d+$')
```

**7D — Mark issue as implemented in state:**
```python
state = json.load(open('/tmp/ftd_state.json'))
for q in state['queue']:
    if q['issue'] == issue_num:
        q['status'] = 'implemented'
        q['pr'] = pr_num
        q['branch'] = branch_name
state['opened_prs'].append(pr_num)
state['batch'] += 1
json.dump(state, open('/tmp/ftd_state.json', 'w'), indent=2)
```

**7E — Return to Phase 4 for next issue in this_batch.**

---

### Phase 7F: End-of-batch decision

After all issues in `this_batch` are implemented:

```python
state = json.load(open('/tmp/ftd_state.json'))
remaining = [q for q in state['queue'] if q['status'] == 'pending']

if remaining:
    # NOT the final batch — tell user how to continue
    print(f"""
✅ Batch {state['batch']} complete.

Implemented this run:
{chr(10).join(f"  PR #{q['pr']} — {q['title']}" for q in state['queue'] if q['status'] == 'implemented' and q['pr'] in this_run_prs)}

Still pending ({len(remaining)} issues):
{chr(10).join(f"  #{q['issue']} {q['title'][:60]}" for q in remaining)}

👉 Run /figma-to-dev --continue to implement the next batch.
   Or run /loop /figma-to-dev --continue to finish automatically.
""")
    # EXIT — do NOT run Phases 8-11 yet
    state['phase'] = 'implementing'
    json.dump(state, open('/tmp/ftd_state.json', 'w'), indent=2)
else:
    # FINAL batch — continue to Phase 8 (dev merge + deploy)
    print(f'All {len(state["queue"])} issues implemented. Proceeding to dev merge...')
    state['phase'] = 'merging'
    json.dump(state, open('/tmp/ftd_state.json', 'w'), indent=2)
    # Fall through to Phase 8
```

**Phases 8–11 only execute on the final batch (when remaining queue is empty).**
If `--no-dev-merge` is passed, skip to Phase 11 report instead.

---

### Phase 8: Dev merge (final batch only)

**8A — Fetch all open PRs (includes new ones just opened):**
```bash
gh pr list --repo dbbuilder-org/u-rent --state open --base staging \
  --json number,headRefName,title --limit 100 \
  | python3 -c "
import json, sys
prs = json.load(sys.stdin)
prs = [p for p in prs if not p['headRefName'].startswith('dependabot/')]
json.dump(prs, open('/tmp/dev_merge_prs.json', 'w'))
print(f'Merging {len(prs)} PRs into dev')
"
```

**8B — Reset dev to staging:**
```bash
cd /Users/admin/dev2/clients/u-rent/u-rent-platform
git fetch origin
git branch -D dev 2>/dev/null || true
git checkout -b dev origin/staging
echo "dev reset to staging at $(git rev-parse --short HEAD)"
```

**8C — Merge all PRs (sorted by number ascending — oldest first):**
```python
# /tmp/do_merge.py
import subprocess, json

prs = sorted(json.load(open('/tmp/dev_merge_prs.json')), key=lambda x: x['number'])
results = {'merged': [], 'conflicted': [], 'skipped': []}

for pr in prs:
    branch = pr['headRefName']
    check = subprocess.run(['git', 'ls-remote', '--exit-code', 'origin', branch], capture_output=True)
    if check.returncode != 0:
        results['skipped'].append({'num': pr['number'], 'branch': branch, 'reason': 'remote branch missing'})
        continue

    r = subprocess.run(
        ['git', 'merge', '--no-ff', '-m',
         f'Merge PR #{pr["number"]} ({branch}) into dev', f'origin/{branch}'],
        capture_output=True, text=True
    )
    if r.returncode == 0:
        print(f'✅ #{pr["number"]} {branch}')
        results['merged'].append({'num': pr['number'], 'branch': branch})
    else:
        print(f'❌ #{pr["number"]} {branch} — CONFLICT')
        subprocess.run(['git', 'merge', '--abort'], capture_output=True)
        results['conflicted'].append({'num': pr['number'], 'branch': branch})

json.dump(results, open('/tmp/dev_merge_results.json', 'w'))
print(f'\n✅ {len(results["merged"])} merged | ❌ {len(results["conflicted"])} conflicted | ⚠️ {len(results["skipped"])} skipped')
```

Run: `python3 /tmp/do_merge.py`

**8D — Resolve conflicts (additive strategy — never discard code from either side):**

For each conflicted PR, re-attempt merge and resolve. Apply the cheat sheet below.
After resolving: `git add <files> && git commit -m "Merge PR #NNN (...) into dev — <conflict note>"`

**8E — TypeScript check on dev before push:**
```bash
npx nx typecheck web 2>&1 | grep "error TS" | head -20
npx nx typecheck api 2>&1 | grep "error TS" | head -20
```

Fix merge artifacts (always the same patterns):
- Duplicate `export { Foo }` in `lib/api/index.ts` → remove second
- Duplicate `import { Module }` in `app.module.ts` → remove second, keep one in providers
- Duplicate type block in `api-types.ts` → remove second block
- Unused import `TS6133` → remove the import
- Missing variable `TS2304` → check if handler/prop was dropped in HEAD resolution

**8F — Push dev:**
```bash
git push --force-with-lease origin dev
```

**8G — Update state:**
```python
state = json.load(open('/tmp/ftd_state.json'))
state['phase'] = 'deploying'
json.dump(state, open('/tmp/ftd_state.json', 'w'), indent=2)
```

---

### Phase 9: Deploy to Render (final batch only)

```bash
render deploys create srv-d7qeu9jeo5us73c58l9g --confirm
render deploys create srv-d7qetrreo5us73c585fg --confirm
```

Poll until live:
```bash
until render deploys list srv-d7qetrreo5us73c585fg --output json \
  | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; s=d['status']; print(s); exit(0 if s in ['live','build_failed'] else 1)"; do
  sleep 15
done
```

If `build_failed`: check build log, fix the issue in dev branch, force-push, redeploy.

---

### Phase 10: Visual confirmation (final batch only)

```
WebFetch https://dev.doyu.rent
  → "Does the page load? Nav items? Any errors?"

WebFetch https://dev.doyu.rent/browse
  → "Filter order (Location before Categories?), distance slider, sticky Apply, popular tags"

WebFetch https://u-rent-staging-api.onrender.com/api/health
  → "Status ok? DB latency? Redis active?"
```

For each PR opened this pipeline run, verify its specific goal is visible on the page.
Use `mcp__figma__get_screenshot` + compare to the live page to confirm visual match.

---

### Phase 11: Report (always runs — final batch only does deploy/merge sections)

**11A — Mark state as done:**
```python
state = json.load(open('/tmp/ftd_state.json'))
state['phase'] = 'done'
state['all_done'] = True
json.dump(state, open('/tmp/ftd_state.json', 'w'), indent=2)
```

**11B — Post to issue #649:**
```bash
gh issue comment 649 --repo dbbuilder-org/u-rent --body "$(cat <<'EOF'
## 🎨 figma-to-dev — $(date -u '+%Y-%m-%d %H:%M UTC')

### Figma Scan
- Annotations: N total | Already built: N | Issue existed: N | Net new: N

### Issues Created
- #NNNN [UX] title
- ...

### PRs Opened This Pipeline Run
- #NNNN feat(ux): title → https://github.com/dbbuilder-org/u-rent/pull/NNNN
- ...

### Dev Branch Rebuild
- ✅ Merged: N PRs | ❌ Conflicted (resolved): N | ⚠️ Skipped: N

### Deploy
- API: ✅ live | Web: ✅ live
- https://dev.doyu.rent

### Visual Confirmation
- ✅ Home page loads
- ✅ Browse: Location before Categories
- ✅ Browse: Distance slider 1-200mi with mi/km toggle
- ✅ Browse: Sticky Apply Filters button
- <per-PR confirmations>
EOF
)"
```

---

## Conflict Resolution Cheat Sheet

| File | Conflict Type | Resolution |
|------|--------------|-----------|
| `app.module.ts` | Two PRs add same Module import | Keep both (one import line + one in providers) |
| `entities/index.ts` | Two PRs export same entity | Keep one export block |
| `api-types.ts` | Two PRs add same endpoint type | Keep first block; remove second |
| `lib/api/index.ts` | Two PRs export same function | Keep one export line |
| `FilterSidebar.tsx` | Filter order + new filter | Apply both: reorder AND include new filter |
| `Header.tsx` | Popover search + modal changes | Keep HEAD (popover); merge incoming additions inside |
| `*.test.tsx` | Two PRs add `describe` blocks | Keep both describe blocks |
| `*.tsx` imports | Two PRs add different imports | Keep all unique imports, sort alphabetically |
| `broadcast-refresh.ts` | Add/add conflict | Keep HEAD (BroadcastChannel version) |

**FilterSidebar canonical order:**
Clear All → Search → Location → Distance (Slider+SegmentedControl) → Categories → Dates → Price Range → Popular Tags → Sticky Footer (Apply + Save Search)

---

## TypeScript Quick Fix Map

| Error | Always means | Fix |
|-------|-------------|-----|
| `TS2300` duplicate identifier | Additive merge duplicated an export | Remove second occurrence |
| `TS6133` declared but not read | Removed usage but left import | Remove the import |
| `TS2304` cannot find name | Prop missing from interface, or handler renamed | Add prop or use existing handler name |
| `TS2345` type mismatch | Mantine v8 ISO string vs Date | Convert to ISO string |

---

## Loop Usage

**Automatic (recommended for nightly runs):**
```
/loop /figma-to-dev --continue
```
Each iteration implements the next batch of 3 PRs. The loop terminates when
the skill prints "All N issues implemented" and proceeds to dev merge + deploy.
The `/loop` skill's self-pacing handles the delay between batches.

**Manual (for daytime interactive use):**
```
/figma-to-dev              # first run: scan + queue + batch 1
/figma-to-dev --continue   # batch 2
/figma-to-dev --continue   # batch 3  ← dev merge + deploy happen here
```

**Targeted (implement one specific issue):**
```
/figma-to-dev --issue 1685
```
Implements issue #1685 only, skips queue management, runs validation + PR,
then does dev merge + deploy (treated as a final batch).

**Scan only (safe for GHA automation — no code written):**
```
/figma-to-dev --scan-only
```
Pulls Figma, creates issues, saves queue. Stops before any code.
Useful as a nightly GHA step with manual implementation sessions during the day.

---

## U-Rent Visual Gap Checklist (run after each full Figma audit)

After implementing Figma issues, cross-check these known gap patterns that keyword-matching
alone misses. Each was caught in the 2026-05-11 full audit:

| Gap pattern | Where to check | What to look for |
|-------------|---------------|-----------------|
| Section background color | Every `<Box bg=...>` in `app/page.tsx` | Flat `gray.0` sections that Figma shows as gradients (e.g. How It Works → periwinkle gradient) |
| Footer background | `components/layout/Footer.tsx` style block | `--mantine-color-gray-0` → should be `#e4e4e4` per Figma Frame 74 |
| CTA band on browse surfaces | `app/browse/page.tsx`, `app/categories/page.tsx`, `app/categories/[category]/page.tsx` | "Ready to rent or ready to earn?" band must appear before `<Footer />` on all browse-surface pages |
| Listing wizard field grouping | `app/items/new/page.tsx` Pricing step | Deposit Amount + Buffer Time + Availability fields must be inside a `#e9effd` periwinkle `<Box>` per Figma |
| Alert/callout color | Any `<Alert color="blue">` in dashboard pages | Check against Figma — Pro Tip and tips are amber (`color="yellow"`), info is blue |
| Dashboard NavLink active color | `components/dashboard/DashboardLayout.tsx` | All `<NavLink>` components must have `color="urentBlue"` — active state bg `#e9effd` |
| Auth page layout | `app/sign-in/`, `app/sign-up/` | Figma shows single-column white card; code has split blue gradient — **needs Bob/Jaclyn sign-off before changing** |

**How to run this checklist:**

```bash
# Section backgrounds — find Box components without gradient where Figma expects one
grep -n 'bg="gray.0"' apps/web/src/app/page.tsx

# Footer bg
grep -n 'backgroundColor' apps/web/src/components/layout/Footer.tsx

# CTA band presence on browse pages
grep -n 'Ready to rent\|CTA band' apps/web/src/app/browse/page.tsx apps/web/src/app/categories/page.tsx "apps/web/src/app/categories/[category]/page.tsx"

# Alert colors
grep -rn 'color="blue"' apps/web/src/app/items/explore/ apps/web/src/app/dashboard/

# NavLink color
grep -n 'NavLink' apps/web/src/components/dashboard/DashboardLayout.tsx | grep -v 'color="urentBlue"'

# Listing wizard booking rules panel
grep -n 'e9effd\|periwinkle' apps/web/src/app/items/new/page.tsx
```

Add items to this table when new gaps are discovered. Remove items once they are confirmed correct in both staging and dev.

---

## Phase Execution Map

```
/figma-to-dev [--continue]
│
├── Start: detect mode, check /tmp/ftd_state.json
│
│   ┌─ CONTINUE mode ─────────────────────────────────┐
│   │  read state → go to Phase 3C                    │
│   └─────────────────────────────────────────────────┘
│
│   ┌─ FRESH mode ────────────────────────────────────┐
│   │  Phase 0  Load context (parallel)               │
│   │  Phase 1  Scan Figma annotations + frames       │
│   │  Phase 2  Dedup: BUILT / ISSUE / PR / NET_NEW   │
│   │  Phase 3  Create issues → build full queue      │
│   │           [--scan-only stops here]              │
│   └─────────────────────────────────────────────────┘
│
├── Phase 3C  Slice this_batch = queue[:max_prs]
│             is_final = len(queue[max_prs:]) == 0
│
├── Phase 4   Figma design context (MCP) — per issue
├── Phase 5   Implement code + tests — per issue
├── Phase 6   Validate: typecheck + lint + patterns — per issue
├── Phase 7   Commit + push + open PR — per issue
│             update state: mark implemented, save PR number
│
├── Phase 7F  End-of-batch decision
│   ├── remaining > 0 → PRINT "run --continue" → EXIT
│   └── remaining == 0 → FALL THROUGH to Phase 8
│
├── Phase 8   git-dev-merge (final batch only)
│             Reset dev → merge all PRs → fix TS errors → push
├── Phase 9   Render deploy (final batch only)
├── Phase 10  Visual confirmation (final batch only)
└── Phase 11  Report to issue #649 + mark state done
```
