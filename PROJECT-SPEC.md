# Skinsbury Library — Project Specification

## Overview

A personal-use web app for cataloging a home book library from shelf photos. The app reads book spines from uploaded photos, identifies titles via API lookup, auto-generates genre tags using a controlled vocabulary, and exports LibraryThing-compatible CSV files. Built with Next.js, deployed on Vercel.

**Critical constraint:** No book data is ever uploaded to LibraryThing without explicit human approval. The pipeline has a hard stop at the Review screen.

---

## Tech stack

- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel
- **APIs:**
  - Anthropic Claude API (spine reading via Vision, tag inference)
  - Open Library API (ISBN, LCC, publisher, year — free, no key)
  - Google Books API (fallback lookup — free tier)
- **State:** React state only. No database for v1. Each batch lives in session.
- **Auth:** None for v1. Anthropic API key lives in Vercel env var `ANTHROPIC_API_KEY`. Google Books API key in `GOOGLE_BOOKS_API_KEY` (optional).

---

## Directory structure

```
skinsbury-library/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Upload screen (default)
│   ├── review/page.tsx             # Review screen
│   ├── export/page.tsx             # Export screen
│   └── api/
│       ├── process-photo/route.ts  # Spine reading via Claude Vision
│       ├── lookup-book/route.ts    # Open Library + Google Books lookup
│       └── infer-tags/route.ts     # Tag inference via Claude API
├── components/
│   ├── AppShell.tsx                # Layout wrapper with nav
│   ├── PhotoUploader.tsx           # Drag-and-drop upload zone
│   ├── ProcessingQueue.tsx         # Photo processing status list
│   ├── BookCard.tsx                # Individual book review card
│   ├── TagChip.tsx                 # Editable tag pill component
│   ├── TagPicker.tsx               # Tag search/add dropdown
│   ├── BatchProgress.tsx           # Progress bar + stats
│   ├── ExportPreview.tsx           # CSV preview table
│   └── ConfidenceBadge.tsx         # HIGH/MEDIUM/LOW indicator
├── lib/
│   ├── tag-vocabulary.json         # The controlled vocabulary (provided)
│   ├── system-prompt.md            # Claude system prompt for tag inference (provided)
│   ├── types.ts                    # TypeScript interfaces
│   ├── csv-export.ts               # LT CSV generation logic
│   └── book-lookup.ts              # Open Library + Google Books chain
├── public/
│   └── ...
├── tailwind.config.ts
├── next.config.js
├── package.json
└── README.md
```

---

## Core data types

```typescript
interface SpineRead {
  position: number;          // Order on shelf, left to right
  rawText: string;           // Text extracted from spine
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  note?: string;             // Why confidence is low, if applicable
}

interface BookRecord {
  id: string;                // Generated UUID
  spineRead: SpineRead;
  title: string;
  author: string;            // Display format: "First Last"
  authorLF: string;          // LT format: "Last, First"
  isbn: string;
  publisher: string;
  publicationYear: number;
  lcc: string;
  genreTags: string[];
  formTags: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasoning: string;         // Why these tags were inferred
  status: 'pending' | 'approved' | 'rejected';
  warnings: string[];        // Flags for reviewer attention
  sourcePhoto: string;       // Filename of source photo
}

interface PhotoBatch {
  id: string;
  filename: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  spinesDetected: number;
  booksIdentified: number;
  books: BookRecord[];
}

interface AppState {
  batches: PhotoBatch[];
  allBooks: BookRecord[];    // Flattened from all batches
}
```

---

## API routes

### POST /api/process-photo

Accepts an uploaded image. Sends to Claude Vision API to read all visible book spines.

**Request:** `FormData` with image file

**Claude Vision prompt:**
```
Look at this photo of a bookshelf. For each visible book spine, reading left to right, extract:
1. Title (as printed on the spine)
2. Author (as printed on the spine)
3. Publisher (if visible)
4. Any other identifiers (edition info, series branding)

For each spine, rate your confidence:
- HIGH: title and author are clearly legible
- MEDIUM: partially readable, some guessing involved
- LOW: very difficult to read, substantial uncertainty

If a spine is completely unreadable, include it with confidence LOW and describe its physical appearance (color, size, position) so the reviewer can identify it.

Return a JSON array of objects with fields: position, title, author, publisher, confidence, note
```

**Response:** `SpineRead[]`

### POST /api/lookup-book

Takes a title + author, queries Open Library first, then Google Books as fallback.

**Request:** `{ title: string, author: string }`

