# Carnegie — design polish pass

This is a visual refinement pass. No features, no logic changes. Every change is cosmetic. The goal: make the app feel like a finished product, not a prototype.

---

## 1. Typography hierarchy

The problem: everything is the same visual weight. Fix by establishing five distinct levels.

### Level 1 — Page titles
- "Review & approve", "Export", etc.
- Cormorant Garamond, 32px, weight 500
- Color: library green (#1E3A2F) in light mode, limestone (#E8E2D4) in dark mode
- Margin bottom: 4px before subtitle/description text

### Level 2 — Page descriptions
- "Verify each book's metadata and tags..."
- Inter, 15px, weight 400
- Color: muted — #6B6A65 in light mode, #9A9890 in dark mode
- Margin bottom: 24px before content

### Level 3 — Card titles (book titles)
- Source Serif 4, 18px, weight 600
- Color: primary text color
- No margin bottom — metadata line sits directly below with 2px gap

### Level 4 — Card metadata
- Inter, 13px, weight 400
- Color: #9A9890 (muted)
- ISBN in JetBrains Mono, same size
- Metadata items separated by middot (·) with 6px spacing on each side

### Level 5 — Labels, badges, helper text
- Inter, 11px, weight 500 for labels (all-caps, letterspaced 0.5px)
- Inter, 11px, weight 400 for helper text
- Color: #B4A99A (tertiary)

Apply these levels consistently across every screen. If any text doesn't fit one of these five levels, it's probably unnecessary — consider removing it.

---

## 2. Spacing system

Use an 8px base grid. Every margin, padding, and gap should be a multiple of 4 or 8:

```
4px  — tight: between a label and its field, between a title and its subtitle
8px  — compact: between metadata items, between tag pills
12px — standard: padding inside tags, between small UI elements
16px — comfortable: padding inside cards (horizontal), gaps between cards
20px — breathing room: padding inside cards (vertical top/bottom)
24px — section breaks: between page title area and content, between major sections
32px — major sections: between the stats bar and the card list
48px — page-level: top padding of main content area below header
```

### Specific fixes
- Card internal padding: 20px vertical, 24px horizontal (consistent on every card)
- Gap between cards: 12px (currently inconsistent)
- Gap between tag pills: 6px
- Gap between tag section and action buttons: 16px
- Stats tiles: 16px internal padding, 8px gap between tiles
- Filter/sort row: 32px below stats tiles, 24px above first card

---

## 3. Card redesign — visual zones

Each BookCard should have three visually distinct zones separated by subtle dividers or spacing:

### Zone A — Identity (top)
```
┌────────────────────────────────────────────────────────┐
│  [Spine thumbnail]  Title                    [HIGH]    │
│                     Author · ISBN · Publisher · Year    │
│                     LCC: PR2345 .A1 [from LoC]         │
│                                                        │
│  ⚠ Warning banner if applicable                        │
└────────────────────────────────────────────────────────┘
```
- Spine thumbnail: 48px wide, rounded corners (6px), subtle limestone border (1px)
- Title and metadata right of the thumbnail, vertically centered
- Confidence badge top-right, pill-shaped
- LCC on its own line with provenance badge
- Warning banner: full width, 8px below metadata, subtle background tint with rounded corners (8px), 12px padding

### Zone B — Tags (middle)
```
┌────────────────────────────────────────────────────────┐
│  [Genre tag] [Genre tag] [Genre tag] [+ add genre]     │
│  [Form tag] [+ add form]                               │
└────────────────────────────────────────────────────────┘
```
- Separated from Zone A by 16px space (no line — just air)
- Genre tags and form tags on separate rows
- Tags have 6px gap between them
- "+ add" buttons are dashed-border pills that match the height of real tags

### Zone C — Actions (bottom)
```
┌────────────────────────────────────────────────────────┐
│  LOCATION [field]     NOTES [field]                    │
│                                                        │
│  📸 spine #3 · OPEN LIBRARY    ↻ Reread  ✕ Reject  ✓ Approve │
└────────────────────────────────────────────────────────┘
```
- Separated from Zone B by a subtle 1px divider line in limestone (#E8E2D4) light / #3A3936 dark
- Location and notes fields on the left
- Source info (spine number, lookup source badge) bottom-left
- Action buttons bottom-right
- The divider creates a clear "metadata above, actions below" split

---

## 4. Micro-interactions

### Approve button
- Default: outlined, brass border, brass text
- Hover: brass background fills in, text goes dark
- Active/approved state: solid brass background, dark text, subtle scale(1.02) for 150ms then back to scale(1)
- On click: the entire card border transitions to a soft brass glow (box-shadow: 0 0 0 1px #C9A96E) over 200ms, then settles to a solid 1px brass border

### Reject button
- Default: outlined, muted border, muted text
- Hover: warm red background tint
- Active/rejected state: card dims to 60% opacity over 200ms
- On click: gentle fade to dimmed state, not a jarring snap

### Reread button
- On click: the spine thumbnail gets a subtle spinning refresh indicator overlay (brass colored, 1.5s rotation) until the new read completes
- When new data arrives: the card content cross-fades (150ms) from old to new values. Changed fields briefly highlight in brass background (500ms fade out)

### Tag removal
- Hover on tag: × appears with a slight expand animation (scale from 0.8 to 1 over 100ms)
- Click ×: tag shrinks to 0 width and 0 opacity over 150ms, then removes from DOM. Adjacent tags slide closed smoothly.

### Tag addition
- "+ add genre" click: pill expands into a text input inline (no modal, no dropdown initially). Start typing and matching tags appear as a filtered dropdown below.
- Selecting a tag: it pops into existence with a brief scale-up (0.9 to 1 over 100ms)

### Photo upload queue
- New photo added: slides in from the right (translateX animation, 200ms)
- Processing status change: status badge cross-fades between states

### Export CSV download
- Button click: brief brass pulse animation (opacity 1 → 0.7 → 1 over 300ms), then browser download triggers
- Success: green checkmark appears next to button text for 2 seconds

---

## 5. Upload screen — empty state

When the queue is empty, the page currently feels barren. Fix:

### Replace the empty void with a guided welcome

Below the dropzone, when no photos are queued, show a warm onboarding section:

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│         How it works                                   │
│                                                        │
│    1. Photograph    →    2. Review    →    3. Export    │
│    your shelves          the results       to           │
│                                            LibraryThing │
│                                                        │
│    ─────────────────────────────────────────            │
│                                                        │
│    Tips for best results                               │
│                                                        │
│    · Hold your device in landscape                     │
│    · Fill the frame with one shelf section              │
│    · Stand 2–3 feet away                               │
│    · Turn off flash                                    │
│    · Avoid overhead lighting on plastic covers          │
│                                                        │
│    Stats: 47 books cataloged · 3 batches exported      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

- "How it works" heading in Cormorant Garamond, 18px
- Three steps shown as a horizontal flow with subtle arrow connectors
- Tips section below, in muted text, no bullet points — use middots or small icons
- At the bottom: pull lifetime stats from the ledger — total books cataloged, total batches exported. This gives returning users a sense of progress.
- This entire section disappears once a photo is added to the queue. It's only for the empty state.

### Processing state improvements

When photos are processing:
- Show a progress summary above the queue: "Processing 3 photos · 28 spines found · 14 books identified so far"
- Each queue item should show a thin brass progress bar below the filename that fills as its sub-steps complete (detection → OCR → lookup → tags)
- When a photo completes, its progress bar flashes brass briefly then fades, and the status updates to "Done · 12 books"

---

## 6. Review screen stats bar

The stats tiles at the top are functional but bland. Polish:

- Give each tile a distinct left border accent:
  - Total: library green
  - Pending: brass
  - Approved: warm green (#2D7A4F)
  - Rejected: warm red (#A3432E)
  - Low confidence: mahogany (#8B4513)
- The number should be 28px, weight 600
- The label should be 11px, all-caps, letterspaced, weight 500
- Active filter should make its corresponding stat tile glow subtly (background shifts slightly toward its accent color)

---

## 7. Export screen polish

- The CSV preview table should have alternating row backgrounds (marble / limestone in light mode)
- Column headers should be sticky if the preview is long enough to scroll
- The "Vocabulary updates" section (if there are proposed tags to promote) should be visually separated with a brass top border, not just floating below the download button
- After a successful export, show a brief success state: the download button text changes to "Downloaded ✓" in green for 2 seconds before reverting

---

## 8. Dark mode refinements

- Card backgrounds: #2E2924 (warmer than current)
- Card borders: #4A4540 (warmer)
- Divider lines inside cards: #3E3A35
- Tag pills in dark mode: slightly increase background opacity so they pop more against the warm dark cards
- The brass accent (#C9A96E) should stay identical in both modes — gold reads well on both light and dark backgrounds
- Warning banners: use a deep amber tint (#3D2E1A) instead of a washed-out orange

---

## Implementation notes

- Use CSS transitions everywhere, not JavaScript animations. `transition: all 150ms ease-in-out` as a baseline, then override duration per element where needed.
- Use Tailwind's `transition`, `duration-150`, `ease-in-out` utilities where possible.
- For the card zone dividers, use a `<hr>` with custom styling or a `border-top` on Zone C — not a separate div.
- For the empty state stats, read from the export ledger (localStorage cache or GitHub fetch, wherever it currently lives).
- Test all animations at 2x speed to make sure nothing feels sluggish. If an animation takes more than 200ms to complete, shorten it.

---

## Files to change

- `components/BookCard.tsx` — zone layout, dividers, micro-interactions, typography levels
- `components/TagChip.tsx` — removal animation, hover effects
- `components/TagPicker.tsx` — inline expansion animation
- `components/PhotoUploader.tsx` — empty state content, processing progress bars
- `components/ProcessingQueue.tsx` — slide-in animation, progress bars
- `components/ConfidenceBadge.tsx` — ensure sizing matches new typography scale
- `components/BatchProgress.tsx` — brass progress bar styling
- `app/page.tsx` — empty state welcome section, stats from ledger
- `app/review/page.tsx` — stats bar accent borders, filter highlight behavior
- `app/export/page.tsx` — preview table styling, vocabulary section border, success state
- `app/globals.css` — spacing scale variables, transition defaults, dark mode color updates
- `tailwind.config.ts` — add spacing scale values if not already present, add animation utilities

## Files NOT to change

- Pipeline, API routes, lookup chain — untouched
- State management, ledger — untouched (read-only for empty state stats)
- Header/AppShell — already polished, leave it alone
