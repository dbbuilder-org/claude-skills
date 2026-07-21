# figma-measure

Extracts exact CSS measurements and content from a Figma frame before coding begins.
Eliminates the "eyeball the screenshot" pattern that causes correction PRs.

## Trigger Phrases

- `/figma-measure`
- "measure the figma frame", "get figma specs", "pull figma dimensions"
- "what are the exact values for this frame"
- "measure before coding"

## Arguments

- `<node-id>` — Figma node ID to measure (e.g., `913:11799` or `913-11799`)
- `--depth N` — how many child levels to extract (default: 4)
- `--content` — also scan TEXT nodes and cross-reference against `content/*.ts` files
- `--children` — print all child dimensions (for strips, grids, ordered sections)

## Instructions

<command-name>figma-measure</command-name>

---

### Step 1: Normalize node ID

Figma node IDs may arrive as `913:11799` (API format) or `913-11799` (URL format).
Normalize to `913:11799` for the API call.

```python
node_id_raw = "<node-id from user>"
node_id = node_id_raw.replace('-', ':', 1) if node_id_raw.count('-') == 1 and ':' not in node_id_raw else node_id_raw
```

---

### Step 2: Fetch node data from Figma API

```python
import os, requests, json

PAT      = '<vault: credentials.md → Figma → Token>'
FILE_KEY = 'BE7PLhsb0FoOtbTI9BhFoK'
DEPTH    = 4  # override with --depth

r = requests.get(
    f'https://api.figma.com/v1/files/{FILE_KEY}/nodes?ids={node_id}&depth={DEPTH}',
    headers={'X-Figma-Token': PAT},
    timeout=20
)
r.raise_for_status()
doc = r.json()['nodes'][node_id]['document']
```

---

### Step 3: Extract and print the spec sheet

```python
def print_spec(node, depth=0, parent_layout=None):
    indent = "  " * depth
    name = node.get('name', '')
    typ  = node.get('type', '')

    # ── Layout properties ──────────────────────────────────────────────────────
    pad_t = node.get('paddingTop')
    pad_r = node.get('paddingRight')
    pad_b = node.get('paddingBottom')
    pad_l = node.get('paddingLeft')
    gap   = node.get('itemSpacing')
    lm    = node.get('layoutMode', '')         # HORIZONTAL / VERTICAL / NONE
    align = node.get('primaryAxisAlignItems')  # SPACE_BETWEEN / CENTER / etc.

    # ── Size ──────────────────────────────────────────────────────────────────
    bb = node.get('absoluteBoundingBox', {})
    w  = round(bb.get('width',  0))
    h  = round(bb.get('height', 0))

    # ── Fills / colors ─────────────────────────────────────────────────────────
    fills = node.get('fills', [])
    color = None
    for f in fills:
        if f.get('type') == 'SOLID':
            c = f.get('color', {})
            r_val = round(c.get('r', 0) * 255)
            g_val = round(c.get('g', 0) * 255)
            b_val = round(c.get('b', 0) * 255)
            color = f'rgb({r_val},{g_val},{b_val})'
            break

    # ── Border radius ──────────────────────────────────────────────────────────
    radii = node.get('rectangleCornerRadii', [])
    radius = node.get('cornerRadius')

    # ── Text content ──────────────────────────────────────────────────────────
    chars = node.get('characters', '') if typ == 'TEXT' else ''
    font_size = node.get('style', {}).get('fontSize') if typ == 'TEXT' else None

    # ── Print ─────────────────────────────────────────────────────────────────
    has_data = bool(w or h or pad_t is not None or gap is not None or chars or color)
    if not has_data and depth > 0:
        pass  # skip empty intermediate nodes
    else:
        print(f"{indent}[{typ}] {name}")
        if w and h:
            print(f"{indent}  size:    {w}×{h}px")
        if pad_t is not None:
            if pad_t == pad_r == pad_b == pad_l:
                print(f"{indent}  padding: {pad_t}px  → p={{{pad_t}}}")
            else:
                print(f"{indent}  padding: {pad_t}px {pad_r}px {pad_b}px {pad_l}px")
        if gap is not None:
            direction = 'VERTICAL' if lm == 'VERTICAL' else 'HORIZONTAL'
            print(f"{indent}  gap:     {gap}px  ({direction})  → gap={{{gap}}}")
        if color:
            print(f"{indent}  fill:    {color}")
        if radius:
            print(f"{indent}  radius:  {radius}px")
        if chars:
            preview = chars.replace('\n', ' ')[:80]
            print(f"{indent}  text:    \"{preview}\"")
            if font_size:
                print(f"{indent}  font:    {font_size}px")

    # ── Recurse into children ──────────────────────────────────────────────────
    for child in node.get('children', []):
        print_spec(child, depth + 1, lm)

print_spec(doc)
```

---

### Step 4: Section order (if --children or frame has multiple top-level children)

