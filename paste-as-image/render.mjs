#!/usr/bin/env node
// Render a large text blob to dense PNG pages via pxpipe, so Claude Code can
// Read it as an image (~3x cheaper than text tokens) instead of tokenizing it.
//
// Usage: node render.mjs [--file <path>] [--exact] [--min-chars <n>] [--cols <n>]
// Source precedence: --file  →  clipboard (pbpaste)  →  stdin.
// Prints one JSON object to stdout. Exit 0 = rendered, non-zero = caller uses text.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { renderTextToImages } from 'pxpipe-proxy/transform';
import { encode } from 'gpt-tokenizer';

// ── arg parsing ──────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { file: null, stdin: false, exact: false, minChars: 2000, cols: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') opts.file = argv[++i];
    else if (a === '--stdin') opts.stdin = true;
    else if (a === '--exact') opts.exact = true;
    else if (a === '--min-chars') opts.minChars = Number(argv[++i]);
    else if (a === '--cols') opts.cols = Number(argv[++i]);
  }
  return opts;
}

function emit(obj, code) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  process.exit(code);
}

// ── source resolution ────────────────────────────────────────────────────────
function readSource(opts) {
  if (opts.file) return readFileSync(opts.file, 'utf8');
  // --stdin forces reading piped input (used by the `pipethis:` fallback), so a
  // non-empty clipboard can't shadow the intended payload.
  if (opts.stdin) {
    try { return readFileSync(0, 'utf8'); } catch { return ''; }
  }
  // clipboard (macOS pbpaste); if empty or unavailable, fall through to stdin
  try {
    const clip = execFileSync('pbpaste', { encoding: 'utf8' });
    if (clip && clip.trim().length > 0) return clip;
  } catch { /* no pbpaste (non-mac) or empty — try stdin */ }
  try {
    if (!process.stdin.isTTY) return readFileSync(0, 'utf8');
  } catch { /* no stdin */ }
  return '';
}

// ── heuristics ───────────────────────────────────────────────────────────────
function fidelityWarnings(text, droppedChars) {
  const warnings = [];
  const hasLongHex = /[0-9a-f]{12,}/i.test(text);
  const symbols = (text.match(/[^\w\s]/g) || []).length;
  const symbolDensity = text.length ? symbols / text.length : 0;
  const codeMarkers = /(\bfunction\b|\bconst\b|\bdef\b|\bimport\b|=>|;\s|\{|\})/.test(text);
  if (hasLongHex || symbolDensity > 0.15 || codeMarkers) {
    warnings.push(
      'looks like code / exact data — images are lossy on byte-exact strings ' +
      '(IDs, hashes, hex); verify identifiers, or re-run with --exact to keep it as text.'
    );
  }
  if (droppedChars > 0) {
    warnings.push(
      `${droppedChars} char(s) not in the glyph atlas were rendered blank — check for non-ASCII content.`
    );
  }
  return warnings;
}

// Anthropic vision token approximation: tokens ≈ (width × height) / 750.
function imageTokens(pages) {
  return pages.reduce((sum, p) => sum + Math.ceil((p.width * p.height) / 750), 0);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const text = readSource(opts);

  if (!text || text.trim().length === 0) {
    emit({ ok: false, reason: 'no_input', detail: 'clipboard/file/stdin were empty' }, 2);
  }
  if (text.length < opts.minChars) {
    emit({
      ok: false, reason: 'below_min_chars', chars: text.length, minChars: opts.minChars,
      detail: 'too small to be worth imaging — use as plain text',
    }, 3);
  }
  if (opts.exact) {
    emit({
      ok: false, reason: 'exact_requested', chars: text.length,
      detail: 'exact fidelity requested — keep as plain text (imaging is lossy on exact strings)',
    }, 4);
  }

  let result;
  try {
    result = await renderTextToImages(text, {
      reflow: true,
      ...(Number.isFinite(opts.cols) ? { cols: opts.cols } : {}),
    });
  } catch (err) {
    emit({ ok: false, reason: 'render_error', detail: String(err && err.message || err) }, 5);
  }

  const dir = join(homedir(), '.pxpipe', 'pastes', String(Date.now()));
  mkdirSync(dir, { recursive: true });
  const pages = result.pages.map((p, i) => {
    const path = join(dir, `page-${i + 1}.png`);
    writeFileSync(path, p.png);
    return path;
  });

  const textTokens = encode(text).length;
  const imgTokens = imageTokens(result.pages);
  const savedPct = textTokens > 0 ? Math.round((1 - imgTokens / textTokens) * 100) : 0;

  emit({
    ok: true,
    pages,
    chars: text.length,
    textTokens,
    imageTokens: imgTokens,
    savedPct,
    droppedChars: result.droppedChars,
    warnings: fidelityWarnings(text, result.droppedChars),
  }, 0);
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, reason: 'fatal', detail: String(err) }) + '\n');
  process.exit(1);
});
