# Carnegie — About page

## Placement

**Desktop/tablet:** Add an "About" nav item at the bottom of the sidebar, below the Library section, above the stats footer. Use an info-circle icon. No section header — it stands alone.

**Phone:** Add a small "About" link in the compact header bar, right side, as a text link or small icon. Not in the bottom tab bar — it's not a primary workflow screen.

## Page layout

Simple editorial page. No cards, no tables, no interactive elements. Just text on a clean background.

- Max-width: 640px, centered within the content area
- Generous vertical padding: 48px top
- At the very top of the page, a horizontal bar of the CSS tartan pattern — same pattern used in the sidebar brand panel — 80px tall, full content width, border-radius 8px. The tartan anchors the page visually.
- All text below the tartan bar.

## Typography

- Page title: Outfit, 28px, weight 700
- Section labels: Outfit, 11px, weight 600, uppercase, letterspaced 1px, color var(--text-3), margin-top 32px
- Body text: Outfit, 15px, weight 400, line-height 1.7, color var(--text-2)
- Emphasis within body: weight 500, color var(--text-1) — not bold, just slightly heavier
- The Carnegie name wherever it appears in body text: weight 600
- Links: navy accent color, underlined on hover

## Copy

Use this text exactly:

---

**[Page title]**
About Carnegie

**[Section label]**
WHAT THIS IS

**[Body]**
Carnegie is a personal cataloging system that photographs bookshelves and turns spines into library records. You take a picture, the app reads the spines, looks up each book across six bibliographic databases, infers subject tags from classification data, and exports everything as a clean CSV for LibraryThing.

It was built to solve a specific problem: hundreds of books in boxes with no catalog connecting them. Typing each one into LibraryThing by hand wasn't going to happen. So this happened instead.

**[Section label]**
WHY THE NAME

**[Body]**
Andrew Carnegie funded 2,509 free public libraries between 1883 and 1929. More than any individual in history. He believed that access to books was the foundation of a self-educated life. His father was a handloom weaver in Dunfermline, Scotland, and the tartan pattern in this app is the Carnegie clan tartan.

**[Section label]**
HOW IT WORKS

**[Body]**
The pipeline has five stages:

Detection — Claude identifies individual book spines in a shelf photo and draws bounding boxes around each one.

Reading — each spine is cropped and sent to Claude Opus, which reads the title, author, and any other visible text at full resolution.

Lookup — the extracted text is searched across Open Library, the Library of Congress, ISBNdb, Google Books, Wikidata, and OCLC Classify to fill in ISBN, publisher, publication year, and LCC classification.

Tagging — Claude infers genre and form tags from a controlled vocabulary based on the book's classification, subject headings, and author profile.

Review — every result is presented for human approval. Nothing exports without a person confirming it.

**[Section label]**
BUILT WITH

**[Body]**
Claude by Anthropic (spine reading, tag inference) · Next.js · Vercel · Open Library · Library of Congress SRU · ISBNdb · Google Books · Wikidata · OCLC Classify · LibraryThing

**[Section label]**
BUILT BY

**[Body]**
A librarian with too many books and not enough shelves.

---

## Styling details

- The five pipeline stages in the "How it works" section should be styled as a subtle list — each stage name in weight 600 followed by an em dash and the description in weight 400. No bullet points, no numbers. Just the stage name standing out slightly from the description text through font weight.
- The "Built with" section is a single line of tools separated by middots (·). All in body text weight, no special styling.
- The "Built by" line should have a touch more space above it — 8px extra margin. It's the closing statement.
- No footer, no links, no social media, no version number. The page ends after "Built by."

## Dark mode

- Tartan bar at the top stays the same (it's already on a dark base)
- Text colors follow the standard dark mode variables
- Background follows the standard page background dark mode variable

## Files to change

- Sidebar component — add "About" nav item
- Phone header component — add "About" link
- New file: `app/about/page.tsx`
- No API routes, no state changes, no logic — this is a static page
