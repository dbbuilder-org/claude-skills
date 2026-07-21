#!/usr/bin/env node
/**
 * ────────────────────────────────────────────────────────────────────
 * TEMPLATE — copy into scripts/marketing-shared/verify-site-parity.mjs
 * and edit the `results = [ check(a, b, allowedDiff) ]` block for your
 * brand's specific site paths and the exact substitutions the mirror
 * files legitimately differ by (typically just the market/region
 * constant + a header comment).
 * ────────────────────────────────────────────────────────────────────
 *
 * Drift detector for the FireProof marketing sites.
 *
 * site/ (US) and site-uk/ (GB) SHOULD have byte-identical:
 *   - api/lead.js      (except for MARKET constant + header comment)
 *   - js/lead-form.js  (identical)
 *
 * This script fails (exit 1) if either pair drifts beyond the allowed diff.
 * Run in CI or before deploying:
 *   node scripts/marketing-shared/verify-site-parity.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REPO = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')

function norm(s) { return s.replace(/\r\n/g, '\n') }

function check(pathA, pathB, allowedDiff) {
  const a = norm(readFileSync(join(REPO, pathA), 'utf8'))
  const b = norm(readFileSync(join(REPO, pathB), 'utf8'))
  if (a === b) return { ok: true, msg: `${pathA} == ${pathB} (identical)` }
  // Apply allowed transforms to a; if it then equals b, we're good.
  let mutated = a
  for (const t of allowedDiff) mutated = mutated.replace(t.from, t.to)
  if (mutated === b) return { ok: true, msg: `${pathA} ~= ${pathB} (only allowed diffs)` }
  // Find the diverging line
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const badLines = []
  for (let i = 0; i < Math.max(aLines.length, bLines.length); i++) {
    if (aLines[i] !== bLines[i]) {
      badLines.push(`  line ${i + 1}:\n    A: ${aLines[i] || '(missing)'}\n    B: ${bLines[i] || '(missing)'}`)
      if (badLines.length >= 5) break
    }
  }
  return { ok: false, msg: `${pathA} <> ${pathB} — unexpected diff:\n${badLines.join('\n')}` }
}

const results = [
  check('site/api/lead.js', 'site-uk/api/lead.js', [
    { from: /handler \(US\)/g, to: 'handler (GB)' },
    { from: /`site\/` project/g, to: '`site-uk/` project' },
    { from: /\(fireproofapp\.com\)\. The `site-uk\/`/g, to: '(fireproofapp.uk). The `site/`' },
    { from: /counterpart at site-uk\/api\/lead\.js/g, to: 'counterpart at site/api/lead.js' },
    { from: /const MARKET = 'US'/g, to: "const MARKET = 'GB'" },
  ]),
  check('site/js/lead-form.js', 'site-uk/js/lead-form.js', []),
]

let ok = true
for (const r of results) {
  console.log((r.ok ? '✓ ' : '✗ ') + r.msg)
  if (!r.ok) ok = false
}
process.exit(ok ? 0 : 1)
