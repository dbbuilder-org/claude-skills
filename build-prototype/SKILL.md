---
name: build-prototype
description: Build a production-ready prototype, deploy to Vercel, and wire up a servicevision.io subdomain. Use when the user asks to "build a prototype", "scaffold a new project", "create a prototype", or "new prototype". Asks for a project brief, then executes discovery, scaffold, build, deploy, DNS, and verification in sequence.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
  - AskUserQuestion
---

# Build Prototype Skill

Build a high-quality, production-ready prototype mirroring a reference project's architecture from `~/dev2/clients/prototypes/`, deploy it to Vercel, and wire a `<projectname>.servicevision.io` subdomain via Cloudflare.

## Trigger Phrases

- "build a prototype", "create a prototype", "new prototype"
- "scaffold a new project", "start a prototype"
- "build and deploy", "prototype and deploy"

---

## Step 0: Determine Project Name

Derive `<projectname>` from the **innermost folder** of the current working directory:

```
/Users/admin/dev2/clients/prototypes/septic  →  projectname = "septic"
C:\folder1\folder2\myapp                     →  projectname = "myapp"
```

Use `basename "$PWD"` (or platform equivalent) to extract it. Set these constants:
- `PROJECT_NAME` = innermost folder name (lowercase, hyphenated if needed)
- `TARGET_URL` = `https://<PROJECT_NAME>.servicevision.io`
- `VERCEL_PROJECT` = `<PROJECT_NAME>-servicevision`

---

## Step 1: Collect the Project Brief

Use `AskUserQuestion` to ask for the project description before doing any work:

> **"Please describe the prototype you want to build."**
>
> Include: what it does, who uses it, key screens/features, any specific data or integrations needed.

Wait for the answer. Do not proceed to Step 2 until the brief is received.

---

## Step 2: Discovery — Audit a Reference Project

**Prototypes live in:** `~/dev2/clients/prototypes/`

**Preferred reference projects** (in priority order):
1. `onsiteIT` — IT field service SaaS
2. `electronicsw` — electronics/hardware SaaS

Pick the reference project whose domain is closest to the brief. If neither is a good fit, use whichever has the most complete implementation. Check both exist with:
```bash
ls ~/dev2/clients/prototypes/
```

Audit the chosen reference project thoroughly:

1. **Stack** — Read `package.json` (or equivalent). Note framework, UI library, runtime, package manager.
2. **Structure** — Glob all source files. Map the directory layout.
3. **Patterns** — Read 3–5 representative components/pages. Note naming, file organization, export patterns.
4. **Styling** — Identify CSS approach (Tailwind, CSS Modules, styled-components, etc.) and any design tokens.
5. **Config files** — `tsconfig.json`, `.eslintrc*`, `.prettierrc*`, `next.config.*`, `vercel.json`, `.env.example`.
6. **Deployment** — Note how `vercel.json` is structured, what env vars are expected.

Capture all findings in a brief internal summary before proceeding.

---

## Step 3: Scaffold the New Project

Using the **same framework and stack** as onsiteIT:

1. Initialize the project in the current working directory (do not create a nested subfolder — the CWD is already `<PROJECT_NAME>/`).
2. Apply identical:
   - TypeScript config
   - ESLint + Prettier config (copy from onsiteIT)
   - Package manager (npm/yarn/pnpm/bun — match onsiteIT)
   - Folder structure conventions
3. Set all internal references to `<PROJECT_NAME>`.
4. Install dependencies.

---

## Step 4: Build the Prototype

Implement all features described in the brief. Quality bar:

- **Responsive design** — mobile-first, works at 375px and 1280px+.
- **Loading states** — skeleton loaders or spinners on async operations.
- **Error states** — meaningful error messages, not blank screens.
- **Realistic placeholder data** — hardcoded fixtures that look production-like, not "Lorem ipsum" or "test123".
- **Navigation** — every page/view implied by the brief must exist and be reachable.
- **Visual language** — match the component library and styling conventions from onsiteIT exactly.
- **No "coming soon" stubs** — every feature must be implemented or have a clearly functional placeholder with realistic UI.

---

## Step 5: Environment & Config

1. Create `.env.example` listing all required environment variables with placeholder values and comments.
2. Set canonical URL:
   - Next.js: `NEXT_PUBLIC_SITE_URL=https://<PROJECT_NAME>.servicevision.io`
   - Other frameworks: use the framework-appropriate env var name.
