---
name: design-sync
description: >
  Sync a Claude AI Design file (claude.ai/design or Anthropic Design API) into the codebase
  and into Figma in a roundtrip-ready structure. Covers wireframes and hi-fi mockups.
  Use when the user says "sync design", "import from claude design", "push to figma",
  "roundtrip this design", or shares an Anthropic Design API URL.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - mcp__figma__generate_figma_design
  - mcp__figma__use_figma
  - mcp__figma__get_metadata
  - mcp__figma__get_screenshot
  - AskUserQuestion
---

# Design Sync — Claude Design ↔ Code ↔ Figma Roundtrip

Sync a Claude AI Design file into:
1. **The codebase** — implement the design decisions in actual app files
2. **Figma** — one page per section, roundtrip-ready for a UI designer to edit and hand back

---

## Trigger Phrases

- `/design-sync`
- "sync design", "import from claude design", "push to figma"
- "roundtrip this design", "bring this design to life"
- User shares a URL like `https://api.anthropic.com/v1/design/...`

---

## Step 0: Gather Inputs

If not already clear from context, ask:
- The Anthropic Design API URL (format: `https://api.anthropic.com/v1/design/h/<id>?open_file=<file>`)
- The target Figma file key (if updating an existing file) — or create new
- The scope: wireframes only, or hi-fi mockups, or both
- The project directory to implement into

---

## Step 1: Download and Extract the Design Bundle

The Claude AI Design API returns a **gzip-compressed tar archive**, not raw HTML. Never try to parse the response as text directly.

```bash
# 1. Save the binary
curl -s -L "<API_URL>" -o /tmp/design-bundle.tar.gz

# 2. Check it is actually gzip (should say "gzip compressed data")
file /tmp/design-bundle.tar.gz

# 3. Extract
mkdir -p /tmp/design-extract
cd /tmp/design-extract && gunzip -c /tmp/design-bundle.tar.gz | tar -xf -

# 4. Inspect what we got
find /tmp/design-extract -type f | sort
```

**Expected bundle structure:**
```
index.html                  ← entry point with tab definitions and TABS array
styles.css                  ← all CSS (including CSS variables for brand tokens)
components/
  Phone.jsx                 ← device frame component
  IA.jsx                    ← tab bar / information architecture
  Onboarding.jsx
  Discovery.jsx
  ItemBooking.jsx
  Listing.jsx
  OtherFlows.jsx            ← Rentals, Messages, Owner, Profile sections
  <...>.jsx
chat.transcript.md          ← optional: original design chat for context
```

**If the URL has `?open_file=index.html`** — drop the query string for the tarball download; add it back only for browser preview.

---

## Step 2: Read and Understand the Design

Read at minimum:
1. `index.html` — find the `TABS` array to learn the sections and their IDs
2. `styles.css` — extract brand tokens (colors, fonts, spacing)
3. Each `components/*.jsx` file — understand variants, recommendations, and annotations

Key things to extract per section:
- **Recommended variant** (look for `tag="recommended"` or `tag="... · recommended"`)
- **Designer notes** (the `note=` prop on each `<Variant>`)
- **Flow chains** — multi-step sequences shown below the 3-variant grid
- **Brand tokens** — CSS variables like `--navy`, `--orange`, `--green` and their hex values

**CSS variable extraction:**
```bash
grep -E '^\s*--[a-z]' /tmp/design-extract/styles.css | head -30
```

---

## Step 3: Implement in the Codebase

Apply the design decisions to the actual app files. Prioritize:

1. **Navigation / tab bar** — match recommended IA variant exactly
2. **Home/Explore screen** — implement recommended discovery layout
3. **Brand tokens** — create or update a `tokens.ts` (or equivalent) with exact hex values
4. **New screens** — scaffold any screens shown in the design that don't exist yet

### React Native (Expo) Conventions
- Tab bar: `apps/mobile/app/(tabs)/_layout.tsx`
- Screens: `apps/mobile/app/(tabs)/<name>.tsx`
- Tokens: `apps/mobile/src/lib/constants/tokens.ts`
- Brand: navy `#1F3A5F`, orange `#FF8C00`, green `#2F9E44`, paper `#F5F1E8`
- Center CTA tab: 52px orange circle, routes to `/items/new`
- `tabBarStyle: { height: 84, paddingBottom: 20 }`

### Next.js Conventions
- Check `apps/web/src/` for page and component directories
- Use existing NativeWind / Tailwind classes where possible
- Don't duplicate CSS variables already in `globals.css`

### Hi-fi mockup specifics
When the design is hi-fi (not wireframes):
- Preserve exact hex colors, font sizes, border radii from the design
- Capture shadow values (`box-shadow` → RN `shadow*` props)
- Note any new Ionicons names used
- Flag any custom icons that need to be sourced

