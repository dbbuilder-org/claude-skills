---
name: icons-create
description: Generate a logo/icon set for a product using Google Imagen 3 (Gemini API, "nano-banana"). Produces PNG variants at multiple sizes (16, 32, 48, 128, 192, 512px) plus an SVG fallback. Use when the user says "create icons", "make a logo", "generate icons", "nano-banana", or "create an icon set".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# icons-create

Generates a product icon/logo set via Google Imagen 3 and exports PNG variants at standard sizes.

<command-name>icons-create</command-name>

---

## What this skill does

1. Calls Google Imagen 3 (`imagen-3.0-generate-001`) with a tailored prompt describing the desired logo
2. Saves the raw PNG output to `public/logo-raw.png`
3. Uses `rsvg-convert` or `magick` to resize into all standard sizes
4. Reports output paths and suggests next integration steps

---

## Inputs (gather before running)

| Input | How to get it |
|-------|---------------|
| `PRODUCT_NAME` | From user or project context |
| `PROMPT_DESCRIPTION` | User's description of desired aesthetic — or auto-compose from brand context |
| `OUT_DIR` | Where to save icons — default: `public/` in current project root |
| `API_KEY` | Gemini prompt2image key — load from `~/.config/claude/credentials.md` "Google Gemini · prompt2image" row |

---

## Prompt engineering for Imagen 3

Build a rich prompt from brand context. Good Imagen 3 logo prompts:

```
A minimalist corporate logo mark for "[PRODUCT_NAME]". [STYLE_DESC].
Color palette: [COLORS]. Single icon mark, no text, no wordmark.
White background. Ultra-clean, modern SaaS aesthetic.
Simple enough to work at 32×32px. Flat vector style.
```

Always generate **3 variants** (different prompt angles) and let the user pick.

**Variant strategies:**
- Variant 1: Geometric/abstract mark — shapes representing the core metaphor
- Variant 2: Letter-form monogram — initials unified into a single shape
- Variant 3: Concept icon — literal-but-stylized representation of the product's action

---

## Step 1 — Generate via Imagen 3

```python
import urllib.request, json, base64, os

API_KEY = "<from credentials.md>"
MODEL   = "imagen-3.0-generate-001"
URL     = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:predict?key={API_KEY}"

PROMPTS = [
    "Variant 1 prompt here",
    "Variant 2 prompt here",
    "Variant 3 prompt here",
]

OUT_DIR = "public"
os.makedirs(OUT_DIR, exist_ok=True)

for i, prompt in enumerate(PROMPTS, 1):
    payload = json.dumps({
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "1:1",
            "outputMimeType": "image/png",
            "safetySetting": "block_only_high",
        }
    }).encode()

    req = urllib.request.Request(URL, data=payload,
          headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
        b64 = data["predictions"][0]["bytesBase64Encoded"]
        out_path = os.path.join(OUT_DIR, f"logo-v{i}.png")
        with open(out_path, "wb") as f:
            f.write(base64.b64decode(b64))
        print(f"✓ Saved variant {i}: {out_path}")
    except Exception as e:
        print(f"✗ Variant {i} failed: {e}")
```

> **If all Imagen 3 calls fail** (expired key, quota): pivot to a hand-crafted SVG logo using the brand colors. Create `public/logo.svg` with a rounded-square gradient background + abstract geometric mark, then proceed to Step 2.

---

## Step 2 — Resize to all standard sizes

After the user picks a variant (or after SVG creation), generate PNGs at all sizes.

**If source is a PNG** (from Imagen 3):
```bash
for size in 16 32 48 128 192 512; do
  magick public/logo-vN.png -resize ${size}x${size} public/logo-${size}.png
  echo "Generated logo-${size}.png"
done
```

**If source is an SVG** (fallback):
```bash
for size in 16 32 48 128 192 512; do
  rsvg-convert -w $size -h $size public/logo.svg -o public/logo-${size}.png
  echo "Generated logo-${size}.png"
done
```

---

## Step 3 — Create favicon.ico

```bash
magick public/logo-32.png public/favicon.ico
```

---

## Step 4 — Report outputs

Print a summary:

```
✓ Generated icon set from [source]:
  public/logo-16.png   — browser favicon, manifest
  public/logo-32.png   — favicon.ico source
  public/logo-48.png   — extension icon (Chrome)
  public/logo-128.png  — extension icon (Chrome Web Store), PDF
  public/logo-192.png  — PWA manifest / apple-touch-icon
  public/logo-512.png  — PWA splash, OG image
  public/favicon.ico   — legacy favicon

Next steps:
  - Extension icons → copy 16/48/128 to extension/public/icons/
  - Next.js favicon → add <link rel="icon" href="/logo.svg"> to layout.tsx
  - PDF → reference public/logo-128.png as absolute path in @react-pdf/renderer Image
  - GitHub Pages → use absolute CDN URL in docs/index.html img tag
```

---

## Notes

- **API key location:** `~/.config/claude/credentials.md` → "Google Gemini · prompt2image" row. Key is also in `~/dev2/prompt2imageapikey.txt`.
- **Key rotation:** If the key fails with "API key expired", ask the user to run `cat ~/dev2/prompt2imageapikey.txt` and update credentials.md.
- **rsvg-convert** is available at `/opt/homebrew/bin/rsvg-convert`. Use for SVG → PNG.
- **magick** (ImageMagick 7) is available. Use for PNG → PNG resize or PNG → ICO.
- Never embed API keys in committed project files — generate-logo.mjs scripts in project dirs should read from env or credentials.md.