3. Create or update `vercel.json`:
   ```json
   {
     "name": "<PROJECT_NAME>-servicevision"
   }
   ```
4. Ensure `.env.local` (if created) is in `.gitignore`.

---

## Step 6: Deploy to Vercel

```bash
vercel --prod --yes
```

- Capture the Vercel-assigned deployment URL (e.g., `https://<PROJECT_NAME>-servicevision.vercel.app`).
- If the Vercel CLI is not installed, install it first: `npm install -g vercel`.
- If not logged in, run `vercel login` and instruct the user to authenticate.

After deployment succeeds, link the custom domain:

```bash
vercel domains add <PROJECT_NAME>.servicevision.io
```

---

## Step 7: Cloudflare DNS

Add a CNAME record on the `servicevision.io` zone using the Cloudflare API.

Read the Cloudflare API token from `~/.config/claude/credentials.md` (look for `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` for servicevision.io).

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "CNAME",
    "name": "<PROJECT_NAME>",
    "content": "cname.vercel-dns.com",
    "proxied": true,
    "ttl": 1
  }'
```

- `ttl: 1` = Auto when `proxied: true`.
- Confirm the API response shows `"success": true`.
- If the record already exists, update it (PATCH) rather than failing.

---

## Step 8: Login Notification via Resend

Every prototype that has any kind of login/sign-in/auth screen must email `info@servicevision.io` whenever a user authenticates — so we know when prospects are exploring.

**Every login must also capture a real, verified work email for the visitor** (the lead), separate from whatever demo account they sign in with. The work email is:
- **Required** — login cannot proceed without it.
- **Verified by one-time code** — we email a 6-digit code (via Resend) and gate access on it, proving the visitor controls the inbox. This is real verification, not just a well-formed address.
- **Deliverable** — because the code has to arrive for them to get in, every captured lead is a real, reachable address.

The verified work email is what we send in the notification; the demo persona they explore as is included as a secondary field. (This is the same flow as the `bookkeeper` reference prototype, which is the quality bar.)

**Skip this step only if the prototype has zero login surface** (pure marketing site with no auth).

### 8a. Install Resend
```bash
npm install resend
```

### 8b. Create the notify API route

For Next.js App Router, write `src/app/api/login-notify/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export const runtime = 'nodejs'

