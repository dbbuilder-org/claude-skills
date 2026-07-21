---
name: marketing-send-intro-debrief
description: Send the SeniorProtect marketing intro and project debrief email. Covers the three pillars (identity, money, legacy), voice-first design, business model, M0-M10 milestone summary, and marketing angles. Use when the user says "/marketing-send-intro-debrief", "send the seniorprotect intro email", "send the debrief email", or "send marketing intro to [name/email]".
allowed-tools:
  - Bash
  - Read
  - Write
---

# marketing-send-intro-debrief

Sends the SeniorProtect branded marketing intro and technical debrief email. Designed for technical PMs, potential partners, investors, or stakeholders being introduced to the project for the first time.

---

## Trigger Phrases

- `/marketing-send-intro-debrief`
- "send the seniorprotect intro email"
- "send the debrief email"
- "send marketing intro to [name/email]"
- "send the sp intro"
- "intro debrief"

---

## Instructions

<command-name>marketing-send-intro-debrief</command-name>

### Step 1: Resolve inputs

Extract from the user's message:

| Input | How to resolve |
|-------|---------------|
| **To** | Email address(es) in the message. If none given, ask before proceeding. |
| **CC** | Any CC addresses in the message (e.g. "cc chris@servicevision.net"). Optional. |
| **Recipient name** | First name if inferable from the email (e.g. `ryan@...` → "Ryan"). Use for greeting. |
| **Recipient role** | If mentioned (e.g. "technical PM", "investor", "partner") — use to tune the intro line. Default: generic stakeholder intro. |

### Step 2: Personalize the email

Adjust these elements based on recipient role:

| Role | Intro line | Emphasis |
|------|-----------|----------|
| Technical PM / PM | "Wanted to get you fully up to speed on SeniorProtect — what we're building, where it stands, and the positioning I'd like your help framing for launch." | Include milestone list + tech stack callouts |
| Investor / partner | "We're building the only voice-first security platform designed specifically for seniors — and we'd love your perspective." | Lead with market size + business model |
| Family / non-technical | "We built SeniorProtect to protect people like your parents from the scams and fraud that target seniors every day." | Skip milestone table; lead with story |
| Default | Same as Technical PM | Full debrief |

### Step 3: Build and send the email

Write a Python script and run it via Bash. Use this exact HTML template, substituting `{{RECIPIENT_NAME}}`, `{{INTRO_LINE}}`, and toggling the milestone section based on role.

**Config:**
- **API Key:** vault → credentials.md → SeniorProtect → Resend API Key row (never hardcode — repo is on GitHub)
- **From:** `Chris Therriault <chris@servicevision.net>`
- **Subject:** `SeniorProtect: Project Debrief & Marketing Positioning`

```python
import json, subprocess

RESEND_KEY = "<vault: credentials.md → SeniorProtect → Resend API Key>"
TO         = ["{{RECIPIENT_EMAIL}}"]   # list
CC         = []                        # fill if cc given; omit key if empty
FROM       = "Chris Therriault <chris@servicevision.net>"
SUBJECT    = "SeniorProtect: Project Debrief & Marketing Positioning"

BODY = """{{HTML_BODY}}"""   # substitute full HTML below

payload = {
    "from": FROM,
    "to":   TO,
    "subject": SUBJECT,
    "html": BODY,
}
if CC:
    payload["cc"] = CC

with open('/tmp/sp_intro_email.json', 'w') as f:
    json.dump(payload, f)

result = subprocess.run([
    'curl', '-s', '-X', 'POST', 'https://api.resend.com/emails',
    '-H', f'Authorization: Bearer {RESEND_KEY}',
    '-H', 'Content-Type: application/json',
    '-d', '@/tmp/sp_intro_email.json'
], capture_output=True, text=True)

if result.returncode != 0:
    print(f"curl error: {result.stderr}")
else:
    try:
        resp = json.loads(result.stdout)
        if 'id' in resp:
            print(f"Sent to {TO} — message ID: {resp['id']}")
        else:
            print(f"Resend error: {resp.get('message', resp)}")
    except json.JSONDecodeError:
        print(f"Non-JSON: {result.stdout[:300]}")
```

---

### HTML Template

Use this as the base. Substitute `{{RECIPIENT_NAME}}` (e.g. "Ryan") and `{{INTRO_LINE}}` from Step 2. The milestone section (`<!-- MILESTONES START -->` … `<!-- MILESTONES END -->`) can be removed for non-technical recipients.

