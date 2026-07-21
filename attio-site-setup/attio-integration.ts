/**
 * Attio integration for a brand site in the shared multi-brand workspace.
 * Reference implementation — copy into server/utils/attio.ts (Nuxt) or lib/attio.ts
 * (Next), replace BRAND placeholders. Uses global fetch/$fetch; no SDK dependency.
 *
 * Convention: people/companies shared + brand-neutral; brand data on the brand list
 * entry or Notes; lead_source = first touch, set only on create.
 */
const ATTIO_BASE = 'https://api.attio.com/v2'

interface AttioOpts {
  apiKey: string
}

async function attioFetch(apiKey: string, path: string, options: { method: string, body?: unknown }): Promise<any> {
  const doFetch = async () => {
    const res = await fetch(`${ATTIO_BASE}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    if (!res.ok) {
      const err: any = new Error(`Attio ${options.method} ${path} → ${res.status}`)
      err.status = res.status
      err.retryAfter = Number(res.headers.get('Retry-After') || 2)
      throw err
    }
    return res.json()
  }
  try {
    return await doFetch()
  }
  catch (err: any) {
    if (err?.status === 429) {
      await new Promise(r => setTimeout(r, Math.min(err.retryAfter, 10) * 1000))
      return await doFetch()
    }
    throw err
  }
}

export interface PersonInput {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
}

/** Upsert person by email. lead_source (workspace-wide TEXT attr) is FIRST TOUCH:
 *  written only when the person doesn't already exist. Never add brand-specific
 *  attributes here — those belong on the brand list entry. */
export async function assertPerson(opts: AttioOpts, p: PersonInput): Promise<string> {
  let exists = false
  try {
    const found = await attioFetch(opts.apiKey, '/objects/people/records/query', {
      method: 'POST',
      body: { filter: { email_addresses: p.email }, limit: 1 },
    })
    exists = Array.isArray(found?.data) && found.data.length > 0
  }
  catch {
    // query failure is non-fatal; fall through to assert with lead_source
  }

  const values: Record<string, unknown> = {
    email_addresses: [{ email_address: p.email }],
  }
  if (p.firstName || p.lastName) {
    values.name = [{
      first_name: p.firstName || '',
      last_name: p.lastName || '',
      full_name: [p.firstName, p.lastName].filter(Boolean).join(' '),
    }]
  }
  if (p.phone) values.phone_numbers = [{ original_phone_number: p.phone }]
  if (!exists) values.lead_source = 'BRAND_NAME website' // e.g. "Fireproof website"

  const res = await attioFetch(opts.apiKey, '/objects/people/records?matching_attribute=email_addresses', {
    method: 'PUT',
    body: { data: { values } },
  })
  return res?.data?.id?.record_id
}

/** Upsert company by domain. Call only for non-free-mail domains. */
export async function assertCompany(opts: AttioOpts, domain: string, name?: string): Promise<string | null> {
  const values: Record<string, unknown> = { domains: [{ domain }] }
  if (name) values.name = name
  const res = await attioFetch(opts.apiKey, '/objects/companies/records?matching_attribute=domains', {
    method: 'PUT',
    body: { data: { values } },
  })
  return res?.data?.id?.record_id ?? null
}

export interface LeadEntryInput {
  formType: string // must be a pre-created option on the list's form_type select
  utm: Record<string, string>
  referrer: string
  landingPage: string
  newsletterOptIn?: boolean
}

/** One entry per touch into the BRAND's list — this is what puts the lead in the
 *  funnel; sequences and views enroll from list membership. */
export async function addLeadEntry(opts: AttioOpts, personId: string, e: LeadEntryInput): Promise<void> {
  await attioFetch(opts.apiKey, '/lists/BRAND_LIST_SLUG/entries', { // e.g. fireproof_leads
    method: 'POST',
    body: {
      data: {
        parent_record_id: personId,
        parent_object: 'people',
        entry_values: {
          stage: 'New inquiry',
          form_type: e.formType,
          utm_source: e.utm.utm_source || '',
          utm_medium: e.utm.utm_medium || '',
          utm_campaign: e.utm.utm_campaign || '',
          referrer: e.referrer || '',
          landing_page: e.landingPage || '',
          ...(e.newsletterOptIn !== undefined ? { newsletter_opt_in: e.newsletterOptIn } : {}),
        },
      },
    },
  })
}

/** Free-text payloads (messages, qualitative signup detail) go to Notes — schema-free,
 *  no workspace attributes needed. */
export async function addNote(opts: AttioOpts, personId: string, title: string, lines: string[]): Promise<void> {
  await attioFetch(opts.apiKey, '/notes', {
    method: 'POST',
    body: {
      data: {
        parent_object: 'people',
        parent_record_id: personId,
        title,
        format: 'plaintext',
        content: lines.join('\n'),
      },
    },
  })
}

/* Form handler shape (framework-agnostic):
 *   1. honeypot filled → return { ok: true } immediately
 *   2. validate email; trim/limit all fields
 *   3. personId = assertPerson(...)
 *   4. domain not free-mail → assertCompany(domain, schoolOrCompanyName) (non-fatal)
 *   5. addLeadEntry(personId, {...})
 *   6. free text present → addNote(personId, 'BRAND website inquiry', [...])
 *   7. any CRM error → console.error('[lead:crm-failed]', JSON.stringify(lead)) and
 *      STILL return { ok: true } — never lose the lead, never block the visitor.
 * FREE_MAIL set: gmail.com yahoo.com outlook.com hotmail.com icloud.com aol.com
 * live.com msn.com proton.me protonmail.com mail.com ymail.com
 */
