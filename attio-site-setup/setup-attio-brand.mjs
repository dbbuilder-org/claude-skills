#!/usr/bin/env node
/**
 * Idempotent Attio workspace setup for a NEW BRAND in the shared multi-brand workspace.
 * Copy into the brand repo's scripts/, edit the BRAND block, run:
 *   ATTIO_API_KEY=<brand-scoped token> node scripts/setup-attio-brand.mjs
 *
 * Safe to re-run: every create tolerates "already exists". Creates NOTHING on the shared
 * people/companies objects (lead_source already exists workspace-wide as TEXT — do not
 * create or modify it). Attio never auto-creates select options/statuses on write, so
 * every option used by the site MUST be created here.
 */

// ─── BRAND CONFIG — the only block you edit. Values below are an EXAMPLE:
//     replace every field for your brand. ──────────────────────────────────────
const BRAND = {
  name: 'Fireproof', // display name
  listSlug: 'fireproof_leads', // <brand>_leads
  listName: 'Fireproof Leads',
  stages: ['New inquiry', 'Contacted', 'Demo booked', 'Closed won', 'Closed lost'],
  formTypes: ['contact', 'demo-request', 'tool-signup'],
  // One record per offering the site sells — created in the shared `products` object
  // so future deals reference real product records. Slugged by name match.
  products: [
    { name: 'Fireproof Core', description: 'Fire-safety compliance platform — base plan' },
  ],
  // Entry-level consent flags for this brand's email programs (checkbox attrs)
  consentFlags: ['newsletter_opt_in'],
}
// ───────────────────────────────────────────────────────────────────────────────

