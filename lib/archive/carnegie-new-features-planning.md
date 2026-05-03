# Carnegie — new features planning prompt

Plan these two features. Don't build yet — outline what you'll do, what files change, what APIs you'll call, and any concerns. I'll review the plan before you start.

---

## Feature 1: ISBN barcode scanning

**What it does:** On the phone Capture tab (and optionally desktop/tablet Upload page), add a "Scan barcode" button alongside the existing "Take photos" and "Choose photos" options. Tapping it opens the camera in barcode scanning mode. The user points the camera at a book's back cover barcode, the app reads the ISBN, and it immediately runs the lookup → tag inference pipeline for that single book. The result appears as a BookRecord in the Review screen like any other book.

**Why this matters:** When the user is holding a book or it's face-out in a box, photographing the spine and waiting for Pass A + Pass B is overkill. A barcode scan goes straight to lookup — no spine detection, no OCR, no Opus API call. Faster, cheaper, more accurate.

**Technical direction:**
- Use a JavaScript barcode scanning library that works with getUserMedia — evaluate `quagga2` (QuaggaJS fork), `@nicbarker/barcode-scanner`, or the BarcodeDetector Web API (Chrome 83+, check support).
- The BarcodeDetector API is native to Chrome and requires no library — but verify it works inside the PWA on Android. If it does, prefer it over a third-party library.
- The camera should show a live viewfinder with a targeting rectangle. When a barcode is detected, the app reads the ISBN, closes the camera, and immediately calls the lookup chain (Open Library → LoC → ISBNdb → Google Books → Wikidata → OCLC Classify) using the ISBN directly — no title/author search needed, just `GET /book/{isbn}` on each source.
- After lookup, run tag inference using the same `/api/infer-tags` route.
- The resulting BookRecord gets a "Scanned" badge instead of a spine thumbnail. The cover image from the lookup serves as the visual.
- Scanned books enter the same batch as photographed books. They appear on the Review screen identically — same approve/reject/edit flow.
- Multiple scans in a row: after a successful scan, the camera reopens automatically (same loop pattern as the photo capture). The user scans book after book until they tap Done.

**Questions to answer in your plan:**
1. Does BarcodeDetector work in the Carnegie PWA on Android Chrome? If not, which library do you recommend?
2. How do you handle a barcode that isn't an ISBN (UPC, QR code, etc.)? Filter by format or attempt lookup and fail gracefully?
3. Where does the "Scan barcode" button go in the UI on phone vs desktop?
4. What happens if the ISBN doesn't match any source? Show an empty BookRecord with just the ISBN pre-filled for manual completion?

---

## Feature 2: Import existing LibraryThing catalog into the ledger

**What it does:** The user may already have books cataloged in LibraryThing from before Carnegie existed. This feature lets them import that existing catalog into Carnegie's export ledger so that duplicate detection works against their full library — not just books cataloged through Carnegie.

**Where it lives:** A button on the History screen — "Import from LibraryThing." This is a setup action the user runs once, or re-runs if their LT catalog has grown.

**Technical direction:**
- LibraryThing's export page (librarything.com/export.php) lets users download their catalog as JSON, CSV, or tab-delimited text. Carnegie should accept any of these formats.
- Clicking "Import from LibraryThing" opens a file picker that accepts .json, .csv, or .tsv files.
- Parse the uploaded file and extract: title, author, ISBN, publication year, tags, collections, and any other fields present.
- For each book in the import, create a ledger entry in the same format the export ledger uses. Set the `batchLabel` to "LibraryThing Import" and the date to the import date.
- Commit the updated ledger to GitHub via the existing GITHUB_TOKEN pattern.
- After import, show a summary: "Imported X books from LibraryThing. These will be flagged as duplicates if re-scanned."
- The import is additive — it doesn't replace existing ledger entries. If a book already exists in the ledger (matched by ISBN), skip the duplicate.
- The imported books appear in the History screen as a single batch labeled "LibraryThing Import."
- If the user has no existing LT catalog, they simply never use this button. It's optional and unobtrusive.

**Questions to answer in your plan:**
1. What fields are available in the LibraryThing JSON export format? Map them to the ledger entry format.
2. How do you handle books in the LT export that have no ISBN? Match by title + author for dedup purposes?
3. What happens if the user imports twice — does it detect and skip books already imported, or create duplicates?
4. How large could the file be? If someone has thousands of books in LT, does the GitHub commit handle a ledger that size?

---

## Deliverable

For each feature, give me:
1. Which files you'll create or modify
2. The API/library you'll use and why
3. The user flow step by step
4. Any concerns or blockers
5. Estimated number of commits

Don't start building until I approve the plan.
