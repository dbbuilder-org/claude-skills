---
name: marp-generator
description: Generate professional presentations from Markdown using Marp CLI and marp-autofit. Use when asked to create slide decks, pitch decks, presentations, marketing materials, or convert markdown to PDF/PowerPoint/HTML slides. Supports custom themes, dark/light mode, callout boxes, speaker notes, and multiple output formats including editable PPTX via Google Slides.
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# Marp Presentation Generator

Generate professional presentations from Markdown files using Marp CLI and marp-autofit.

## Two Output Pipelines

### 1. Marp CLI (HTML, PDF, image-based PPTX)
Best for: HTML presentations, PDFs, pixel-perfect CSS rendering.

```bash
# HTML presentation (preserves all CSS)
marp input.md -o output.html --no-stdin

# PDF presentation
marp input.md -o output.pdf --no-stdin

# Image-based PPTX (not editable text)
marp input.md -o output.pptx --no-stdin
```

### 2. marp-autofit (Editable PPTX via Google Slides)
Best for: Editable PowerPoint files with native auto-fit text. Converts Marp Markdown to Google Slides API, exports to PPTX.

**Location:** `~/dev2/marp-autofit/`

```bash
# Light mode PPTX
node ~/dev2/marp-autofit/dist/index.js input.md -o output.pptx --format pptx --mode light -v

# Dark mode PPTX
node ~/dev2/marp-autofit/dist/index.js input.md -o output.pptx --format pptx --mode dark -v

# Both dark and light (produces -dark.pptx and -light.pptx)
node ~/dev2/marp-autofit/dist/index.js input.md -o output.pptx --format pptx --mode both -v

# PDF via Google Slides
node ~/dev2/marp-autofit/dist/index.js input.md -o output.pdf --format pdf -v

# Preview in Google Slides (opens browser)
node ~/dev2/marp-autofit/dist/index.js input.md --preview -v
```

#### marp-autofit CLI Flags

| Flag | Description |
|------|-------------|
| `-o, --output <file>` | Output file path |
| `-f, --format <format>` | Output format: `pdf` or `pptx` (default: pdf) |
| `-m, --mode <mode>` | Theme mode: `dark`, `light`, or `both` (default: light) |
| `--keep-slides` | Keep temporary Google Slides after export |
| `--title <title>` | Override presentation title |
| `--preview` | Create in Google Slides and open browser |
| `-v, --verbose` | Verbose output |
| `--auth` | Run OAuth2 authentication flow |

#### marp-autofit Features

- **Native editable text** in PPTX (not images)
- **Auto-fit text** shrinks text on overflow in all text boxes
- **Dark/light mode** with full theme-aware colors
- **Callout boxes** from `<div class="highlight|warn|crit|highlight-green">` rendered with colored backgrounds and borders
- **Vertical compression** automatically scales slides that overflow
- **Table styling** with alternating row backgrounds, content-aware row heights
- **Bold/italic/strikethrough** properly rendered (no raw `**` markers)
- **Two-col divs** content extracted and rendered sequentially

#### marp-autofit Limitations

- Images are placeholders only (no image upload to Google Slides)
- CSS gradients, `::after` pseudo-elements, and complex CSS don't transfer
- Logo watermarks must be added manually in PowerPoint after export
- Requires Google OAuth2 authentication (token at `~/dev2/marp-autofit/.marp-autofit-token.json`)

#### Dark Mode Theme Colors

| Element | Dark | Light |
|---------|------|-------|
| Background | #0f1724 | #FFFFFF |
| Text | #cbd5e0 | #1F2937 |
| Headings | #63b3ed | #1a365d |
| Lead/Divider bg | #1a2744 | #1a365d |
| Table header bg | #1e3a5f | #1a365d |
| Alt row bg | #1a2236 | #F3F4F6 |

#### Callout Box Types

Use HTML divs in Marp markdown to create styled callout boxes:

```markdown
<div class="highlight">
**Info callout** with blue border and background.
</div>

<div class="warn">
**Warning callout** with yellow border and background.
</div>

<div class="crit">
**Critical callout** with red border and background.
</div>

<div class="highlight-green">
**Success callout** with green border and background.
</div>
```

## Marp Markdown Format

