---
name: send-email-resend
description: Send email (optionally with attachments) via the Resend API. Use when asked to email documents, reports, or notifications. Encodes the 2026-07-14 lessons — key selection from the vault, Cloudflare UA blocking, attachment payload handling.
---

# send-email-resend

Send email via Resend (https://api.resend.com/emails) safely and on the first try.

## Trigger phrases
- "send via resend", "email this to …", "send the PDF/report to …"

## The three lessons this skill exists to encode (2026-07-14 incident)

1. **The vault has MULTIPLE Resend keys.** `~/.config/claude/credentials.md` contains several
   `re_…` entries, and as of 2026-07-19 there are multiple `Resend | From Email` rows too
   (`info@servicevision.io`, `noreply@collabworld.servicevision.io`, `noreply@servicevision.net`) —
   so `grep -n | cut` returns multiple line numbers and the naive math breaks. The correct key is
   the one on the line-group paired with **`info@servicevision.io`**. Filter for that row first:
   ```bash
   FROM_LINE=$(grep -n "Resend | From Email.*info@servicevision\.io" ~/.config/claude/credentials.md | grep -v collabworld | head -1 | cut -d: -f1)
   RESEND_KEY=$(sed -n "$((FROM_LINE-1))p" ~/.config/claude/credentials.md | grep -oE 're_[A-Za-z0-9_]+')
   FROM_EMAIL=$(sed -n "${FROM_LINE}p" ~/.config/claude/credentials.md | grep -oE '[a-z0-9._%-]+@[a-z0-9.-]+')
   ```
2. **NEVER use Python urllib / requests default user-agents.** Cloudflare fronts api.resend.com and
   returns `HTTP 403` with body `error code: 1010` (a Cloudflare ban code, NOT a Resend auth error)
   for non-browser UAs. **Always use `curl`.** If you see `error code: 1010`, it is the transport,
   not the key — do not rotate credentials over it.
3. **Attachments go through a payload file on disk, not inline shell args.** Base64 attachment
   content easily exceeds argv limits and mangles quoting. Build the JSON with Python, write it to
   the session scratchpad, `curl --data @file`, then delete the file.

## Procedure

1. Resolve `RESEND_KEY` + `FROM_EMAIL` per lesson 1. Never print the key (mask to last 4 chars max).
2. Build the payload (Python → scratchpad file):
   ```python
   import base64, json, pathlib
   atts = [{"filename": f.name, "content": base64.b64encode(f.read_bytes()).decode()}
           for f in [pathlib.Path(p) for p in ATTACHMENT_PATHS]]   # ≤ 40MB total post-encode
   body = {"from": f"DISPLAY NAME <{FROM_EMAIL}>", "to": [RECIPIENT],
           "subject": SUBJECT, "html": HTML_BODY,
           **({"attachments": atts} if atts else {})}
   pathlib.Path(SCRATCHPAD + "/resend-payload.json").write_text(json.dumps(body))
   ```
3. Send with curl, then delete the payload file in the same command:
   ```bash
   curl -s -X POST https://api.resend.com/emails \
     -H "Authorization: Bearer $RESEND_KEY" -H "Content-Type: application/json" \
     --data @"$SCRATCHPAD/resend-payload.json" | head -c 300
   rm -f "$SCRATCHPAD/resend-payload.json"
   ```
4. **Verify:** success = `{"id":"<uuid>"}`. Report the id to the user.

## Error decision table

| Response | Meaning | Action |
|---|---|---|
| `{"id":"…"}` | Sent | Report the id |
| `403` + `error code: 1010` | Cloudflare UA ban | You used urllib/requests — switch to curl. NOT an auth issue |
| `403` + JSON body | Wrong key, or From domain not verified in that Resend account | Re-check lesson-1 key pairing; From must be on the verified domain (`servicevision.io`) |
| `422` | Payload validation (bad from format, oversize attachment) | Read the JSON message; `from` needs `Name <addr>` format |
| `429` | Rate limited | Wait and retry once |

## Rules
- From address must be on the account's verified domain — do not invent senders on other domains.
- Sending is outward-facing: confirm recipient + content with the user unless they explicitly
  specified both (as in "send X to Y").
- Never commit or echo the payload file (it can embed whole documents); always delete it after send.
