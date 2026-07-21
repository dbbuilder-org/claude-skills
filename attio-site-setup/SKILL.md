---
name: attio-site-setup
description: Use when connecting a site or app (Nuxt, Next.js, React, Vue, ASP.NET Core) to the shared multi-brand Attio workspace — new brand lead capture, CRM funnel setup, forms feeding Attio, or when a second site must not disturb an existing brand's pipeline. Also use when a site's leads land as people but never enter a pipeline list, or when invoked from a repo with no Attio integration yet.
---

# Attio Site Setup (Multi-Brand Workspace)

## Overview

Wire a site's lead capture into the shared Attio workspace so each brand runs a
**complementary, never competitive** funnel. Core principle: **people and companies are
shared and brand-neutral; everything brand-specific lives on that brand's list.** The
same person can sit at different stages in two brand funnels simultaneously — that is the
separation guarantee.

## The Convention (non-negotiable rules)

| Rule | Detail |
|---|---|
| Shared objects | Upsert `people` by email, `companies` by domain. Never fork per-brand person/company objects. |
| `lead_source` | Workspace-wide TEXT attribute = first touch ever. Write `"<Brand> website"` ONLY when the person doesn't already exist. Never overwrite. |
| Per-brand list | `<brand>_leads` (parent `people`) holds the funnel: `stage` status attribute + entry-level fields (`form_type`, UTM, consent). |
| No new person attributes | Brand-specific data goes on list ENTRIES or Notes. (`product_interest` on people is a legacy DriverTrack field — don't write it from other brands, don't copy the mistake.) |
| Products are records | The workspace has `products` and `deals` objects. Create a product record per offering the site sells; deals reference products + people when a lead advances. The funnel starts at the list entry; the deal starts at qualification. |
| Consent per brand | Opt-in flags (`newsletter_opt_in` etc.) are entry attributes on the brand list — never a person-level "subscribed". Unsubscribes must not cross brands. |
| Token per app | Issue a dedicated Attio access token per site/backend; store in the credentials vault + platform env. Revocation must not break sibling brands. |
| Never lose a lead | Honeypot short-circuit `{ok:true}`; CRM failure → structured `console.error('[lead:...]')` log and still `{ok:true}` to the visitor. |
| Deals | Form submission NEVER creates a deal. A deal (referencing person + product records) is created manually by a rep at qualification — or by later automation, not the site. |
| Legacy artifacts | Existing workspace leftovers (the empty generic `leads` list, `lead_detail`, another brand's attributes): don't write to them, don't delete them — flag to the workspace owner. |
| Email consumption | Sequence/newsletter tools enroll from saved VIEWS on the brand list filtered by the consent flag — never from raw person queries. |
| Multi-domain brands | One brand = one list = one token = one `lead_source` value, even across multiple sites/markets (e.g. .com + .uk). Distinguish with a `market` (or `site`) select on the entry. Split lists only when the funnels are worked by genuinely separate teams. |
| Cross-site links | Structural links between brand-family properties carry `?utm_source=<sending-site>&utm_medium=referral&utm_campaign=cross-link`. Referrer policy strips paths cross-origin, so without UTM you lose WHICH page sent the lead. |
| No forms yet | If the site's only lead capture is `mailto:` links, building the forms (honeypot, consent checkbox default-unchecked, UTM capture, POST to the handler) is IN scope — keep mailto as fallback link. |
| Consent semantics | Send the consent flag ONLY when the form actually showed the checkbox — omit otherwise. "Not asked" and "declined" must stay distinguishable in the CRM. |
| E2E test hygiene | Test leads use `e2e-<timestamp>@example.com` and MUST be deleted after verification (`DELETE /v2/objects/people/records/:id` — list entries go with the person). A production CRM accumulating fake people is a failed verification step. |

## Procedure

0. **Discover before asking.** Infer from the current repo and machine — do not
   interrogate the user for things that are discoverable:
   - **Brand + domain**: README/CLAUDE.md/package.json name, git remote, domain strings
     in config or brand/ folders.
   - **Stack**: `nuxt.config.*` → Nuxt; `next.config.*` → Next.js; `*.sln`/`*.csproj` →
     ASP.NET Core backend (Vue/React frontend is then just the form client); plain SPA
     with no backend → serverless function.
   - **Credentials**: check `~/.config/claude/credentials.md` for an "Attio" section —
     the workspace-level key there is for the read-only inventory (step 1). The brand's
     own token is minted in Attio → Workspace settings → Developers; if it doesn't
     exist yet, plan for the user to mint it (never reuse another brand's token).
   Then ask the user at most TWO things: (a) the offerings/products this site sells, if
   not inferable, and (b) confirmation of the inferred brand config before any live
   workspace mutation. Everything else proceeds from discovery.
1. **Inventory the live workspace first** — `GET /v2/objects`, `/v2/lists`, and
   `/v2/objects/people/attributes`. Trust the API, not sibling repo code (UI drift is
   real; e.g. `lead_source` is text, not select). Note existing lists/slugs so the new
   brand's slugs don't collide.
2. **Run the setup script** — copy `setup-attio-brand.mjs` (this directory), set the
   BRAND config block, run with the new token. Idempotent: safe to re-run. Creates the
   brand list, `stage` statuses, entry attributes + ALL select options (Attio never
   auto-creates options on write), and asserts one `products` record per offering.
3. **Wire the site** — copy `attio-integration.ts` (this directory) into the server
   layer; write the form handler: validate → honeypot → `assertPerson` →
   `assertCompany` (skip free-mail domains) → `addListEntry` → `addNote` for free text.
   - Nuxt: `server/utils/` + `server/api/*.post.ts`, key via `runtimeConfig`
   - Next.js: `app/api/*/route.ts` (or `pages/api`), key via `process.env`
   - React/Vue SPA: same code in a serverless function (Vercel/Netlify) — the token
     must NEVER ship client-side
   - ASP.NET Core (.NET backend + Vue/React frontend): port `attio-integration.ts` to a
     typed `AttioClient` service (HttpClient, same four operations: AssertPerson,
     AssertCompany, AddLeadEntry, AddNote; same first-touch and never-lose-a-lead
     rules), minimal-API or controller endpoint `POST /api/lead`, token via
     configuration `Attio:ApiKey` (user-secrets locally, env var in prod). The TS file
     is the canonical semantics — port it, don't redesign it.
4. **Env + vault** — `ATTIO_API_KEY` (framework-prefixed as needed) in platform env;
   token recorded in `~/.config/claude/credentials.md` under the brand's heading.
5. **Verify end-to-end** — curl the deployed form endpoint with a test lead, then query
   Attio: person exists, `lead_source` correct, entry present in the brand list with
   stage + attribution, note attached. Re-submit same email: no duplicate person,
   `lead_source` unchanged, new entry (one per touch is intended).
6. **Record** — brand section in the project docs (list slug, stages, token name);
   update the workspace-conventions memory if a new rule emerged.
7. **Day-2 operations (manual, in the Attio UI — flag for the owner):** saved views on
   the brand list (per `source_site`/`market`; `newsletter_opt_in = true` for email
   enrollment; `stage = New inquiry` sales queue); optional webhook on stage transitions
   (Slack notify); payment→stage automation is Phase 2, needs the Webhooks token scope.

## Attribution Model (three layers)

Every lead should be answerable at three altitudes — set up all three:

1. **`lead_source` on the person** — first brand touch EVER, workspace-permanent, set
   only at person creation. Answers "which brand found them first."
2. **`source_site` / `market` on the entry** — which property converted them on THIS
   touch. Answers "where did this lead event happen."
3. **UTM + referrer + landing_page on the entry** — how the session arrived. Captured
   client-side first-touch-per-session (sessionStorage composable + plugin), sent with
   every submit.

**The gap layer 3 has by default:** cross-origin referrer policy
(`strict-origin-when-cross-origin`) strips the path — a lead who read
`pellcompliance.com/library/some-article` and clicked through to drivertrack.ai shows
only `referrer: https://pellcompliance.com/`. You know the site, not the page. That is
why the Cross-site links rule exists: structural links between family properties carry
`?utm_source=<sending-site>&utm_medium=referral&utm_campaign=cross-link`, which
survives the hop and lands in the entry's UTM fields. Content deep-links may stay
untagged (origin-level referrer still attributes the site); tag anything structural
(nav, footer, callout boxes, CTAs).

## Common Mistakes

- **Skipping the products/deals layer** — leads enter a list but the site's offerings
  don't exist as `products` records, so later deals have nothing to reference. Create
  them in step 2, not "later".
- **Copying a sibling repo instead of inventorying** — repo code lags workspace reality.
- **Person + note but no list entry** — the lead never enters a pipeline and sequences
  (which enroll from list views) never see it.
- **Auto-subscribing** — consent checkboxes default unchecked; store the flag on the
  entry.
- **Reusing another brand's token or stage semantics debates** — token is per app;
  reusing stage TITLES across brands is fine (aids reporting), sharing the list is not.

## Attio API Quirks (verified 2026-07-20 against live workspace)

The setup script handles all of these, but you'll hit them if you write against the
API directly. Documenting so nobody re-derives the same debugging.

- **`POST /v2/lists` — parent_object is a STRING; GET returns an ARRAY.** POST body
  needs `"parent_object": "people"`. `GET /v2/lists/:slug` returns `"parent_object":
  ["people"]`. Symmetric round-trip fails with "Expected string, received array".
- **`POST /v2/lists` — `workspace_member_access: []` is REQUIRED.** Omit it and the
  400 error only reveals it in `validation_errors`, not the top-level message.
- **`POST /v2/lists/:slug/attributes` — four fields are ALL required on every attribute
  regardless of type:** `is_required`, `is_unique`, `is_multiselect` (yes, even on
  text/number/checkbox/timestamp), and `config` (object; `{}` accepts defaults).
  Missing any produces "Body payload validation error" with no clue in the message —
  the details are in `validation_errors[]`.
- **`products.name` attribute slug is workspace-specific.** Attio's default `products`
  template uses `product_name`, not `name`. Detect at runtime by GET'ing the products
  attributes and picking the `is_unique: true` text attribute — hard-coding either
  slug will break on some workspaces. The setup script does this now via
  `detectProductsNameSlug()`.
- **`lead_source` is TEXT, not SELECT.** The Attio UI renders it like a picklist but
  the API type is `text`. Never try to add "options" — just write the string.
- **Silent error messages.** Attio's top-level `message` on 400s often says only "Body
  payload validation error". The useful info is in `validation_errors[]`. Any
  API-call helper should surface that array when logging failures — the base template
  now does this in `ensureAttribute`.

## Vercel Deployment Quirks (verified 2026-07-20 on FireProof)

Setting up the runtime env and shipping the handler exposed a few Vercel-specific
gotchas worth encoding — they will affect every future brand deploy.

- **`vercel env add NAME preview` cannot be piped from stdin.** For Production and
  Development, `printf "value" | vercel env add NAME production` works. For
  **Preview**, the CLI insists on knowing which git branch (or "all preview branches")
  and treats stdin as ambiguous — you'll get an `action_required / git_branch_required`
  error even with `--value ... --yes` in some CLI versions. Bypass by hitting the
  REST API directly:
  ```bash
  VERCEL_TOKEN=$(python3 -c "import json;print(json.load(open('$HOME/Library/Application Support/com.vercel.cli/auth.json'))['token'])")
  curl -X POST "https://api.vercel.com/v10/projects/$PROJECT_ID/env?teamId=$TEAM_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
    -d '{"key":"ATTIO_API_KEY","value":"...","type":"encrypted","target":["preview"]}'
  ```
- **`"public": true` in `vercel.json` blocks deployment.** It's a legacy Vercel
  config setting that new-schema deploys reject with "should NOT have additional
  property `public`. Please remove it." Strip it from any older static-site
  `vercel.json` before running `vercel deploy --prod` the first time.
- **`vercel deploy --prod` output "promote to production" hint is misleading.** The
  deploy IS production if the CLI logged `target: production` (visible via
  `vercel inspect <url>`). The "next[]" hints are generic — ignore them if inspect
  confirms target=production and status=Ready.
- **Static sites can host serverless functions.** The two FireProof marketing sites
  are plain HTML with no build step (`site/`) or a trivial one (`site-uk/`). Adding
  a Vercel Serverless Function is as simple as creating `<site>/api/lead.js` with a
  default export handler — Vercel autodetects and provisions the function. No
  `vercel.json` change required.

## Progressive Enhancement Pattern (recommended for HTML-only sites)

Baked into the FireProof implementation:

- Every CTA stays as `<a href="mailto:...?subject=...">` for graceful degradation.
- A vanilla-JS widget (`js/lead-form.js`) intercepts clicks on anchors carrying a
  `data-lead-form="<form_type>"` attribute and opens an in-page modal instead.
- The widget POSTs to `/api/lead` and closes on success; on failure it displays the
  mailto fallback address so the visitor can still reach sales.
- **Never lose a lead:** the server handler ALWAYS returns `{ok:true}` — even on
  CRM outage — and logs `[lead:crm-failed]` with the payload for later replay.
- **Honeypot as silent success:** a hidden `website` field short-circuits to
  `{ok:true}` with no CRM writes. Same visible outcome as a legitimate submit;
  spam and real leads are indistinguishable to a bot.
- **Attribution capture:** UTM params + `document.referrer` + `window.location.href`
  are collected client-side and passed with the payload; the visitor never sees
  or edits them.

## Multi-Site Same-Brand Pattern (US + UK)

FireProof runs `fireproofapp.com` + `fireproofapp.uk` from one repo. The pattern:

| Piece | Layout |
|---|---|
| Server handler | `site/api/lead.js` + `site-uk/api/lead.js` — differ only in `MARKET = 'US'` vs `'GB'` and a header comment |
| Client widget | `site/js/lead-form.js` + `site-uk/js/lead-form.js` — byte-identical |
| HTML pages | Duplicated per site (they render different content anyway) |
| Attio | **One list** (`fireproof_leads`), **one token**, `market` select on the entry distinguishes |
| CI hook | `scripts/marketing-shared/verify-site-parity.mjs` fails the build if the two handlers diverge beyond the allow-list |

The temptation to symlink or `import` across sites is real; the reality is
Vercel scans each project root independently and cross-project imports create
resolution headaches at build time. **Duplicate and check parity in CI** is the
lower-risk pattern.

## Idempotent HTML Enhancer

`scripts/marketing-shared/wire-lead-forms.mjs` is a re-runnable HTML patcher: it
adds `data-lead-form` / `data-plan-interest` attributes to specific mailto anchors
by matching on the `?subject=` substring. Handles the URL-encoding case (US site
uses literal spaces, UK site uses `%20`). Copy this template — it saves a lot of
tedious targeted Edits when a marketing team adds new CTAs.
