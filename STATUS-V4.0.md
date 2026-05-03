# Carnegie — Status v4.0

**Date of writing:** 2026-05-03 (updated later same day)
**Active branch:** `main`
**Latest commit:** merge commit — "Merge next-16-upgrade: v4.0 lookup pipeline + Next 16 / React 19 + barcode preview". `next-16-upgrade` retained for reference.

This is a handoff document. If you are picking this project up cold, read it linearly. Every fact below was verified against the working tree at the date above.

---

## 1. Project identity

| | |
|---|---|
| **Name** | Carnegie |
| **Purpose** | Personal-use web app that catalogs a home library from shelf photos. Reads book spines via Claude Vision, identifies books via a multi-source lookup pipeline, infers genre + form tags from a controlled vocabulary, and exports LibraryThing-compatible CSV files. |
| **Hard rule** | No book ever leaves Carnegie without explicit human approval on the Review screen. The pipeline has a stop here by design. |
| **Repo URL** | https://github.com/GonzoDuke/carnegie |
| **Live URL** | https://carnegielib.vercel.app — production. Vercel auto-deploys from `main`. |
| **Version (package.json)** | `4.0.0`. Footer on the About page reads `ver. 4.0` and is wired to read from package.json (see `app/about/page.tsx`). When you bump, the footer updates automatically. |
| **Deployment platform** | Vercel. CI is the default Vercel GitHub integration — push to `main` deploys production; PRs and other branches get preview URLs. |
| **License** | None declared (private). |

Origin: built by a librarian with hundreds of unboxed books, to avoid typing each into LibraryThing manually.

---

## 2. Architecture overview

### Tech stack

- **Framework:** Next.js 16.2.4 (App Router, Turbopack default in Next 16). Single Node runtime — no Edge functions.
- **Language:** TypeScript 5.5.3 (strict mode).
- **Styling:** Tailwind CSS 3.4.6, custom palette in `tailwind.config.ts`. CSS variables in `app/globals.css` drive the dark-mode swap.
- **Hosting:** Vercel.
- **Auth:** None. Personal-use app, no user system.
- **Database:** None. State lives in React + localStorage + a JSON-on-GitHub sync layer (see §7).

### Frontend

- **React** 19.2.5 / **React DOM** 19.2.5.
- **PWA:** Installable. `public/manifest.json` + a no-op `public/sw.js` service worker just to satisfy the install prompt requirement. Icons: `public/icon.svg`, `icon-192.png`, `icon-512.png`.
- **State management:** Single `StoreProvider` (React `useReducer`) in `lib/store.tsx`. No Redux, no Zustand. Persistence to localStorage on every state change; a `HYDRATE` action loads from localStorage on mount (see §7 — the no-early-hydration pattern matters for React 19).

### Server / pipeline

- **Anthropic SDK** (`@anthropic-ai/sdk` 0.30.1). Spine detection (Pass A), spine OCR (Pass B), LCC inference, tag inference, and a Sonnet last-resort book identifier.
- **External lookup APIs:** Open Library, Library of Congress SRU (MARC XML), ISBNdb, Google Books, Wikidata. Full inventory in §4.
- **Barcode scanning:** native `BarcodeDetector` API where available (modern Chrome / Edge / Safari 16.4+), with `@zxing/browser` 0.2.0 + `@zxing/library` 0.22.0 as a dynamic-import fallback. The library is loaded only when the native detector isn't present, so the desktop bundle pays no cost.

### Data flow (photo → CSV)

```
PhotoUploader        →   Pass A (Claude Sonnet)  →    Per-spine workers (×4 concurrent)
(public/, /upload)        spine bbox detection        ─────────────────────────┐
                                                                                ▼
                                                                  Pass B per spine (Sonnet/Opus)
                                                                  → spine read: title/author/publisher/lcc
                                                                                ▼
                                                                  Phase 1 — parallel candidate discovery
                                                                  ISBNdb /books/{q}  ⊕  OL search.json
                                                                  → unified scoring → winner
                                                                                ▼
                                                                  Phase 2 — parallel ISBN enrichment
                                                                  MARC + GB-by-ISBN + Wikidata-by-ISBN
                                                                  + OL-by-ISBN
                                                                                ▼
                                                                  /api/infer-tags (Sonnet)
                                                                                ▼
                                                                  BookRecord lands in store.allBooks
                                                                                ▼
                                                                  Review screen — human approve/reject
                                                                                ▼
                                                                  Export screen — generate LT CSV +
                                                                  append to export ledger (GitHub-synced)
                                                                                ▼
                                                                  CSV download → upload to LibraryThing
```

### Directory layout

```
carnegie/
├── app/                    # Next.js App Router pages and API routes
│   ├── about/              # About page + version footer
│   ├── api/                # 13 server-only API routes (see §4)
│   ├── export/             # Approved-books CSV generation + ledger commit
│   ├── globals.css         # Tailwind base + CSS variables for theming
│   ├── history/            # Past exports, re-download
│   ├── layout.tsx          # Root layout, AppShell wrapping
│   ├── ledger/             # Manage exported batches (delete, recover)
│   ├── page.tsx            # /  — Upload screen + barcode scanner trigger
│   ├── review/             # /review — main human-in-the-loop review surface
│   └── vocabulary/         # Manage tag vocabulary, propose/promote tags
├── components/             # Reusable UI (see §6 for inventory)
├── lib/                    # Pipeline orchestration, store, helpers, types
│   ├── archive/            # Old planning docs, kept for history
│   └── …                   # See §13 for file-by-file
├── data/
│   └── pending-batches/    # Per-batch JSON files synced to/from GitHub
├── scripts/
│   └── gen-icons.py        # PNG icon generator for the PWA
├── public/                 # Static assets — favicon, manifest, sw.js
├── next.config.js          # Turbopack root pin + serverActions body-size cap
├── tailwind.config.ts      # Carnegie palette + font stack
├── tsconfig.json           # Strict TS + bundler module resolution
├── package.json            # Versions + scripts (see §12 for full list)
├── README.md
├── CHANGELOG.md
├── CHANGELOG-2026-05-02.md
├── PROJECT-SPEC.md
├── STATUS-V2.0.md          # Older status snapshot
├── STATUS-V4.0.md          # ← this file
└── tag-vocabulary.json     # Mirror of lib/tag-vocabulary.json (root copy is the live one)
```

### Key files (read these first)

| File | What it owns | LOC |
|---|---|---|
| `lib/book-lookup.ts` | The entire metadata-lookup pipeline. Phase 1 candidate discovery, Phase 2 ISBN enrichment, the in-memory cache, all per-tier helpers. | 1817 |
| `lib/pipeline.ts` | Per-spine orchestration (`buildBookFromCrop`, `addManualBook`, `rereadBook`, `retagBook`), client wrappers around `/api/*` routes, USE_CANONICAL_TITLES flag, multi-author authorLF builder. | 1411 |
| `lib/store.tsx` | StoreProvider, reducer, all actions, localStorage persistence (with HYDRATE), processQueue worker pool with 45s per-spine timeout, mergeDuplicates / addCopy / keepBothDuplicates flow. | 1014 |
| `app/review/page.tsx` | The Review surface (table + expanded detail rows, filters, sort, bulk-retag, refresh-from-cloud, EmptyState). | 644 |
| `components/BarcodeScanner.tsx` | Native + ZXing barcode detection, freeze-frame confirm flow, ISBN preview lookup with 3s timeout, dup-in-batch confirm. | 603 |

---

## 3. The pipeline in detail

This is the order operations run in, end to end. File references are absolute paths from the repo root.

