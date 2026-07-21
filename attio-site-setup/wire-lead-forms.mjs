#!/usr/bin/env node
/**
 * ────────────────────────────────────────────────────────────────────
 * TEMPLATE — copy into scripts/marketing-shared/wire-lead-forms.mjs
 * and adapt the MAPPINGS array + PAGES/SITES lists to your brand. The
 * MAPPINGS table is a needle→form_type dictionary matching against the
 * ?subject= substring of mailto: hrefs; case-insensitive; handles both
 * literal spaces and %20 URL-encoding between words.
 * ────────────────────────────────────────────────────────────────────
 *
 * Idempotent HTML patcher: turns FireProof marketing site mailto CTAs into
 * widget triggers by inserting data-lead-form/data-plan-interest attributes
 * on the specific button-style anchors. Also injects the lead-form.js script
 * tag before </body>.
 *
 * Safe to re-run — every insertion checks whether the attribute already
 * exists before adding. Mailtos remain as href fallbacks (progressive
 * enhancement).
 *
 * Rules:
 *  - Only enhance mailto CTAs whose href includes a ?subject= (those are
 *    intentional lead-capture buttons; plain "email us at" text links are
 *    informational and stay as mailtos).
 *  - Match on the exact subject text and map to form_type + plan_interest.
 *
 *   node scripts/marketing-shared/wire-lead-forms.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REPO = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')

// Subject-substring → data-attributes mapping. Substring match (case-insensitive)
// against the mailto's ?subject= query string. First match wins.
// NB: Starter (pricing.html) maps to plan_interest=growth — Attio uses "growth"
// as the entry-tier product slug even though the pricing page brands it "Starter".
const MAPPINGS = [
  { needle: 'ios app early access', formType: 'ios_early_access' },
  { needle: 'reseller program inquiry', formType: 'reseller_inquiry', fields: 'reseller' },
  { needle: 'reseller pricing - growth', formType: 'reseller_inquiry', plan: 'growth', fields: 'reseller' },
  { needle: 'reseller pricing - professional', formType: 'reseller_inquiry', plan: 'professional', fields: 'reseller' },
  { needle: 'reseller pricing - enterprise', formType: 'reseller_inquiry', plan: 'enterprise', fields: 'reseller' },
  { needle: 'enterprise enquiry', formType: 'pricing_enterprise', plan: 'enterprise' },
  { needle: 'enterprise inquiry', formType: 'pricing_enterprise', plan: 'enterprise' },
  { needle: 'demo request', formType: 'demo_request' },
]

// Pages to patch on each site. Include the script tag on ALL pages we might touch;
// enhance only CTAs on pages with real buttons.
const PAGES = ['index.html', 'pricing.html', 'reseller.html']
const SITES = ['site', 'site-uk']

function addDataAttrs(html, mapping) {
  // Regex to find <a ...> tags whose href starts with mailto:...?subject=<needle>
  // Non-greedy inside the tag; case-insensitive on the subject.
  // UK site URL-encodes subject spaces (%20); US site uses literal spaces.
  // Accept either between needle words by substituting escaped space for
  // (space | %20 | encoded em-dash %E2%80%94).
  const parts = mapping.needle.split(/\s+/).map(w =>
    w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  const needle = parts.join('(?:\\s|%20)+')
  const re = new RegExp(`(<a\\b[^>]*?href="mailto:[^"]*?subject=[^"]*?${needle}[^"]*?"[^>]*?)>`, 'gi')
  return html.replace(re, (m, openTag) => {
    let out = openTag
    if (!/data-lead-form=/.test(out)) out += ` data-lead-form="${mapping.formType}"`
    if (mapping.plan && !/data-plan-interest=/.test(out)) out += ` data-plan-interest="${mapping.plan}"`
    if (mapping.fields && !/data-form-fields=/.test(out)) out += ` data-form-fields="${mapping.fields}"`
    return out + '>'
  })
}

function ensureScriptTag(html) {
  if (html.includes('/js/lead-form.js')) return html
  return html.replace(/<\/body>/i, '  <script src="/js/lead-form.js" defer></script>\n</body>')
}

let changed = 0
let touchedFiles = []
for (const site of SITES) {
  for (const page of PAGES) {
    const path = join(REPO, site, page)
    if (!existsSync(path)) continue
    const before = readFileSync(path, 'utf8')
    let after = before
    for (const m of MAPPINGS) after = addDataAttrs(after, m)
    after = ensureScriptTag(after)
    if (after !== before) {
      writeFileSync(path, after)
      changed++
      touchedFiles.push(`${site}/${page}`)
    }
  }
}

console.log(`Patched ${changed} file(s):`)
touchedFiles.forEach(f => console.log(`  - ${f}`))
if (!changed) console.log('  (no changes — already up to date)')
