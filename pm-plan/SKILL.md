---
name: pm-plan
description: Write a PM-level product and engineering plan for a feature or project. Well-formatted for readability, concept-driven with all code and schema in numbered addenda, and includes a Glossary for technical jargon. Use when planning a significant feature, documenting an in-progress build, or communicating technical scope to a mixed audience.
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
  - Edit
  - WebSearch
---

# /pm-plan — Write a PM-Level Feature Plan

Produce a complete, well-formatted product and engineering plan for a feature or project. The plan is readable by both technical and non-technical stakeholders. All code, schema, and implementation detail lives in numbered Addenda — the main body stays conceptual and narrative.

## Trigger Phrases

- `/pm-plan` — write a plan for the current feature being discussed
- `write a PM plan for [feature]`
- `document this as a PM plan`
- `write the plan for this` (when a feature has just been built or designed)
- `PM level plan`

---

## Output

One `.md` file written to `docs/` in the current project directory, named:
```
docs/[FEATURE-NAME]-PLAN.md
```

If the project has no `docs/` directory, create it.

---

## Document Structure

Follow this exact structure in order. Do not skip sections. Mark any section `N/A — [reason]` if genuinely not applicable rather than omitting it.

```markdown
# [Feature Name] — Product & Engineering Plan

**Status:** [Draft | In Development | Ready for Review | Shipped]
**Target:** [Branch/Environment]
**Date:** [YYYY-MM-DD]

---

## Executive Summary
3–5 sentences. What is this, why does it exist, and what does it do for the user.
No technical jargon. A founder or investor should understand this paragraph.

---

## Problem Statement
What pain, gap, or opportunity does this address? Be specific about what currently
happens without this feature and why that matters. Quantify where possible.

---

## Product Vision
What is the user experience? What does this feel like to use? What is the "aha" moment?
Write this in present tense as if the feature already exists.

---

## [Feature Modules / Components]
One H3 section per major sub-feature, persona, module, or workflow.
Each section:
- Name + one-line purpose
- What data or context it uses
- What makes it valuable or unique
- One "novel angle" — the non-obvious thing this enables

---

## How It Works — Technical Concepts
Explain the architecture conceptually. NO code here — reference Addenda for implementation.
Use these subsections as applicable:
1. Data model / storage approach
2. External integrations (APIs, services)
3. Access control / permissions
4. Caching and performance strategy
5. LLM / AI system design (if applicable)
6. Extensibility / how to add more later

---

## User Experience
- Navigation: where does it live, how do users get there
- Layout: desktop vs. mobile
- Key interactions: the 3–5 things a user actually does
- Empty states and loading states
- Error states

---

## Data Flow
A numbered prose walkthrough of what happens when the user takes the primary action.
Format:
```
User action →
  1. What the client does
  2. What the API does
  3. What the database/AI does
  4. What the user sees
```

---

## Infrastructure Requirements
- New environment variables (name, purpose, where to add)
- New services or third-party accounts required
- Database changes summary (non-technical: "one new table for X")
- Migration safety statement

---

## Rollout Plan
Table: Phase | What | When | Owner

---

## Success Metrics
3–5 measurable outcomes that indicate the feature is working.
Tie each to something observable (usage rate, session depth, conversion, etc.)

---

## Open Questions
Numbered list of unresolved decisions, with enough context to make the decision later.
Flag whether each is blocking launch or post-launch.

---

## Files Created / Modified
Table: File | Status (Created/Modified) | Description

---

## Glossary
Alphabetical. Every technical term, acronym, or jargon word used in the document.
Format:
**Term** — Plain English definition. Include why it matters to this feature.

---

## Addendum A — [First technical topic]
Code, schema, config, query, API contract — whatever belongs here.

## Addendum B — [Second technical topic]
...

## Addendum N — [Nth technical topic]
...
```

---

## Writing Rules

### Voice and Tone
- **Executive Summary and Problem Statement**: Non-technical. A marketing lead should understand it without asking questions.
- **Product Vision and UX**: User-centric. Written from the user's perspective, not the engineering perspective.
- **Technical Concepts**: Conceptual but precise. Explain *what* and *why*, not *how*. The reader should understand the system without reading code.
- **Addenda**: Technical and specific. The reader is an engineer. Include complete code, schema, and config.

### Formatting Rules
- Use `---` horizontal rules between major sections
- Use H2 (`##`) for sections, H3 (`###`) for sub-sections within a section
- Use tables for: file lists, rollout plans, success metrics, addendum index
- Use numbered lists for: data flows, rollout steps, open questions
- Use bullet lists for: feature attributes, infrastructure items, UX states
- **Bold** key concepts, persona names, and metric names on first use
- Use backtick code blocks only in Addenda (never in the main body)
- Keep paragraphs to 3–5 sentences max

