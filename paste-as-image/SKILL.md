---
name: paste-as-image
description: Render a large clipboard or file blob to dense PNG pages via pxpipe and load them into context as images, so big pastes cost vision tokens (~3x denser) instead of text tokens. Use when the user says "paste as image", "pxpipe this", "load this file/clipboard as an image", or wants to feed a large log/doc/transcript into Claude Code cheaply. NOT for content that must survive byte-exact (IDs, hashes, code identifiers) — that stays text.
---

# paste-as-image

Turns a large blob — sourced from the **clipboard or a file, never the prompt
textbox** — into dense PNG pages using the local pxpipe renderer, then loads them
as images. The raw text is never tokenized in the prompt.

## When to use

- User copied a big log/doc/transcript and says "paste as image" / "pxpipe this".
- User points at a file: "load /path/to/big.log as an image".
- Any time a large, gist-tolerant blob would otherwise blow up input tokens.

**Do not use** for content that must be reproduced byte-exact (credentials,
hashes, exact IDs, code you'll edit). Images are lossy on dense exact strings.

## One-time setup

The skill is self-contained but needs its deps installed once:

```bash
cd ~/.claude/skills/paste-as-image && pnpm install
```

## How to run it

Pick the source and run `render.mjs`:

```bash
# from the clipboard (default)
node ~/.claude/skills/paste-as-image/render.mjs

# from a file
node ~/.claude/skills/paste-as-image/render.mjs --file /abs/path/to/blob.log

# force plain text (content must stay byte-exact)
node ~/.claude/skills/paste-as-image/render.mjs --exact
```

Flags: `--file <path>`, `--exact`, `--min-chars <n>` (default 2000), `--cols <n>`.

## Interpreting the result

The script prints one JSON object.

- **`ok: false`** — do NOT image. Tell the user the `reason`
  (`no_input`, `below_min_chars`, `exact_requested`, `render_error`) and use the
  content as plain text instead.
- **`ok: true`** — use the **Read** tool on each path in `pages[]` to load the
  images into context. Then relay `savedPct` (e.g. "imaged 91k chars, ~92% fewer
  tokens") and surface any `warnings` verbatim. Answer from the images.

If `warnings` mentions code/exact data, tell the user the imaged copy is
gist-level and offer to re-run with `--exact` (kept as text) if they need
verbatim fidelity.