When the frame is a page-level section container, print children in y-axis order
to show the correct JSX section order:

```python
def print_section_order(node):
    children = node.get('children', [])
    ordered = sorted(children, key=lambda c: c.get('absoluteBoundingBox', {}).get('y', 0))
    print("\n── Section order (top to bottom) ──────────────────────────────")
    for i, child in enumerate(ordered):
        bb = child.get('absoluteBoundingBox', {})
        y  = round(bb.get('y', 0))
        h  = round(bb.get('height', 0))
        print(f"  {i+1}. [{child.get('type','?')}] {child.get('name','?')}  y={y}  h={h}")
    print()

if doc.get('type') in ('FRAME', 'COMPONENT') and len(doc.get('children', [])) > 3:
    print_section_order(doc)
```

---

### Step 5: Content audit (if --content)

Cross-reference TEXT nodes against `content/*.ts` files in the project:

```python
import subprocess, re

def collect_text_nodes(node, results=None):
    if results is None: results = []
    if node.get('type') == 'TEXT':
        chars = node.get('characters', '').strip()
        if chars and len(chars) > 5:
            results.append(chars)
    for child in node.get('children', []):
        collect_text_nodes(child, results)
    return results

figma_texts = collect_text_nodes(doc)

# Find all string values in content/*.ts
content_dir = 'apps/web/src/content'
result = subprocess.run(
    ['grep', '-rn', '--include=*.ts', '-E', '"[^"]{5,}"', content_dir],
    capture_output=True, text=True
)
content_strings = re.findall(r'"([^"]{5,})"', result.stdout)

print("\n── Content audit ──────────────────────────────────────────────────")
print(f"Figma TEXT nodes: {len(figma_texts)}")
print(f"content/*.ts strings: {len(content_strings)}")
print()

# Flag content strings not found in any Figma TEXT node
phantom = []
for cs in content_strings:
    if not any(cs[:40] in ft for ft in figma_texts):
        phantom.append(cs)

if phantom:
    print("⚠️  PHANTOM keys (in code but not in Figma — verify or remove):")
    for p in phantom[:15]:
        print(f"  - \"{p[:70]}\"")
else:
    print("✅ All content strings have matching Figma TEXT nodes")
```

---

### Step 6: Output the CSS translation table

After the spec sheet, print a quick-reference CSS table:

```
── CSS translation ───────────────────────────────────────────────
  Figma property          → Mantine / CSS
  padding: 20px           → p={20}
  itemSpacing: 64         → <Stack gap={64}> or gap="xl"
  cornerRadius: 8         → radius="md"
  fontSize: 16            → size="md"   (Mantine rem scale)
  fontSize: 48            → size="3rem" (non-token sizes use rem string)
  fill: rgb(37,99,235)    → color="urentBlue" (check theme)
  layoutMode: VERTICAL    → <Stack> (not <Group>)
  layoutMode: HORIZONTAL  → <Group> (not <Stack>)
──────────────────────────────────────────────────────────────────
```

---

## What This Replaces

Before this skill existed, every measurement came from eyeballing a screenshot:
- "That padding looks like 24px" → was 20px
- "Those sections are in order: How It Works → Garage Scanner" → they were reversed
- "The strip has about 8 items" → Figma had 7 specific items with specific heights

After: every value in the code traces back to a specific Figma API field.

---

## When to Use

**Always run before coding a new component or section.** Even if you think you know the values.

Run with `--content` whenever adding or modifying content keys in `content/*.ts`.

Run with `--children` for sections that contain ordered child frames (page sections,
wizard steps, hero strips) to get the correct JSX order.

---

## Example Output

```
/figma-measure 913:11799 --children --content

[FRAME] Home
  size: 1440×4800px

── Section order (top to bottom) ──────────────────────────────
  1. [FRAME] Hero          y=0    h=680
  2. [FRAME] Trust Band    y=680  h=380
  3. [FRAME] Categories    y=1060 h=480
  4. [FRAME] Featured      y=1540 h=600
  5. [FRAME] Garage Scanner y=2140 h=520   ← Garage BEFORE How It Works
  6. [FRAME] How DOYU Works y=2660 h=520
  7. [FRAME] CTA Band      y=3180 h=320

  [FRAME] Trust Card (first)
    size: 420×240px
    padding: 20px  → p={20}
    gap:     64px  (VERTICAL)  → <Stack gap={64}>
    [INSTANCE] ShieldCheck icon
      size: 44×44px
    [TEXT] Damage Protection
      text: "Damage Protection"
      font: 20px
    [TEXT] body
      text: "Every rental includes up to $2,500..."
      font: 14px

── Content audit ──────────────────────────────────────────────────
⚠️  PHANTOM keys (in code but not in Figma):
  - "Popular:"
  - "Tools, Photography, Outdoor"
```

The phantom keys would be caught BEFORE any code is committed.
