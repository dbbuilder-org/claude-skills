---
name: docs-maximize-roi
description: "Identify a project's single highest-ROI deliverable, then produce the full case for it as a document set in docs/ROI/. Four sequential phases → five artifacts: (1) an ROI analysis that triages intended vs potential vs approachable value and names ONE defensible highest-ROI thesis; (2) a strategic + detailed delivery roadmap for it; (3) an academically defensible paper (LaTeX→PDF) proving the analysis; (4) an HBR-style article (→PDF) making the CFO/CTO business case. Use when the user asks to 'maximize ROI', 'build the ROI case', 'find the highest-ROI deliverable and prove it', 'ROI analysis + academic + HBR papers', or 'docs-maximize-roi'."
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - Agent
---

# docs-maximize-roi

Turn a project into a defensible ROI case. Four phases, run **in order**, each gated, all output
landing in a new `docs/ROI/` folder. The deliverable is not "some docs about value" — it is a
**single, named, defended highest-ROI thesis** and the three documents that prove it to three
audiences (strategy, academia, the C-suite).

```
Phase 1  ANALYZE & IDENTIFY   → docs/ROI/ROI-ANALYSIS.md   (name ONE highest-ROI thesis)
Phase 2  ROADMAP              → docs/ROI/ROI-ROADMAP.md    (how to deliver it)
Phase 3  ACADEMIC PAPER       → docs/ROI/<slug>-academic.pdf (+.tex)  (prove it, rigorously)
Phase 4  HBR ARTICLE          → docs/ROI/<slug>-hbr.pdf (+.tex)       (sell it, to a CFO/CTO)
         + docs/ROI/README.md (index + rebuild commands)
```

Worked reference implementation (canonical example of the output shape):
`~/dev2/aicostmemory/docs/ROI/`.

## Trigger phrases
- "maximize ROI", "docs-maximize-roi", "build the ROI case", "prove the ROI"
- "find the highest-ROI deliverable", "what's our greatest ROI and defend it"
- "academic + HBR ROI papers", "CFO/CTO ROI paper"

## The five artifacts
| # | File | Audience | Phase |
|---|------|----------|-------|
| 1 | `ROI-ANALYSIS.md` | Internal / founder | 1 |
| 2 | `ROI-ROADMAP.md` | Product / eng leadership | 2 |
| 3 | `<slug>-academic.pdf` (+`.tex`) | Technical / academic | 3 |
| 4 | `<slug>-hbr.pdf` (+`.tex`, +exhibit `.png`) | CFO / CTO / board | 4 |
| 5 | `README.md` | anyone opening the folder | after 4 |

`<slug>` = short project name (e.g., `mindspace`, `acme-billing`).

---

## Phase 1 — Analyze & identify the highest-ROI deliverable

**Goal:** end with ONE named thesis of the form *"our greatest ROI is X, because Y"*, defended
against alternatives, plus an honest ranking of the runner-up returns.

### 1a. Understand the project (breadth, then depth)
Use `Agent`/Explore for broad reads so file contents stay out of context; read only load-bearing
files directly. Gather: what it does, its architecture and unique position, who pays and for what,
git history (recent direction), existing planning/roadmap/research docs, and any measurements
already available. Do NOT skip this — a thesis not grounded in the actual system is worthless.

### 1b. Triage value three ways (the naming discipline the user asked for)
For each candidate source of value, place it in exactly one bucket:
- **Intended** — the value the project was explicitly built to deliver (the stated pitch).
- **Potential** — value the architecture *could* unlock but doesn't yet (latent, needs build).
- **Approachable** — value reachable *now or soon* with the current assets (near-term, low-lift).

The highest-ROI deliverable usually lives at the **intersection of Potential and Approachable**:
big enough to matter, close enough to ship. Pure-intended is often commoditized; pure-potential is
often a mirage. Say which bucket your thesis is in and why.

### 1c. Apply the three analytical lenses (see `references/roi-frameworks.md`)
1. **Mechanism, not feature.** Ask what single *mechanism* makes multiple benefits real at once.
   The strongest ROI is usually a mechanism (a loop, a position, a data asset), not a feature.
   Features are copyable; mechanisms are moats.
2. **Moat analysis.** Separate *valuable* from *defensible*. Rank candidates by
   value × defensibility × time-to-value. Name what a competitor structurally cannot copy.
3. **Honest value ranking.** Rank ALL the returns most→least defensible, and explicitly
   **de-rank the oversold one** (there is almost always a headline number that is real but
   unprovable/contested — name it and demote it). Honesty here is what makes the case persuasive.

