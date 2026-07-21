# write-scripts

Generate user-facing documentation for a project: a self-demo guide, a UAT testing script, and optionally other guides. Exports all output to `.docx` and `.pdf` using pandoc + LibreOffice (soffice).

## Usage

```
/write-scripts [project name or description]
```

## Trigger Phrases

- `/write-scripts`
- "write a demo guide"
- "create a UAT script"
- "generate testing docs"
- "write user documentation"
- "make a user guide"
- "export docs to pdf"

## Instructions

<command-name>write-scripts</command-name>

When this command is invoked:

---

### Step 1: Understand the project

Read available context to understand the product:
- Look for `CorePlan/MustHaves.md`, `docs/ROADMAP*.md`, `ARCHITECTURE.md`, or any spec/planning docs
- Read the main routes/pages from the web app (`apps/web/src/app/` if Next.js, or equivalent)
- Read key API modules to understand what features exist
- Read `CLAUDE.md` for project overview

Build a mental model of:
1. Who the users are (renters, listers, admins, etc.)
2. The core user flows (sign up → list item → book item → complete rental, etc.)
3. What's new or notable about the platform

---

### Step 2: Determine output directory

Use the project root or `docs/` folder. Create a `user-guides/` subdirectory:
```
docs/user-guides/
  self-demo-guide.md
  uat-testing-script.md
```

---

### Step 3: Write the Self-Demo Guide

**Audience:** New users (renters and listers) seeing the platform for the first time. They may be coming from Craigslist, Facebook Marketplace, or similar. Tone: friendly, clear, no jargon.

**Format:** Narrative walkthrough. Step-by-step with section headers. Each step explains what they see AND why it works that way.

**Writing style rules (apply to every section):**

1. **"What you're looking at" opener** — begin each major section with a 1–2 sentence orienter that describes what the user sees on screen before diving into sub-steps.
2. **Labelled bullet lists over prose paragraphs** — when describing multiple things (fields, tabs, options), use a bullet per item with a bold label: `- **Label** — explanation`. Avoid long prose paragraphs.
3. **Plain-language stage descriptions** — any status/stage table must include a "What it means" column in plain English, not just the status name.
4. **Numbered + explained steps** — multi-step processes (checkout, condition capture, dispute) must number each step AND include a one-sentence explanation of why that step exists.
5. **Intentional design callouts** — when a design choice may surprise users (e.g., "why can't I see the address yet?", "why is my card not charged yet?"), add a `> **Why this works this way:**` blockquote explaining the reasoning.
6. **Expanded context tables** — any reference table (pricing options, verification levels, notification types) should have 3+ columns with enough context to be self-explanatory without reading the surrounding text.

**Sections to include:**

#### 1. Welcome & What Is This
- "What you're looking at" opener describing the homepage
- What the platform does in plain English (labelled bullets: what it is, who uses it, what it replaces)
- The two roles: lister (item owner) and renter — table with Role / Who they are / What they do
- How money works — numbered steps with explanations
- How it's different from Craigslist/Facebook Marketplace — labelled bullet list

#### 2. Creating Your Account
- "What you're looking at" opener for the sign-up page
- Sign up flow (Clerk auth) — labelled bullets for each method (email, Google, Apple) + why Clerk callout
- What happens after sign-up — labelled bullets for each dashboard element they see
- Profile completion — labelled bullets for each field + why phone verification callout

#### 3. For Renters: Finding & Booking an Item
- "What you're looking at" opener for the browse page
- Browsing / search — labelled bullets for each filter/sort option
- Item detail page — labelled bullets for each section (photos, description, price, calendar, lister profile)
- Booking dates + times — numbered steps with explanations; separate daily/weekly vs hourly flows
- Checkout — numbered steps with explanations; why hold-not-charge callout
- Status after booking — plain-language stage table (Pending / Approved / Active / Completed + what each means)
- After approval — labelled bullets for what unlocks (address, contact, messaging)

#### 4. For Listers: Creating a Listing
- "What you're looking at" opener for the listing form
- Each form step as a sub-section with labelled bullets for its fields
- Pricing options — expanded table: Option / Best for / Typical example
- Availability settings — labelled bullets for days, time window, buffer; why-set-a-schedule callout
- Receiving a booking request — labelled bullets for what info is shown; response-time-matters note
- Approving or declining — numbered steps with explanations; decline-reason callout

#### 5. During the Rental
- "What you're looking at" opener for the active booking view
- Pickup condition capture — numbered steps with explanations; why-photos-matter callout
- While the rental is active — labelled bullets for renter capabilities (message, extend, modify)
- Return — numbered steps mirroring pickup

#### 6. After the Rental
- "What you're looking at" opener for the completed booking view
- Review system — labelled bullets explaining mutual/blind reviews, public display, weighting; why-blind callout
- Payout timeline — numbered steps with explanations; Stripe Connect note
- Dispute process — numbered steps with explanations; how deposit release works

#### 7. Account & Settings
- "What you're looking at" opener for the Settings page
- Verification — expanded table: Verification type / What it unlocks / Why it's required
- Payment methods — labelled bullets for card (renter) vs bank account (lister)
- Notifications — expanded table: Event / Channel (email/SMS/in-app) / Why you'd want it

