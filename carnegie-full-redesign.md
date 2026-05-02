# Carnegie — complete design overhaul

This is a full visual and structural redesign. The app is being rebuilt visually from the ground up. A working HTML mockup is included in the project directory at `carnegie-mockup-v3-modern.html` — open it in a browser, click through all three tabs, and use it as the visual target for spacing, density, and layout. Match it as closely as possible while implementing the changes described below.

---

## 1. Layout: sidebar navigation

Replace the current top-nav header with a left sidebar. This is the single biggest structural change.

### Sidebar specs
- Width: 200px, fixed
- Background: #141414 (near-black)
- Full viewport height, does not scroll with content

### Sidebar contents (top to bottom)

**Brand block (top)**
- Logo: 32x32px rounded square with Carnegie tartan pattern fill (see section 5)
- "Carnegie" in JetBrains Mono, 14px, weight 600, color #E0E0E0, letter-spacing 0.5px
- "Cataloging System" below it, 9px, uppercase, letter-spacing 2px, color #C4A35A (gold)
- Entire block is clickable, navigates to Upload

**Workflow section**
- Section label: "WORKFLOW", 9px, uppercase, letterspaced, color #444
- Three nav items:
  - Upload (camera/upload icon)
  - Review (list icon) — shows badge with pending count in gold
  - Export (download icon)

**Library section**
- Section label: "LIBRARY", same style as above, with more top margin (28px)
- Two nav items:
  - Vocabulary (books icon)
  - History (clock icon)

**Footer (bottom, pushed to bottom with margin-top auto)**
- Border-top: 1px solid #222
- Two lines of muted stats: "73 books cataloged" and "5 batches exported"
- Pull these numbers from the export ledger
- Font: 11px, color #444

### Nav item styling
- Padding: 7px 16px
- Font: Outfit, 13px, weight 400
- Default color: #707070
- Hover: background #1F1F1F, color #E0E0E0
- Active: background #252525, color #E0E0E0, left border 2px solid #1B3A5C (navy accent)
- Icons: 15px, stroke-based SVG, opacity 0.4 default, 0.7 when active

### Content area
- Takes remaining width (calc(100vw - 200px))
- Scrolls independently from sidebar
- Each screen has a sticky page header (background white, border-bottom, contains page title and any page-level actions)
- Page body has 20px 28px padding

---

## 2. Color palette

Replace ALL existing colors. The palette is derived from the Carnegie clan tartan (navy, red, gold, green, black).

### Primary
- **Accent (navy):** #1B3A5C — primary interactive color, active states, primary buttons, links
- **Accent soft:** rgba(27,58,92,0.08) — hover backgrounds, selected row backgrounds
- **Accent mid:** rgba(27,58,92,0.15) — badges, filter pills

### Status
- **Approved/positive (gold):** #C4A35A — approved button active state, approved row tint, progress indicators
- **Gold soft:** rgba(196,163,90,0.10) — approved row background
- **Reject/error (red):** #B83232 — reject states, error messages, low confidence badge
- **Red soft:** rgba(184,50,50,0.06) — rejected row background
- **Warning (amber):** #C08800 — medium confidence, warning dots
- **Amber soft:** rgba(192,136,0,0.07) — warning backgrounds
- **Success (green):** #1A8754 — high confidence badge, done status
- **Green soft:** rgba(26,135,84,0.07) — high confidence background

### Surfaces
- **Page background:** #F6F6F4
- **Card/table:** #FFFFFF
- **Card hover:** #FBFBFA
- **Border:** #E4E4E0
- **Border light:** #EFEFEC (internal dividers)

### Text
- **Primary:** #141414
- **Secondary:** #555550
- **Tertiary:** #8A8A84
- **Quaternary:** #B0B0A8

### Tag domain colors (keep but adjust to be slightly more muted/modern)
- Philosophy: #EEF0FF / #4547A9
- Religion: #E6F5EE / #1A6B45
- Psychology: #FFF0F0 / #A33030
- Literature: #E8F2FC / #2A5F9E
- Language: #FFF6E0 / #7A5B14
- History: #FFF0E8 / #8B3A1D
- Media/tech: #F0F0EC / #4A4840
- Social/political: #EEF6E6 / #3A6B1A
- Science: #E8F2FC / #2A5F9E
- Biography: #EEF0FF / #4547A9
- Arts/culture: #FFF0E8 / #8B3A1D
- Books/libraries: #F0F0EC / #4A4840

---

## 3. Typography

All sans-serif. No serifs anywhere in the app.

- **Brand name ("Carnegie"):** JetBrains Mono, 14px, weight 600
- **Page titles:** Outfit, 18px, weight 600
- **Book titles in review table:** Outfit, 14px, weight 600
- **Body text / nav items:** Outfit, 13px, weight 400-500
- **Metadata:** Outfit, 11px, weight 400, muted color
- **Labels:** Outfit, 10-11px, weight 500-600, uppercase, letterspaced 0.5px
- **ISBN / LCC / monospace data:** JetBrains Mono, 10-11px
- **Badges / status:** Outfit, 9-10px, weight 600, uppercase