const FROM = '<PROJECT_NAME_TITLECASE> <info@servicevision.io>'
const TO = 'info@servicevision.io'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isValidEmail(s: string): boolean {
  return s.length <= 254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/.test(s)
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return NextResponse.json({ ok: false, error: 'RESEND_API_KEY not configured' }, { status: 200 })

  let body: { email?: string; role?: string; name?: string; demoAccount?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const email = (body.email ?? '').trim().slice(0, 254)
  const role = (body.role ?? '').trim().slice(0, 32)
  const name = (body.name ?? '').trim().slice(0, 80)
  const demoAccount = (body.demoAccount ?? '').trim().slice(0, 254)
  if (!isValidEmail(email)) return NextResponse.json({ ok: false, error: 'invalid email' }, { status: 400 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const ua = req.headers.get('user-agent') ?? 'unknown'
  const ts = new Date().toISOString()
  const s = { email: escapeHtml(email), role: escapeHtml(role || 'unknown'), name: escapeHtml(name || 'unknown'), demo: escapeHtml(demoAccount || 'unknown'), ip: escapeHtml(ip), ua: escapeHtml(ua), ts: escapeHtml(ts) }

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:24px;color:#0f172a"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#1e293b;color:#fff;padding:18px 24px"><h1 style="margin:0;font-size:16px;font-weight:700"><PROJECT_NAME_TITLECASE> · Login Event</h1></div><div style="padding:24px"><p style="margin:0 0 16px;font-size:14px;color:#475569">A user just signed in to the <PROJECT_NAME_TITLECASE> prototype with a verified work email.</p><table style="width:100%;font-size:13px;border-collapse:collapse"><tr><td style="padding:8px 0;color:#64748b;width:120px">Work email</td><td style="padding:8px 0;font-weight:600">${s.email}</td></tr><tr><td style="padding:8px 0;color:#64748b">Name</td><td style="padding:8px 0">${s.name}</td></tr><tr><td style="padding:8px 0;color:#64748b">Role</td><td style="padding:8px 0">${s.role}</td></tr><tr><td style="padding:8px 0;color:#64748b">Demo account</td><td style="padding:8px 0">${s.demo}</td></tr><tr><td style="padding:8px 0;color:#64748b">Timestamp</td><td style="padding:8px 0">${s.ts}</td></tr><tr><td style="padding:8px 0;color:#64748b">IP</td><td style="padding:8px 0">${s.ip}</td></tr><tr><td style="padding:8px 0;color:#64748b">User Agent</td><td style="padding:8px 0;font-size:11px;color:#64748b">${s.ua}</td></tr></table></div><div style="padding:12px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">Sent from <PROJECT_NAME>.servicevision.io</div></div></body></html>`
  const text = `<PROJECT_NAME_TITLECASE> login event\nWork email: ${email}\nName: ${name || 'unknown'}\nRole: ${role || 'unknown'}\nDemo account: ${demoAccount || 'unknown'}\nTime: ${ts}\nIP: ${ip}\nUA: ${ua}`

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({ from: FROM, to: TO, subject: `<PROJECT_NAME_TITLECASE> login: ${email}`, html, text })
    if (error) { console.error('[login-notify]', error); return NextResponse.json({ ok: false }, { status: 200 }) }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[login-notify]', e)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
```

Replace `<PROJECT_NAME_TITLECASE>` with the project's display name (e.g., "StructureBiz") and `<PROJECT_NAME>` with the subdomain slug.

### 8c. Add the OTP routes (`send-code` + `verify-code`)

Verification is a 6-digit one-time code emailed via Resend, validated with a **stateless HMAC-signed token** — no database, no session store. `send-code` generates the code, emails it, and returns a token that encodes `(email, expiry, hmac)`; `verify-code` re-derives the HMAC from the submitted code and compares. The code itself is never exposed to the client.

Write `src/app/api/send-code/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createHmac, randomInt } from 'crypto'

export const runtime = 'nodejs'

const FROM = '<PROJECT_NAME_TITLECASE> <info@servicevision.io>'
const SECRET = process.env.NOTIFY_SECRET ?? '<PROJECT_NAME>-demo-secret-v1'
const TTL_MS = 10 * 60 * 1000 // codes valid 10 minutes

function isValidEmail(s: string): boolean {
  return s.length <= 254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/.test(s)
}

/** Stateless token: signs (email + code + expiry) so verify needs no storage. Never reveals the code. */
function signToken(email: string, code: string, expires: number): string {
  const h = createHmac('sha256', SECRET).update(`${email.toLowerCase()}.${code}.${expires}`).digest('hex')
  return Buffer.from(JSON.stringify({ e: email.toLowerCase(), x: expires, h })).toString('base64url')
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return NextResponse.json({ ok: false, error: 'email-not-configured' }, { status: 200 })

  let body: { email?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const email = (body.email ?? '').trim().slice(0, 254)
  if (!isValidEmail(email)) return NextResponse.json({ ok: false, error: 'invalid-email' }, { status: 400 })

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expires = Date.now() + TTL_MS
  const token = signToken(email, code, expires)

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:24px;color:#0f172a"><div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#2563eb;color:#fff;padding:18px 24px"><h1 style="margin:0;font-size:16px;font-weight:700"><PROJECT_NAME_TITLECASE> demo access</h1></div><div style="padding:28px 24px;text-align:center"><p style="margin:0 0 12px;font-size:14px;color:#475569">Your verification code is</p><p style="margin:0;font-size:36px;font-weight:800;letter-spacing:8px;color:#0f172a">${code}</p><p style="margin:16px 0 0;font-size:12px;color:#94a3b8">Enter this code in the demo to continue. It expires in 10 minutes. If you didn't request this, you can ignore this email.</p></div><div style="padding:12px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8"><PROJECT_NAME>.servicevision.io</div></div></body></html>`
  const text = `Your <PROJECT_NAME_TITLECASE> demo verification code is ${code}. It expires in 10 minutes.`

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({ from: FROM, to: email, subject: `Your <PROJECT_NAME_TITLECASE> code: ${code}`, html, text })
    if (error) { console.error('[send-code]', error); return NextResponse.json({ ok: false, error: 'send-failed' }, { status: 200 }) }
    return NextResponse.json({ ok: true, token, expires })
  } catch (e) {
    console.error('[send-code]', e)
    return NextResponse.json({ ok: false, error: 'send-failed' }, { status: 200 })
  }
}
```

Write `src/app/api/verify-code/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

export const runtime = 'nodejs'

const SECRET = process.env.NOTIFY_SECRET ?? '<PROJECT_NAME>-demo-secret-v1'

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export async function POST(req: NextRequest) {
  let body: { email?: string; code?: string; token?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const email = (body.email ?? '').trim().toLowerCase()
  const code = (body.code ?? '').trim()
  const token = (body.token ?? '').trim()
  if (!email || !/^\d{6}$/.test(code) || !token) {
    return NextResponse.json({ ok: false, error: 'invalid-input' }, { status: 200 })
  }

  let payload: { e: string; x: number; h: string }
  try {
    payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
  } catch {
    return NextResponse.json({ ok: false, error: 'bad-token' }, { status: 200 })
  }

  if (payload.e !== email) return NextResponse.json({ ok: false, error: 'email-mismatch' }, { status: 200 })
  if (Date.now() > payload.x) return NextResponse.json({ ok: false, error: 'expired' }, { status: 200 })

  const expected = createHmac('sha256', SECRET).update(`${email}.${code}.${payload.x}`).digest('hex')
  if (!safeEqual(expected, payload.h)) {
    return NextResponse.json({ ok: false, error: 'wrong-code' }, { status: 200 })
  }

  return NextResponse.json({ ok: true })
}
```

Set `SECRET`'s fallback string per project and pick the email header color to match the project's accent.

### 8d. Wire the two-step login form

The login page becomes a two-step flow with `step` state (`'email' | 'code'`). The visitor enters their work email and picks a demo persona, gets a code, enters it, then enters the app. Key state and handlers (full reference: the `bookkeeper` prototype's `src/app/page.tsx`):

```tsx
const [step, setStep] = useState<'email' | 'code'>('email')
const [workEmail, setWorkEmail] = useState('')
const [code, setCode] = useState('')
const [token, setToken] = useState('')
const [error, setError] = useState('')
const [loading, setLoading] = useState(false)

const emailValid = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/.test(workEmail.trim())
const codeValid = /^\d{6}$/.test(code)

// Step 1 — email the visitor a 6-digit code.
async function handleSendCode(e?: React.FormEvent) {
  e?.preventDefault()
  if (!emailValid) { setError('Enter a valid work email to continue.'); return }
  setLoading(true); setError('')
  try {
    const res = await fetch('/api/send-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: workEmail.trim() }),
    })
    const data = await res.json()
    if (!data.ok) { setError(data.error === 'send-failed' ? 'We couldn’t send the code. Try again.' : 'Please enter a valid email.'); setLoading(false); return }
    setToken(data.token); setStep('code'); setCode('')
  } catch { setError('Network error. Please try again.') }
  setLoading(false)
}

// Step 2 — verify the code, then enter the demo.
async function handleVerify(e: React.FormEvent) {
  e.preventDefault()
  if (!codeValid) { setError('Enter the 6-digit code from your email.'); return }
  setLoading(true); setError('')
  try {
    const res = await fetch('/api/verify-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: workEmail.trim(), code, token }),
    })
    const data = await res.json()
    if (!data.ok) { setError(data.error === 'expired' ? 'That code expired. Request a new one.' : 'Incorrect code. Please try again.'); setLoading(false); return }
  } catch { setError('Network error. Please try again.'); setLoading(false); return }

  const found = roles.find((r) => r.role === selectedRole)
  // Verified lead capture — confirmed, deliverable work email + the demo persona chosen.
  fetch('/api/login-notify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: workEmail.trim(),
      role: found?.label ?? 'unknown',
      name: `Verified · explored as ${found?.label ?? 'demo'}`,
      demoAccount: found?.email ?? '',
    }),
    keepalive: true,
  }).catch(() => {})
  login(workEmail, '', selectedRole)
  router.push('/dashboard')
}
```

UI notes: the email step has the work-email input + persona selector + "Email me a code" button (disabled until `emailValid`); the code step shows "We sent a code to {workEmail}", a centered numeric input (`inputMode="numeric"`, `autoComplete="one-time-code"`, `autoFocus`, strip non-digits to 6 chars), a "Verify & enter" button (disabled until `codeValid`), and "← Use a different email" / "Resend code" links. Buttons show "Sending code…" / "Verifying…" while `loading`.

> **Lighter variant (only if the brief explicitly wants zero-friction):** skip the code step and instead verify the domain server-side with a DNS MX lookup + personal-domain rejection (`node:dns/promises` `resolveMx`). It proves the domain is real but not that the visitor owns the inbox — so OTP is the default.

### 8e. Push secrets to Vercel

Read the Resend API key from `~/.config/claude/credentials.md` (the `Resend | API Key` row paired with `From Email | info@servicevision.io`). Push it plus a fresh `NOTIFY_SECRET` (the HMAC key for the OTP token) to **both** production and preview:

```bash
printf "<RESEND_API_KEY>" | vercel env add RESEND_API_KEY production --force
printf "<RESEND_API_KEY>" | vercel env add RESEND_API_KEY preview --force
printf "%s" "$(openssl rand -hex 32)" | vercel env add NOTIFY_SECRET production --force
printf "%s" "$(openssl rand -hex 32)" | vercel env add NOTIFY_SECRET preview --force
```

`NOTIFY_SECRET` is optional (the routes fall back to a built-in demo secret), but set it so tokens can't be forged. Add `RESEND_API_KEY=` and `NOTIFY_SECRET=` (commented) to `.env.example`.

### 8f. Redeploy and verify

```bash
vercel --prod --yes