---

## Step 4: Prepare the Design for Figma Capture

The bundle's `index.html` loads React via CDN and renders each section as a tab. To capture each tab to Figma:

### 4a: Inject capture script (if not already present)

Edit `index.html` to add immediately after `<head>` opens:

```html
<script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>
<script>
  // Allow ?tab=<id> URL param to pre-select a tab for Figma capture
  const tabParam = new URLSearchParams(window.location.search).get('tab');
  if (tabParam) { try { localStorage.setItem('doyu_tab', tabParam); } catch {} }
</script>
```

**Critical**: The tab-selection script must run BEFORE the React app reads localStorage. Placement matters — put it in `<head>` before the Babel/React scripts, not at the bottom.

The localStorage key name comes from the app's `Shell` component — grep for `localStorage.getItem(` to find it.

### 4b: Serve locally

```bash
# Python (simplest)
cd /path/to/design-bundle && python3 -m http.server 8743 &
echo "Serving at http://localhost:8743/"

# Or npx serve
npx serve . -p 8743 &
```

Wait 2 seconds after starting before making any capture requests.

---

## Step 5: Capture Tabs to Figma

**IMPORTANT ORDERING RULES:**
- Capture tabs **one at a time** — never open multiple browser windows simultaneously for the same CDN-heavy React app
- The Figma capture script requires the page to fully load (React + Babel CDN can take 3–8s)
- Each capture ID is single-use — do not retry a failed capture with the same ID

### Option A: HTML-to-Figma capture (recommended for first-time capture)

Use `generate_figma_design` for the first capture of each tab. The tool opens a browser, navigates to the URL, and captures the rendered output.

For each tab in the TABS array (from `index.html`):
```
URL pattern: http://localhost:8743/?tab=<tab.id>
```

Call `generate_figma_design` sequentially — await each before starting the next.

After capture, the content lands in the Figma file. Use `use_figma` to:
1. Move the frame to the correct page
2. Rename it to match the section naming convention

### Option B: Figma Plugin API (recommended for updates / re-sync)

When the design has already been captured once, or when building programmatic frames:

Use `use_figma` with the Figma Plugin API to:
1. Find pages by name
2. Create iPhone frames (390×844) — or component frames for web
3. Build the wireframe/mockup content using primitives

```javascript
// Navigate to a specific page
const page = figma.root.children.find(p => p.name.includes('03'));
await figma.setCurrentPageAsync(page);

// Create iPhone frame
const phone = figma.createFrame();
phone.resize(390, 844);
phone.cornerRadius = 44;
phone.name = "A · [Variant Name]";
```

---

## Step 6: Organize Figma File

### Page naming convention
```
00 · Tab bar · IA
01 · Onboarding · Verification
02 · Explore · Discovery
03 · Item Detail · Booking
04 · List an Item
05 · Rentals
06 · Messages
07 · Owner Dashboard
08 · Profile · Reviews · Disputes
🎨 Design Tokens
```

Number prefix ensures alphabetical sort matches flow order. The `🎨` page always stays at the end.

### Per-page structure
Each page should contain:
```
[Section header frame]
  Title text (e.g. "Book It")
  Sub-label text (e.g. "03 · Item Detail · Booking")
  Description text

[Variants row — horizontal, 80px gap between phones]
  [Variant A frame]
    Variant label above ("A · One-screen quick-book")
    Tag badge ("minimal taps")
    Phone frame (390×844)
      Status bar area (44px)
      Content frames
    Notes text below

  [Variant B frame — recommended]
    "★ Recommended" badge
    ...

  [Variant C frame]
    ...

[Flow chain — below variants, 60px gap]
  Flow step frames with arrows between
```

### Design Tokens page structure
```
Colors section:
  Navy #1F3A5F   [80×80 swatch]
  Orange #FF8C00 [80×80 swatch]
  Green #2F9E44  [80×80 swatch]
  Paper #F5F1E8  [80×80 swatch]
  Ink #1A1A1A    [80×80 swatch]
  Muted #6B7280  [80×80 swatch]

Typography section:
  Display / 32px Bold
  Title / 24px Semi Bold
  Body / 16px Regular
  Caption / 12px Regular

Spacing section:
  xs=4  sm=8  md=16  lg=24  xl=32  xxl=48

Tab bar specs:
  Height: 84px  PaddingBottom: 20px
  Active: #1F3A5F  Inactive: #9CA3AF
  CTA: 52×52px circle, #FF8C00
```

---

## Step 7: Create or Update the Figma File