---

### Step 4: Write the UAT Testing Script

**Audience:** QA testers (Eric, or the client). Each test case has: Prerequisites, Steps (numbered), Expected Result, Pass/Fail checkbox.

**Format:** Structured script with test IDs (UAT-001, UAT-002, etc.)

**Test cases to include:**

**Auth & Onboarding**
- UAT-001: Sign up as new user
- UAT-002: Sign in with existing account
- UAT-003: Complete phone verification
- UAT-004: Profile page shows correct info

**Listing (Lister flow)**
- UAT-005: Create a daily rental listing
- UAT-006: Create an hourly rental listing
- UAT-007: Upload photos to listing
- UAT-008: Set availability schedule
- UAT-009: Publish listing (appears in search)
- UAT-010: Edit listing title/price
- UAT-011: Pause and reactivate listing

**Booking (Renter flow)**
- UAT-012: Search for items by category
- UAT-013: View item detail page
- UAT-014: Select dates on availability calendar (blocked dates cannot be selected)
- UAT-015: Complete booking checkout
- UAT-016: Booking appears in renter dashboard

**Approval & Comms**
- UAT-017: Lister receives booking request notification
- UAT-018: Lister approves booking
- UAT-019: Lister declines booking with reason
- UAT-020: Renter receives approval notification

**Rental Flow**
- UAT-021: Booking status changes to "active" at start time
- UAT-022: Condition photos can be uploaded at pickup
- UAT-023: Renter can request booking modification
- UAT-024: Lister approves modification
- UAT-025: Booking marked complete at return

**Payments**
- UAT-026: Payment hold placed at booking confirmation
- UAT-027: Deposit held separately
- UAT-028: Payout released to lister after completion

**Messaging**
- UAT-029: Renter sends message to lister
- UAT-030: Lister replies
- UAT-031: Notification received for new message

**Reviews**
- UAT-032: Renter leaves review after completed booking
- UAT-033: Lister leaves review
- UAT-034: Reviews appear on item/profile pages

**Edge Cases**
- UAT-035: Cannot book own listing
- UAT-036: Cannot select already-booked dates
- UAT-037: Suspended user cannot create bookings
- UAT-038: Location required to activate listing

Each test case format:
```markdown
### UAT-XXX: [Test Name]

**Prerequisites:** [what must be true before this test]
**Role:** Renter / Lister / Admin
**Environment:** Production / Staging

**Steps:**
1. [Action]
2. [Action]
3. [Action]

**Expected Result:** [What should happen]

- [ ] **PASS** / **FAIL** — Notes: _______________
```

---

### Step 5: Export to DOCX and PDF

After writing both `.md` files, export using pandoc and soffice:

```bash
# Detect tools
PANDOC=$(which pandoc 2>/dev/null)
SOFFICE=$(which soffice 2>/dev/null || which libreoffice 2>/dev/null)

OUTPUT_DIR="docs/user-guides"

for doc in self-demo-guide uat-testing-script; do
  MD="$OUTPUT_DIR/$doc.md"
  DOCX="$OUTPUT_DIR/$doc.docx"
  PDF="$OUTPUT_DIR/$doc.pdf"

  # MD → DOCX via pandoc
  if [ -n "$PANDOC" ]; then
    $PANDOC "$MD" -o "$DOCX" \
      --from markdown \
      --to docx \
      --standalone \
      -V geometry:margin=1in 2>/dev/null && echo "✅ $doc.docx"
  fi

  # DOCX → PDF via soffice (headless)
  if [ -n "$SOFFICE" ] && [ -f "$DOCX" ]; then
    $SOFFICE --headless --convert-to pdf "$DOCX" \
      --outdir "$OUTPUT_DIR" 2>/dev/null && echo "✅ $doc.pdf"
  elif [ -n "$PANDOC" ]; then
    # Fallback: pandoc direct to pdf (requires pdflatex or wkhtmltopdf)
    $PANDOC "$MD" -o "$PDF" 2>/dev/null && echo "✅ $doc.pdf (pandoc direct)"
  fi
done
```

---

### Step 6: Report output

Print a summary:
```
✅ Generated:
  docs/user-guides/self-demo-guide.md
  docs/user-guides/self-demo-guide.docx
  docs/user-guides/self-demo-guide.pdf
  docs/user-guides/uat-testing-script.md
  docs/user-guides/uat-testing-script.docx
  docs/user-guides/uat-testing-script.pdf
```

List file sizes for each. If any export failed, note it clearly and show the fallback.

---

## Notes

- Tailor all content to the actual project — read the codebase before writing
- Use the app's real terminology (e.g. "listing" not "product", "lister" not "seller")
- Self-demo guide should read like a magazine walkthrough, not a manual
- UAT script should be printable — avoid markdown-heavy formatting inside test steps
- If pandoc is unavailable, write `.md` only and note that export requires `brew install pandoc`
- If soffice/libreoffice is unavailable, use pandoc's built-in PDF support as fallback