```html
<div style="font-family: Georgia, serif; max-width: 680px; margin: 0 auto; color: #1a1a1a; line-height: 1.7;">

<div style="background: linear-gradient(135deg, #7B1FA2 0%, #C62828 100%); padding: 40px 32px; border-radius: 12px 12px 0 0; text-align: center;">
  <h1 style="color: white; font-size: 32px; margin: 0 0 8px 0;">SeniorProtect</h1>
  <p style="color: rgba(255,255,255,0.85); font-size: 16px; margin: 0; font-style: italic;">Protect yourself and your loved ones</p>
</div>

<div style="background: #fff; padding: 40px 32px; border: 1px solid #e5e7eb; border-top: none;">

<p>Hey {{RECIPIENT_NAME}},</p>

<p>{{INTRO_LINE}}</p>

<h2 style="color: #7B1FA2;">The Problem We're Solving</h2>

<p>Americans 65+ lose <strong>$3.4 billion per year to online fraud</strong>. The attacks are sophisticated — AI-generated voice clones, hyper-personalized phishing, fake family emergencies. The people being targeted are our parents and grandparents, and they have no real defense.</p>

<p>Traditional security tools are built for tech-savvy users. Seniors get complexity, jargon, and interfaces that assume they already know what a phishing link looks like. We built something completely different.</p>

<h2 style="color: #7B1FA2;">What SeniorProtect Is</h2>

<p>SeniorProtect is a <strong>voice-first mobile app</strong> that gives seniors and the families watching over them three things:</p>

<div style="background: #F9F5FF; border-left: 4px solid #7B1FA2; padding: 20px 24px; border-radius: 0 8px 8px 0; margin: 24px 0;">

<p><strong style="color: #C62828;">1. Protect Your Identity</strong><br>
Instantly check suspicious emails, texts, and URLs. Our AI analysis engine runs content through pattern matching, Google Safe Browsing, PhishTank, and behavioral fingerprinting — then answers three plain-English questions: <em>Who is this from? What do they want? Should I trust it?</em></p>

<p><strong style="color: #C62828;">2. Protect Your Money</strong><br>
Threat alerts, trusted-site library, and a local resource directory (food banks, senior centers, legal aid) searchable by zip code. When something is dangerous, we say so clearly — and explain why in language that doesn't require a cybersecurity degree.</p>

<p style="margin-bottom: 0;"><strong style="color: #C62828;">3. Protect Your Legacy</strong><br>
The premium tier lets seniors record their life stories — 100 guided memory questions across 8 life categories, answered by voice, enriched by AI (Claude Haiku for per-response summaries, Claude Sonnet for personality profiles), and shared privately with family. Their story becomes their legacy — and the behavioral fingerprint it builds makes our scam detection smarter over time.</p>

</div>

<h2 style="color: #7B1FA2;">The Core Insight (and Why It Wins)</h2>

<p>The Legacy feature generates the best behavioral data in the industry. As a senior records their life story, we learn who they call "Grandma," which bank they've used for 40 years, that they never wire money without calling first. When a scammer impersonates a family member or their "bank," our impersonation detector catches it — because we know this specific person.</p>

<p>No one else can build this. It requires the user's trust and their story. We earn both.</p>

<h2 style="color: #7B1FA2;">Voice Is the Interface</h2>

<p>Seniors understand conversation. They do not understand forms. Every interaction is voice-first:</p>
<ul>
  <li>Tap the mic, describe the suspicious message, get a spoken answer</li>
  <li>Legacy questions are narrated by OpenAI TTS — seniors record answers by voice</li>
  <li>Check results are spoken aloud automatically for danger results</li>
  <li>Alert cards have a speaker button — one tap to hear it explained</li>
</ul>

<h2 style="color: #7B1FA2;">Business Model</h2>

<table style="width: 100%; border-collapse: collapse; font-size: 15px; margin: 16px 0;">
  <tr style="background: #F3F4F6;">
    <th style="padding: 12px 16px; text-align: left;">Free Tier</th>
    <th style="padding: 12px 16px; text-align: left;">Premium &mdash; Your Legacy ($7.99/mo &middot; $59.99/yr)</th>
  </tr>
  <tr style="border-bottom: 1px solid #e5e7eb;">
    <td style="padding: 12px 16px; vertical-align: top;">Email, text &amp; URL scam checking<br>Trusted sites library<br>Local senior resources by zip<br>Alert history<br>Three-question plain-English explanations</td>
    <td style="padding: 12px 16px; vertical-align: top;">Everything in Free, plus:<br>100 guided life-story questions<br>Voice recording (Whisper STT)<br>AI-narrated questions (OpenAI TTS)<br>Claude AI personality profile &amp; narrative<br>Family sharing with notifications<br>Behavioral impersonation protection<br>Daily engagement reminders</td>
  </tr>
</table>

<p>The free tier is the acquisition engine. Premium converts families, not just individuals. One adult child buying a gift subscription for a parent is worth more than a solo signup.</p>

<!-- MILESTONES START -->
<h2 style="color: #7B1FA2;">Where We Are</h2>

<p><strong>M0&ndash;M10 complete.</strong> The app is built, tested (136 automated tests passing), and deploy-ready. Milestone summary:</p>

<ul style="line-height: 2;">
  <li><strong>M0&ndash;M2:</strong> Core infrastructure, Clerk auth, threat analysis engine, check routes</li>
  <li><strong>M3:</strong> Subscription tier (RevenueCat + Stripe), premium gating</li>
  <li><strong>M4:</strong> Legacy foundation &mdash; 100-question bank, DB schema, full CRUD</li>
  <li><strong>M5:</strong> Voice &mdash; TTS narration (OpenAI tts-1-hd), STT transcription (Whisper)</li>
  <li><strong>M6:</strong> AI synthesis &mdash; Claude Haiku per-response enrichment, Claude Sonnet personality profiles</li>
  <li><strong>M7:</strong> Voice for protection &mdash; spoken check results, alert narration, voice scam input</li>
  <li><strong>M8:</strong> Family sharing &mdash; share tokens, family viewer, email notifications</li>
  <li><strong>M9:</strong> Behavioral fingerprinting &mdash; impersonation detection using Legacy story data</li>
  <li><strong>M10:</strong> Production hardening &mdash; Sentry, rate limits, Redis caching, health endpoint, GDPR deletion, render.yaml finalized</li>
</ul>

<p><strong>Next: M11 &mdash; App Store Launch.</strong></p>
<!-- MILESTONES END -->

<h2 style="color: #7B1FA2;">Marketing Angles Worth Exploring</h2>

<ul style="line-height: 2;">
  <li><strong>Gift angle:</strong> "Give your parent the gift of protection &mdash; and preserve their story forever"</li>
  <li><strong>Family peace of mind:</strong> "You can't be there every time their phone rings. We can."</li>
  <li><strong>Legacy urgency:</strong> "Every day without a record is a story lost forever"</li>
  <li><strong>Trust anchor:</strong> Built by ServiceVision &mdash; 20+ years building software for care organizations</li>
  <li><strong>Voice-first positioning:</strong> "The only security app that speaks their language &mdash; literally"</li>
</ul>

<p>Happy to walk through any of this on a call. Let me know what angles you want to develop first.</p>

<p>&mdash; Chris</p>

</div>

<div style="background: #F9F5FF; padding: 20px 32px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
  <p style="font-size: 13px; color: #6B7280; margin: 0;">SeniorProtect &middot; ServiceVision &middot; Built April 2026</p>
</div>

</div>
```

