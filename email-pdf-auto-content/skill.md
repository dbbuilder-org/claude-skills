---
name: email-pdf-auto-content
description: Compose and send a beautifully formatted HTML announcement email with a PDF attached. Reads the PDF or project context to auto-generate enticing subject and body copy. Sends via Resend. Use when the user says "email the PDF", "send announcement email", "email with PDF attached", "email-pdf-auto-content", or "announce [product] via email with the PDF".
allowed-tools:
  - Bash
  - Read
  - Glob
---

# email-pdf-auto-content

Composes a polished HTML announcement email, attaches a PDF, and sends it via Resend. Auto-generates subject line and body copy from project/product context.

<command-name>email-pdf-auto-content</command-name>

---

## Inputs (gather before composing)

| Input | Source |
|-------|--------|
| `TO` | From user — one address or list |
| `CC` | Optional — from user |
| `PDF_PATH` | Absolute path to the PDF file to attach |
| `PRODUCT_NAME` | From project context or user |
| `TAGLINE` | Product tagline — landing page hero or user description |
| `CTA_URL` | Primary URL to drive traffic to |
| `CALENDLY_URL` | Optional consult booking link |
| `SENDER_NAME` | From user profile — default: Chris Therriault |
| `FROM_EMAIL` | `info@servicevision.io` (verified Resend domain) |
| `RESEND_KEY` | Load from `~/.config/claude/credentials.md` → servicevision.io Resend row (never copy the value into this file) |

---

## Step 1 — Auto-generate email copy

Read the landing page or PDF context to write:

- **Subject line:** Punchy, benefit-led, under 60 chars. Format: `"Introducing [Product] — [core benefit] in [time/ease]"`
- **Opening line:** Address the reader's pain point or opportunity in one sentence
- **Body:** 2–3 short paragraphs: what it is → how it works (3–5 bullets) → what they get
- **CTA:** Single primary button ("Try [Product] Free →") + optional secondary link

Keep copy tight — assume the reader is skimming. The PDF has the detail; the email creates desire to open it.

---

## Step 2 — Compose HTML

### Critical email rendering rules

**NEVER use `background: linear-gradient(...)` alone.** Most email clients (Gmail, Outlook) ignore CSS gradients entirely, leaving white text invisible on a white/transparent background.

**ALWAYS use `background-color` as the primary background**, with the gradient as an enhancement only:
```html
<!-- WRONG — gradient stripped in Gmail, white text on white bg -->
<td style="background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff;">

<!-- CORRECT — solid color is the fallback, gradient is enhancement -->
<td style="background-color:#6366f1; color:#fff;">
```

Additional rules:
- All layout via `<table>` / `<td>` — no CSS Flexbox or Grid (not supported in Outlook)
- Inline all styles — no `<style>` block (Gmail strips `<head>` styles)
- Max width: 600px centered
- Use `&mdash;`, `&rarr;`, `&middot;`, `&rsquo;` — not raw Unicode dashes/arrows/quotes
- Images: use absolute HTTPS URLs — relative paths don't work in email
- Logo: use the deployed absolute URL, e.g. `https://[domain]/logo-128.png` (PNG, not SVG — some clients block SVG)
- Rounded corners (`border-radius`) are decorative only — graceful fallback if stripped

