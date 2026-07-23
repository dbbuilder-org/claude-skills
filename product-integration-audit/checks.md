# Integration Audit — Dimension Matrix

The fixed check matrix. Every audit runs every dimension; skips must be ⬜ N/A with a reason. Sources of truth: `gtm-bible/OPERATIONS-STACK.md` (layer atlas — mirrored layer-for-layer) and `gtm-bible/devops/` (engineering doctrine; checks marked "go-live gate" derive from `devops/GO-LIVE-CHECKLIST.md`). Types: **[AUTO]** = verify by command/API (record evidence) · **[MANUAL]** = emit UI instructions · **[ASK]** = emit question. Tokens: `~/.config/claude/credentials.md` (GET-only calls; a send-restricted or missing token downgrades the check to [MANUAL], noted).

## 1 · Web presence & domains
- [AUTO] Apex + www resolve, HTTPS 200, correct `<title>`: `curl -sI https://DOMAIN`
- [AUTO] Cousin domain(s) registered + 301 to parent: `curl -sI -o /dev/null -w "%{http_code} %{redirect_url}" https://COUSIN`
- [AUTO] Cert validity/expiry: `openssl s_client` or curl verbose
- [AUTO] Domain registration expiry + auto-renew across the product's WHOLE domain set (whois; one silent lapse = dead brand)
- [AUTO] Vercel project + latest deployment READY (Vercel API, token in `~/Library/Application Support/com.vercel.cli/auth.json`). Enumerate `/v2/teams` for the real teamId FIRST — a guessed slug silently returns an empty deployments list that reads as "no deploys" (false-❌ trap)

## 2 · SEO & discoverability
- [AUTO] `/sitemap.xml` present AND includes content pages (count `<loc>` — static-only sitemap = 🟡; the runtime-content-DB trap)
- [AUTO] `/robots.txt`; schema.org JSON-LD in live HTML; OG image resolves; RSS if content site
- [MANUAL] Google Search Console: property registered, sitemap submitted, no coverage errors — search.google.com/search-console
- [ASK] Any paid acquisition running that needs landing/UTM conventions?

## 3 · Analytics & attribution
- [AUTO] Analytics ACTIVE in **live HTML** — standard is **self-hosted Plausible**: the script points at the portfolio instance (`analytics.<domain>`) AND the brand's domain is registered in that instance; source-code presence alone is ❌-adjacent 🟡 "coded, unconfigured" (GA4/Vercel Insights accepted as legacy). Deploy: `runbooks/PLAUSIBLE-SELFHOST-RUNBOOK.md`
- [AUTO] UTM capture plumbing in repo (attribution composable/widget) and landing in CRM entries (Attio query for utm fields on recent entries)
- [ASK] Are conversion events defined (demo request, tool signup) and reviewed anywhere?
- [ASK] B2B visitor de-anonymization adopted for named-account reveal? (recommended 2026-07-22, not yet decided — US: RB2B/Vector; UK: Leadinfo/Dealfront/GDPR) — turns content readers into Attio account signals