**Open Library:** `https://openlibrary.org/search.json?title={title}&author={author}&limit=3`
- Extract: ISBN, publisher, publish year, LCC classification, number of pages

**Google Books fallback:** `https://www.googleapis.com/books/v1/volumes?q=intitle:{title}+inauthor:{author}&maxResults=3`
- Extract: ISBN, publisher, publishedDate, categories

**Response:** `{ isbn, publisher, publicationYear, lcc, source: 'openlibrary' | 'googlebooks' | 'none' }`

### POST /api/infer-tags

Takes a book's metadata and returns inferred tags using the Claude API with the system prompt and tag vocabulary.

**Request:** `{ title, author, isbn, publisher, publicationYear, lcc, existingGenreTags?, subjectHeadings? }`

**System prompt:** Load from `lib/system-prompt.md`

**User prompt:** Include the book metadata and ask for tag inference per the system prompt format.

**Model:** claude-sonnet-4-20250514

**Response:** `{ genreTags: string[], formTags: string[], confidence: string, reasoning: string }`

---

## Screens

### 1. Upload (default route: `/`)

**Purpose:** Upload spine photos, manage the processing queue, kick off batch processing.

**Layout:**
- Top: app name "Skinsbury Library" + nav tabs (Upload / Review / Export)
- Center: large drag-and-drop zone with icon, text, and file picker button
- Below: processing queue showing each uploaded photo with status
- Bottom: "Process all" button (disabled until at least one photo is queued)

**Behavior:**
- Accepts JPG, PNG, HEIC
- Multiple files at once
- Each photo shows: thumbnail, filename, file size, status (Queued → Processing → Done / Error), spine count when done
- "Process all" triggers sequential API calls: process-photo → lookup-book (per spine) → infer-tags (per book)
- When processing completes, auto-navigate to Review screen
- Show a progress indicator during processing with estimated time

**Processing pipeline per photo:**
1. Call `/api/process-photo` with image → get SpineRead[]
2. For each SpineRead, call `/api/lookup-book` with title + author → get metadata
3. For each book with metadata, call `/api/infer-tags` → get tags
4. Assemble BookRecord, add to batch

### 2. Review (`/review`)

**Purpose:** Human review and approval of all identified books and their tags.

**Layout:**
- Top: batch stats bar (total identified, approved, rejected, pending counts)
- Filter row: All / Pending / Approved / Rejected / Low confidence
- Body: scrollable list of BookCards
- Each card shows all book info, editable tags, approve/reject buttons

**BookCard component spec:**
- **Header row:** Book title (serif font, prominent) + confidence badge (HIGH green, MEDIUM amber, LOW red)
- **Meta line:** Author · ISBN · Publisher · Year · LCC code (small, muted)
- **Warning banner:** If confidence is LOW or warnings exist, show an amber or red banner explaining the issue. Examples:
  - "Spine unreadable in photo — ID inferred from adjacent books"
  - "No ISBN found — metadata may be incomplete"
  - "LCC code missing — tags inferred from title and author only"
- **Tags section:** Genre tags as colored pills, form tags as outlined pills, gold pills for collectible tags. Each tag has a remove (×) button on hover. A "+ add tag" button at the end opens the TagPicker dropdown.
- **Reasoning:** Expandable/collapsible section showing the engine's reasoning for the tag assignments.
- **Action buttons:** Approve / Reject, right-aligned. Toggle behavior — clicking Approve highlights the card border green, clicking Reject dims the card and marks it red. Clicking again un-toggles.

**TagPicker component spec:**
- Triggered by "+ add tag" button
- Dropdown with search input
- Shows tags from the vocabulary grouped by domain
- Type to filter
- Selecting a tag adds it to the card
- Typing a tag that doesn't exist shows "[Proposed] your text" option — adds it with a visual distinction

**Bulk actions:**
- "Approve all HIGH confidence" button in the filter row
- "Approve remaining" button at the bottom

### 3. Export (`/export`)

**Purpose:** Generate and download LibraryThing-compatible CSV from approved books only.

**Layout:**
- Summary stats: approved count, rejected count, pending count
- Warning if pending items remain: "12 books still pending review — only approved books will be exported"
- CSV preview: scrollable table showing exactly what will be in the CSV
- Download button: generates and downloads the CSV file
- Instructions: brief text explaining how to upload to LibraryThing

**CSV format:**
```
"TITLE","AUTHOR (last, first)","ISBN","PUBLICATION","DATE","TAGS","COPIES"
```

