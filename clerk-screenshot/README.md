# clerk-screenshot

Takes an authenticated screenshot of a Clerk-protected web app dashboard.

## Usage

```
/clerk-screenshot [url] [output-path]
```

## What it does

1. Gets a fresh Clerk session JWT via the Backend API
2. Injects it as a `__session` cookie into a headless browser
3. Navigates to the dashboard and sets the active theme
4. Takes a screenshot and saves it

## Requirements

- `CLERK_SECRET_KEY` — Clerk secret key for the app
- `CLERK_USER_ID` — Clerk user ID to impersonate (e.g. `user_abc123`)
- `CLERK_SESSION_ID` — (optional) Known active session ID; will auto-select if omitted
- `SCREENSHOT_URL` — Base URL of the app (e.g. `https://app.example.com`)
- `SCREENSHOT_THEME` — (optional) localStorage theme key to set
- `SCREENSHOT_OUT` — Output path for the PNG (default: `/tmp/screenshot.png`)

## Instructions

<command-name>clerk-screenshot</command-name>

When this command is invoked, follow these steps:

### Step 1: Resolve inputs

- **url** = first argument OR `SCREENSHOT_URL` env var OR ask user
- **output** = second argument OR `SCREENSHOT_OUT` env var OR `/tmp/screenshot.png`

### Step 2: Get a Clerk session JWT

```bash
# List active sessions for the user
curl -s "https://api.clerk.com/v1/sessions?user_id=${CLERK_USER_ID}&limit=5" \
  -H "Authorization: Bearer ${CLERK_SECRET_KEY}"

# Create a fresh token for the most recent active session
curl -s -X POST "https://api.clerk.com/v1/sessions/${SESSION_ID}/tokens" \
  -H "Authorization: Bearer ${CLERK_SECRET_KEY}" \
  -H "Content-Type: application/json"
```

Save the `jwt` value from the response.

### Step 3: Write a Playwright spec

Create a temp spec file `/tmp/clerk-screenshot.spec.ts`:

```typescript
import { test } from '@playwright/test'

test.setTimeout(120000)

test('clerk-screenshot', async ({ page, context }) => {
  const appUrl = process.env.SCREENSHOT_URL!
  const jwt = process.env.CLERK_SESSION_JWT!
  const domain = new URL(appUrl).hostname
  const theme = process.env.SCREENSHOT_THEME

  // Inject Clerk session cookie — works for proper domains in production mode
  await context.addCookies([{
    name: '__session',
    value: jwt,
    domain: '.' + domain,
    path: '/',
    httpOnly: true,
    secure: true,
  }])

  await page.goto(appUrl + '/dashboard', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(4000)

  // Set theme via localStorage if specified
  if (theme) {
    await page.evaluate((t) => {
      localStorage.setItem('theme', t)
      localStorage.setItem('colorMode', 'light')
    }, theme)
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(5000)
  }

  const out = process.env.SCREENSHOT_OUT || '/tmp/screenshot.png'
  await page.screenshot({ path: out, fullPage: false })
  console.log('Saved:', out, '— URL:', page.url())
})
```

### Step 4: Run it

```bash
SCREENSHOT_URL="https://yourapp.onrender.com" \
SCREENSHOT_OUT="/path/to/output.png" \
SCREENSHOT_THEME="grapevine" \
CLERK_SESSION_JWT="<jwt from step 2>" \
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..." \
CLERK_SECRET_KEY="sk_test_..." \
npx playwright test --project=chromium /tmp/clerk-screenshot.spec.ts --reporter=list
```

### Step 5: Copy to destination

If the screenshot was for the marketing site hero:

```bash
cp /tmp/screenshot.png path/to/marketing-site/public/images/hero/dashboard-screenshot.png
```

### Notes

- This approach works for **production-mode** Clerk (proper domains with `__session` cookie)
- For **development mode** (localhost), Clerk uses `__clerk_db_jwt` + server-side exchange, which cannot be replicated by cookie injection alone
- If the session JWT is rejected, the screenshot will show the sign-in page — check the URL in the output
- For localhost dev screenshots, use the manual approach: log in via browser, set theme in Settings, use browser's screenshot tool or `⌘+Shift+4`

## Example — AestheticIQ

```bash
# Get session (one-time setup)
CLERK_SECRET_KEY="sk_test_WFPNzhYCS0BRQugwTQqwM4hDl6o8yzlrfu47VnSzOz"
CLERK_USER_ID="user_36dwVyrFi3bFBRXCdkZE5MT9DYM"  # dbbuilderio@gmail.com

SESSION_ID=$(curl -s "https://api.clerk.com/v1/sessions?user_id=${CLERK_USER_ID}&limit=1" \
  -H "Authorization: Bearer ${CLERK_SECRET_KEY}" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

JWT=$(curl -s -X POST "https://api.clerk.com/v1/sessions/${SESSION_ID}/tokens" \
  -H "Authorization: Bearer ${CLERK_SECRET_KEY}" -H "Content-Type: application/json" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['jwt'])")

SCREENSHOT_URL="https://aestheticiq-web.onrender.com" \
SCREENSHOT_OUT="aestheticiq-ai-marketing-site/public/images/hero/dashboard-screenshot.png" \
SCREENSHOT_THEME="grapevine" \
CLERK_SESSION_JWT="$JWT" \
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_aG9seS1sb3VzZS05OC5jbGVyay5hY2NvdW50cy5kZXYk" \
CLERK_SECRET_KEY="${CLERK_SECRET_KEY}" \
npx playwright test --project=chromium /tmp/clerk-screenshot.spec.ts --reporter=list
```
