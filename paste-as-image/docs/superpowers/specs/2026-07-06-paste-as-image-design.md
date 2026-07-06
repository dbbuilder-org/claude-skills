# paste-as-image — design spec

**Date:** 2026-07-06
**Status:** approved, building
**Depends on:** [pxpipe](https://github.com/teamchong/pxpipe) (`pxpipe-proxy` on npm), cloned/running at `/Users/admin/dev2/pxpipe`

## Problem

Large blobs (logs, docs, transcripts, sometimes code) pasted into Claude Code
cost input tokens at ~1 char/token. pxpipe's renderer packs text into dense PNGs
that the model reads by vision at ~3× the character density, but the running
pxpipe proxy only images content **already in the request** (old history, tool
results). There is no on-demand "ingest this blob as an image" front door, and
content typed into the prompt is already tokenized before any tool can act.

## Goal

An on-demand skill that turns a blob sourced from **clipboard or a file** (never
the prompt textbox) into dense PNG page(s) via pxpipe, and loads them into Claude
Code as images — so the raw text is never tokenized in the prompt and the model
answers from the images.

## Non-goals (v1)

- The automatic proxy path — already handled by the running pxpipe proxy.
- An MCP variant — `render.mjs` is structured so it can graduate into one later.
- `keepSharp` block-splitting — `--exact` falls back to plain text instead.

## Shape

Personal, self-contained skill at `~/.claude/skills/paste-as-image/`:

```
paste-as-image/
├── SKILL.md            # triggers + instructions: run render.mjs, then Read the PNGs
├── package.json        # deps: pxpipe-proxy, gpt-tokenizer  (one pnpm install)
├── render.mjs          # the engine
├── fixtures/           # big-log.txt, tiny.txt, code.txt
└── render.test.mjs     # assertions, run with `node --test`
```

Dependency: skill owns its `package.json` pinning `pxpipe-proxy`, so it survives
moving/deleting the `~/dev2/pxpipe` clone. Renderer imported from
`pxpipe-proxy/transform` (maps to `dist/core/library.js` →
`renderTextToImages(text, opts)`).

## render.mjs contract

**Invocation:** `node render.mjs [--file <path>] [--exact] [--min-chars <n>] [--cols <n>]`
Source precedence: `--file` → clipboard (`pbpaste`) → stdin. Default `--min-chars` 2000.

**Behavior gate:**

| Condition | Action |
|---|---|
| source empty / unreadable | exit 2, `{ ok:false, reason:"no_input" }` |
| chars < min-chars | exit 3, `{ ok:false, reason:"below_min_chars" }` → caller uses text |
| `--exact` | exit 4, `{ ok:false, reason:"exact_requested" }` → caller uses text (lossy-unsafe) |
| otherwise | `renderTextToImages(text,{reflow:true})`, write PNGs, exit 0 |

**Success output (stdout, JSON):**
```json
{
  "ok": true,
  "pages": ["/Users/.../.pxpipe/pastes/<ts>/page-1.png", ...],
  "chars": 91234,
  "textTokens": 24000,          // gpt-tokenizer encode length
  "imageTokens": 1806,          // Σ (w*h)/750 over pages (Anthropic vision approx)
  "savedPct": 92,
  "droppedChars": 0,
  "warnings": ["looks like code/exact data — verify identifiers", ...]
}
```

**Warnings (rendered anyway, but surfaced):**
- code/exact heuristic fires — long hex run `/[0-9a-f]{12,}/i`, or non-alnum-non-space
  density > 0.15, or code markers (`{ } ; => function const def import`).
- `droppedChars > 0` — glyphs missing from the atlas, rendered blank.

**Output location:** `~/.pxpipe/pastes/<timestamp>/page-N.png`.

## SKILL.md behavior

Triggers: "paste as image", "pxpipe this", "/paste-as-image", "load this file as
an image". Instructions:
1. Run `node render.mjs` with the right source flag.
2. If `ok:false` → tell the user why and use the content as plain text.
3. If `ok:true` → `Read` each page path (loads images into context), relay
   `savedPct` and any `warnings`, then answer from the images.

## Error handling

Empty/missing input, below-threshold, `--exact`, and render errors all exit
non-zero with a machine-readable `reason`; the skill degrades to plain text with a
one-line explanation. `droppedChars > 0` renders but warns.

## Testing (`node --test render.test.mjs`)

- `big-log.txt` (>2000 chars) → `ok:true`, `pages.length >= 1`, `savedPct > 0`.
- `tiny.txt` (<2000 chars) → exit 3, `reason:"below_min_chars"`.
- `code.txt` (hashes/identifiers) → `ok:true` with a code/exact warning present.
- `--exact` on any input → exit 4, `reason:"exact_requested"`.