Import from Google Fonts:
```
Outfit: weights 300, 400, 500, 600, 700
JetBrains Mono: weights 400, 500, 600
```

Remove all serif font imports (Cormorant Garamond, Source Serif 4, Spectral). They are no longer used.

---

## 4. Review screen: compact table with covers

Replace the current card-based review layout with a compact table. See the mockup for the exact visual.

### Table structure
- Columns: Cover (52px) | Book info (flexible) | Confidence (80px) | Tags (200px) | Actions (100px)
- Header row: gray background, uppercase labels, sticky
- Each row: 9-10px vertical padding, border-bottom between rows
- Approved rows: gold tint background (rgba(196,163,90,0.10))
- Rejected rows: 30% opacity

### Book covers
- Display a 36x52px book cover image in the first column
- Source priority:
  1. Open Library Covers API: `https://covers.openlibrary.org/b/isbn/{isbn13}-M.jpg`
  2. Google Books: `imageLinks.thumbnail` from existing lookup response
  3. ISBNdb: `image` field from existing lookup response
  4. Fallback: show the spine crop thumbnail as currently done
- Store the cover URL on BookRecord as `coverUrl?: string`
- Set during the lookup step — add cover URL extraction to `lib/book-lookup.ts`
- Use `loading="lazy"` on all cover images
- If the cover URL returns a 404 or broken image, fall back to a neutral placeholder (gray rectangle with a subtle book icon)

### Row expansion
- Clicking a row expands a detail panel below it (same row, full width)
- Detail panel shows: publisher, LCC (with provenance badge), source/spine number, batch label
- Full tag list with add/remove capability
- Reread button
- Clicking the row again collapses it
- Warning dots (amber, 5px circle) appear inline before the title for books that need attention — replacing the current full-width warning banners

### Approve/reject in table
- Two small buttons per row: ✓ and ✕
- ✓ hover: navy border and text, navy soft background
- ✓ active (approved): solid gold background, dark text
- ✕ hover: red border and text, red soft background
- ✕ active (rejected): red soft background, red border

---

## 5. Carnegie tartan integration

Two places only. Subtle, not decorative.

### 5a. Logo icon
The 32x32px "C" logo square in the sidebar gets a tartan pattern fill instead of a solid color.

Generate the tartan pattern using CSS or inline SVG. The Carnegie tartan thread count is:
Y/4 G4 R4 G4 R4 G12 K12 R4 B12 R4 B4 R4 B/6

Simplified for a 32px icon, use these approximate colors:
- Navy: #1B3A5C
- Green: #2D5A3A
- Red: #B83232
- Black: #141414
- Gold: #C4A35A

The "C" letter sits on top of the tartan pattern in white, JetBrains Mono, weight 600, 16px. The tartan should be subtle — reduced opacity or very fine lines so the "C" remains clearly readable.

If generating a real tartan pattern in CSS is too complex at 32px, an acceptable alternative is a simplified crosshatch of the navy, red, and gold at fine scale that reads as "plaid-ish" without needing to be an exact tartan reproduction.

### 5b. Sidebar accent stripe
A 3-4px horizontal stripe at the bottom of the sidebar (above the footer stats), using the same tartan pattern or a simplified version of it. Full width of the sidebar. This is a subtle decorative element — the only one in the entire app.

---

## 6. Vocabulary screen (new)

Accessible via the "Vocabulary" nav item in the sidebar's Library section.

### Layout: two-column

**Left column (180px, fixed)**
- List of domains, vertically stacked
- Each domain shows: name + tag count in parentheses
- "All" option at the top, selected by default
- Clicking a domain filters the right column
- Active domain has navy accent left border (same style as nav items)
- Style: same font/size as sidebar nav items but on a white background

**Right column (remaining width)**

**Top: Add tag bar**
- A single row with two inputs and a button:
  - Tag name input (text, placeholder "New tag name...")
  - Domain dropdown (select, populated with all domain names)
  - "Add" button (navy accent)
- Adding a tag immediately updates the vocabulary JSON via the GitHub API (same pattern as the existing vocabulary auto-update)

**Tag list**
- One row per tag, compact table style
- Columns: Tag name | Domain | Usage count | Delete
- Sort alphabetically by default within each domain
- Usage count: number of books in the export ledger that have this tag. Query from ledger data.
- Delete button: small ✕, disabled (grayed out) if usage count > 0. Enabled if usage count is 0.
- Deleting a tag: confirmation dialog "Remove [tag] from [domain]? This cannot be undone."
- After deletion, commit updated vocabulary JSON to GitHub

