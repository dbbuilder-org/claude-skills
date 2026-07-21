# send-email

Send an email via Microsoft Graph API using `~/.claude/scripts/send-email.sh`.

## Trigger Phrases

- `send-email`
- "send an email"
- "email [name]"
- "send a message to"

## Config

- **Script:** `~/.claude/scripts/send-email.sh`
- **Default From:** `info@servicevision.net`
- **Override From:** set `FROM_EMAIL=` env var before the script

---

## Instructions

<command-name>send-email</command-name>

Ask the user for any missing fields, then send using the bash script below.

### Required fields

| Field | Example |
|-------|---------|
| `to` | `ransom@servicevision.net` |
| `subject` | `Re: CodeRabbit staging` |
| `body` | Plain text or HTML |

### Optional fields

| Field | Default | Notes |
|-------|---------|-------|
| `from` | `info@servicevision.net` | Override with `FROM_EMAIL=other@servicevision.net` |
| `attachment` | (none) | One absolute file path |

---

### Send the email

Use `Bash` to call the script directly:

```bash
# Plain text or HTML body — script auto-detects
~/.claude/scripts/send-email.sh \
  "recipient@example.com" \
  "Subject line" \
  "Body text or <b>HTML</b>"

# With attachment
~/.claude/scripts/send-email.sh \
  "recipient@example.com" \
  "Subject line" \
  "Body text" \
  "/absolute/path/to/file.pdf"

# Multiple recipients (comma-separated, no spaces)
~/.claude/scripts/send-email.sh \
  "a@example.com,b@example.com" \
  "Subject" \
  "Body"

# Send from a different address
FROM_EMAIL="chris@servicevision.net" ~/.claude/scripts/send-email.sh \
  "recipient@example.com" \
  "Subject" \
  "Body"
```

On success the script prints: `✓ Email sent to <recipient>`
On failure it prints an error and exits non-zero — report the error to the user.

## Notes

- Emails are sent **as** `info@servicevision.net` and **saved to Sent Items** in Outlook
- The script uses Azure AD client credentials flow — no browser login required
- Credentials are stored in `~/.config/claude/credentials.md` under "Microsoft Graph Email"
- The client secret expires 2028-06 — set a calendar reminder to rotate it
- Only one attachment per send; for multiple files, zip them first or send separately
- For multiline HTML bodies, use `$'...\n...'` bash quoting or write to a temp file and pass via `"$(cat /tmp/body.html)"`