# send-code: real send to an inbox you control → returns a signed token.
curl -s -X POST https://<PROJECT_NAME>.servicevision.io/api/send-code \
  -H "Content-Type: application/json" -d '{"email":"info@servicevision.io"}'    # → {"ok":true,"token":"…","expires":…}
# send-code: malformed address is rejected.
curl -s -X POST https://<PROJECT_NAME>.servicevision.io/api/send-code \
  -H "Content-Type: application/json" -d '{"email":"notanemail"}'               # → {"ok":false,"error":"invalid-email"}
# verify-code: a wrong code against that token is rejected (paste the real token).
curl -s -X POST https://<PROJECT_NAME>.servicevision.io/api/verify-code \
  -H "Content-Type: application/json" -d '{"email":"info@servicevision.io","code":"000000","token":"<TOKEN>"}'  # → {"ok":false,"error":"wrong-code"}

# Notify route: includes the verified work email + the demo persona.
curl -s -X POST https://<PROJECT_NAME>.servicevision.io/api/login-notify \
  -H "Content-Type: application/json" \
  -d '{"email":"you@yourcompany.com","role":"demo","name":"Smoke Test","demoAccount":"admin@<PROJECT_NAME>.io"}'  # → {"ok":true}
```

Expect `send-code` to return a token (and a real code to land in the inbox), the failure paths to reject, the notify route to return `{"ok":true}`, and an email in `info@servicevision.io`. The wrong-code/email-mismatch/expired paths confirm the HMAC without needing the emailed code.

> **Note (Vercel CLI quirk):** older CLI versions reject `vercel env add … preview --force` non-interactively. If preview won't take, use `vercel env add <NAME> preview --value "<value>" --yes`, or just upgrade the CLI. Production is what the live demo runs on.

### Security checklist (do not skip)
- ✅ Access **gated on a one-time code** emailed to the work address — proves inbox control, not just a valid string.
- ✅ Stateless **HMAC-signed token** (`NOTIFY_SECRET`) — the 6-digit code is never sent to the client; verify re-derives and compares with `timingSafeEqual`.
- ✅ Codes **expire** (10 min) and the token is bound to the exact email (`email-mismatch` rejected).
- ✅ All crypto + sending runs server-side in the `nodejs` runtime — uses `randomInt` (CSPRNG), never `Math.random`.
- ✅ Emails validated via bounded regex (no nested quantifiers — safe-regex friendly).
- ✅ Internal alert is **plain text only** — user-controlled values are never interpolated into HTML (Bible decision 12; no custom `escapeHtml`). Field length caps (email 254, role 32, name 80, demoAccount 254).
- ✅ Routes fail-soft — never throw into the login flow.
- ✅ `From:` uses a verified Resend domain (`servicevision.io`) — never spoof user domains.

---

## Step 8.5: GTM paved-road alignment (the handoff contract)

Every prototype is **stage one of the StartupVision lifecycle** (prototype → MVP → last mile → market). It must ship *toward* the 11-layer GTM machine so the GTM Sprint picks it up with zero rework. Full spec: `~/dev2/GTM-SaaS/docs/handoff/PAVED-ROAD-HANDOFF.md`. Apply all four:

### 8.5a — Lead capture writes to Attio (the CRM is the source of truth)
The OTP flow already captures a **verified, deliverable work email** — route that same lead into Attio so it enters the machine, not just an inbox. In the `verify-code` success path (server-side), upsert the person (first-touch `lead_source="StartupVision prototype"`) and add a `prototype_leads` list entry (`form_type="prototype-signup"`, `source_site="<PROJECT_NAME>.servicevision.io"`). Copy the `toAttio()` helper from the handoff contract (§"The load-bearing fix"). `ATTIO_API_KEY` from the vault → Vercel env. Never-lose-a-lead: if the key is missing or the call fails, log and continue — the email notify still fires. One-time: ensure the `prototype_leads` list exists (`setup-attio-brand.mjs`).

### 8.5b — Internal alert is PLAIN TEXT only (fix the escapeHtml anti-pattern)
Do **not** hand-roll `escapeHtml` and interpolate user-controlled values into an HTML email — Bible decision 12 forbids it (validation regexes admit `<`), and the house rule bans custom `escapeHtml`. **Send the login/lead alert as `text` only** (drop the `html` field). The values are already length-capped and email-validated; a plain-text alert carries them with zero injection surface. Remove the `escapeHtml` function.

### 8.5c — Emit the paved-road stubs
Copy from `~/dev2/GTM-SaaS/templates/paved-road/` into the project root, replacing `<PROJECT_NAME>`:
- `AGENTS.md` — doctrine-as-code carrier (sanctioned stack, the load-bearing rules).
- `GO-LIVE.md` — the go-live-gate stub the product clears before real launch.
- Merge the `env.example` slots (`ATTIO_API_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `NEXT_PUBLIC_POSTHOG_KEY`, `SENTRY_DSN`) into the project's `.env.example`.

