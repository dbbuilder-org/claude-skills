# Marp Autofit Skill

Generate professional presentations from Marp-compatible Markdown with automatic text fitting.

## Invocation

- `/slides` or `/marp` or `/marp-autofit`
- Use when asked to: create slides, make a presentation, build a deck, generate a pitch deck

## Instructions for Claude

When this skill is invoked, follow these steps:

### Mode Detection

Determine the mode based on user input:

1. **Convert Mode**: User provides an existing `.md` file
   - Example: `/slides presentation.md`
   - Action: Convert directly to PPTX

2. **Generate Mode**: User provides a topic, content, or description
   - Example: `/slides about AI best practices`
   - Action: First generate Marp markdown, then convert to PPTX

### Generate Mode: Creating Slide Content

When generating new slides, follow this structure:

```markdown
---
marp: true
theme: default
paginate: true
style: |
  section {
    background-color: #1a1a2e;
    color: #eaeaea;
  }
  h1 {
    color: #00d9ff;
  }
  h2 {
    color: #00b4cc;
  }
  strong {
    color: #00d9ff;
  }
  table {
    font-size: 0.8em;
  }
  th {
    background-color: #16213e;
    color: #00d9ff;
  }
  td {
    background-color: #0f3460;
  }
  code {
    background-color: #16213e;
    color: #00ff88;
  }
---

# Title Slide
## Subtitle

Author Name | Date

---

# Section Title

---

# Content Slide

- Bullet point 1
- Bullet point 2
- Bullet point 3

---
```

Slide Best Practices:
- Limit text: 5-7 bullet points max per slide
- Use tables for comparisons and structured data
- Separate sections with section title slides
- Include an agenda slide after the title
- End with key takeaways and a questions slide
- Avoid HTML elements (use standard Markdown only)
- Avoid bold/italic inside table cells (renders literally)
- Use blockquotes for callouts (they render correctly)
- Convert ASCII diagrams and Mermaid to tables

### Convert Mode: Processing Existing Markdown

#### Step 1: Validate Input File

```bash
test -f "<inputFile>" && echo "File exists" || echo "ERROR: File not found"
```

If the file doesn't exist, report the error and stop.

#### Step 2: Determine Output Path

If no output specified:
- Use input filename with `.pptx` extension
- Place in same directory as input file

#### Step 3: Generate Presentation

```bash
marp-autofit "<inputFile>" -o "<outputFile>" -f pptx -v
```

For PDF output:
```bash
marp-autofit "<inputFile>" -o "<outputFile>" -f pdf
```

For preview in Google Slides:
```bash
marp-autofit "<inputFile>" --preview
```

#### Step 4: Open Output

```bash
open "<outputFile>"
```

### Authentication Handling

If you receive a Google API permission error, run the authentication flow:

```bash
marp-autofit --auth --client-id "<GOOGLE_CLIENT_ID>" --client-secret "<GOOGLE_CLIENT_SECRET>"
```

This will open a browser for OAuth consent. After authentication, retry the generation.

### Report Results

After successful generation, report:
- Output file path
- Number of slides
- Any skipped elements or warnings

## Examples

| Command | Result |
|---------|--------|
| `/slides presentation.md` | Converts existing file to PPTX |
| `/slides about project planning best practices` | Generates new presentation |
| `/slides quarterly review for Q1 2026` | Generates business presentation |
| `/slides pitch deck for AI startup` | Generates startup pitch deck |
| `/slides from meeting notes in notes.md` | Converts notes to presentation |

## Presentation Templates by Type

### Business Presentation
1. Title + subtitle + date
2. Agenda/Overview
3. Background/Context
4. 3-5 content sections
5. Key Takeaways
6. Next Steps
7. Questions

### Technical Presentation
1. Title
2. Problem Statement
3. Solution Overview
4. Architecture/Design
5. Implementation Details
6. Demo/Examples
7. Lessons Learned
8. Q&A

### Pitch Deck
1. Title + tagline
2. Problem
3. Solution
4. Market Size
5. Business Model
6. Traction/Metrics
7. Team
8. Ask/Investment
9. Contact

## Features

- **PPTX Autofit**: "Shrink text on overflow" enabled on all text boxes
- **Theme Colors**: Dark theme with cyan accents (customizable in frontmatter)
- **Full Markdown**: Headings, lists, tables, code blocks, images
- **Cleanup**: Temporary Google Slides are deleted after export

## Critical Formatting Rules

These rules MUST be followed to avoid rendering issues in the generated PPTX:

### No Bold Inside Table Cells
```markdown
# WRONG - bold shows as literal **text**
| Metric | Value |
|--------|-------|
| **TTFT** | 300ms |

# CORRECT - plain text in cells
| Metric | Value |
|--------|-------|
| TTFT | 300ms |
```
Bold markdown (`**text**`) inside table cells renders literally as asterisks in the PPTX. Use plain text; table headers are already styled differently via CSS.

### No Empty Table Cells
```markdown
# WRONG - causes API error
| Layer | Role |
|-------|------|
| App | UI |
| ↓ | |      <-- empty cell breaks generation

# CORRECT - all cells have content
| Layer | Role |
|-------|------|
| App | UI |
| Gateway | Routing |
```
Empty table cells cause "The object has no text" errors during Google Slides API calls.

### No Mermaid Diagrams
Mermaid diagrams (` ```mermaid `) are NOT supported by marp-autofit. They will be skipped or cause errors. Convert diagrams to tables:

```markdown
# WRONG - mermaid not rendered
```mermaid
flowchart LR
    A --> B --> C
```

# CORRECT - use a table
| Step | From | To |
|------|------|-----|
| 1 | Request | Gateway |
| 2 | Gateway | Provider |
| 3 | Provider | Response |
```

### No ASCII Art Diagrams
ASCII box diagrams in code blocks don't render well. Convert to tables:

```markdown
# WRONG - ASCII art
```
┌─────────┐
│ Gateway │
└────┬────┘
     │
     ▼
```

# CORRECT - use a table
| Component | Function |
|-----------|----------|
| Gateway | Routes requests |
| Provider | Executes inference |
```

### No HTML Entities
Do not use HTML entities like `&quot;`, `&amp;`, `&lt;`. Use actual characters:

```markdown
# WRONG
| Field | Description |
|-------|-------------|
| Name | User&apos;s name |

# CORRECT
| Field | Description |
|-------|-------------|
| Name | User's name |
```

### Use Tables for Structured Data
Prefer tables over code blocks for any structured information:

```markdown
# WRONG - code block for data
```
Request Type    | Avg Cost
----------------|----------
Simple query    | $0.0002
```

# CORRECT - proper table
| Request Type | Avg Cost |
|--------------|----------|
| Simple query | $0.0002 |
```

## Limitations

- HTML elements (`<div class="columns">`) are skipped - use standard Markdown
- Complex CSS (gradients, shadows) not fully converted
- Requires Google Cloud authentication (auto-handled)
- Code blocks rendered as text (no syntax highlighting in PPTX)
- Mermaid diagrams not supported - use tables instead
- Bold/italic inside table cells renders as literal markdown

## Location

- Tool: `/Users/admin/.volta/bin/marp-autofit`
- OAuth Credentials: `/Users/admin/dev2/marp-autofit/.secrets/oauth-client.json`
- Token Storage: `~/.marp-autofit-token.json`
