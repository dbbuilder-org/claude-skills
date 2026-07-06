// Run: node --test   (from ~/.claude/skills/paste-as-image)
// Drives render.mjs as a subprocess against fixtures and checks the JSON contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'render.mjs');
const fixture = (name) => join(here, 'fixtures', name);

// Run render.mjs; returns { code, json }. Never throws on non-zero exit.
function run(args) {
  let out = '';
  let code = 0;
  try {
    out = execFileSync('node', [script, ...args], { encoding: 'utf8' });
  } catch (err) {
    out = err.stdout || '';
    code = err.status ?? 1;
  }
  return { code, json: JSON.parse(out) };
}

test('big log renders to at least one page with positive savings', () => {
  const { code, json } = run(['--file', fixture('big-log.txt')]);
  assert.equal(code, 0);
  assert.equal(json.ok, true);
  assert.ok(json.pages.length >= 1, 'expected >=1 page');
  assert.ok(json.savedPct > 0, `expected savedPct>0, got ${json.savedPct}`);
});

test('tiny input is refused as below_min_chars', () => {
  const { code, json } = run(['--file', fixture('tiny.txt')]);
  assert.equal(code, 3);
  assert.equal(json.ok, false);
  assert.equal(json.reason, 'below_min_chars');
});

test('code-like content renders but warns about exact data', () => {
  const { code, json } = run(['--file', fixture('code.txt')]);
  assert.equal(code, 0);
  assert.equal(json.ok, true);
  assert.ok(
    json.warnings.some((w) => /code|exact/i.test(w)),
    `expected a code/exact warning, got ${JSON.stringify(json.warnings)}`,
  );
});

test('--exact refuses to image and keeps text', () => {
  const { code, json } = run(['--file', fixture('big-log.txt'), '--exact']);
  assert.equal(code, 4);
  assert.equal(json.ok, false);
  assert.equal(json.reason, 'exact_requested');
});