### 8.5d — Point visitors toward the lifecycle
Add a subtle footer link — "Built by StartupVision · [take your product to market](https://gtm.startupvision.net)" — so a prospect exploring the prototype can flow into the GTM machine.

---

## Step 9: Verify

Wait ~30 seconds for propagation, then:

```bash
curl -s -o /dev/null -w "%{http_code}" https://<PROJECT_NAME>.servicevision.io
```

Assert HTTP `200` (or `301`/`302` redirect that resolves to 200).

---

## Step 10: Final Summary

Output a clean summary block:

```
## Prototype Build Complete

| Field                | Value |
|----------------------|-------|
| Project Name         | <PROJECT_NAME> |
| Live URL             | https://<PROJECT_NAME>.servicevision.io |
| Vercel Project       | <VERCEL_DEPLOYMENT_URL> |
| Vercel Project Name  | <PROJECT_NAME>-servicevision |
| DNS Record           | CNAME <PROJECT_NAME> → cname.vercel-dns.com (proxied) |
| Login Notify         | ✅ Resend (plain text) → info@servicevision.io  (or N/A if no auth) |
| Attio lead capture   | ✅ prototype_leads (first-touch lead_source)  (or N/A) |
| Paved-road stubs     | ✅ AGENTS.md · GO-LIVE.md · env slots · GTM footer link |

### Environment Variables Still Needing Real Values
- List any vars in .env.example that still have placeholder values and need real secrets/keys

### Next Steps
- List any features described in the brief that are stubbed vs fully implemented
```

---

## Rules

1. **Project name comes from the CWD** — never prompt the user for it; derive it automatically.
2. **Mirror the chosen reference** — use `onsiteIT` or `electronicsw` from `~/dev2/clients/prototypes/`; pick by domain fit; replicate stack and style exactly.
3. **Brief first, then code** — always collect the brief before writing any files.
4. **Read credentials from** `~/.config/claude/credentials.md` — never ask the user to paste API tokens.
5. **No placeholder content** — every page must look like a real product demo.
6. **Typed code only** — TypeScript strict mode if onsiteIT uses TypeScript.
7. **Deploy is non-optional** — complete all deployment steps; don't stop at local scaffold.
8. **Login notification + verified work email are non-optional when there is a login** — if the prototype has any auth/sign-in screen, Step 8 must ship: a required work email verified by a 6-digit OTP (Resend + HMAC token) gating access, captured into the Resend notification (→ `info@servicevision.io`, **plain text**) alongside the demo persona, **and written to Attio** (`prototype_leads`, first-touch `lead_source`) per Step 8.5 — the CRM is the source of truth, the email is a secondary signal. Pure marketing sites with no auth may skip the OTP, but still apply Step 8.5c–d (stubs + lifecycle pointer).