Every Marp presentation starts with YAML frontmatter:

```markdown
---
marp: true
theme: default
paginate: true
backgroundColor: #ffffff
---

# First Slide Title

Content for slide 1

---

# Second Slide Title

- Bullet points
- More content

---

<!-- _class: title -->

# Special Slide

With custom class applied
```

## Key Features

### Slide Separators
Use `---` (three dashes) to separate slides.

### Frontmatter Options
| Option | Description |
|--------|-------------|
| `marp: true` | **Required** - Enable Marp processing |
| `theme: default` | Theme: default, gaia, uncover, or custom |
| `paginate: true` | Show page numbers |
| `header: 'Text'` | Header on all slides |
| `footer: 'Text'` | Footer on all slides |
| `backgroundColor` | Background color |
| `color` | Text color |

### Custom Styling
Add CSS in the frontmatter:
```yaml
style: |
  section {
    font-family: 'Inter', sans-serif;
  }
  h1 {
    color: #0ea5e9;
  }
  .accent {
    color: #6366f1;
  }
```

### Slide-Level Directives
Apply settings to individual slides:
```markdown
---
<!-- _class: title -->
<!-- _backgroundColor: #0c4a6e -->
<!-- _color: white -->

# Dark Slide
```

### Supported Slide Classes
| Class | Effect |
|-------|--------|
| `title` | Centered title slide with lead background |
| `lead` | Same as title (alias) |
| `divider` | Section divider with colored background |
| `optionA` | Blue accent bar (custom) |
| `optionB` | Green accent bar (custom) |
| `compare` | Purple accent bar (custom) |
| `timeline` | Gold accent bar (custom) |

### Speaker Notes
```markdown
# Slide Title

Content visible to audience

<!--
Speaker notes go here.
Only visible in presenter view.
-->
```

### Images
```markdown
![width:500px](image.png)
![bg](background.jpg)
![bg right:40%](side-image.png)
```

### Tables
```markdown
| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |
```

### Code Blocks
````markdown
```javascript
const hello = "world";
```
````

### Two-Column Layout
```markdown
<div class="two-col">
<div>

## Left Column
- Item 1
- Item 2

</div>
<div>

## Right Column
- Item 3
- Item 4

</div>
</div>
```

## Built-in Themes

### `default`
Clean, minimal design with white background.

### `gaia`
Bold design with colored sections.

### `uncover`
Modern design with subtle animations.

## Recommended Workflow

1. **Write** - Create presentation in Marp Markdown
2. **Preview** - Use `marp -s presentation.md` for live HTML preview
3. **HTML** - Export with `marp input.md -o output.html --no-stdin` for web sharing
4. **Editable PPTX** - Export with marp-autofit for editable PowerPoint:
   ```bash
   node ~/dev2/marp-autofit/dist/index.js input.md -o output.pptx --format pptx --mode both -v
   ```
5. **PDF** - Export with `marp input.md -o output.pdf --no-stdin` for print

## Marp CLI Output Flags

| Flag | Description |
|------|-------------|
| `--pdf` | Generate PDF |
| `--pptx` | Generate PowerPoint (image-based) |
| `--html` | Generate HTML |
| `--images png` | Generate PNG per slide |
| `--images jpeg` | Generate JPEG per slide |
| `--allow-local-files` | Allow local file references |
| `--no-stdin` | Don't wait for stdin (use when chaining commands) |
| `-w, --watch` | Watch for changes |
| `-s, --server` | Start preview server |

## Troubleshooting

**PDF/PPTX generation fails (Marp CLI):**
- Marp requires Chrome/Chromium for PDF/PPTX
- Install with: `npx playwright install chromium`

**marp-autofit auth expired:**
- Re-authenticate: `node ~/dev2/marp-autofit/dist/index.js --auth --client-id ID --client-secret SECRET`
- Token stored at `~/dev2/marp-autofit/.marp-autofit-token.json`

**Fonts not rendering:**
- Use web-safe fonts or embed in CSS via `@import` in style block
- marp-autofit uses Inter font family by default

**Images not showing (Marp CLI):**
- Use `--allow-local-files` flag
- Use absolute paths or URLs

**Images not showing (marp-autofit):**
- marp-autofit does not upload images — add manually in PowerPoint after export