### Step 0 — capture

User on `/` selects or photographs shelves via `components/PhotoUploader.tsx`. Photos are stored in-memory as `File` refs in `pendingFiles` (a `Map<batchId, File>` ref inside `lib/store.tsx`). They are NOT persisted to localStorage — too big.

Tablet capture supports a multi-photo loop (`components/CropModal.tsx`) and the user can crop before queuing.

### Step 1 — Pass A (spine detection)

- Route: `app/api/process-photo/route.ts`
- Model: `claude-sonnet-4-20250514` via Anthropic Vision.
- Prompt: detects every visible spine and returns a JSON array of bounding boxes (`{x, y, width, height, position}`) in image-percent coordinates. Vertical and horizontal spines both detected.
- Wrapper: `lib/pipeline.ts:detectSpines(file)` posts the image as base64 and parses the JSON response.
- Retry: `withAnthropicRetry` (in `lib/anthropic-retry.ts`) — up to 2 retries on 429/5xx with exponential backoff (1s, 3s); respects `Retry-After` capped at 10s.

### Step 2 — Per-spine worker pool

- Orchestrator: `lib/store.tsx:processQueue()`. Concurrency cap = 4. Each worker pulls the next bbox and calls `buildBookFromCrop`.
- Hard wall-clock cap: **45 seconds per spine**, enforced via `Promise.race` against a `setTimeout`. On timeout the spine becomes a stub `BookRecord` with `confidence: 'LOW'` and warning `"Pipeline timeout — try rereading"`. Worker proceeds to next spine — does not freeze the batch.

### Step 3 — Pass B (per-spine OCR)

- Route: `app/api/read-spine/route.ts`
- Model selection by spine size (`pickSpineModel` in `lib/pipeline.ts`):
  - `claude-sonnet-4-20250514` (Sonnet) for "easy" spines (≥2% of image area, aspect ratio < 3).
  - `claude-opus-4-7` (Opus) for narrow / vertical / hard spines. Opus is ~5× the per-token cost; using Sonnet everywhere produced confident hallucinations on hard spines, so this hybrid sticks.
- Prompt: extracts `title`, `author`, `publisher`, `lcc` (only when actually printed/stickered on the spine), `confidence` (HIGH/MEDIUM/LOW). Strict canonical-LCC formatting rules. Editor prefix: `ed. Barney Hoskyns`.
- **Important:** the read-spine prompt does NOT extract ISBN. Even when the spine has a printed barcode, we currently don't read it from spine OCR — that's a known gap (§9).

### Step 4 — Lookup pipeline (`lib/book-lookup.ts:lookupBook`)

Restructured 2026-05-03 from a serial cascade to a two-phase architecture.

**Cache check:** `lookupCache` (module-level `Map<string, BookLookupResult>`) keyed by both title|author and ISBN. Hits short-circuit the network entirely. Survives across requests in a warm Vercel function instance.

**Phase 1 — parallel candidate discovery:**

- Two queries fire simultaneously via `Promise.all`:
  - `fetchOpenLibraryCandidates`: `GET https://openlibrary.org/search.json?title=…&author=…&limit=10&fields=…`
  - `fetchIsbndbCandidates`: `GET https://api2.isbndb.com/books/{title}%20{lastName}` (1-second rate limiter via `isbndbWaitSlot`).