### 1d. Write `docs/ROI/ROI-ANALYSIS.md`
Contents: one-line thesis; the intended/potential/approachable triage table; the mechanism; the
flywheel/compounding story if one exists; the honest value ranking (with the de-ranked item);
and the caveats you will hold yourself to. This doc grounds Phases 2–4 — they must not contradict it.

**Gate 1:** a single named thesis + value ranking + de-ranked headline, all grounded in the real system.

---

## Phase 2 — Strategic + detailed delivery roadmap

**Goal:** a plan that takes the thesis from "true on paper" to "delivered and measured."

Write `docs/ROI/ROI-ROADMAP.md`. It MUST include:
- **What exists vs. what must be built** (table: component · status · effort). Ground in the real repo.
- **Sequenced phases/sprints** with dependencies — critical path first. Distinguish "unblocks the
  proof" from "scales it."
- **The measurement plan** — the specific metrics that will *prove* the ROI once delivered
  (define them; this is what Phase 3 formalizes). If a metric needs a data join or instrument, say so.
- **Success criteria** — falsifiable thresholds ("ROI proxy > 1 for N weeks", "retry-rate Δ ≤ 0").
- **Risks / provisioning knobs** — separate design constraints (real) from provisioning knobs
  (money/latency/scale that $$$ solves). Be explicit about which is which.

Reuse the project's own roadmap conventions/format if it has them (match its sprint style, IDs).

**Gate 2:** a sequenced plan with an explicit measurement scheme and falsifiable success criteria.

---

## Phase 3 — Academic paper (defensible, LaTeX → PDF)

**Goal:** a paper a skeptical technical reviewer would accept — the *methodology* is sound and the
*conclusions* follow, even where numbers are illustrative.

Start from `references/academic-paper-template.tex` (a preamble that compiles cleanly with TeX Live).
Structure: Abstract · Introduction (problem + contributions) · Background/Related Work (with **real**
citations) · System Design · **Formal metric definitions** (equations — this is where defensibility
lives) · Evaluation (methodology + results) · Discussion · **Limitations & Threats to Validity** ·
Conclusion · References.

### Defensibility rules (non-negotiable)
- **Formalize the metrics.** Define every claimed quantity with an equation and say exactly what is
  observed vs. estimated. Distinguish a cheap **proxy** from the **counterfactual** that actually
  means ROI — never conflate them.
- **Cite real work.** Use genuine references (papers, standards, docs). Never invent citations or
  attribute specific fabricated numbers to third parties. (See the template's bibliography for the
  general-LLM-memory set; swap in domain-appropriate ones.)
- **Make the central claim architectural, not numerical.** The strongest conclusion should hold on
  the *mechanism* even if point estimates are illustrative — then numbers support, not carry, it.
- **Limitations section is mandatory and is a feature.** Name the honest threats (single pilot,
  counterfactual estimation, privacy bounds). This is what makes it defensible, not weaker.
