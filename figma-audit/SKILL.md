# figma-audit

Sequential frame-by-frame Figma parity audit. One frame per invocation. Patient, complete, resumable.

Detects:
- **Phantom elements**: text, buttons, or links in dev that have no counterpart in the Figma frame
- **Missing Figma text**: content in Figma TEXT nodes that doesn't exist in dev
- **Section count mismatches**: dev renders sections Figma doesn't define

Creates a GitHub issue for every finding. Maintains a ledger so each run picks up where the last left off.

## Trigger Phrases

- `/figma-audit`
- "audit next frame", "check next figma frame"
- "figma parity audit", "run frame audit"
- `/figma-audit --frame home-hero` (specific frame)
- `/figma-audit --reset` (restart from the beginning)

## Constants

```
REPO:          dbbuilder-org/u-rent
REGISTRY:      scripts/figma-section-registry.json
LEDGER:        scripts/figma-audit-ledger.json
PLATFORM_PATH: /Users/admin/dev2/clients/u-rent/u-rent-platform
COMPARE_SCRIPT: scripts/figma-dev-compare.py
FIGMA_PAT:     vault → credentials.md → Figma → Token row (never hardcode — repo is on GitHub)
FIGMA_FILE:    BE7PLhsb0FoOtbTI9BhFoK
```

## Instructions

<command-name>figma-audit</command-name>

---

### Phase 0: Parse args + load ledger

```python
import json, os, sys

PLATFORM = '/Users/admin/dev2/clients/u-rent/u-rent-platform'
LEDGER_PATH   = f'{PLATFORM}/scripts/figma-audit-ledger.json'
REGISTRY_PATH = f'{PLATFORM}/scripts/figma-section-registry.json'

# Parse args from user message
args = '<<ARGS>>'  # filled in from invocation
specific_frame = None
reset = '--reset' in args
if '--frame' in args:
    # extract: --frame home-hero
    parts = args.split('--frame')
    if len(parts) > 1:
        specific_frame = parts[1].strip().split()[0]

# Load or initialize ledger
if reset or not os.path.exists(LEDGER_PATH):
    ledger = {'frames': {}, 'last_run': None}
else:
    ledger = json.load(open(LEDGER_PATH))

# Load registry
registry = json.load(open(REGISTRY_PATH))
```

---

### Phase 1: Build frame queue from registry

Flatten all pages + sections into an ordered audit queue. Order: sections first (most granular), then full-page frames.

```python
queue = []

for page in registry['pages']:
    # Skip in-progress designs
    if page.get('status') == 'in-progress':
        continue

    # Add child sections first (if they have figma_node)
    for section in page.get('sections', []):
        if section.get('figma_node'):
            queue.append({
                'key':         section['key'],
                'label':       section['label'],
                'figma_node':  section['figma_node'],
                'data_section': section.get('data_section'),
                'compare_key': section.get('compare_key'),
                'dev_url':     page['route'],
                'page_label':  page['label'],
            })

    # Add the full-page frame if no sections defined
    if not page.get('sections') and page.get('figma_node'):
        queue.append({
            'key':        page['key'],
            'label':      page['label'],
            'figma_node': page['figma_node'],
            'data_section': None,
            'compare_key': None,
            'dev_url':    page['route'],
            'page_label': page['label'],
        })

print(f'Total frames in registry: {len(queue)}')

# Show ledger progress
done    = [f for f in queue if ledger['frames'].get(f['key'], {}).get('status') == 'complete']
pending = [f for f in queue if ledger['frames'].get(f['key'], {}).get('status') != 'complete']
print(f'Done: {len(done)} / {len(queue)} | Pending: {len(pending)}')
```

---

### Phase 2: Select next frame

