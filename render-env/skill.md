# render-env

Safely read, set, or back up environment variables on a Render service.
Always fetches the full current set first, merges changes in, then PUTs
the merged set back — so no existing variables are ever wiped.
Saves a timestamped backup to `/tmp/` before every write.

## Trigger Phrases

- `/render-env`
- "set render env var", "update render env", "add env var to render"
- "render environment variable", "render env vars"
- "backup render env vars", "list render env vars"
- "add staging env var", "update production env var"

## Known Service IDs

### U-Rent
| Name | Service ID |
|------|-----------|
| Production API | `srv-d4q29du3jp1c739a31d0` |
| Production Web | `srv-d4q28pm3jp1c739a2l50` |
| Staging API | look up via `render-env list` or ask user |
| Staging Web | look up via `render-env list` or ask user |

### DoGood
| Name | Service ID |
|------|-----------|
| API | `srv-d5ut5fhr0fns73ei91l0` |
| Web | `srv-d5ut4r1r0fns73ei8n60` |
| Worker | `srv-d5ut5fhr0fns73ei91lg` |

Render API key: read from `~/.config/claude/credentials.md` (look for `Render | API Key`).

---

## Instructions

<command-name>render-env</command-name>

Parse the user's intent from their message:

- **`list`** — show all current env vars for a service (mask values >8 chars)
- **`set KEY=VALUE [KEY2=VALUE2 ...]`** — safely add/update one or more vars
- **`backup`** — fetch and save current vars to `/tmp/` without changing anything
- **`delete KEY [KEY2 ...]`** — remove one or more keys (with backup first)

If the user didn't specify a service, ask which one (production API/Web or staging API/Web) before proceeding.

---

### Step 1: Read the Render API key

```bash
grep "Render.*API Key\|API Key.*Render" ~/.config/claude/credentials.md | grep -oP 'rnd_\w+'
```

Store it as `RENDER_KEY`.

---

### Step 2: Fetch current env vars (ALWAYS — even for set/delete)

```bash
curl -s -X GET "https://api.render.com/v1/services/{SERVICE_ID}/env-vars?limit=100" \
  -H "Authorization: Bearer {RENDER_KEY}" \
  -H "Accept: application/json"
```

The response is an array of `{ "envVar": { "key": "...", "value": "..." } }` objects.

Parse it with Python:

```python
import json, sys
raw = json.loads(sys.stdin.read())
# Render wraps each item: [{"envVar": {"key": "K", "value": "V"}}, ...]
current = {}
for item in raw:
    ev = item.get("envVar") or item  # handle both wrapped and unwrapped
    if ev.get("key"):
        current[ev["key"]] = ev.get("value", "")
print(json.dumps(current))
```

---

### Step 3: Backup to /tmp/

Always save before any write:

```bash
BACKUP_FILE="/tmp/render-env-backup-{SERVICE_ID}-$(date +%Y%m%d-%H%M%S).json"
```

Write the current vars (as a flat `{"KEY": "VALUE"}` dict) to that file.

Tell the user: `Backup saved to {BACKUP_FILE} ({N} variables)`

---

### Step 4a: For `list`

Print a table, masking long values:

```
KEY                          VALUE
────────────────────────────────────────────────
NODE_ENV                     production
STORAGE_PROVIDER             aws-s3
STORAGE_ENDPOINT             https://54150df6…[masked]
DB_HOST                      oregon-postgres…[masked]
...
```

Do NOT print secret values in full. Mask anything longer than 8 characters to show only first 8 chars + `…[masked]`.

---

### Step 4b: For `set KEY=VALUE ...`

1. Merge the new key/value pairs into the current dict (new values win).
2. Build the PUT body — Render expects an array:

```json
[
  {"key": "KEY1", "value": "VALUE1"},
  {"key": "KEY2", "value": "VALUE2"}
]
```

3. PUT:

```bash
curl -s -X PUT "https://api.render.com/v1/services/{SERVICE_ID}/env-vars" \
  -H "Authorization: Bearer {RENDER_KEY}" \
  -H "Content-Type: application/json" \
  -d '[{"key":"K1","value":"V1"},...]'
```

4. Verify the response contains the expected keys.

5. Report:
```
✅ Updated 2 variable(s) on {SERVICE_NAME}:
  + STORAGE_ENDPOINT  (new)
  ~ STORAGE_BUCKET    (changed)

Total: 47 variables. Backup: /tmp/render-env-backup-srv-xxx-20260312-103045.json
```

---

### Step 4c: For `backup` only

Just save the file and report the count. No PUT.

---

### Step 4d: For `delete KEY ...`

1. Remove the specified keys from the current dict.
2. Confirm with the user before proceeding: `About to delete: KEY1, KEY2. Continue? (yes/no)`
3. If confirmed, PUT the remaining vars.
4. Report deleted keys and new total count.

---

## Safety Rules

0. **ALWAYS use `?limit=100` on every GET.** The Render API defaults to 20 items. Omitting this on a service with >20 vars causes a partial GET → PUT wipes all vars not in the first 20. This is the #1 cause of production env var incidents. The GET URL in Step 2 above already includes it — never remove it.
1. **NEVER call PUT without fetching first.** The fetch-merge-PUT cycle is mandatory.
2. **NEVER print secret values in full** — mask anything > 8 chars.
3. **Always save a backup before any write operation** (set or delete).
4. **If the PUT response does not return HTTP 200**, report the error and tell the user the backup file path so they can recover manually.
5. **If the user says "wipe" or "replace all"**, warn them explicitly that this will delete all existing vars not in their list, and require a `yes` confirmation.

---

## Recovery Instructions (include if PUT fails)

If a PUT fails or variables were accidentally wiped, recover from backup:

```bash
# Read backup
cat /tmp/render-env-backup-{SERVICE_ID}-{TIMESTAMP}.json

# Re-apply via this skill:
# /render-env set KEY1=VALUE1 KEY2=VALUE2 ... --service {SERVICE_ID}
```

Or manually via Render dashboard → Service → Environment.