- **If told to present the build as complete**, do so — but frame unfinished pieces precisely as
  *provisioning/deployment variables* ("a deployment, not a design, variable"; "provisioned
  resource, not an architectural constraint"), and record the true current state in the README scope
  note so the paper survives a fact-check.

### Build & verify
```bash
cd docs/ROI
pdflatex -interaction=nonstopmode -halt-on-error <slug>-academic.tex   # pass 1
pdflatex -interaction=nonstopmode -halt-on-error <slug>-academic.tex   # pass 2 (bibliography refs)
pdftotext <slug>-academic.pdf - | grep -iE "abstract|contributions|references"  # sanity-check render
rm -f *.aux *.log *.out   # remove aux (explicit names — zsh aborts on a no-match glob)
```
**Gate 3:** PDF compiles in two clean passes and `pdftotext` confirms sections/equations/refs rendered.

---

## Phase 4 — HBR-style business article (CFO/CTO-ready, → PDF)

**Goal:** an executive who reads it funds the thing. HBR voice: authoritative, narrative, one big
idea, a memorable framework, concrete stakes.

**House style is LaTeX, not markdown.** Copy `references/hbr-article-template.tex` to
`docs/ROI/<slug>-hbr.tex` and fill it. It is a two-column magazine layout (validated preamble,
compiles with `pdflatex`) matching `~/dev2/aicostoptimize/docs/ROI/hbr-cfo-article.tex` and
`~/dev2/aicostmemory/docs/ROI/mindspace-hbr.tex`. Its elements, in order:
- **Kicker** — red small-caps `SECTION • TOPIC` (left) + a status line (right, e.g. `INTERNAL DRAFT — STEALTH`).
- **Title** — `\Huge` sans bold, 2–3 short `\\`-broken lines. **Do not** also repeat it as a heading (that double-titles page one).
- **Dek** — the gray sans subtitle that reframes the problem.
- **Byline** — `by **Author**, Company … Month Year`.
- **Idea in Brief** — the tan `ideabrief` box: problem / why-usual-fixes-fail / the move / the payoff.
- **Two-column body** (`multicols`) — opening (the felt pain) · why obvious fixes fall short · the reframe (the mechanism).
- **Pull-quote** — `\pullquote{…}` (red rules) with the single most quotable line.
- **Exhibit** — a full-width figure between the two `multicols` blocks (see below), with a gray-sans `\textbf{EXHIBIT}` caption.
- **Two-column body** (resumed) — the flywheel · the honest ranking (de-rank the oversold headline out loud) · what to do Monday.
- **Footer** — a rule + small-print bio referencing the companion academic paper; note the strongest claim is architectural, not numerical.

### The exhibit (the framework / 2×2) — a real graphic, not ASCII
Prefer **Mermaid → PNG** for a 2×2 (`quadrantChart`), embedded with `\includegraphics`:
```bash
cd docs/ROI
# 1. write <slug>-2x2.mmd (mermaid quadrantChart: x/y axes, quadrant labels, one point per option)
# 2. mmdc needs a Chromium — point it at an installed browser (it won't find one by default):
echo '{ "executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "args": ["--no-sandbox"] }' > /tmp/pptr.json
mmdc -i <slug>-2x2.mmd -o <slug>-2x2.png -b white -w 1600 -s 2 -p /tmp/pptr.json
# 3. keep quadrant labels short (<~28 chars) or they clip; verify by opening the PNG.
```
Then set `\includegraphics[width=0.62\textwidth]{<slug>-2x2.png}` in the template's exhibit block.
(Alternative: a native `tikz`/`pgfplots` chart — e.g. a savings-curve — as in the aicostoptimize template.)

### Build & verify
```bash
cd docs/ROI
pdflatex -interaction=nonstopmode -halt-on-error <slug>-hbr.tex   # run twice if refs/toc used
rm -f <slug>-hbr.aux <slug>-hbr.log <slug>-hbr.out
pdftoppm -png -r 100 -f 1 -l 1 <slug>-hbr.pdf /tmp/pg1   # eyeball page 1: no double title, clean kicker
```
**Gate 4:** PDF compiles; page 1 shows the kicker/title/dek/idea-brief with no duplicated title; the
exhibit renders (not tofu/ASCII). Avoid `→`/`•` literals in body text (glyph-tofu risk) — use words
or `\textbullet`/`$\rightarrow$`.

---

## Finish — README + commit
Write `docs/ROI/README.md`: a table indexing the five artifacts (audience + one-line what-it-is),
the rebuild commands, and a **scope note** stating what is live today vs. presented-as-complete.
Then commit the folder (match the repo's commit conventions). Report the five artifacts and the
one-line thesis.

## Rules
1. **Phases are sequential and gated** — never start N+1 until N's gate passes. 2–4 must not
   contradict Phase 1's thesis.
2. **One thesis.** Do not hedge into a list. Name the single greatest ROI and defend the ranking.
3. **Ground everything in the real project** — real architecture, real git history, real assets.
4. **Honesty is the persuasion strategy.** Rank returns, de-rank the oversold headline, keep a real
   limitations section and a real scope note. Overclaiming loses the technical AND the exec reader.
5. **Cite real sources; formalize real metrics; never fabricate citations or third-party numbers.**
6. **Verify every PDF** with `pdftotext` before declaring done; clean up LaTeX aux files.
7. **Toolchain check first:** confirm `pdflatex` and (for a Mermaid exhibit) `mmdc` exist
   (`which pdflatex mmdc`). `mmdc` needs a Chromium — if it errors on a missing browser, point it at
   an installed one via a puppeteer config (`executablePath`, `--no-sandbox`). If a tool is missing,
   produce the sources and note the one command the user must run. (Both papers are LaTeX now; pandoc
   is no longer required.)
8. **HBR house style is LaTeX** (`references/hbr-article-template.tex`) — two-column magazine layout,
   not pandoc/markdown. The exhibit is a real graphic (Mermaid→PNG or tikz/pgfplots), never ASCII.