```python
# If specific frame requested, use it; otherwise take first pending
if specific_frame:
    target = next((f for f in queue if f['key'] == specific_frame), None)
    if not target:
        print(f'❌ Frame "{specific_frame}" not found in registry')
        sys.exit(1)
else:
    target = next((f for f in pending), None)
    if not target:
        print('✅ All frames audited! Run /figma-audit --reset to start over.')
        sys.exit(0)

print(f'\n🎯 Auditing: [{target["key"]}] {target["label"]}')
print(f'   Figma node: {target["figma_node"]}')
print(f'   Dev URL:    https://dev.doyu.rent{target["dev_url"]}')
```

---

### Phase 3: Fetch Figma TEXT nodes

```python
import requests, re, difflib

PAT = '<vault: credentials.md → Figma → Token>'
FILE_KEY = 'BE7PLhsb0FoOtbTI9BhFoK'

r = requests.get(
    f'https://api.figma.com/v1/files/{FILE_KEY}/nodes?ids={target["figma_node"]}&depth=8',
    headers={'X-Figma-Token': PAT},
    timeout=30
)
r.raise_for_status()
doc = r.json()['nodes'][target['figma_node']]['document']

figma_texts = []
def walk_texts(node):
    if node.get('type') == 'TEXT':
        t = node.get('characters', '').strip()
        if t and len(t) > 1:
            figma_texts.append(t)
    for child in node.get('children', []):
        walk_texts(child)

walk_texts(doc)
print(f'\n📝 Figma TEXT nodes found: {len(figma_texts)}')
for t in figma_texts[:10]:
    print(f'   "{t[:80]}"')
if len(figma_texts) > 10:
    print(f'   ... and {len(figma_texts) - 10} more')
```

---

### Phase 4: Run compare:audit for this frame

Use the compare script's `--audit --frames <compare_key>` mode if a compare_key exists.
Otherwise, run the Playwright audit inline using the figma-dev-compare.py logic.

```bash
# If compare_key exists in the frame definition:
cd /Users/admin/dev2/clients/u-rent/u-rent-platform
python3 scripts/figma-dev-compare.py \
  --audit \
  --frames <compare_key> \
  --out /tmp/figma-audit-<key>

cat /tmp/figma-audit-<key>/audit.json 2>/dev/null || echo "audit.json not generated"
```

For frames without a compare_key (most dashboard/sub-pages), use Playwright directly:

```python
# Run Playwright audit inline
import asyncio
from playwright.async_api import async_playwright

DEV_BASE = 'https://dev.doyu.rent'

async def audit_frame(target, figma_texts):
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 1440, 'height': 900})
        page = await ctx.new_page()
        
        url = f'{DEV_BASE}{target["dev_url"]}'
        await page.goto(url, wait_until='networkidle', timeout=60000)
        await page.wait_for_timeout(2000)  # let React hydrate
        
        # Determine section selector
        if target.get('data_section'):
            selector = f'[data-section="{target["data_section"]}"]'
        else:
            selector = 'main, body'
        
        # Extract dev text
        dev_texts = await page.evaluate(f'''(sel) => {{
            const root = document.querySelector(sel) || document.body;
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const results = new Set();
            let node;
            while (node = walker.nextNode()) {{
                const t = node.textContent.trim();
                if (t.length > 2) results.add(t);
            }}
            return [...results];
        }}''', selector)
        
        # Extract buttons and links
        btns  = await page.locator(f'{selector} button').all_inner_texts()
        links = await page.locator(f'{selector} a[href]').all_inner_texts()
        
        await browser.close()
        return dev_texts, [b.strip() for b in btns if b.strip()], [l.strip() for l in links if l.strip()]

dev_texts, dev_btns, dev_links = asyncio.run(audit_frame(target, figma_texts))
```

---

### Phase 5: Compute phantom elements

