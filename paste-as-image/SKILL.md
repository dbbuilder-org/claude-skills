---
name: paste-as-image
description: Render a large clipboard or file blob to dense PNG pages via pxpipe and load them into context as images, so big pastes cost vision tokens (~3x denser) instead of text tokens. Use when the user says "pipethis:", "paste as image", "pxpipe this", "load this file/clipboard as an image", or wants to feed a large log/doc/transcript into Claude Code cheaply. NOT for content that must survive byte-exact (IDs, hashes, code identifiers) — that stays text.
---

# paste-as-image

Turns a large blob — sourced from the **clipboard or a file, never the prompt
textbox** — into dense PNG pages via pxpipe, then loads them as images. The raw
text is never tokenized in the prompt.

## `pipethis:` — one-step, zero interaction (do this immediately)

When a user message starts with **`pipethis:`**, treat everything after the
prefix as the payload and, **without asking any questions or confirming**:

1. Call the MCP tool **`render_text_as_image`** with
   `{ text: "<payload>", minChars: 1 }` (minChars 1 forces imaging regardless of
   size — the user explicitly opted in).
2. The tool stores the PNG(s), returns the image block(s), and a summary.
   **Read/keep the returned image**, then reply with ONE line: what it is, the
   `~X% saved`, and the stored path. Surface any `warnings` in that same line.

That is the entire flow — store, render, load, done. Do not narrate steps, do
not ask about fidelity up front. If the summary carries a code/exact warning,
just append it to your one-line reply so the user can re-send byte-exact bits as
text if needed.

If the `render_text_as_image` MCP tool isn't available this session, fall back:
`printf '%s' '<payload>' | node ~/.claude/skills/paste-as-image/render.mjs --stdin --min-chars 1`
then Read the emitted `pages[]`.

## When to use

- User copied a big log/doc/transcript and says "paste as image" / "pxpipe this".
- User points at a file: "load /path/to/big.log as an image".
- Any time a large, gist-tolerant blob would otherwise blow up input tokens.

**Do not use** for content that must be reproduced byte-exact (credentials,
hashes, exact IDs, code you'll edit). Images are lossy on dense exact strings.

## Preferred path: the `px-pipe-mcp` MCP tools (one step)

If the **px-pipe-mcp** MCP server is connected, use its tools — they render AND
return the image blocks in a single call, so there is no script to run and no
separate Read. Check with `/mcp` or by whether these tools are available:

| Situation | Call |
|---|---|
| User copied the content | `paste_clipboard_as_image` |
| User named a file | `render_file_as_image` `{ path: "/abs/path" }` |
| Content came from another tool result | `render_text_as_image` `{ text: "..." }` |

Optional args on every tool: `minChars` (default 2000), `exact` (true = keep as
text). The result is a text summary (`N text tokens -> M image tokens (~X%
saved)` plus any warnings) followed by one image block per page — **read the
images and answer from them**, and relay the savings + any warnings to the user.

Setup, if the tools aren't listed:
```bash
cd ~/dev2/px-pipe-mcp && pnpm install
claude mcp add --scope user px-pipe-mcp -- node ~/dev2/px-pipe-mcp/server.mjs
# then restart Claude Code so the tools load
```
Repo: https://github.com/dbbuilder-org/px-pipe-mcp

## Fallback path: the local `render.mjs` script

Use this only when the MCP tools are not available (e.g. MCP not yet loaded in
this session). First-time deps:
```bash
cd ~/.claude/skills/paste-as-image && pnpm install
```
Run it and then Read the PNGs it writes:
```bash
node ~/.claude/skills/paste-as-image/render.mjs                       # clipboard
node ~/.claude/skills/paste-as-image/render.mjs --file /abs/blob.log  # file
node ~/.claude/skills/paste-as-image/render.mjs --exact               # keep as text
```
Flags: `--file <path>`, `--exact`, `--min-chars <n>` (default 2000), `--cols <n>`.
It prints one JSON object:
- **`ok: false`** — do NOT image; tell the user the `reason` (`no_input`,
  `below_min_chars`, `exact_requested`, `render_error`) and use the content as text.
- **`ok: true`** — **Read** each path in `pages[]` to load the images, then relay
  `savedPct` and surface any `warnings` verbatim. Answer from the images.

## Fidelity note (both paths)

If a result's warnings mention code/exact data, tell the user the imaged copy is
gist-level and offer the `exact` option (kept as text) if they need verbatim
fidelity for identifiers, hashes, or code they'll edit.