Tags column: all genre tags + form tags, comma-separated, in a single field.

**Filename:** `skinsbury-lt-import-{YYYY-MM-DD}-{batch-count}books.csv`

---

## Visual design direction

The mockup we prototyped was functional but visually flat. The production version should feel warm, tactile, and bookish — like a well-designed independent bookstore's inventory system, not a corporate SaaS dashboard.

### Color palette

**Primary accent:** Deep purple (#534AB7) for interactive elements, nav highlights, primary buttons
**Secondary:** Warm cream/ivory tones for backgrounds — not stark white
**Card backgrounds:** Soft warm white, very slightly off-white
**Tag color system (by domain):**
- Philosophy: purple (#EEEDFE / #3C3489)
- Religion & spirituality: teal (#E1F5EE / #085041)
- Psychology: pink (#FBEAF0 / #72243E)
- Literature: blue (#E6F1FB / #0C447C)
- Language & linguistics: amber (#FAEEDA / #633806)
- History: coral (#FAECE7 / #712B13)
- Media, tech & information: warm gray (#F1EFE8 / #444441)
- Social & political: green (#EAF3DE / #27500A)
- Science & mathematics: blue (#E6F1FB / #0C447C)
- Biography & memoir: purple (#EEEDFE / #3C3489)
- Arts & culture: coral (#FAECE7 / #712B13)
- Books & libraries: warm gray (#F1EFE8 / #444441)
- Form tags (content): outlined, no fill
- Form tags (collectible): gold (#FAEEDA / #633806)

### Typography

- **Headings and book titles:** Serif font — use something like Lora, Libre Baskerville, or Source Serif 4. Book titles should feel literary.
- **Body text and UI:** Clean sans-serif — Inter, DM Sans, or system font stack.
- **Monospace:** For ISBN numbers and CSV preview — JetBrains Mono or similar.

### Texture and warmth

- Subtle warm background tint — not pure white (#FAFAF7 or similar)
- Cards should feel like physical index cards — warm white with very subtle border
- The upload zone could have a subtle paper texture or a bookshelf illustration as background
- Tag pills should feel tactile — slightly rounded, comfortable padding
- Transitions should be gentle, not snappy — ease-in-out, ~200ms

### Dark mode

- Support dark mode via Tailwind's dark: prefix
- Dark backgrounds should be warm dark (#1A1A18 or similar), not pure black
- Tag colors should use the darker stops from each ramp
- Cards should be slightly lighter than background

### Responsive

- Desktop-first (this is a personal tool, used at a desk with photos)
- But should be usable on tablet for reviewing on the couch
- Cards stack single-column on narrow viewports

---

## Config files (provided separately)

The following files are provided and should be placed in `lib/`:

1. **tag-vocabulary.json** — Complete tag vocabulary with domains, tags, form tags, inference rules, and confidence definitions
2. **system-prompt.md** — Claude API system prompt with inference rules and 8 few-shot examples

These are the engine's brain. The API routes load them at runtime.

---

## Key behaviors

### Processing resilience
- If a spine can't be read, include it as a LOW confidence entry with description
- If Open Library returns no results, try Google Books
- If both fail, still create a BookRecord with whatever info the spine read provided, flag confidence LOW, add warning
- If tag inference fails, add the book with empty tags and a warning
- Never silently drop a book — every detected spine must appear in Review

### Tag vocabulary growth
- When a user adds a tag via TagPicker that doesn't exist in the vocabulary, prefix it with [Proposed]
- Proposed tags render with a dashed border to distinguish them
- In a future version, approved proposed tags can be written back to the vocabulary file. For v1, this is manual.

### Export safety
- The Export screen only includes books with status === 'approved'
- If zero books are approved, the download button is disabled
- The CSV preview shows exactly what will be downloaded — WYSIWYG
- Pending and rejected books are shown in the summary but excluded from the CSV

---

## Out of scope for v1

- User accounts / authentication (beyond env var API key)
- Database / batch persistence across sessions
- Direct LibraryThing API integration (upload is manual)
- Barcode/ISBN scanning from photos
- Writing proposed tags back to vocabulary file
- Batch history
- Mobile-optimized photo capture

---

## Definition of done

The app is done when:
1. A user can upload 1-5 shelf photos
2. The app processes all photos and presents identified books with tags
3. The user can review, edit tags, and approve/reject each book
4. The user can export approved books as a LibraryThing-compatible CSV
5. The CSV imports successfully into LibraryThing
6. Dark mode works
7. It's deployed on Vercel and accessible via URL