```python
SKIP_RE = re.compile(r'^\$?[\d.,]+(/\w+)?$|^\d+$|^.$|^..$')

def normalize(t):
    return ' '.join(t.lower().split())

def fuzzy_match(needle, haystack, threshold=0.65):
    n = normalize(needle)
    if len(n) < 3 or SKIP_RE.match(n):
        return True
    for h in haystack:
        ratio = difflib.SequenceMatcher(None, n, normalize(h)).ratio()
        if ratio >= threshold:
            return True
        if len(n) >= 6 and (n in normalize(h) or normalize(h) in n):
            return True
    return False

phantom_text    = [t for t in dev_texts if not fuzzy_match(t, figma_texts)]
phantom_buttons = [b for b in dev_btns  if not fuzzy_match(b, figma_texts)]
phantom_links   = [lnk for lnk in dev_links if not fuzzy_match(lnk, figma_texts)]

# Also find Figma text missing from dev (reverse direction)
missing_from_dev = [t for t in figma_texts if len(t) > 5 and not fuzzy_match(t, dev_texts)]

print(f'\n🔴 Phantom text (dev only, not in Figma): {len(phantom_text)}')
for t in phantom_text[:10]:
    print(f'   → "{t[:80]}"')

print(f'🔴 Phantom buttons: {len(phantom_buttons)}')
for b in phantom_buttons[:5]:
    print(f'   → "{b}"')

print(f'🔴 Phantom links: {len(phantom_links)}')
for lnk in phantom_links[:5]:
    print(f'   → "{lnk}"')

print(f'\n🟡 Figma text missing from dev: {len(missing_from_dev)}')
for t in missing_from_dev[:5]:
    print(f'   → "{t[:80]}"')
```

---

### Phase 6: Create GitHub issues for findings

Create one issue per category of finding. Skip if zero findings.

```bash
# Phantom elements issue (if any)
gh issue create \
  --repo dbbuilder-org/u-rent \
  --title "fix(figma-parity): [FRAME_KEY] phantom elements — remove from dev" \
  --label "figma-parity,needs-fix" \
  --body "## Figma Parity Audit — [FRAME_LABEL]

**Frame:** [FRAME_KEY] ([FIGMA_NODE])
**Dev route:** https://dev.doyu.rent[DEV_URL]
**Detected:** [DATE]

### Phantom Elements (in dev, not in Figma)

These elements render in dev but have no counterpart in the Figma design. They should be removed or confirmed with Jaclyn.

**Phantom text:**
$(for each phantom_text item)
- \`[text]\`

**Phantom buttons:**
$(for each phantom_button)
- \`[button label]\`

**Phantom links:**
$(for each phantom_link)
- \`[link text]\`

### How to Fix

1. Find the JSX that renders each phantom element
2. Either remove it, or confirm with Jaclyn that it should be added to the Figma design
3. Run \`npm run compare:audit --frames [FRAME_KEY]\` to verify it's gone

> Detected by \`/figma-audit\` skill — [DATE]"
```

```bash
# Missing Figma content issue (if any)
gh issue create \
  --repo dbbuilder-org/u-rent \
  --title "fix(figma-parity): [FRAME_KEY] — Figma content missing from dev" \
  --label "figma-parity,needs-fix" \
  --body "## Figma Content Missing From Dev — [FRAME_LABEL]

**Frame:** [FRAME_KEY] ([FIGMA_NODE])
**Detected:** [DATE]

### Text in Figma not rendered in dev:
$(for each missing_from_dev item)
- \`[text]\`

> Detected by \`/figma-audit\` skill — [DATE]"
```

---

### Phase 7: Update ledger

```python
ledger['frames'][target['key']] = {
    'status':           'complete',
    'run_date':         datetime.now().isoformat()[:10],
    'figma_node':       target['figma_node'],
    'label':            target['label'],
    'phantom_text':     phantom_text,
    'phantom_buttons':  phantom_buttons,
    'phantom_links':    phantom_links,
    'missing_from_dev': missing_from_dev,
    'issues_created':   [],  # fill with issue numbers from Phase 6
}
ledger['last_run'] = datetime.now().isoformat()[:10]

import json
json.dump(ledger, open(LEDGER_PATH, 'w'), indent=2)
print(f'\n✅ Ledger updated: {LEDGER_PATH}')
```