### Template structure

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:40px 0;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

    <!-- HEADER — solid background-color, never gradient-only -->
    <tr>
      <td style="background-color:#6366f1;border-radius:16px 16px 0 0;padding:40px 48px 36px;">
        <img src="https://[domain]/logo-128.png" width="52" height="52"
             style="border-radius:12px;display:block;margin-bottom:20px;" alt="[Product]"/>
        <div style="font-size:11px;letter-spacing:3px;color:rgba(255,255,255,0.75);
                    text-transform:uppercase;font-weight:600;margin-bottom:12px;">
          [Company] &middot; [Year]
        </div>
        <h1 style="margin:0;font-size:32px;font-weight:800;color:#ffffff;line-height:1.2;">
          Introducing<br/>[PRODUCT_NAME]
        </h1>
        <p style="margin:14px 0 0;font-size:16px;color:#e0e7ff;line-height:1.6;">[TAGLINE]</p>
      </td>
    </tr>

    <!-- ACCENT BAR -->
    <tr><td style="background-color:#8b5cf6;height:4px;font-size:0;">&nbsp;</td></tr>

    <!-- BODY — white background -->
    <tr>
      <td style="background-color:#ffffff;padding:40px 48px;">
        <p style="margin:0 0 20px;font-size:16px;color:#374151;line-height:1.7;">Hi,</p>
        <p style="margin:0 0 20px;font-size:16px;color:#374151;line-height:1.7;">[OPENING_PARA]</p>

        <!-- STAT PILLS — solid background-color only -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
          <tr>
            <td width="31%" style="background-color:#eef2ff;border-radius:12px;
                padding:16px;text-align:center;vertical-align:top;">
              <div style="font-size:28px;font-weight:900;color:#6366f1;line-height:1;">[N]</div>
              <div style="font-size:12px;color:#6b7280;margin-top:6px;font-weight:600;">[LABEL]</div>
            </td>
            <!-- repeat for each stat -->
          </tr>
        </table>

        <!-- HOW IT WORKS -->
        <p style="margin:0 0 12px;font-size:16px;color:#374151;font-weight:600;">
          Here&rsquo;s how it works:
        </p>
        <ol style="margin:0 0 28px;padding-left:20px;font-size:15px;color:#374151;line-height:2.1;">
          <li>[Step 1]</li>
          <!-- ... -->
        </ol>

        <p style="margin:0 0 28px;font-size:16px;color:#374151;line-height:1.7;">
          I&rsquo;ve attached the full overview PDF &mdash; [enticing 1-liner about what's inside].
        </p>

        <!-- CTA BUTTON — solid background-color -->
        <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
          <tr>
            <td style="background-color:#6366f1;border-radius:10px;">
              <a href="[CTA_URL]" target="_blank"
                 style="display:inline-block;padding:14px 32px;font-size:15px;
                        font-weight:700;color:#ffffff;text-decoration:none;">
                Try [PRODUCT] Free &rarr;
              </a>
            </td>
          </tr>
        </table>

        <!-- OPTIONAL: consult link -->
        <p style="margin:0 0 36px;font-size:14px;color:#6b7280;">
          Or book a free consult:
          <a href="[CALENDLY_URL]" style="color:#6366f1;font-weight:600;text-decoration:none;">
            [calendly-short-url]
          </a>
        </p>

        <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">
          Best,<br/>
          <strong>[SENDER_NAME]</strong><br/>
          <span style="color:#6b7280;">[Company] &middot;
            <a href="https://servicevision.net" style="color:#6366f1;text-decoration:none;">
              servicevision.net
            </a>
          </span>
        </p>
      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;
                 border-radius:0 0 16px 16px;padding:20px 48px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
          &copy; [YEAR] [Company] &middot;
          <a href="https://servicevision.net" style="color:#9ca3af;text-decoration:none;">servicevision.net</a><br/>
          <a href="[PRIVACY_URL]" style="color:#9ca3af;text-decoration:none;">Privacy Policy</a>
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>
```

---

## Step 3 — Send via Resend (curl only)

**ALWAYS use `curl` via Python `subprocess` — never `urllib`, `http.client`, or `requests`.** Resend's API is behind Cloudflare which returns `403 error 1010` for Python HTTP libraries. curl bypasses this.

**ALWAYS write the payload to a temp file** before sending — base64 attachments exceed shell `ARG_MAX` limits if passed inline to `-d`.

```python
import json, subprocess, base64, os

RESEND_KEY  = "<vault: credentials.md → ServiceVision → Resend API Key>"
PDF_PATH    = "/absolute/path/to/file.pdf"

with open(PDF_PATH, "rb") as f:
    pdf_b64 = base64.b64encode(f.read()).decode()

payload = {
    "from": "Chris Therriault <info@servicevision.io>",
    "to": ["recipient@example.com"],       # list
    # "cc": ["cc@example.com"],            # omit key entirely if no CC
    "subject": "Subject line here",
    "html": HTML_BODY,                     # the HTML string from Step 2
    "attachments": [
        {
            "filename": os.path.basename(PDF_PATH),
            "content": pdf_b64,
        }
    ],
}

with open("/tmp/email_payload.json", "w") as f:
    json.dump(payload, f)

result = subprocess.run([
    "curl", "-s", "-X", "POST", "https://api.resend.com/emails",
    "-H", f"Authorization: Bearer {RESEND_KEY}",
    "-H", "Content-Type: application/json",
    "-d", "@/tmp/email_payload.json",
], capture_output=True, text=True)

resp = json.loads(result.stdout)
if "id" in resp:
    print(f"✅ Sent — message ID: {resp['id']}")
else:
    print(f"❌ Error: {resp.get('message', resp)}")
```

---

## Step 4 — Report result

Tell the user:
- Recipients (to + cc)
- Subject line used
- PDF filename and size
- Resend message ID
- Note if the subject/copy was auto-generated so they can tweak and resend

---

## Notes

- **From address:** Always `info@servicevision.io` — `servicevision.net` is not verified in Resend
- **CC:** Omit the `cc` key entirely (don't pass empty list) if no CC address given
- **PDF size limit:** Resend rejects attachments over 40 MB — warn the user if the file is large
- **Logo in email:** Use absolute HTTPS PNG URL — SVG is blocked by some clients; relative paths don't resolve
- **Stat pills:** Use solid `background-color` only (e.g. `#eef2ff`, `#f5f3ff`, `#ecfeff`) — gradients stripped
- **No CSS gradient anywhere** — the single most common cause of broken email rendering