**Bottom: Changelog (collapsible)**
- Header: "Changelog" with expand/collapse toggle
- Shows entries from vocabulary-changelog.md in reverse chronological order
- Each entry: date, tag name, domain, source book
- Collapsed by default

---

## 7. History screen (new)

Accessible via the "History" nav item in the sidebar's Library section.

### Layout

**Top: lifetime stats**
- Single horizontal line, same style as the review stats bar
- "142 books cataloged · 8 batches exported · First export: Apr 29, 2026"
- Pull all data from the export ledger

**Batch table**
- One row per exported batch
- Columns: Batch label | Date exported | Books | Notes | Actions
- Sort by date, most recent first
- Each row is expandable (same pattern as review table)

**Expanded batch row**
- Shows all books in that batch as a compact sub-table: Title, Author, ISBN (monospace), Tags (truncated)
- This is read-only — no approve/reject, no editing. Just a record.

**Actions per batch**
- **Re-download CSV:** regenerates and downloads the CSV from the stored ledger data. Uses the same CSV export logic as the Export screen.
- **Delete from ledger:** removes all books in this batch from duplicate detection. Confirmation dialog: "Delete batch '[label]' (20 books) from the ledger? These books will no longer be flagged as duplicates if re-scanned. This does not affect LibraryThing." After confirmation, commit updated ledger to GitHub.

---

## 8. Upload and Export screens

These keep the same functionality but get the new styling:

### Upload
- Batch label and notes fields: Outfit font, white background inputs with #E4E4E0 border, navy focus border
- Dropzone: dashed border, navy hover color, navy accent background on hover
- Queue items: same compact list style as mockup
- "Process all" button: navy accent (#1B3A5C), white text
- Kill the "How it works" section and "Tips for best results" section entirely. Photography tips move to a small (i) info icon tooltip next to the dropzone text.

### Export
- CSV preview table: same styling as the review table (gray header, alternating rows, sticky header, monospace ISBNs)
- Download button: navy accent
- Vocabulary updates section: bordered with a 2px navy top line (not gold — we're using navy as the primary accent now)
- Filename in the export note line

---

## 9. Dark mode

- Sidebar stays the same (already dark)
- Page background: #1A1816 (warm dark)
- Card/table background: #242220 (warm dark surface)
- Borders: #3A3836
- Text primary: #E4E2DC
- Text secondary: #8A8880
- All accent colors (navy, gold, red, green, amber) stay the same
- Tag domain colors shift to darker variants (reduce lightness, maintain hue)
- The tartan icon and stripe stay the same — they're already on a dark background

---

## 10. What to remove

- All serif font imports (Cormorant Garamond, Source Serif 4, Spectral)
- The top navigation header bar (replaced by sidebar)
- The "How it works" section on the upload page
- The "Tips for best results" section on the upload page
- The Princeton orange (#C85A12) — should not appear anywhere
- The old library green (#1E3A2F) — should not appear anywhere
- The old brass (#C9A96E) — replaced by Carnegie gold (#C4A35A)
- Any full-width warning banners on BookCards (replaced by inline warning dots)

---

## 11. Visual reference

The file `carnegie-mockup-v3-modern.html` in the project directory is the visual target. Open it in a browser and match:
- The sidebar proportions and styling
- The compact table density on the Review screen
- The spacing between elements
- The button sizes and shapes
- The tag pill sizing

The mockup uses indigo (#5B5FE6) as the accent — replace all instances with Carnegie navy (#1B3A5C). The mockup doesn't have the tartan icon, book covers, Vocabulary screen, or History screen — those are specified in this document only.

---

## Implementation order

1. Sidebar + navigation (structural change, do first)
2. Color palette swap (global find-and-replace old colors)
3. Typography swap (remove serifs, install Outfit + JetBrains Mono)
4. Review screen table layout with book covers
5. Tartan icon and stripe
6. Upload and Export screen restyling
7. Vocabulary screen (new)
8. History screen (new)
9. Dark mode adjustments
10. Remove all deprecated elements (section 10)

Commit after each step. Test between each step.

---

## Test

After all changes:
1. Open the app in light mode. Navigate all five screens. Confirm no old colors (orange, green, brass) appear anywhere.
2. Open the app in dark mode. Confirm all screens render correctly with warm dark backgrounds.
3. On the Review screen, confirm book covers load from Open Library. Confirm at least one falls back to spine crop.
4. Click a review table row — confirm the detail panel expands. Click again — confirm it collapses.
5. Approve a book — confirm the row highlights in gold tint. Reject — confirm it dims.
6. Open Vocabulary — confirm domains are listed, tags are shown with usage counts, and the add/delete functions work.
7. Open History — confirm all exported batches appear with correct data. Expand one — confirm the book list is correct. Delete one — confirm it's removed from the ledger.
8. Check the sidebar: confirm the tartan icon renders, the tartan stripe is visible, and the stats update from the ledger.
9. Compare against carnegie-mockup-v3-modern.html — the app should feel like the same product.