---

### Phase 8: Report progress

```python
done    = [f for f in queue if ledger['frames'].get(f['key'], {}).get('status') == 'complete']
pending = [f for f in queue if ledger['frames'].get(f['key'], {}).get('status') != 'complete']
total   = len(queue)

print(f"""
╔══════════════════════════════════════════════════════════════╗
  Figma Audit Progress: {len(done)}/{total} frames complete

  Just audited: [{target['key']}] {target['label']}
  Phantoms:     {len(phantom_text)} text | {len(phantom_buttons)} buttons | {len(phantom_links)} links
  Missing:      {len(missing_from_dev)} Figma items not in dev

  Next frame: {pending[0]['key'] + ' — ' + pending[0]['label'] if pending else 'ALL DONE!'}

  Run /figma-audit again to continue.
  Run /figma-audit --reset to start over.
╚══════════════════════════════════════════════════════════════╝
""")
```

---

## Ledger Schema

```json
{
  "last_run": "2026-05-19",
  "frames": {
    "hero": {
      "status": "complete",
      "run_date": "2026-05-19",
      "figma_node": "913:11801",
      "label": "Hero",
      "phantom_text": ["Popular:", "Use my location"],
      "phantom_buttons": ["Browse Items", "List an Item"],
      "phantom_links": [],
      "missing_from_dev": [],
      "issues_created": [1924, 1925]
    }
  }
}
```

---

## Sequential Agent Plan (Full Audit)

To audit all 34 RTD frames sequentially with no context window pressure:

**Option A — Manual loop (recommended):**
```
/figma-audit          # audits frame 1, shows "Next: frame 2"
/figma-audit          # audits frame 2
... (repeat until "ALL DONE!")
```

**Option B — Automated via /loop:**
```
/loop /figma-audit
```
Each loop iteration: one frame, one or two issues created, ledger updated. The loop runs until `pending` is empty, then stops. This processes all ~30 pending frames automatically, one at a time, creating issues as it goes.

**Option C — Specific frame:**
```
/figma-audit --frame home-hero
/figma-audit --frame browse-full
```

---

## Rules

1. **One frame per invocation** — Never process more than one frame per run. Sequential is the point.
2. **Always read current ledger** — Do not re-audit already-complete frames unless `--reset` is passed.
3. **Create issues with `gh issue create`** — Use the exact label `figma-parity` so the team can filter.
4. **Skip in-progress Figma frames** — `status: "in-progress"` in the registry means Jaclyn hasn't finalized the design. Do not audit.
5. **Fuzzy match, not exact** — Text matching uses difflib ratio ≥ 0.65. Don't flag near-matches (prices, dates, counts).
6. **Missing from dev = separate issue from phantom** — Two distinct issue types, two separate GitHub issues.
7. **Confirm with Jaclyn before removing any phantom** — Some phantom elements may be intentional additions not yet in Figma. The issue title says "remove or confirm with Jaclyn."
8. **Update MEMORY.md pointer** after the first successful run — add audit ledger path.

---

## What This Catches

| Issue Type | Detected | Example |
|---|---|---|
| Phantom text (dev only) | ✅ | "Popular:", "Use my location" |
| Phantom buttons | ✅ | "Browse Items", "List an Item" |
| Phantom links | ✅ | "View All Categories →" |
| Figma text missing in dev | ✅ | Missing subheading |
| Visual design differences | ❌ | Color, layout — use compare screenshot |
| CSS layout (stacked vs horizontal) | ❌ | Use compare screenshot |
| Wrong Figma ID in compare script | ❌ | Update figma-section-registry.json |

---

## When to Run

- After any new page or section is implemented
- Before every PR that touches a page's JSX structure
- Weekly audit sweep: `/loop /figma-audit` while doing other work
- After Jaclyn delivers new designs (run `--reset` for affected pages only)