If creating a new Figma file:
```javascript
// use_figma: create file in team
const file = await figma.createFileAsync({ name: "<AppName> — v2 Wireframes" });
// Set thumbnail background
```

If updating existing: use the fileKey from the URL (`figma.com/design/<fileKey>/...`).

After all pages are populated:
1. Set the first page (00) as the current page
2. Run a `get_metadata` call to confirm all pages are present
3. Take a `get_screenshot` of page 00 as a preview

---

## Step 8: Document the Figma File

Update the project's designer onboarding or design doc with:

```markdown
## Figma File
https://www.figma.com/design/<fileKey>

Sections: [list page names]
Captured from: [Claude Design API URL]
Last synced: [date]
```

Also save the Figma file URL in memory for this project.

---

## Step 9: Reverse Direction — Figma → Code

When a designer hands back edits from Figma:

1. Use `get_design_context` with the modified node IDs to extract updated specs
2. Use `get_screenshot` to visually compare before/after
3. Apply changes to the codebase (colors, spacing, layout changes from Figma annotations)
4. Use `get_variable_defs` if the designer used Figma variables — map to project tokens

```javascript
// Figma → extract design specs
const context = await mcp__figma__get_design_context({
  fileKey: "<fileKey>",
  nodeId: "<nodeId>"
});
// context.code has React+Tailwind — adapt to project stack
```

---

## Lessons Learned (from first U-Rent DoYu v2 sync, Apr 2026)

### The Design API Returns Binary
`curl` on the Design API URL returns a **gzip tar archive**, not HTML. Always:
```bash
curl -s -L "<url>" -o /tmp/bundle.tar.gz
file /tmp/bundle.tar.gz          # confirm: gzip compressed data
gunzip -c /tmp/bundle.tar.gz | tar -xf - -C /tmp/design-extract/
```

### Tab Pre-selection via URL Param
React reads tab from localStorage. To pre-select a tab for Figma capture:
1. Inject `?tab=<id>` URL param handler in `<head>` (writes to localStorage)
2. The handler must run before React initializes — placement in `<head>` is critical
3. Find the localStorage key by grepping: `grep -n "localStorage.getItem" index.html`

### Simultaneous Browser Captures Fail
Opening 6+ browser windows simultaneously for a CDN-heavy React app (Babel + React CDN) causes all captures to hang pending. Always capture **one tab at a time**, sequentially, with the window fully loaded before the next.

### Capture IDs Are Single-Use
A Figma capture ID that times out or fails cannot be retried. Switch to `use_figma` Plugin API for subsequent pages — it's more reliable for complex multi-page builds.

### use_figma vs generate_figma_design
| Situation | Use |
|-----------|-----|
| First-time capture of a rendered web page | `generate_figma_design` |
| Updating existing page / re-sync | `use_figma` |
| Building programmatic frames from code | `use_figma` |
| Multi-page design (6+ sections) | `use_figma` for all but first 2–3 |

### Font Loading in use_figma
Always `await figma.loadFontAsync()` before setting `.characters` on text nodes:
```javascript
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" }); // Note: space, not "SemiBold"
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
```

### Hi-fi Mockup Specifics
For hi-fi (not wireframe) syncs:
- Parse CSS custom properties from `styles.css` to extract exact hex values
- Preserve `box-shadow` values — convert to Figma drop shadow effects
- Check for web fonts (`@font-face` or Google Fonts links) — load matching fonts in Figma
- Capture at 2× scale if the design uses `@media (min-resolution: 2dppx)` styles
- Use `get_screenshot` after each capture to verify fidelity before moving to next tab

### Roundtrip Readiness Checklist
- [ ] One Figma page per section (numbered, named to match tab IDs)
- [ ] Each page has 3 variant phone/screen frames side-by-side
- [ ] Recommended variant clearly labeled (badge or ★)
- [ ] Notes text preserved below each variant
- [ ] Flow chain steps below the main variant grid
- [ ] Design Tokens page with colors, typography, spacing, component specs
- [ ] Figma file URL documented in project docs
- [ ] Layer names match component names from code (enables Code Connect later)

---

## Quick Reference

```bash
# Extract design bundle
curl -s -L "$URL" -o /tmp/d.tar.gz && mkdir -p /tmp/de && gunzip -c /tmp/d.tar.gz | tar -xf - -C /tmp/de/

# Find TABS array
grep -A 20 "const TABS" /tmp/de/index.html

# Find localStorage key
grep -n "localStorage" /tmp/de/index.html

# Extract brand token colors
grep -E '^\s*--[a-z].*#' /tmp/de/styles.css

# Serve locally
(cd /tmp/de && python3 -m http.server 8743) &

# Test tab URL
open "http://localhost:8743/?tab=discovery"
```