const KEY = process.env.ATTIO_API_KEY
if (!KEY) {
  console.error('Set ATTIO_API_KEY (the brand-scoped token, not another brand\'s)')
  process.exit(1)
}
const BASE = 'https://api.attio.com/v2'
const H = { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

const exists = (status, json) => status === 409
  || String(json?.code || '').includes('slug_conflict')
  || String(json?.message || '').toLowerCase().includes('already')
  || String(json?.message || '').toLowerCase().includes('exists')

// ── Step 1: inventory (trust the API, not sibling repos) ──
async function inventory() {
  const objects = await api('GET', '/objects')
  const lists = await api('GET', '/lists')
  console.log('Workspace objects:', objects.json.data?.map(o => o.api_slug).join(', '))
  console.log('Workspace lists:', lists.json.data?.map(l => l.api_slug).join(', '))
  const clash = lists.json.data?.find(l => l.api_slug === BRAND.listSlug)
  if (clash) console.log(`List ${BRAND.listSlug} already exists — attribute/option creation continues idempotently.`)
  const hasProducts = objects.json.data?.some(o => o.api_slug === 'products')
  if (!hasProducts) console.log('! No `products` object in workspace — create it in Attio settings first, then re-run.')
  return { hasProducts }
}

async function ensureList() {
  // Attio API asymmetry (verified against live workspace 2026-07-20):
  //   POST /v2/lists expects parent_object as a STRING slug
  //   GET  /v2/lists/:slug returns parent_object as an ARRAY (["people"])
  // Attempting the array form on POST returns "Expected string, received array".
  // workspace_member_access is a REQUIRED field on POST — send [] to accept the default.
  const { status, json } = await api('POST', '/lists', {
    data: {
      name: BRAND.listName,
      api_slug: BRAND.listSlug,
      parent_object: 'people',
      workspace_access: 'full-access',
      workspace_member_access: [],
    },
  })
  const ok = status < 300 || exists(status, json)
  console.log(exists(status, json) ? `list ${BRAND.listSlug} exists` : `list ${BRAND.listSlug}: HTTP ${status} ${ok ? 'created' : (json?.message || JSON.stringify(json).slice(0, 200))}`)
}

async function ensureAttribute(attr) {
  // Attio requires ALL of these on every list-attribute POST (verified 2026-07-20):
  //   is_required, is_unique, is_multiselect (even for non-select types), config (object).
  // Missing any of them yields HTTP 400 "Body payload validation error".
  // Some workspaces also REJECT attribute creation without a description — include one.
  const data = {
    description: `${BRAND.name} funnel field`,
    is_required: false,
    is_unique: false,
    is_multiselect: false,
    config: {},
    ...attr,
  }
  const { status, json } = await api('POST', `/lists/${BRAND.listSlug}/attributes`, { data })
  const ok = status < 300 || exists(status, json)
  console.log(`  attr ${attr.api_slug}: ${ok ? 'ok' : `HTTP ${status} ${json?.message || ''} ${JSON.stringify(json?.validation_errors || []).slice(0, 200)}`}`)
}

async function ensureTitles(attribute, kind, titles) {
  for (const title of titles) {
    const { status, json } = await api('POST', `/lists/${BRAND.listSlug}/attributes/${attribute}/${kind}`, { data: { title } })
    if (status >= 300 && !exists(status, json)) console.log(`  ! ${kind} "${title}" on ${attribute}: HTTP ${status} ${json?.message || ''}`)
  }
}

async function ensureListShape() {
  await ensureAttribute({ title: 'Stage', api_slug: 'stage', type: 'status', is_multiselect: false })
  await ensureTitles('stage', 'statuses', BRAND.stages)
  await ensureAttribute({ title: 'Form type', api_slug: 'form_type', type: 'select', is_multiselect: false })
  await ensureTitles('form_type', 'options', BRAND.formTypes)
  for (const slug of ['utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'landing_page']) {
    await ensureAttribute({ title: slug.replace(/_/g, ' '), api_slug: slug, type: 'text' })
  }
  for (const flag of BRAND.consentFlags) {
    await ensureAttribute({ title: flag.replace(/_/g, ' '), api_slug: flag, type: 'checkbox' })
  }
}

// ── Products: the site's offerings as real records in the shared products object ──
//
// The `products` object's name attribute slug is workspace-specific. Attio's
// out-of-the-box `products` template uses `product_name` (unique-indexed) rather
// than `name`. Detect at runtime rather than hard-coding: GET the products
// attributes, pick a unique-indexed text/personal-name attribute (prefer
// `product_name`, fall back to `name` or any is_unique=true text field). If none
// exists, matching_attribute assertions won't dedupe and re-runs will create
// duplicate records — flag it and require the workspace owner to add uniqueness.
async function detectProductsNameSlug() {
  const { json } = await api('GET', '/objects/products/attributes?limit=100')
  const attrs = json.data || []
  const prefer = ['product_name', 'name']
  for (const p of prefer) {
    const a = attrs.find(a => a.api_slug === p && a.is_unique)
    if (a) return p
  }
  const anyUnique = attrs.find(a => a.is_unique && a.type === 'text' && !a.is_system)
  return anyUnique?.api_slug || null
}

async function ensureProducts() {
  const nameSlug = await detectProductsNameSlug()
  if (!nameSlug) {
    console.log('  ! products has no unique-indexed name attribute — cannot dedupe on assert. Add a unique text attribute in Attio settings then re-run.')
    return
  }
  console.log(`  (products name attribute: ${nameSlug})`)
  for (const p of BRAND.products) {
    const values = { [nameSlug]: p.name, ...(p.description ? { description: p.description } : {}) }
    const { status } = await api('PUT', `/objects/products/records?matching_attribute=${nameSlug}`, { data: { values } })
    if (status < 300) {
      console.log(`  product "${p.name}" asserted`)
    }
    else {
      const q = await api('POST', '/objects/products/records/query', { data: {} })
      const found = q.json.data?.some(r => JSON.stringify(r.values?.[nameSlug] || '').includes(p.name))
      if (found) {
        console.log(`  product "${p.name}" exists`)
      }
      else {
        const c = await api('POST', '/objects/products/records', { data: { values } })
        console.log(`  product "${p.name}": HTTP ${c.status} ${c.json?.message || 'created'}`)
      }
    }
  }
}

const inv = await inventory()
await ensureList()
await ensureListShape()
if (inv.hasProducts) await ensureProducts()
console.log(`\nDone. Verify in Attio: list "${BRAND.listName}" with stages [${BRAND.stages.join(', ')}], products asserted.`)
console.log('Next: wire the site (attio-integration.ts pattern), then E2E-verify a test lead lands as person + list entry.')