- Results unified into `Candidate[]` (ISBNdb's `IsbndbBook` is adapted to the OpenLibraryDoc shape via `isbndbToCandidate`).
- `pickBestCandidate` runs the existing `scoreDoc` scorer across both pools — author-token match (3 pts), title exact match (2 pts), LCC presence (3 pts), ISBN presence (2 pts), publisher (1), year (1), KDP self-published penalty (−3), study-guide filter. Single best candidate wins regardless of source.

**Phase 2 — targeted ISBN-direct enrichment** (only when Phase 1 winner has an ISBN):

Four parallel exact lookups, all gap-fill (never overwrite Phase 1):

| Tier | Function | URL |
|---|---|---|
| LoC MARC | `lookupFullMarcByIsbn` (lib/lookup-utils.ts) | `https://lx2.loc.gov/sru/voyager?…&query=bath.isbn={isbn}&recordSchema=marcxml` |
| Google Books by ISBN | `gbEnrichByIsbn` | `https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}` |
| Wikidata by ISBN | `lookupWikidataByIsbn` | `https://query.wikidata.org/sparql?…?item wdt:P212 "{isbn}"` |
| OL by ISBN | `enrichFromIsbn` | `https://openlibrary.org/search.json?isbn={isbn}` |

MARC parses 050 (LCC), 082 (DDC), 100 (main author), 245 (title), 250 (edition), 260/264 (publisher), 300 (page count), 600/610/611/630/650/651 (LCSH subject headings — capped 25), 700/710 (co-authors).

**Fallbacks** when Phase 1 produced no winner:
1. GB title-search (`q=intitle:…+inauthor:…`) — single attempt.
2. LoC SRU title+author for residual LCC.
3. Wikidata title-search via SPARQL CONTAINS filter.
4. (At pipeline layer) `/api/identify-book` Sonnet call from raw spine fragments, then re-run lookup with the corrected title.

**Verbose logging:** every tier emits a structured trace to the dev terminal. `process.env.VERBOSE_LOOKUP=0` silences. See `createLookupLogger` in `lib/book-lookup.ts`.

### Step 5 — Tag inference

- Route: `app/api/infer-tags/route.ts`
- Model: `claude-sonnet-4-20250514`.
- System prompt: `lib/system-prompt.md`. Loaded once and module-cached — restart the dev server if you edit it.
- The user's last 20 corrections (from `lib/corrections-log.ts`) are appended to the system prompt on every call as few-shot examples (see §8).
- Inputs: title, author, ISBN, publisher, year, LCC, free-text subject headings (OL `subject` + ISBNdb `subjects` + Wikidata genre/subject), and optionally DDC, LCSH headings, synopsis (first 300 chars).
- Output: `{ genreTags: string[], formTags: string[], confidence, reasoning }`.

### Step 6 — Final BookRecord assembly

`buildBookFromCrop` writes the BookRecord. Title/author logic:

- `USE_CANONICAL_TITLES` flag at top of `lib/pipeline.ts` (currently `true`).
- If a lookup tier matched AND the canonical title's Levenshtein similarity to the spine read is ≥ 0.6, the **shorter** of the two is used. Stops "The Hobbit, Or, There and Back Again" from replacing "The Hobbit".
- If similarity < 0.6, the canonical wins (the spine read was probably a fragment).
- Multi-author books get `authorLF = "Last1, First1; Last2, First2"` via `flipNameLastFirst`.

### Step 7 — Review (human approval)

- Page: `app/review/page.tsx`
- Desktop/tablet: a sortable table (`components/BookTableRow.tsx`) with click-to-expand detail rows that include `Editable` fields for title/author/ISBN/publisher/year/LCC, a `TagPicker` for adding tags, full LCSH list, synopsis, edition, page count.
- Phone: card list (`components/MobileBookCard.tsx`) with the same Editable fields.
- Filters: All / Pending / Approved / Rejected / Low confidence.
- Bulk re-tag (per-domain): re-runs `/api/infer-tags` against the latest vocabulary. User edits to tags are merged in, not overwritten.
- Refresh from cloud: pulls pending batches AND the export ledger from GitHub in parallel. Visible in both populated and empty states.
- Hard rule: nothing exports without explicit Approve.

### Step 8 — Export

- Page: `app/export/page.tsx`
- Builds the CSV via `lib/csv-export.ts:generateCsv`. Columns: TITLE, AUTHOR (last, first), ISBN, PUBLICATION, DATE, TAGS, COLLECTIONS, COMMENTS, COPIES.
- Author flipping handles single-author and multi-author (semicolon-joined LibraryThing format) — see §11 features list.
- On download, the books are appended to the export ledger via `lib/export-ledger.ts:appendToLedger` (localStorage) and a delta is pushed to GitHub via `/api/ledger`. The ledger is what flags previously-exported books on subsequent processing runs.
- Vocabulary commit: any `[Proposed]` tags from this batch can be promoted into `tag-vocabulary.json` via `/api/commit-vocabulary` — that route also appends a one-line entry to `lib/vocabulary-changelog.md`.

---

## 4. API dependencies

### External APIs (called by the server)

| API | Endpoint(s) | Returns | Key required | Free tier | Rate limit | Failure handling |
|---|---|---|---|---|---|---|
| Anthropic | `https://api.anthropic.com/v1/messages` (via SDK) | Spine detection JSON, spine read JSON, tag inference JSON, LCC inference JSON, identify-book JSON | `ANTHROPIC_API_KEY` | No (paid usage) | RPM/TPM per Anthropic plan | `withAnthropicRetry` retries 429/5xx twice; routes return 502 with structured JSON on hard failure. Pipeline degrades gracefully — tag inference returning empty does not block the pipeline. |
| Open Library Search | `https://openlibrary.org/search.json?title=…&author=…&fields=…` | Edition + work metadata, ISBN, publisher, year, LCC, subjects, page count | No | Yes | None enforced | Phase 1 candidate; `Promise.all` paired with ISBNdb. Failure → empty candidate list. |
| Open Library Works | `https://openlibrary.org{key}.json` | Work record (LCC fallback, subjects, description used as synopsis) | No | Yes | None | Used when search-level LCC empty. |
| Open Library /isbn | `https://openlibrary.org/isbn/{isbn}.json` | Edition by ISBN — title, author refs, covers | No | Yes | None | Used by `/api/preview-isbn` and `enrichFromIsbn`. |
| Open Library Covers | `https://covers.openlibrary.org/b/isbn/{isbn}-M.jpg?default=false` | Cover JPEG | No | Yes | None | `default=false` makes it 404 instead of grey placeholder; client falls back to GB / ISBNdb cover via `Cover.tsx`. |
| Library of Congress SRU | `https://lx2.loc.gov/sru/voyager?version=1.1&operation=searchRetrieve&query=…&recordSchema=marcxml` | MARCXML record (LCC, LCSH, DDC, edition, pages, co-authors) | No | Yes | Patchy availability | 8s timeout. Failure → null. The MARC parse is the most thorough single source we have for LCSH and DDC. |
| ISBNdb | `https://api2.isbndb.com/book/{isbn}` (direct) and `/books/{query}` (search) | ISBN, title, authors, publisher, date, pages, binding, dimensions, image, dewey_decimal, language, edition, synopsis | `ISBNDB_API_KEY` (header `Authorization`) | No (paid plan) | **1 req/sec on basic plan** — enforced by `isbndbWaitSlot` queue | One-time console warning when key missing, then skipped silently. 401/403 handled (invalid/expired key). 429 retry once. |
| Google Books | `https://www.googleapis.com/books/v1/volumes?q=…` | volumeInfo (title, authors, publisher, publishedDate, categories, imageLinks, industryIdentifiers/ISBN) | `GOOGLE_BOOKS_API_KEY` (optional) | Yes (generous unauth quota) | 1k requests/day default | Keyed call retries unauth on 4xx/5xx — quota survives most outages. |
| Wikidata SPARQL | `https://query.wikidata.org/sparql?format=json&query=…` | Book entities — P212 (ISBN), P1036 (LCC), P971 (DDC), P136 (genre), P921 (subject), P1104 (pages), P179 (series), P50/P123/P577 | No | Yes | Coarse usage policy — tens of req/min OK | 10s timeout. Title-search uses CONTAINS; ISBN-direct uses P212 exact match (`lookupWikidataByIsbn`). |
| GitHub Contents API | `https://api.github.com/repos/{REPO}/contents/{path}` | File reads/writes for ledger, corrections, pending batches, vocabulary | `GITHUB_TOKEN` (repo scope) | Yes | 5000 req/hour per token | All routes use `sha`-based optimistic concurrency. Pending-batches POST has a 409-retry shim. Other routes surface 409 to caller. |

### Internal API routes (under `app/api/`)

| Route | Method(s) | Purpose | Calls |
|---|---|---|---|
| `/api/process-photo` | POST | Pass A spine detection. | Anthropic Sonnet Vision. |
| `/api/read-spine` | POST | Pass B per-spine OCR. | Anthropic Sonnet or Opus. |
| `/api/lookup-book` | POST | Full Phase-1+Phase-2 metadata lookup. | OL, ISBNdb, GB, LoC, Wikidata. |
| `/api/infer-tags` | POST | Tag inference with last-20 corrections. | Anthropic Sonnet. |
| `/api/infer-lcc` | POST | LCC inference fallback (model-guess). | Anthropic Sonnet. |
| `/api/identify-book` | POST | Last-resort book identification from raw spine fragments. | Anthropic Sonnet. |
| `/api/preview-isbn` | GET | Fast preview for the barcode-scanner confirm card. ISBNdb → OL fallback. 3s client timeout, 4.5s server. | ISBNdb, OL. |
| `/api/ledger` | GET, POST | Read / merge-write the export ledger to GitHub (`lib/export-ledger.json`). | GitHub Contents API. |
| `/api/corrections` | GET, POST | Read / merge-write the tag-correction log to GitHub (`data/corrections-log.json`). | GitHub Contents API. |
| `/api/pending-batches` | GET, POST, DELETE | Read / write / delete cross-device batches (`data/pending-batches/*.json`). | GitHub Contents API. 409-retry shim on POST. |
| `/api/commit-vocabulary` | POST | Promote `[Proposed]` tags into `lib/tag-vocabulary.json` + append to `lib/vocabulary-changelog.md`. Two sequential PUTs (no transactional rollback — known concern §10). | GitHub Contents API. |
| `/api/changelog` | GET | Read `lib/vocabulary-changelog.md` for the Vocabulary screen. | GitHub Contents API. |
| `/api/debug-log` | POST | Server-side diagnostic logging (used by client error boundaries). | None. |

---

## 5. Environment variables

Required keys for full functionality. Place in `.env.local` for local dev; in Vercel project settings for production.

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Required.** | Without it, every AI route returns 500. Pipeline non-functional. |
| `ISBNDB_API_KEY` | Strongly recommended. | Without it, Phase-1 ISBNdb candidates skip silently. Open Library + Google Books still work, but coverage drops noticeably for recent printings. One-shot console warning logged. |
| `GOOGLE_BOOKS_API_KEY` | Optional. | If absent, `lookupBook` falls back to the unauth'd Google Books endpoint (still has a generous free quota). The keyed call also auto-retries unauth on 4xx/5xx. |
| `GITHUB_TOKEN` | Required for cross-device sync. | Without it, the ledger / corrections / pending-batches routes return 501 cleanly and the client falls back to localStorage-only flow. |
| `GITHUB_REPO` | Optional. | Defaults to `GonzoDuke/carnegie`. Override only if forking. |
| `GITHUB_BRANCH` | Optional. | Defaults to `main`. |
| `VERBOSE_LOOKUP` | Optional. | Set to `0` to silence the per-tier lookup trace logging. Default on. |
| `NEXT_PUBLIC_VERBOSE_LOOKUP` | Optional. | Set to `0` to silence the barcode-scan path's browser-console trace. Default on. |
| `NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY` | Optional. | Used in `lib/scan-pipeline.ts` for client-side GB lookups during barcode scan. Public-prefixed because it's a frontend-readable key. |

A `GOOGLE_VISION_API_KEY` exists in `.env.local` from a long-abandoned experiment. Nothing in the codebase references it. Safe to remove.

---

## 6. Frontend

### Sidebar nav (desktop / tablet — `components/AppShell.tsx`)

Fixed 260px left rail, near-black background, Carnegie tartan brand panel at top.

- **Workflow** section: Upload (`/`), Review (`/review`, with pending-count badge), Export (`/export`).
- **Library** section: Vocabulary (`/vocabulary`), History (`/history`).
- **Standalone**: About (`/about`), pinned just above the footer.
- **Footer**: lifetime stats — `N books cataloged · M batches exported`. Read from the export ledger.
- **New session button**: above Workflow nav. Confirms-then-clears the active session. Disabled when session is empty.

### Mobile nav (`components/MobileShell.tsx`)

Hidden at `md+`. Top bar (48px) + bottom tab bar (~56px). Same routes, condensed.

### Pages

| Path | File | Behavior |
|---|---|---|
| `/` | `app/page.tsx` | Upload screen. PhotoUploader for shelf photos, BarcodeScanner trigger, batch label/notes inputs. On phone, hosts the `md:hidden` Refresh-from-cloud button. |
| `/review` | `app/review/page.tsx` | The main approve/reject surface. Always renders the header with "↻ Refresh from cloud" — even on EmptyState (this was just fixed in commit `b832f08`). Filters, sort, bulk re-tag dropdown, "Add missing book" per-batch button, "Continue to export" CTA. |
| `/export` | `app/export/page.tsx` | CSV preview, batch label / notes / "include batch tag" toggles, vocabulary-promotion section for `[Proposed]` tags, download CSV, post-export ledger commit. |
| `/history` | `app/history/page.tsx` | Past batches read from the ledger. Re-download CSV, Import existing LibraryThing CSV (via `lib/librarything-import.ts`). |
| `/ledger` | `app/ledger/page.tsx` | Manage the export ledger. Per-batch delete (with confirmation). Pushes through `pushLedgerDelta` so deletions land on the repo. |
| `/vocabulary` | `app/vocabulary/page.tsx` | Browse current vocabulary by domain. Add / rename / remove tags. Vocabulary changelog (read from GitHub). |
| `/about` | `app/about/page.tsx` | Editorial page with Carnegie's origin story, the five-stage pipeline explanation, version footer. |

### Key components (under `components/`)

- `AppShell.tsx` — desktop sidebar shell.
- `MobileShell.tsx` — phone nav chrome.
- `PhotoUploader.tsx` — drag-drop / file-picker, multi-photo capture.
- `CropModal.tsx` — pre-process crop UI.
- `BarcodeScanner.tsx` — native + ZXing barcode detection. Now includes the ISBNdb→OL preview lookup with 3s timeout (commit `9370c47`).
- `BookTableRow.tsx` — Review table row + expanded detail panel (desktop/tablet).
- `MobileBookCard.tsx` — Review card (phone).
- `Cover.tsx` — `<img>` wrapper that walks `coverUrlFallbacks` on each `onError`.
- `Editable.tsx` — click-to-edit text/number field with original-value diff.
- `TagChip.tsx` / `TagPicker.tsx` — tag rendering and add/edit picker.
- `ConfidenceBadge.tsx` — HIGH/MED/LOW pill.
- `ProcessingQueue.tsx` — live progress for the Pass-A → per-spine loop.
- `BatchProgress.tsx` — per-batch progress in the queue UI.
- `SpineSelector.tsx` — "Add missing book" canvas; lets the user draw a rectangle on the source photo or fill a manual-entry form.
- `ImportLibraryThingDialog.tsx` — bulk-import an existing LT CSV into the local ledger.
- `UndoToast.tsx` — global undo notification (used by reject, clear session, etc).
- `ExportPreview.tsx` — CSV preview table on `/export`.
- `DebugErrorBoundary.tsx` — wraps Review to catch React errors with diagnostic dump.

### Dark mode

CSS variables in `app/globals.css` swap on `.dark` class on `<html>`. Default LIGHT on first visit; opt-in only via toggle (sidebar). Inline script in `app/layout.tsx` reads `localStorage.getItem('carnegie:dark')` and applies before React hydrates so there's no flash. `<html suppressHydrationWarning>` covers the mismatch React 19 would otherwise complain about.

### PWA

Installable via `public/manifest.json`. Service worker (`public/sw.js`) is intentionally a no-op — registered only because the install prompt requires its presence.

---

## 7. State management

### Where state lives

| Layer | What | Persistence |
|---|---|---|
| React store (`lib/store.tsx`) | `batches`, `allBooks`, `processing` | localStorage key `carnegie:state:v1` (images stripped before write). HYDRATE on mount. |
| Pending files | `Map<batchId, File>` ref inside StoreProvider | In-memory only. Lost on hard reload. |
| Export ledger | Every exported book — title, author, ISBN, date, batch label, tags | localStorage key `carnegie:export-ledger:v1` + GitHub at `lib/export-ledger.json`. |
| Corrections log | Tag add/remove events for inference few-shot | localStorage key `carnegie:corrections-log:v1` + GitHub at `data/corrections-log.json`. |
| Pending batches | Cross-device snapshots — phone capture → desktop pickup | GitHub at `data/pending-batches/{batchId}.json` (one file per batch). |
| Vocabulary | Genre + form tags | `tag-vocabulary.json` (root) and `lib/tag-vocabulary.json` — both written by `/api/commit-vocabulary`. The lib copy is the live one read by the app. |
| Dark mode flag | `'1'` / `'0'` | localStorage key `carnegie:dark`. |
| Remote-availability flags | per-resource | localStorage keys `carnegie:export-ledger:remote-available:v1`, `carnegie:corrections-log:remote-available:v1`, `carnegie:pending-batches:remote-available:v1`. |

### LocalStorage discipline

`lib/store.tsx` strips heavy data URIs before every persist via `slimBook` — `spineThumbnail` zeroed, `ocrImage` deleted, `mergedFrom` snapshots also slimmed. Net effect: per-batch payload stays in tens of KB. The 5-10MB localStorage limit is unreachable in practice.

Hydration is gated through a `HYDRATE` action: `useReducer` initializes empty, a mount `useEffect` reads localStorage and dispatches `HYDRATE`. The persist effect bails out until `hasHydrated.current` is true so an empty first render can't wipe the cache. This is what keeps React 19 strict-mode happy (commit `54e3db7`).

### Cross-device sync

- On `StoreProvider` mount: `syncLedgerFromRepo()`, `syncCorrectionsFromRepo()`, and `syncPendingBatchesFromRepo()` run in parallel.
- New batches landing on `data/pending-batches/` are dispatched into the local store via `ADD_BATCH`.
- After processing, `pushBatchToRepo(finalizedBatch)` writes the slim batch to GitHub for other devices to pick up.
- After export, the ledger delta is pushed via `pushLedgerDelta`.
- After a tag correction (add/remove on a system-suggested tag), `pushCorrectionDelta` writes the entry.

Race-condition note: GitHub's `sha`-based optimistic concurrency rejects stale writes with 409. The `pending-batches` POST has a 409-retry shim. Other routes surface the 409 to the user, who must retry manually. For Carnegie's single-user / two-device usage pattern this is fine in practice.

---

## 8. Tag system

### Vocabulary structure (`tag-vocabulary.json`)

Two-tier shape: domains → tags. Domains (matched by LCC prefix in `lib/tag-domains.ts`):

```
philosophy, religion, psychology, literature, language, history,
media_tech, social_political, science, biography, arts_culture,
books_libraries
```

Each domain has a list of genre tags. Form tags are separate, applied alongside genre tags:

- **content_forms**: Reference, Anthology, How-to / guide, Primary source
- **series**: Penguin Classics, Portable Library
- **collectible**: First edition, Signed

### Inference (`/api/infer-tags`)

System prompt at `lib/system-prompt.md`. Loaded once per server warm-up and cached. Restart the dev server when you edit it.

The route accepts the book's metadata + the user's last 20 corrections (forwarded by the client from `recentCorrections(20)`). Corrections are formatted as few-shot examples and appended to the system prompt:

```
CORRECTION: For "Title" by Author (LCC: ...), the system suggested [tag1, tag2]
            but the user removed "tag1" — do not suggest this tag for similar books.
CORRECTION: For "Title" by Author (LCC: ...), the system missed "tag3"
            — suggest this tag for similar books.
```

Tag-inference rules in the system prompt (abbreviated):
1. LCC code determines primary domain.
2. 2–4 tags per book; >5 is over-tagging.
3. Cross-domain expected — a music/neuroscience book gets tags from both.
4. Author knowledge applied (Sam Harris → Atheism).
5. Subtitles parsed for type signals.
6. Fiction is a Literature tag, not a separate domain.
6a. Every poetry book gets "Poetry" + nationality sub-tag.
7. Form tags independent of content.
8. Series form tags require publisher confirmation.
9. Thin metadata → confidence LOW.
10. **LCSH headings outweigh LCC** (added in enrichment commit 8).
11. DDC supplements LCC.
12. Synopsis disambiguates ambiguous titles.

### Correction feedback loop

Wired in commits 4d4-feb…-ish. When the user removes a tag from a book that was system-inferred (i.e. it appears in `book.original.genreTags` ∪ `book.original.formTags`), `logCorrection({ removedTag })` fires. When they add a tag the system didn't suggest, `logCorrection({ addedTag })`. Undoing a prior correction (re-adding a removed tag, removing an added one) cancels the prior entry rather than logging a contradicting one.

Storage: localStorage + GitHub at `data/corrections-log.json`. Both `BookCard`-style components (`BookTableRow.tsx` and `MobileBookCard.tsx`) wire `logCorrection` into `addTag` / `removeTag`.

### Proposed-tag promotion

Inferred tags that aren't in the vocabulary come back from Sonnet prefixed `[Proposed] `. The Export page surfaces these in a dedicated section; the user can promote each to either an existing or a new vocabulary entry. Promotion goes through `/api/commit-vocabulary` which:
1. PUTs `lib/tag-vocabulary.json` with the new tag added to the right domain.
2. PUTs `lib/vocabulary-changelog.md` with a one-line entry (date, action, tag, from).

The two PUTs are sequential — if the second fails, the vocabulary is updated but the changelog is stale. Known concern (§10).

---

## 9. Features list (specific, current)

### Capture
- Multi-photo upload from desktop (drag-drop or file picker) via `PhotoUploader`.
- Pre-queue cropping (`CropModal`) — useful for cutting a single shelf out of a wide bookshelf shot.
- Tablet multi-capture loop — keep snapping shelves without leaving the camera.
- **Barcode scanning** with ISBNdb-then-OpenLibrary preview on the frozen camera frame. Cover (60px) + title + author + ISBN below in monospace. 3-second client timeout — falls through to ISBN-only display on timeout. Native `BarcodeDetector` API, ZXing dynamic-import fallback. Confirm flow: user must tap "Use this ISBN" or "Rescan" — never auto-commits. Dup-in-batch confirm: if the ISBN was already scanned, defaults to "No, keep scanning" and requires opt-in to "Yes, add copy".
- "Add missing book" on Review: draw a rectangle on the source photo (Path A) → spine read + lookup, or fill a manual title/author/ISBN form (Path B). Both paths run through the standard pipeline.

### Pipeline
- Pass-A spine detection (Sonnet Vision).
- Pass-B per-spine OCR with **per-spine model selection** — easy spines on Sonnet, hard on Opus.
- Phase-1 parallel candidate discovery — ISBNdb + OL queried simultaneously, unified scoring.
- Phase-2 parallel ISBN-direct enrichment — MARC + GB-by-ISBN + Wikidata-by-ISBN + OL-by-ISBN in parallel.
- LCSH subject headings extracted from MARC and fed into the tag-inference prompt as the most authoritative cataloger signal.
- Levenshtein-based **shorter-title rule** — keeps "The Hobbit" instead of "The Hobbit, Or, There and Back Again" when canonical title is a series-bloated variant.
- **Multi-author splitting** — `Last1, First1; Last2, First2` for LibraryThing. Spine-read author strings like "Mike Caulfield & Sam Wineburg" split correctly.
- **In-memory ISBN cache** — same ISBN within a session skips network entirely.
- **Sonnet identify-book last-resort** — when all lookup tiers miss, Sonnet receives raw spine fragments and proposes a title/author. If HIGH/MEDIUM confidence, lookup re-runs with the corrected title.
- **45-second per-spine wall-clock cap** — stuck spine becomes a LOW-confidence stub with `Pipeline timeout — try rereading` warning. Worker continues to next spine.
- **Anthropic retry on 429/5xx** — 1s, 3s exponential backoff. Respects `Retry-After`.
- **Verbose per-tier trace logging** — `[lookup "Title"] discover-isbndb → 200 → 5 book(s)` etc. Server console; parallel browser-console trace for the barcode-scan path.

### Review surface
- Sortable table (desktop/tablet) with click-to-expand detail rows.
- Phone card list with same Editable fields.
- Filters: All / Pending / Approved / Rejected / Low confidence.
- Bulk re-tag (per-domain or all-approved) — preserves user-edited tags.
- "Add copy" button — clones a record with a fresh id and "Copy N" notes prefix. Use case: physical duplicates the dedup flow can't separate.
- Possible-duplicate banner with Merge / Keep-both buttons (never silently merges).
- Reread per-book: AI retry with original crop, OR "Match a specific edition" using user-edited year/publisher/ISBN, OR typed-title hint.
- **Refresh from cloud** button in the header — visible in both populated and empty states. Pulls pending batches AND export ledger from GitHub in parallel.
- Detail-panel rows for: page count, edition, binding, language (when not English), series, all authors, synopsis (truncated 280), LCSH (full).
- Cover-URL fallback chain — `<img>` `onError` walks OL → GB → ISBNdb cover URLs before dropping to spine thumbnail.

### Export
- CSV preview matching LibraryThing's expected format.
- Batch label as TAGS (`location:Shelf 3`) and/or COLLECTIONS — both toggleable.
- Multi-author authorLF correctly formatted with `; ` separator.
- Vocabulary promotion for `[Proposed]` tags.
- Auto-export shortcut: `?auto=1` triggers download on mount.
- Per-export ledger commit.

### Cross-device
- Phone capture → process → push to `data/pending-batches/`.
- Desktop / tablet on Review: Refresh from cloud pulls pending batches + ledger.
- Export ledger: shared, so a previously-exported book on any device flags as duplicate on any other device.
- Tag corrections: shared across devices for inference.

### Diagnostics
- Per-tier lookup trace in dev console.
- Identify-book trace in browser console for barcode flow.
- API routes return structured 502 JSON with `error` + `details` fields on failure.

---

## 10. Known issues

| Issue | Severity | Notes |
|---|---|---|
| `next` Vercel CVE persistence | medium | 5 high-severity advisories on 14.x cleared by upgrading to 16.2.4. Postcss inside `next/node_modules/postcss` (transitive) still flags moderate. Vercel's platform layer mitigates most exposure. Re-run `npm audit` after each Next bump. |
| **No spine-printed ISBN extraction** | high (capability gap) | Pass-B prompt doesn't read the printed ISBN-13 barcode digits at the spine foot. Books with that printed go through fuzzy title-search instead of direct ISBN lookup. Fix: extend `read-spine` prompt + plumb ISBN through. |
| `commit-vocabulary` non-atomic | medium | The route writes `lib/tag-vocabulary.json` and `lib/vocabulary-changelog.md` sequentially with no rollback. If the second PUT fails, vocab is updated but changelog is stale. |
| GitHub 409 conflict UX | medium | `pending-batches` POST has 409-retry. `ledger`, `corrections`, `commit-vocabulary` don't — concurrent writes from two devices surface as user-facing 502s. |
| Wikidata title-search timeout-prone | low | The CONTAINS-LCASE filter is occasionally slow. Now mostly bypassed thanks to ISBN-direct via `lookupWikidataByIsbn`. |
| Anthropic SDK has no `AbortSignal` | low | Relies on Vercel's `maxDuration` for cancellation. The 45s per-spine client-side `Promise.race` is the user-visible safety net. |
| `cc-update-batch.md` is `.gitignore`-d | low | Local-only file. Lives in `lib/archive/` after the cleanup move. Won't sync across clones. |
| `GOOGLE_VISION_API_KEY` in `.env.local` | informational | Unused. Safe to delete. |
| `lib/archive/` retains 13 historical docs | informational | Not loaded by the app. Kept for context. |
| MARC enrichment "no record" common | informational | LoC SRU coverage is patchy for trade-edition ISBNs. The MARC parse works correctly when a record exists; this is upstream coverage, not a bug. |

---

## 11. Infrastructure concerns — audit results

From the backend audit (CHANGELOG entries, commits `5aa8878` through `1bdb7bd`).

### Fixed
- Build warning on `app/about/page.tsx` (named import from `package.json`) — switched to default import.
- Server / client boundary cleanup — `lib/lookup-utils.ts` extracted from `lib/book-lookup.ts` so the env-var-touching code never reaches the client bundle.
- `/api/lookup-book` wrapped in try/catch — returns 502 JSON instead of HTML 500.
- Anthropic retry layer — 429/5xx retries with exponential backoff + Retry-After, capped at 10s.
- 45s client-side per-spine timeout in the orchestrator.
- Postcss bumped to 8.5.13 (XSS GHSA-qx2v-qp2m-jg93 cleared at the direct dep boundary).
- Next 14.2.35 → 16.2.4 (cleared 5 high-severity Next CVEs).
- React 18.3.1 → 19.2.5.
- Hydration mismatch in StoreProvider (React 19 strict-mode) — moved localStorage read out of `useReducer` lazy-init into a HYDRATE useEffect.
- pending-batches 409-retry shim.
- `@zxing/library` peer-dep mismatch — pinned to ^0.22.0 to satisfy `@zxing/browser`'s peer constraint (Vercel's strict installer).
- `next-16-upgrade` merged to `main` — v4 is now live on production at carnegielib.vercel.app. The branch sat unmerged longer than intended; production was running v3.5 the whole time the v4 work appeared on the branch preview URL. Merge was `--no-ff` to preserve both histories cleanly. Branch retained for SHA reference (CHANGELOG-V4_0 cites commits from it).