### Content Rules
- Every technical term introduced in the main body must appear in the Glossary
- Every piece of code, schema, API contract, or config must live in an Addendum
- Reference Addenda inline: `(see Addendum A)` not full links
- Open Questions must be numbered and include whether they are blocking or post-launch
- Never write "N/A" for Success Metrics — if you can't measure it, say what you would measure and why it's currently unmeasurable
- The Glossary must be alphabetical and complete — err on the side of over-including terms

### Length
- Executive Summary: 3–5 sentences max
- Problem Statement: 1–2 paragraphs
- Product Vision: 2–4 paragraphs (expansive, this is where the idea lives)
- Technical Concepts: 1–3 paragraphs per subsection, no code
- Each Addendum: as long as it needs to be — complete and self-contained

---

## Process

### Step 1: Gather Context

If the plan is for a feature being built right now, read:
- Any conversation context already in the session
- Relevant source files for patterns (use Glob/Grep)
- Existing docs if they exist (`docs/ROADMAP-*.md`, `docs/PLAN*.md`, etc.)

If triggered with `/pm-plan [description]` and no code exists yet, use the description as the basis. Ask one clarifying question only if the feature scope is genuinely ambiguous.

### Step 2: Determine Addenda Topics

Before writing, identify what belongs in Addenda:
- Any SQL schema → Addendum (Database Schema)
- Any API request/response structure → Addendum (API Contract)
- Any code snippet → Addendum
- Any config or env var values → Addendum
- Any complex data structure → Addendum

List the Addenda you'll write before starting the main body.

### Step 3: Write the Main Body

Write sections in order. Use the structure above exactly. Reference Addenda inline with `(see Addendum X)`.

### Step 4: Write Addenda

Write each Addendum in full. Addenda are self-contained — a developer should be able to implement from an Addendum without reading the main body. Include:
- Full SQL for schema changes
- Complete API request/response examples (JSON)
- Full code snippets with file paths as comments
- Environment variable names and sample values (never real secrets)

### Step 5: Write Glossary

Go through every paragraph of the main body. Every technical term, product name, acronym, or domain-specific word gets an entry. If you're unsure whether to include it, include it.

Alphabetize. Format:
```
**BRAVE_SEARCH_API_KEY** — Environment variable holding the API token for the Brave Search subscription. Used to authenticate web search requests from the AI Advisor backend.

**Prisma** — The ORM (Object-Relational Mapper) used in this project to interact with PostgreSQL. Prisma generates a type-safe database client from the schema definition file.
```

### Step 6: Write to File

Save to `docs/[FEATURE-NAME]-PLAN.md`. Use kebab-case for the filename. Confirm the output path in your response.

---

## Output Format (Response to User)

After writing the file:

```
Plan written to docs/[FEATURE-NAME]-PLAN.md

Sections: Executive Summary · Problem Statement · Product Vision · [N modules] · Technical Concepts · UX · Data Flow · Infrastructure · Rollout · Success Metrics · [N open questions] · [N files]
Addenda: [list of addendum titles]
Glossary: [N terms]
```

Do not summarize the plan contents — the user can read the file.

---

## Examples of Good vs. Bad Writing

### Problem Statement

❌ Bad (too technical for this section):
> "The existing `/api/ai/chat` endpoint uses ephemeral in-memory conversation state, meaning that session continuity is lost on page refresh or server restart, and there is no persistence layer for multi-turn dialogue across advisor personas."

✅ Good:
> "Medspa owners know their numbers are off. What they don't know is why, what to do about it, and whether what they're doing is market-appropriate. The existing insights surface data anomalies well. What's missing is the *so what* layer — the business judgment that translates data into decisions."

### Technical Concepts

❌ Bad (code in main body):
> "The context builder calls `prisma.invoice.aggregate({ where: { locationId: { in: locationIds }, date: { gte: start, lte: end } }, _sum: { netSale: true } })` to get revenue totals per window."

✅ Good:
> "The **context builder** resolves the advisor's configured time windows against the current date, queries the database for domain-relevant metrics, and formats the result as a readable brief that the LLM receives as grounding context. The brief is always fresh — generated at request time using indexed database queries. (See Addendum A for the full brief format.)"

### Glossary Entry

❌ Bad:
> **JSONB** — A PostgreSQL column type.

✅ Good:
> **JSONB** — A binary JSON column type in PostgreSQL. Stores structured data (like a message history array) alongside relational data in the same row, without requiring a separate table. JSONB supports indexing and querying within the JSON structure. Used here to store advisor conversation history and web search cache in a single `advisor_conversations` row.
