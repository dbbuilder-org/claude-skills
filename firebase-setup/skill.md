---
name: firebase-setup
description: Bootstrap a Firebase project under dbbuilderio@gmail.com (appdevsupport-sv or another GCP project). Registers iOS and Android apps, downloads GoogleService-Info.plist and google-services.json, creates a service account with Firebase Admin role, and saves all keys to keys/ (gitignored). Use when starting a new mobile project or migrating Firebase ownership.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# firebase-setup

Bootstrap Firebase for a mobile app under your own GCP project (`dbbuilderio@gmail.com`). Registers iOS + Android apps, downloads config files, creates a service account key — all via the Firebase Management REST API (no Firebase CLI required).

## Usage

```
/firebase-setup
```

Run from the mobile project root. The skill will prompt for any missing info it can't infer.

## What it does

1. Authenticates via `gcloud` (`dbbuilderio@gmail.com`)
2. Verifies Firebase is enabled on the target GCP project
3. Checks for already-registered iOS/Android apps (skips if present)
4. Registers iOS app (bundle ID) and Android app (package name)
5. Polls the long-running operations until complete
6. Downloads `GoogleService-Info.plist` and `google-services.json` to `keys/`
7. Creates a service account `firebase-admin-<slug>` with `roles/firebase.admin`
8. Downloads the service account key JSON to `keys/`
9. Adds `keys/` to `.gitignore`
10. Prints next steps (APNs key upload, config file swap)

## Instructions

When this skill is invoked:

### Step 1 — Gather project parameters

Infer from the project's existing files where possible:
- **GCP project**: default `appdevsupport-sv`; check `CLAUDE.md` or ask if another project is intended
- **iOS bundle ID**: read from `ios/Runner.xcodeproj/project.pbxproj` or `CLAUDE.md`
- **Android package name**: read from `android/app/build.gradle` or `CLAUDE.md`
- **App display name**: read from `CLAUDE.md` or directory name
- **Service account slug**: lowercase app name, e.g. `sober-city` → `firebase-admin-sober-city`

### Step 2 — Authenticate and verify Firebase enabled

```bash
TOKEN=$(gcloud auth print-access-token --account=dbbuilderio@gmail.com)

curl -s -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: $GCP_PROJECT" \
  "https://firebase.googleapis.com/v1beta1/projects/$GCP_PROJECT"
```

If the response has `"error"` → Firebase is not enabled. Enable it:
```bash
gcloud firebase projects:addfirebase $GCP_PROJECT --account=dbbuilderio@gmail.com
# OR via API:
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "https://firebase.googleapis.com/v1beta1/projects/$GCP_PROJECT:addFirebase"
```

### Step 3 — Check for existing apps (skip registration if already present)

```bash
# iOS
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: $GCP_PROJECT" \
  "https://firebase.googleapis.com/v1beta1/projects/$GCP_PROJECT/iosApps"

# Android
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: $GCP_PROJECT" \
  "https://firebase.googleapis.com/v1beta1/projects/$GCP_PROJECT/androidApps"
```

### Step 4 — Register apps (if not present)

```bash
# iOS
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: $GCP_PROJECT" \
  -H "Content-Type: application/json" \
  -d "{\"bundleId\":\"$IOS_BUNDLE_ID\",\"displayName\":\"$APP_NAME iOS\"}" \
  "https://firebase.googleapis.com/v1beta1/projects/$GCP_PROJECT/iosApps"

# Android
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: $GCP_PROJECT" \
  -H "Content-Type: application/json" \
  -d "{\"packageName\":\"$ANDROID_PACKAGE\",\"displayName\":\"$APP_NAME Android\"}" \
  "https://firebase.googleapis.com/v1beta1/projects/$GCP_PROJECT/androidApps"
```

Both return an operation name. Poll until `done: true` (sleep 3–5s between polls):
```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: $GCP_PROJECT" \
  "https://firebase.googleapis.com/v1beta1/$OPERATION_NAME"
```

Extract `appId` from the response's `response` field once done.

### Step 5 — Download config files

```bash
mkdir -p keys

# GoogleService-Info.plist (iOS)
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: $GCP_PROJECT" \
  "https://firebase.googleapis.com/v1beta1/projects/$GCP_PROJECT/iosApps/$IOS_APP_ID/config" \
| python3 -c "
import json,sys,base64
d=json.load(sys.stdin)
print(base64.b64decode(d['configFileContents']).decode())
" > keys/GoogleService-Info.plist

# google-services.json (Android)
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: $GCP_PROJECT" \
  "https://firebase.googleapis.com/v1beta1/projects/$GCP_PROJECT/androidApps/$ANDROID_APP_ID/config" \
| python3 -c "
import json,sys,base64
d=json.load(sys.stdin)
print(base64.b64decode(d['configFileContents']).decode())
" > keys/google-services.json
```

### Step 6 — Create service account and key

```bash
SA_NAME="firebase-admin-$SLUG"
SA_EMAIL="$SA_NAME@$GCP_PROJECT.iam.gserviceaccount.com"

# Create SA
gcloud iam service-accounts create $SA_NAME \
  --display-name="Firebase Admin - $APP_NAME" \
  --project=$GCP_PROJECT \
  --account=dbbuilderio@gmail.com

# Grant Firebase Admin
gcloud projects add-iam-policy-binding $GCP_PROJECT \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/firebase.admin" \
  --account=dbbuilderio@gmail.com

# Download key
gcloud iam service-accounts keys create keys/$GCP_PROJECT-firebase-admin.json \
  --iam-account=$SA_EMAIL \
  --account=dbbuilderio@gmail.com
```

### Step 7 — Add keys/ to .gitignore

Check if `keys/` is already in `.gitignore`. If not, append it:
```bash
echo "\n# Firebase service account keys\nkeys/" >> .gitignore
```

### Step 8 — Print summary and next steps

Output:
```
✓ Firebase setup complete on appdevsupport-sv

Apps registered:
  iOS:     com.ios.sobercity  (appId: 1:424305566984:ios:...)
  Android: com.mobile.sobercity (appId: 1:424305566984:android:...)

Files created:
  keys/GoogleService-Info.plist
  keys/google-services.json
  keys/$GCP_PROJECT-firebase-admin.json

keys/ added to .gitignore ✓

⚠️  NEXT STEPS — required for iOS push notifications:
1. Upload APNs Auth Key (.p8) to Firebase Console:
   https://console.firebase.google.com/project/$GCP_PROJECT/settings/cloudmessaging
   → Apple app configuration → Upload (Auth Key, NOT Certificate)
   → Key ID + Team ID required from Apple Developer account

2. Swap config files into the app (if testing with this project):
   cp keys/GoogleService-Info.plist ios/Runner/GoogleService-Info.plist
   cp keys/google-services.json android/app/google-services.json

3. Send a test notification via Firebase Console:
   https://console.firebase.google.com/project/$GCP_PROJECT/messaging
   → New notification → Send test message → paste device token
```

## Notes

- This skill does NOT modify the app's live config files (`ios/Runner/GoogleService-Info.plist`, `android/app/google-services.json`) — it only writes to `keys/`. Swapping files is a manual step to avoid accidentally breaking a production build.
- If Firebase is not enabled on the GCP project, the skill enables it first using the Management API.
- The `gcloud` account `dbbuilderio@gmail.com` must have Owner or Editor on the target GCP project.
- APNs key upload cannot be automated via API — it must be done in Firebase Console. The `.p8` file must come from Apple Developer (team `BTDBP99S2B` for Sober City).