---

### Step 4: Report to user

```
✅ SeniorProtect intro email sent.

To:         {{recipient email(s)}}
CC:         {{cc email(s), or "none"}}
Subject:    SeniorProtect: Project Debrief & Marketing Positioning
Message ID: {{id from Resend}}
```

---

## Config

- **API Key:** vault → credentials.md → SeniorProtect → Resend API Key row (never hardcode — repo is on GitHub)
- **From:** `Chris Therriault <chris@servicevision.net>`
- **Endpoint:** `https://api.resend.com/emails`
- **Payload file:** `/tmp/sp_intro_email.json`

---

## Known Recipients

| Name | Email | Role |
|------|-------|------|
| Ryan | `ryan@servicevision.net` | Technical PM |
| Chris | `chris@servicevision.net` | Author / CC |

---

## Notes

- Always use curl via subprocess — never Python urllib/requests (blocked by Cloudflare with 403)
- Write payload to `/tmp/sp_intro_email.json` before calling curl — never inline with `-d`
- For non-technical recipients, remove the `<!-- MILESTONES START -->` … `<!-- MILESTONES END -->` block
- If no recipient name is inferable, use "there" (e.g. "Hey there,")
- CC is optional — omit the `cc` key from the payload entirely if not provided (do not pass an empty list)
- Subject line is fixed — do not vary it unless the user explicitly asks
