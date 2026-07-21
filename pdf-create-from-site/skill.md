---
name: pdf-create-from-site
description: Generate a polished multi-page marketing/overview PDF from a landing page or product site using @react-pdf/renderer. Reads the site's copy, structure, and brand, then produces a standalone PDF. Use when the user says "create a PDF from the site", "generate a marketing PDF", "make a PDF overview", "pdf from landing page", or "create a product PDF".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# pdf-create-from-site

Produces a professional multi-page marketing PDF for a product by reading its landing page and brand assets, then generating a `scripts/generate-marketing-pdf.mjs` script that renders the PDF locally with `@react-pdf/renderer`.

<command-name>pdf-create-from-site</command-name>

---

## Inputs (gather from project context)

| Input | Source |
|-------|--------|
| `PRODUCT_NAME` | Landing page / project context |
| `TAGLINE` | Hero headline on landing page |
| `DESCRIPTION` | Product description paragraph |
| `FEATURES` | Feature list or "how it works" steps |
| `PRICING` | Pricing tiers if present |
| `CTA_URL` | Primary call-to-action URL |
| `BRAND_COLORS` | Tailwind config or globals.css |
| `LOGO_PATH` | Absolute path to logo PNG (128px preferred) |
| `OUT_FILE` | Output PDF filename — default: `<product>-marketing.pdf` in project root |

Read the landing page (`app/page.tsx` or `pages/index.tsx` or `docs/index.html`) to extract all copy. Also check `tailwind.config.*` for brand colors.

---

## PDF Structure (7 pages standard)

| Page | Content |
|------|---------|
| 1 | Cover — logo, product name, tagline, 3–4 stat pills, URL |
| 2 | Problem/opportunity — "before" state, pain points |
| 3 | Solution overview — what the product does, key value props |
| 4 | How it works — numbered steps with descriptions |
| 5 | What you get — deliverables / outputs |
| 6 | Pricing — tiers with price, name, description |
| 7 | Call to action — closing pitch, CTA button, contact |

Adjust page count to match the product's actual content — don't pad or invent sections.

---

## Critical rendering rules for @react-pdf/renderer

### Fonts
**ALWAYS use built-in Helvetica.** Never fetch from Google Fonts — WOFF/WOFF2 URLs fail at runtime.

```js
import { Font } from "@react-pdf/renderer";
Font.registerHyphenationCallback((w) => [w]); // disable hyphenation
// No Font.register() calls — use Helvetica built-in only
```

In styles, use: `fontFamily: "Helvetica"`, `fontFamily: "Helvetica-Bold"`, `fontFamily: "Helvetica-Oblique"`

### Emojis
**NEVER use emojis in PDF text.** Helvetica cannot render them — they appear as `=B`, `=📐`, `=🚀` or garbage characters. Replace all emojis with plain text labels:
- ❌ → "Without"
- ✓ → "With"  
- 📄 → "PDF"
- ✨ → (remove entirely)
- 🚀 → "Launch" or remove

### Layout
- Use `flexDirection: "row"` + `flexWrap: "wrap"` for grid layouts
- Use `width: "31.5%"` (percentage) for 3-column cards — NOT `flex: 1`, which clips text
- Use `<View>` spacers instead of `margin` on `<Text>` for reliable vertical spacing
- Page dimensions: A4 (`{ size: "A4" }`) — 595pt × 842pt

### Images (logo)
```js
import { Image } from "@react-pdf/renderer";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PNG = join(__dirname, "../public/logo-128.png");

// In JSX:
React.createElement(Image, { src: LOGO_PNG, style: { width: 56, height: 56, borderRadius: 14 } })
```

Always use **absolute path** via `__dirname` — relative paths break when script runs from project root.

---

## Script template

```js
/**
 * Generates the [PRODUCT] marketing PDF.
 * Run: node scripts/generate-marketing-pdf.mjs
 * Output: [product]-marketing.pdf
 */
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import {
  Document, Page, Text, View, StyleSheet, Font, Link, Image,
  Svg, Rect, Circle, Path, G,
} from "@react-pdf/renderer";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PNG = join(__dirname, "../public/logo-128.png");

Font.registerHyphenationCallback((w) => [w]);

const BRAND   = "#6366f1";   // adjust to actual brand color
const PURPLE  = "#8b5cf6";
const CYAN    = "#06b6d4";
const DARK    = "#0f172a";

const s = StyleSheet.create({
  page:        { fontFamily: "Helvetica", backgroundColor: "#fff" },
  // ... (full styles)
});

function MarketingPDF() {
  return React.createElement(Document, { title: "[PRODUCT] — Overview" },
    // Page 1: Cover
    // Page 2–7: ...
  );
}

const buffer = await renderToBuffer(React.createElement(MarketingPDF));
writeFileSync("[product]-marketing.pdf", buffer);
console.log("✓ Written: [product]-marketing.pdf");
```

---

## Execution

After writing the script:

```bash
cd /path/to/project && node scripts/generate-marketing-pdf.mjs
```

Then open the PDF to verify rendering:
```bash
open [product]-marketing.pdf
```

Report the output path and file size. If there are rendering errors, fix them iteratively — common issues:
- `Cannot read properties of undefined` → missing React import or wrong component name
- Font rendering garbage → emoji in text — strip all emojis
- Text overflow / clipping → switch from `flex:1` to percentage `width` on cards

---

## Notes

- Install dependency if missing: `npm install @react-pdf/renderer` (check package.json first)
- The script is a local Node.js ESM module — use `.mjs` extension and `import` syntax
- `renderToBuffer` returns a Promise — must `await` at top level (ESM scripts support top-level await)
- For the web API route (`/api/pdf`), `renderToBuffer` may need a `@ts-expect-error` if TypeScript complains about the return type
