# betterstack-monitor

Set up, list, pause, delete, and audit BetterStack Uptime monitors for any project.
Uses the BetterStack Uptime REST API v2. Reads the API token from credentials.md.

## Trigger Phrases

- `/betterstack-monitor`
- "add betterstack monitor", "create uptime monitor", "set up monitoring"
- "list monitors", "show betterstack monitors"
- "delete monitor", "remove monitor", "pause monitor"
- "betterstack setup", "add uptime monitoring for"
- "check betterstack", "monitor this url"

---

## API Reference

**Base URL:** `https://uptime.betterstack.com/api/v2`

**Auth header:** `Authorization: Bearer {TOKEN}`

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List monitors | GET | `/monitors` |
| Create monitor | POST | `/monitors` |
| Get monitor | GET | `/monitors/{id}` |
| Update monitor | PATCH | `/monitors/{id}` |
| Delete monitor | DELETE | `/monitors/{id}` |
| Pause monitor | POST | `/monitors/{id}/pause` |
| Resume monitor | POST | `/monitors/{id}/resume` |
| List on-call calendars | GET | `/on-call-calendars` |
| List escalation policies | GET | `/escalation-policies` |
| List status pages | GET | `/status-pages` |
| Create status page | POST | `/status-pages` |
| Add resource to status page | POST | `/status-pages/{id}/status-page-resources` |

---

## Instructions

<command-name>betterstack-monitor</command-name>

### Step 1: Get the API token

Read from `~/.config/claude/credentials.md`:

```bash
grep "BetterStack Uptime.*API Token (REST)" ~/.config/claude/credentials.md
```

Use the value as `BS_TOKEN`. If not found, fall back to the `(alt)` token.

---

### Step 2: Parse intent

Determine the operation from the user's message:

| Intent | Operation |
|--------|-----------|
| "list", "show", "what monitors" | **list** |
| "create", "add", "set up", "monitor this" | **create** |
| "delete", "remove" | **delete** |
| "pause" | **pause** |
| "resume", "unpause" | **resume** |
| "audit", "check all", "review monitors" | **audit** |
| "status page" | **status-page** |

---

### Step 3: Execute

#### `list`

```bash
curl -s "https://uptime.betterstack.com/api/v2/monitors?per_page=50" \
  -H "Authorization: Bearer {BS_TOKEN}" | jq '.data[] | {
    id: .id,
    name: .attributes.pronounceable_name,
    url: .attributes.url,
    status: .attributes.status,
    check_frequency: .attributes.check_frequency,
    paused: .attributes.paused
  }'
```

Print as a readable table:

```
ID       NAME                              STATUS     FREQ  PAUSED
──────────────────────────────────────────────────────────────────
123456   app.aestheticiq.ai/api/health    up         3m    no
123457   staging.aestheticiq.ai/api/health up        3m    no
```

---

#### `create`

Ask the user for any missing info, then POST:

**Default monitor settings (use these unless user specifies otherwise):**
- `monitor_type`: `status` (HTTP status check)
- `check_frequency`: `180` (3 minutes)
- `request_timeout`: `30`
- `recovery_period`: `180` (3 minutes)
- `confirmation_period`: `0` (immediate)
- `http_method`: `GET`
- `expected_status_codes`: `[200]`
- `follow_redirects`: `true`
- `ssl_expiration`: `30` (warn 30 days before expiry)
- `domain_expiration`: `14`
- `regions`: `["us", "eu"]` (multi-region by default)
- `paused`: `false`

**Required fields:**
- `url` — the URL to monitor
- `pronounceable_name` — human-readable name (auto-derive from hostname if not given)

```bash
curl -s -X POST "https://uptime.betterstack.com/api/v2/monitors" \
  -H "Authorization: Bearer {BS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "monitor_type": "status",
    "url": "{URL}",
    "pronounceable_name": "{NAME}",
    "check_frequency": 180,
    "request_timeout": 30,
    "recovery_period": 180,
    "confirmation_period": 0,
    "http_method": "GET",
    "expected_status_codes": [200],
    "follow_redirects": true,
    "ssl_expiration": 30,
    "domain_expiration": 14,
    "regions": ["us", "eu"],
    "paused": false
  }'
```

On success, print:
```
✅ Monitor created:
  ID:     {id}
  Name:   {pronounceable_name}
  URL:    {url}
  Status: {status}
  Freq:   every 3 min from US + EU
```

---

#### `delete`

1. If the user gave a name (not ID), call `list` first to find the ID.
2. Confirm: `About to delete monitor "{name}" ({url}). Continue? (yes/no)`
3. DELETE:

```bash
curl -s -X DELETE "https://uptime.betterstack.com/api/v2/monitors/{ID}" \
  -H "Authorization: Bearer {BS_TOKEN}"
```

A 204 response = success.

---

#### `pause` / `resume`

```bash
curl -s -X POST "https://uptime.betterstack.com/api/v2/monitors/{ID}/pause" \
  -H "Authorization: Bearer {BS_TOKEN}"

curl -s -X POST "https://uptime.betterstack.com/api/v2/monitors/{ID}/resume" \
  -H "Authorization: Bearer {BS_TOKEN}"
```

---

#### `audit`

List all monitors and flag any issues:
- `status: down` or `status: seems_down` → ❌ DOWN
- `paused: true` → ⏸ PAUSED
- `check_frequency > 300` → ⚠️ slow check interval
- `regions` only 1 → ⚠️ single-region (false positive risk)
- missing `ssl_expiration` check → ⚠️ no SSL monitoring

Print a health summary, then a per-monitor table.

---

#### `status-page`

Create a status page and add monitors to it:

```bash
# Create page
curl -s -X POST "https://uptime.betterstack.com/api/v2/status-pages" \
  -H "Authorization: Bearer {BS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"company_name": "{NAME}", "subdomain": "{SLUG}"}'

# Add a monitor to the page
curl -s -X POST "https://uptime.betterstack.com/api/v2/status-pages/{PAGE_ID}/status-page-resources" \
  -H "Authorization: Bearer {BS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"resource_type": "Monitor", "resource_id": "{MONITOR_ID}", "public_name": "{LABEL}"}'
```

---

## Known Projects & Their Monitors

### AestheticIQ

| Service | Monitor ID | URL | Notes |
|---------|-----------|-----|-------|
| Production | `4212507` | `https://app.aestheticiq.ai/api/health` | Primary monitor |
| Staging | `4212508` | `https://staging.aestheticiq.ai/api/health` | Lower-priority alerts OK |

---

## Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 401 | Bad token | Re-read token from credentials.md, show token prefix |
| 404 | Monitor not found | List monitors to help user find the right ID |
| 422 | Validation error | Print `errors` field from response |
| 429 | Rate limited | Wait 10s and retry once |

---

## Safety Rules

1. **Always confirm before DELETE** — show name + URL.
2. **Never print the full token** — mask after first 4 chars: `3e7J...`.
3. **For bulk operations** (audit, mass-create from a list), show a preview first.