**Satellite/content brands** (e.g. a content property feeding a parent brand's list via `source_site`): dimension 4 entry checks filter by the attribution value; dimension 8 SKUs are ⬜ "parent brand's products" — score the plumbing, not phantom independence.

## 4 · Lead capture → CRM (Attio)
- [AUTO] Brand list exists; recent entries query (`POST /v2/lists/<list>/entries/query`, sort created_at desc) — entries within 30d = live funnel; a list created recently with zero entries ever = 🟡 built-unproven
- [AUTO] Handler in repo: honeypot, never-lose-a-lead logging, first-touch `lead_source`, source/market attribution field
- [AUTO] `products` records exist for the brand's SKUs
- [MANUAL] Attio saved views: stage queue, consent view, per-source views
- [ASK] Who works the New-inquiry queue, and at what SLA?

## 5 · Prospect universe (cultivation runbook state)
- [AUTO] Tier-tagged companies in Attio — SAMPLE a few descriptions first to learn the brand's tag convention (e.g. `[TSP · WARM]`), then count by suffix `· HOT]` / `· WARM]` / `· COOL]`. A naive search for a guessed tag returning 0 is NOT evidence of absence
- [AUTO] `MASTER-PROSPECTS.json` + `STRATEGY-*.md` + `TOP-100` in repo docs
- [ASK] Wedge decision made? Enrichment budget approved?

## 6 · Email infrastructure (per domain: real + cousin)
- [AUTO] `dig MX/TXT` — MX target, single SPF (TWO v=spf1 = ❌ permerror), DMARC present, both DKIM selectors resolve AND serve keys (`dig TXT selector1._domainkey...`)
- [AUTO] info@/support@ routing: where do they land (Exchange alias / Cloudflare routing / nothing)? E2E send-test only on explicit request — audits stay read-only
- [MANUAL] Instantly: warmup health score + days remaining per sender — app.instantly.ai → Email accounts
- [AUTO] Tenant placement sanity: cousin MX → cold tenant pattern, real → production (dig targets differ)

## 7 · Email programs
- [MANUAL] Warm drip sequence exists + enrollment workflow — Attio → Sequences
- [AUTO] Newsletter: consent field on entries with any `true` values; Resend domain/audience configured (Resend API if token permits, else [MANUAL])
- [AUTO] Drip/sequence content drafted in repo docs? (grep drip/sequence docs)
- [ASK] Newsletter cadence commitment + owner?
- [AUTO/ASK] UK/EU audience? If any sending targets .uk/EU: PECR/GDPR rules apply to that motion, NOT CAN-SPAM — flag before launch

## 8 · Sales management
- [AUTO] Stage attribute + full stage set on the brand list (list attributes API)
- [AUTO] Deals object convention: any deals referencing brand products (query deals) — absence early-stage is ⬜ N/A "pre-revenue", not ❌
- [ASK] Reply-culling owner + <4h interested-reply SLA in place? Weekly metrics review happening (which day)?

## 9 · Project management (Linear)
- [AUTO] Team/project for the brand exists (GraphQL `{ projects { nodes { name } } }`, vault key, NO "Bearer" prefix)
- [AUTO] Recent issues (90d) — dormant project = 🟡
- [ASK] Is repo-markdown planning meant to sync to Linear (house `/linear-sync` skill) or is Linear intentionally unused for this brand?

## 10 · Error & log management (Sentry)
- [AUTO] Sentry org project for the brand (API: `GET /api/0/organizations/<org>/projects/`); DSN present in repo/env
- [AUTO] Project has EVER received an event (`firstEvent`/latest-event via API) — DSN present + zero events = 🟡 "wired, never verified" (go-live gate: a test error must be confirmed arriving; audit checks the read-only trace of that)
- [AUTO] The never-lose-a-lead `[lead:*]` console.error paths: do they reach anything watched? (Vercel function logs alone = 🟡 "logged but unwatched")
- [MANUAL] Alert rules → notification channel — sentry.io → Alerts

## 11 · Observability (OpenTelemetry)
- [AUTO] Backend repos: OTel SDK/instrumentation present; traces exporter configured
- [AUTO] Runtime backends: health endpoint live (`curl /health` or platform-declared path → 200); liveness vs readiness separated where the platform supports it (go-live gate reliability item)
- ⬜ Static/prerendered marketing sites: N/A "no runtime backend" — say so explicitly
- [ASK] For real backends: latency/error SLO anyone actually watches? Dashboard of the 2–4 metrics that matter exists (gate hard rule: you cannot launch what you cannot observe)?

## 12 · Uptime monitoring (BetterStack / UptimeRobot)
- [AUTO] Monitor exists for the audited product's user-facing domains + critical API endpoints (BetterStack `GET /api/v2/monitors`, vault token). Monitors on a SIBLING domain (e.g. the app domain when auditing the marketing domain) count as 🟡 for this product — note both
- [AUTO] Status page? Heartbeats for cron-like jobs?
- [MANUAL] Alert routing: who gets paged — betterstack.com → Integrations
- [ASK] On-call: PagerDuty rotation live — weekly primary+secondary (D8/D13)? Who receives this product's pages this week? (org-level: answer once per audit run, applies to all products)

## 13 · CI/CD & repo health
- [AUTO] `gh api repos/<owner>/<repo>` — CI workflows present + passing on default branch; tests run in CI (not just locally)
- [AUTO] Dependabot: `gh api repos/<owner>/<repo>/dependabot/alerts --jq length` (baseline note, dated 2026-07-20: fireproof had 17 open incl 5 high — compare against the LIVE count, don't echo the baseline)
- [AUTO] Branch protection on default branch
- [AUTO] Renovate enabled on the repo (`renovate.json` / org app, D17) — Dependabot alert counts without an update cadence = 🟡
- [AUTO] Paved-road substrate (org-level, once per run): org rulesets + shared CI workflows + stack templates exist (D16) — `gh api orgs/<org>/rulesets`
- [ASK] Portfolio tier (A/B/C, D15) recorded for this product? Tier sets gate depth, testing floor (D19), and launch-calendar slot (D20) — unrecorded tier = 🟡 (org-level gap: the tiering meeting)
- [AUTO] `AGENTS.md` at the repo root (D24, doctrine-as-code carrier) — present + names the product's sanctioned-set slice/tier/market overlay? Missing on an active repo = 🟡 (`devops/docs/13`)
- [AUTO] Golden-state enforcement (D25): lint/static-analysis config present and running in CI (not just committed) — deviations from the sanctioned set should fail a check, not surface later. Config absent = 🟡
- [ASK] Most recent production launch/major release: was the go-live gate run (`gtm-bible/devops/GO-LIVE-CHECKLIST.md` attached to the shipping PR/issue, risk tier recorded)? Never-run gate on a shipped product = 🟡; config-only changes still need the 5-Q fast path

## 14 · Security & legal surface
- [AUTO] Security headers on live site (`curl -sI`: HSTS, X-Content-Type-Options, CSP presence)
- [AUTO] `/privacy` `/terms` (+ `/accessibility` where relevant) live and 200
- [AUTO] CAN-SPAM readiness: physical mailing address available for email footers? (grep site/docs; else [ASK])
- [AUTO] No secrets committed (grep repo for key patterns); vault rows exist for the tokens the brand's CURRENT program state needs (a missing token for a not-yet-started program = ⬜ noted, not ❌)
- [ASK] Vault hardening (D23): this brand's rows in `~/.config/claude/credentials.md` migrated to 1Password Teams shared vaults, file down to pointers? Plaintext rows remaining = 🟡
- [AUTO] Secrets projection model (D26/D27, `devops/docs/14`): repo commits a `.env.op` (secret references) and NO real `.env`/plaintext secrets; dev command runs via `op run`. A committed plaintext `.env` or hand-authored platform env not traceable to 1Password = 🟡
- [ASK] `proj-<brand>` 1Password vault + its dev/CI service accounts exist and are rows in `ACCESS.md`; platform env store (Vercel/Render) is a CI-pushed projection, not dashboard-edited?
- [ASK] Network access (org-level, once per run): access to internal resources is identity-tied, not a shared-password VPN — Cloudflare One (WARP + Access) for user/roaming connectivity, Tailscale for private-DB access without port-opening (`devops/docs/10` §2); contractor access is per-app/tagged, not network-level, and revoked with offboarding?
- [ASK] Access & auth (org-level, once per run): `ACCESS.md` rows exist for this product's systems (two admins min, named recovery owner); 2FA org-enforced; hardware keys on crown jewels (GitHub org, registrar, Azure, 1Password) — `devops/docs/10` §1–2
- [ASK] Continuity (org-level, once per run): nightly repo mirror running; backup payment method on every vendor this product depends on; offboarding checklist walked once as a tabletop — `devops/docs/10` §3–5

## 15 · Payments & billing (if the product sells online)
- [MANUAL] Stripe: products/prices mirror Attio `products`; webhook → (future) stage advance — dashboard.stripe.com
- [ASK] Self-serve vs invoice? Trial mechanics? (⬜ N/A "demo-led sales, no online checkout" is a valid answer — record it)

## 16 · Support & lifecycle
- [AUTO] support@ resolves somewhere deliverable (dig MX + routing check)
- [ASK] Support owner + target response time? Is support@/info@ worked through a **shared team inbox** (Missive — assign/triage/close, internal comments) rather than a personal-inbox black hole? Where do bugs from customers land (Linear? email?)
- [ASK] DB-backed products: backup RESTORED at least once (not just "backups on"), and does a backup-failure alert fire? (go-live gate hard rule; ⬜ N/A for static sites)
- [ASK] Lifecycle governance (`devops/docs/11`): product's lifecycle state recorded; quarterly portfolio review happening (kill criteria asked, drift sweep run)? Not yet started = 🟡 with the first review scheduled


## 17 · Phone, booking & in-app adoption (conversion chain — see OPERATIONS-STACK "The conversion chain")
- [AUTO] Published phone number(s) on the live site — extract and list them
- [ASK] For each: who answers, voicemail state, do calls get logged to Attio as activities? Is it a tracked line?
- [AUTO] Cal.com event type exists for the brand (standard: one account `dbbuilder`, per-brand slug — check `GET /v2/event-types` with the vaulted key) and the booking URL appears on the live site AND in the sequence docs
- [AUTO] Booking webhook wired: a `server/api/webhooks/` route receives Cal.com bookings and advances the Attio entry — grep the repo, then confirm the webhook is registered (`GET /v2/webhooks`)
- [AUTO] In-app adoption (Flows) on logged-in surfaces only: SDK plugin present in repo, `organizationId` in `runtimeConfig.public`, gated to app/tool routes — a Flows install on a *marketing* page is a FINDING (decision 14 scope violation), not a pass
- [ASK] Which Flows experiences are published (dashboard-only knowledge): checklist? post-milestone booking prompt? survey? Do their webhooks write back to Attio via our route?
- [AUTO] Content Factory blog CTA present on published pieces (if the brand is a CF tenant): booking CTA → per-brand Cal.com slug, OR lead CTA → CF `/api/v1/cta` route → Attio person + source note; attribution (`cf_tenant`/`cf_piece` + utm) carried. `ATTIO_API_KEY` set in CF env for lead CTAs

## 18 · Deliverability operations (the sending machine's instrument panel)
- [MANUAL] Google Postmaster Tools: all sending domains (real + cousins) registered — postmaster.google.com
- [MANUAL] Microsoft SNDS registered for the sending infrastructure — sendersupport.olc.protection.outlook.com/snds
- [AUTO/ASK] DMARC `rua=` reports: going somewhere that PARSES them (analyzer service), or an unread mailbox?
- [MANUAL] Blocklist spot-check on sending domains/IPs — public-resolver DBL queries return refusal codes (127.255.255.25x), so without an mxtoolbox API key this is a manual mxtoolbox.com check, not [AUTO]
- [MANUAL] Warmup/campaign health review cadence in the sending tool

## 19 · Reputation & directories
- [AUTO] LinkedIn company page URL returns 200 (curl) — but a 200 may be a DIFFERENT company with the same name: existence is [AUTO], ownership is always [MANUAL]
- [MANUAL] Google Business Profile claimed
- [AUTO/MANUAL] Category directory listings live (G2/Capterra where relevant; the industry directories used as research SOURCES are also where the product should be LISTED)
- [ASK] Review-generation motion (asking happy customers), or intentionally deferred?