### Open
- Spine-printed ISBN extraction (capability, not a regression).
- 409 retry coverage on `ledger`, `corrections`, `commit-vocabulary` routes.
- Postcss inside `next/node_modules/postcss` — transitive, fix has to come upstream from Next.
- GitHub `glob` chain (high-severity command injection) — fix is `eslint-config-next@16.2.4`, already updated. Re-run `npm audit` to confirm clear.

---

## 12. Design system

### Color palette (tailwind.config.ts)

**Primary**
- Carnegie navy: `#1B3A5C` — primary interactive color, accent text.
- Carnegie navy-soft: `#ECF0F4` — hover backgrounds.
- Carnegie navy-mid: `#DDE3EC` — badges, filter pills.
- Carnegie navy-deep: `#14304B` — active / hover-darken.

**Accent**
- Carnegie gold: `#C4A35A` — approve / progress / brand accent. THE Carnegie color (matches the tartan).
- Gold-soft: `#FAF4E5` — approved row tint.

**Status**
- Green `#1A8754` (high confidence) / soft `#EAF6F0`.
- Red `#B83232` (reject / low confidence) / soft `#FBECEC`.
- Amber `#C08800` (medium confidence) / soft `#FBF4E6`.

**Surfaces (CSS-variable-driven for dark mode)**
- `--color-surface-page` — light: `246 246 244` (#F6F6F4) / dark: see globals.css.
- `--color-surface-card` — light: `255 255 255` (#FFFFFF).
- Lines `--color-line` / `--color-line-light`.
- Text `--color-text-primary` / `secondary` / `tertiary` / `quaternary`.

**Domain colors** (each with `bg` + `fg`)
philosophy `#EEF0FF / #4547A9` · religion `#E6F5EE / #1A6B45` · psychology `#FFF0F0 / #A33030` · literature `#E8F2FC / #2A5F9E` · language `#FFF6E0 / #7A5B14` · history `#FFF0E8 / #8B3A1D` · media_tech `#F0F0EC / #4A4840` · social_political `#EEF6E6 / #3A6B1A` · science `#E8F2FC / #2A5F9E` · biography `#EEF0FF / #4547A9` · arts_culture `#FFF0E8 / #8B3A1D` · books_libraries `#F0F0EC / #4A4840`.

**Legacy aliases (still in use, repointed)**
- `accent` → navy. `brass` → gold. `marble` → page bg. `limestone` → card. `cream-50` → white. `mahogany` / `tartan` → red. `ink` → near-black `#141414` (sidebar bg).

### Typography

Single typeface: **Outfit** (Google Fonts, weights 300/400/500/600/700). All keys (`sans`, `display`, `serif`) point at it so any straggling `font-serif` falls back to Outfit. Mono: **JetBrains Mono** for ISBN, LCC, anything that should monowidth.

Loaded in `app/layout.tsx` via Google Fonts `<link>`. `font-feature-settings` baked into globals.

Type scale lives in CSS classes `typo-page-title`, `typo-page-desc`, `typo-card-title` — defined in `app/globals.css`.

### Tartan

Carnegie clan tartan, recreated in CSS via two `repeating-linear-gradient` layers (180° warp + 90° weft) over a navy base. Layered as the background of:
- The sidebar BrandPanel (260×260 square, `components/AppShell.tsx:BrandPanel`).
- The 80px header bar on the About page (`app/about/page.tsx:tartanLayers`).

Stripe colors: gold `rgba(196,163,90,…)`, green `rgba(45,90,58,…)`, near-black `rgba(20,20,20,…)`, red `rgba(184,50,50,…)`. Vignette: radial gradient at `50% 45%` for the sidebar so the wordmark reads.

### Logo (Spine Stack)

56×56 rounded-square tile, near-black `#141414` background, four colored vertical bars representing book spines on a shelf:

- gold `#C4A35A` height 42 — tallest
- blue `#5B8DB8` height 36
- red `#B83232` height 30
- gray `#8A8A84` height 24 — shortest

Bars are 7px wide, 3px gaps. Defined in `components/AppShell.tsx:SpineStackLogo`.

Wordmark: "CARNEGIE" Arial Black, 22px, white, 4px letter-spacing, uppercase. Subtitle: "CATALOGING SYSTEM" 10px, 75% white, 2.5px letter-spacing, uppercase. Sit centered at 45% from top of the brand panel.

### Dark mode

Toggled via `<html class="dark">`. CSS variables in `app/globals.css` swap automatically. Inline script in the layout pre-applies the saved preference before React hydrates. Default LIGHT on first visit. The OS-level `prefers-color-scheme` is intentionally ignored.

Dark surfaces: page bg shifts to `#0F0F0E`-ish, cards to `#242220`, lines to `#3A3836`, text inverts. Brand panel keeps its tartan over navy.

---

## 13. File structure (annotated)

Top-level (excluding `node_modules`, `.next`, `data/pending-batches/*.json` instances):

```
app/
├── about/
│   └── page.tsx                       About page + version footer (reads package.json default import)
├── api/
│   ├── changelog/route.ts             GET vocabulary changelog from GitHub
│   ├── commit-vocabulary/route.ts     POST proposed-tag promotion (writes vocab + changelog)
│   ├── corrections/route.ts           GET/POST tag-correction log on GitHub
│   ├── debug-log/route.ts             POST diagnostic logs from client
│   ├── identify-book/route.ts         POST raw spine fragments → Sonnet book identification
│   ├── infer-lcc/route.ts             POST LCC inference (model fallback when lookup chain returns no LCC)
│   ├── infer-tags/route.ts            POST tag inference with corrections few-shot
│   ├── ledger/route.ts                GET/POST export ledger on GitHub
│   ├── lookup-book/route.ts           POST full Phase-1+Phase-2 metadata lookup (server entry to lib/book-lookup.ts)
│   ├── pending-batches/route.ts       GET/POST/DELETE per-batch JSON files on GitHub (cross-device sync)
│   ├── preview-isbn/route.ts          GET fast ISBN preview for the barcode-scan confirm card
│   ├── process-photo/route.ts         POST Pass A spine detection (Sonnet Vision)
│   └── read-spine/route.ts            POST Pass B per-spine OCR (Sonnet or Opus)
├── export/
│   └── page.tsx                       /export — CSV preview, batch options, vocabulary promotion, download
├── globals.css                        Tailwind base + CSS variables for theming + custom typography classes
├── history/
│   └── page.tsx                       /history — past exports, re-download CSV, import LibraryThing CSV
├── layout.tsx                         Root layout, AppShell, dark-mode pre-script, font links
├── ledger/
│   └── page.tsx                       /ledger — manage exported batches (delete with confirmation)
├── page.tsx                           / (Upload) — PhotoUploader + barcode scanner trigger + batch label/notes
├── review/
│   └── page.tsx                       /review — main review surface (always renders header w/ Refresh)
└── vocabulary/
    └── page.tsx                       /vocabulary — manage tag vocab, promote proposed tags, view changelog

components/
├── AppShell.tsx                       Desktop sidebar shell (brand panel, nav, footer stats)
├── BarcodeScanner.tsx                 Camera-based barcode detection + freeze-frame ISBN preview
├── BatchProgress.tsx                  Per-batch progress bar in the queue UI
├── BookTableRow.tsx                   Review table row + expanded detail panel (desktop/tablet)
├── ConfidenceBadge.tsx                HIGH / MED / LOW pill with status color
├── Cover.tsx                          <img> wrapper, walks coverUrlFallbacks on onError
├── CropModal.tsx                      Pre-process crop UI for shelf photos
├── DebugErrorBoundary.tsx             React error boundary with diagnostic dump (wraps Review)
├── Editable.tsx                       Click-to-edit text/number field with original-value diff dot
├── ExportPreview.tsx                  CSV preview table on /export
├── ImportLibraryThingDialog.tsx       Bulk-import existing LT CSV into the local ledger
├── MobileBookCard.tsx                 Review card (phone)
├── MobileShell.tsx                    Phone top bar + bottom tab bar
├── PhotoUploader.tsx                  Drag-drop + file-picker for shelf photos
├── ProcessingQueue.tsx                Pass-A → per-spine progress UI
├── SpineSelector.tsx                  "Add missing book" canvas (draw rect or manual form)
├── TagChip.tsx                        Single-tag rendering (genre filled / form outlined)
├── TagPicker.tsx                      Add-tag picker grouped by domain
└── UndoToast.tsx                      Global undo notification

lib/
├── anthropic-retry.ts                 withAnthropicRetry — 429/5xx retry with exponential backoff
├── archive/                           Historical planning docs (kept for context, not loaded)
├── book-lookup.ts                     The whole metadata-lookup pipeline (Phase 1 + Phase 2 + cache + verbose logging)
├── corrections-log.ts                 Tag-correction log (localStorage + GitHub sync)
├── csv-export.ts                      LibraryThing CSV builder, multi-author authorLF flipper, title-case helpers
├── export-ledger.ts                   Export ledger (localStorage + GitHub) + duplicate detection + previously-exported flagging
├── json-backup.ts                     JSON backup helper (manual/admin use)
├── librarything-import.ts             Parse a LibraryThing CSV export into ledger entries
├── lookup-utils.ts                    Levenshtein, sanitizeForSearch, normalizeLcc, lookupLccByIsbn, lookupFullMarcByIsbn
├── pending-batches.ts                 Cross-device pending-batch sync helpers
├── pipeline.ts                        Per-spine orchestration, client wrappers around /api/* routes, USE_CANONICAL_TITLES flag
├── scan-pipeline.ts                   Barcode-scan flow (ISBN → metadata via OL → GB → server fallback)
├── session.ts                         confirmDiscardSession helper for clear-session UX
├── store.tsx                          StoreProvider, reducer, all store actions, processQueue, HYDRATE pattern
├── system-prompt.md                   Tag-inference system prompt (cached at module-load)
├── tag-domains.ts                     Domain definitions + LCC-prefix mapping
├── tag-vocabulary.json                Live tag vocabulary read by the app
├── types.ts                           BookRecord, BookLookupResult, SpineRead, PhotoBatch, etc.
├── vocabulary-changelog.md            Append-only log of vocabulary edits
└── vocabulary-update.ts               Vocabulary mutation helpers (add/rename/remove)

data/
└── pending-batches/                   Per-batch JSON files (also written to GitHub at the same path)

scripts/
└── gen-icons.py                       PWA icon generator (PIL)

public/
├── icon-192.png                       PWA icon
├── icon-512.png                       PWA icon
├── icon.svg                           Source icon
├── manifest.json                      PWA manifest
└── sw.js                              No-op service worker (installable-app marker)

next.config.js                         Turbopack root pin + serverActions body limit
next-env.d.ts                          Next-managed types
package.json                           Versions + scripts
package-lock.json                      Locked deps
postcss.config.js                      PostCSS config
tag-vocabulary.json                    Mirror of lib/tag-vocabulary.json (root copy not used by the app at runtime)
tailwind.config.ts                     Carnegie palette + font stack + safelist
tsconfig.json                          Strict TS + bundler module resolution

CHANGELOG.md                           Primary release log
CHANGELOG-2026-05-02.md                Daily changelog, May 2 2026
PROJECT-SPEC.md                        Original spec
README.md                              Overview
STATUS-V2.0.md                         Older status snapshot
STATUS-V4.0.md                         ← this file
carnegie-pipeline-enrichment-stable.md Plan doc that drove the 12-commit enrichment series
sample-lt-import.csv                   Reference LT CSV structure
```

---

## 14. Dependency versions

```
dependencies:
  @anthropic-ai/sdk    ^0.30.1
  @zxing/browser       ^0.2.0
  @zxing/library       ^0.22.0      ← peer-pinned to satisfy @zxing/browser strict resolver
  next                 ^16.2.4      ← upgraded from 14.2.35 (cleared 5 Next CVEs)
  react                ^19.2.5      ← upgraded from 18.3.1
  react-dom            ^19.2.5

devDependencies:
  @types/node          ^20.14.10
  @types/react         ^19.2.14
  @types/react-dom     ^19.2.3
  autoprefixer         ^10.4.19
  eslint               ^10.3.0
  eslint-config-next   ^16.2.4
  postcss              ^8.5.13      ← upgraded for GHSA-qx2v-qp2m-jg93
  tailwindcss          ^3.4.6
  typescript           ^5.5.3
```

Node minimum (per Next 16): 20.9.0 LTS. TypeScript minimum: 5.1.0.

---

## 15. Build and deploy

### From scratch (local dev)

```bash
# 1. Clone
git clone https://github.com/GonzoDuke/carnegie.git
cd carnegie

# 2. Install (Vercel uses plain `npm install`; do the same locally to catch peer-dep issues early)
npm install

# 3. Create .env.local
cat > .env.local <<'ENV'
ANTHROPIC_API_KEY=sk-ant-…
ISBNDB_API_KEY=…
GOOGLE_BOOKS_API_KEY=AIza…    # optional
GITHUB_TOKEN=ghp_…             # required for cross-device sync
GITHUB_REPO=GonzoDuke/carnegie
GITHUB_BRANCH=main
ENV

# 4. Run dev server (Turbopack)
npm run dev      # → http://localhost:3000

# 5. Verify
npx tsc --noEmit
npm run build
```

### Deploy to Vercel

The repo is wired to Vercel via the GitHub integration. Pushing to `main` triggers production deploy; PRs / branches get preview URLs. No `vercel.json` needed — `next.config.js` is the source of truth.

To deploy a specific branch:
```bash
git push origin <branch>
# Vercel posts the preview URL on the GitHub commit
```

Production URL: check the Vercel dashboard. The README does not pin it.

### Push updates

```bash
git checkout -b my-feature
# … work …
npx tsc --noEmit
npm run build         # must pass before push
git commit -am "..."
git push -u origin my-feature
# open PR; Vercel builds preview; merge to main when ready
```

### Common build pitfalls

- **Turbopack root warning** — pinned via `next.config.js:turbopack.root = path.resolve(__dirname)` to dodge a stray `package-lock.json` in the home directory.
- **Peer-dep failure on Vercel** — the strict installer rejected the original `@zxing/library@^0.23.0` against `@zxing/browser@0.2.0`'s `^0.22.0` peer. Fixed by pinning. Don't use `--legacy-peer-deps` locally — Vercel won't.
- **System prompt edits** — module-cached on warm starts. Restart `npm run dev` after editing `lib/system-prompt.md`.

### Operational checklist when shipping a behavioral change

1. `npx tsc --noEmit` clean.
2. `npm run build` clean.
3. Run a real lookup against the dev server with `VERBOSE_LOOKUP=1` and inspect the trace.
4. Test the empty-state + populated-state of `/review` (the EmptyState gate has bitten before).
5. Push.

---

## 16. Future features / brainstorm list

Things discussed in planning docs and conversations but not yet built. Not a commitment — a tracked backlog.

### Pipeline / lookup
- **Spine-printed ISBN extraction** (high priority). Extend `read-spine` prompt to read the printed ISBN-13 barcode digits at the spine foot when present. Plumb through to use exact-ISBN tiers from the start. Biggest single quality + speed win available.
- **OCLC Classify integration** — was in PROJECT-SPEC.md as a free no-key LCC gap-filler. Never built.
- **Match-uncertainty warning** — when the Phase-1 winner's title diverges from the spine read by Levenshtein < 0.6, optionally re-run via `identify-book` instead of trusting the match.
- **Worldcat / OCLC API** as another LCC source.
- **HathiTrust** for full-text matching of partially-OCR'd titles.

### Capture
- **Live spine-detection preview** — show bounding boxes overlaid on the camera feed before commit, so the user knows whether the photo is good before processing.
- **Mass-rescan** — select N books on Review and Reread them all in one go with shared options.
- **OCR-quality crop preserved across reload** — currently `ocrImage` is stripped from localStorage so Reread can't do the AI retry path after a refresh; only `matchEdition` works. Storing OCR crops in IndexedDB would unblock this.

### Review / UX
- **Diff view in detail panel** — show original spine read vs current canonical title side by side when they differ.
- **Bulk approve all matches above HIGH confidence** — one-click for the easy cases.
- **Inline tag suggestions** — show the next 3 most-likely tags from the corrections-log few-shot pool as quick-add chips on each card.
- **Edit history** — track per-field edit timeline.

### Cross-device / sync
- **409-retry coverage** on `ledger`, `corrections`, `commit-vocabulary` routes (matches what `pending-batches` POST already does).
- **Multi-file transactional vocabulary commit** — current `commit-vocabulary` writes two files sequentially without rollback.
- **Live presence / cursor** — see when another device is mid-processing.

### Tag system
- **Confidence-weighted tag merging** — when bulk re-tagging, weight inferred tags by confidence + LCSH presence.
- **Domain-specific tag-inference prompts** — once a book's domain is settled, switch to a focused prompt with that domain's full vocabulary in the context.
- **Tag co-occurrence stats** — show which tags appear together in the user's library.

### Export / integration
- **Direct LibraryThing API integration** — currently the user uploads a CSV manually. LT has an import API, but the user explicitly wants the human-approval CSV workflow to stay; this would be opt-in.
- **Goodreads CSV export** — alternate output format.
- **Calibre integration** — push approved books straight into a local Calibre library.

### Infrastructure
- **Postcss-via-Next-bundle moderate CVE** — wait for upstream Next or pin a bundler override.
- **Session-level GitHub deltas** — instead of per-book ledger PUTs, batch them every N seconds to cut commit noise.
- **Vercel Functions Active CPU pricing optimization** — the 45s per-spine cap is generous; some spines complete in <5s. Investigate `streaming` responses for spine reads to reduce billable wall-time.

### Polish
- **Sidebar minimize toggle** — for small laptop viewports.
- **Keyboard shortcuts** — `j/k` to navigate review rows, `a` to approve, `r` to reject, `/` to search.
- **A11y pass** — color-contrast audit + screen-reader pass on the Review surface.
- **Typeface refinement** — Outfit at 700 reads slightly heavy for the page-title scale; try a custom variable-axis pull.

### Speculative
- **Multi-user libraries** — share-link a read-only view of someone else's collection.
- **Book recommendation engine** — using the corrections-log as preference signal.
- **Mobile-native barcode loop** — keep the camera open after each scan, audio click, no modal — for power users blasting through a shelf.

---

End of status doc. If you hit something that surprises you, it's probably in the CHANGELOG (read newest first) or the per-commit messages on `main` (or on `next-16-upgrade`, which is preserved for reference). The lookup pipeline restructure (commit `a028295`) and the React 19 / Next 16 upgrade (commit `857939f`) are the two biggest recent shifts — start there if behavior diverges from your expectations.
