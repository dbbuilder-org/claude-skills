---
name: appstore-prep
description: Generate App Store assets (descriptions, keywords, screenshots, icons) for mobile apps using AI. Use when the user wants to prepare an app for App Store submission, generate App Store metadata, create app screenshots, or set up automated App Store workflows. Supports Expo, React Native, and Capacitor projects.
---

# AppStore Prep

Generate App Store Connect assets for mobile applications using AI (GPT-4o-mini for text, DALL-E 3 for images).

## When to Use

Use this skill when the user wants to:
- Prepare a mobile app for App Store submission
- Generate App Store descriptions, keywords, or metadata
- Create marketing screenshots for the App Store
- Generate app icons in all required sizes
- Set up automated App Store asset generation
- Integrate with EAS Submit for Expo projects

## Prerequisites

- AppStorePrep must be installed at `~/dev2/AppStorePrep`
- OpenAI API key configured in `~/dev2/AppStorePrep/.env`

## Usage

### Basic Generation

To generate App Store assets for a mobile app:

```bash
cd ~/dev2/AppStorePrep
node src/index.js <path-to-mobile-app> -o ./output/<app-name>
```

### Full EAS Integration (Recommended for Expo)

For Expo projects, use `--integrate` to set up complete automation:

```bash
cd ~/dev2/AppStorePrep
node src/index.js <path-to-mobile-app> --integrate
```

This creates in the target project:
- `store.config.json` - EAS metadata configuration
- `eas-metadata/{locale}/` - Screenshots and app icon
- `scripts/prepare-appstore.sh` - Self-contained automation script
- `.appstoreprep/config.env` - Local API key (gitignored)
- npm scripts: `appstore:prepare`, `appstore:text`, `appstore:push`

### Options

| Option | Description |
|--------|-------------|
| `--integrate` | Write EAS metadata directly to project, set up automation |
| `--skip-screenshots` | Skip DALL-E screenshot generation (faster, cheaper) |
| `--skip-icon` | Skip DALL-E icon generation |
| `--dry-run` | Analyze only, don't generate assets |
| `-o, --output <dir>` | Output directory (default: ./appstore-assets) |
| `--locale <locale>` | Primary locale (default: en-US) |

### Cost Estimates

| Mode | API Calls | Cost |
|------|-----------|------|
| Full (screenshots + icon) | GPT-4o-mini + 6x DALL-E 3 | ~$0.75 |
| Text only (`--skip-screenshots --skip-icon`) | GPT-4o-mini only | ~$0.02 |

## Workflow Examples

### First-time Setup for New Project

```bash
# Generate all assets and set up automation
cd ~/dev2/AppStorePrep
node src/index.js ~/dev2/myapp/apps/mobile --integrate

# Review the generated assets
ls ~/dev2/myapp/apps/mobile/eas-metadata/en-US/
cat ~/dev2/myapp/apps/mobile/store.config.json
```

### Quick Text Update (Existing Project)

```bash
# From the mobile app directory (after initial setup)
cd ~/dev2/myapp/apps/mobile
npm run appstore:text
```

### Full Regeneration and Push

```bash
cd ~/dev2/myapp/apps/mobile
npm run appstore:push
```

## What Gets Generated

### Text Content
- App name and subtitle (30 chars each)
- Full description (up to 4000 chars)
- Keywords (100 chars, comma-separated)
- Promotional text (170 chars)
- Release notes
- Privacy policy summary
- Suggested category

### Images
- 5 marketing screenshots (1024x1792, iPhone portrait)
- App icon in 13 iOS sizes (1024 down to 20px)

### Automation
- `store.config.json` for EAS metadata:push
- Shell script for future regeneration
- npm scripts for convenience

## Output Structure

```
appstore-assets/
├── metadata/
│   ├── metadata.json
│   ├── description.txt
│   ├── keywords.txt
│   └── ...
├── screenshots/
│   ├── screenshot_1_hero.png
│   └── ...
├── icons/
│   ├── AppIcon-1024.png
│   └── ...
├── fastlane/metadata/en-US/
└── UPLOAD_GUIDE.md
```

## Troubleshooting

### "OpenAI API key not configured"
```bash
# Check if .env exists
cat ~/dev2/AppStorePrep/.env

# If not, create it
echo "OPENAI_API_KEY=sk-..." > ~/dev2/AppStorePrep/.env
```

### "AppStorePrep not found"
```bash
# Install dependencies
cd ~/dev2/AppStorePrep
npm install
```

### Script not working after initial setup
```bash
# The local config should have the API key
cat <project>/.appstoreprep/config.env

# If missing, copy from AppStorePrep
cp ~/dev2/AppStorePrep/.env <project>/.appstoreprep/config.env
```
