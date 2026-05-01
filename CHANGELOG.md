# Carnegie — Changelog

A consolidated log of significant changes, organized by archived spec document.
Source documents live in [lib/archive/](lib/archive/). Newest first.

---

## 2026-05-01 — Tablet camera capture (multi-capture loop)

Source: [lib/archive/carnegie-tablet-camera.md](lib/archive/carnegie-tablet-camera.md)
Shipped: `649f2a8` — Tablet camera: multi-capture loop with auto-rename and floating Done bar
Follow-up: `5ee3e22` — Camera: switch to in-app getUserMedia stream to fix Samsung Chrome

- Added a "Take photos" button to the Upload screen that opens the device rear camera.
- Each shot lands in the upload queue as `shelf-capture-NNN.jpg` (sequential auto-rename).
- Camera reopens automatically after each capture; "Done taking photos" floating bar exits the loop.
- Landscape-orientation reminder toast (2s) on first tap.
- The original `<input capture="environment">` approach was later replaced by an in-app `getUserMedia`-driven fullscreen video + canvas shutter to fix a Samsung Chrome regression that flashed the OS file picker.

---

## 2026-05-01 — Lookup chain: ISBNdb (tier 3) and Wikidata (tier 5)

Source: [lib/archive/carnegie-isbndb-wikidata.md](lib/archive/carnegie-isbndb-wikidata.md)
Shipped: `3628424` — Lookup chain: add ISBNdb (tier 3) and Wikidata (tier 5)

- Updated cascade: Open Library → LoC SRU → **ISBNdb** → Google Books → **Wikidata** → OCLC Classify.
- ISBNdb (paid, `ISBNDB_API_KEY`): broadest single book DB. Search by title+author or direct `/book/{isbn13}`. 1 req/sec rate limit. Skipped silently when key absent.
- Wikidata (free, no key): SPARQL endpoint, primarily an LCC gap-filler before OCLC Classify. Pulls LCC, DDC, ISBN, publisher, publication date.
- Neither tier overwrites values from higher-priority tiers — they only fill gaps.
- BookCard: dark-blue "ISBNdb" badge; "from Wikidata" badge slots into the LCC provenance hierarchy (spine > LoC > Wikidata > OCLC > OL).

---

## 2026-04-30 — Carnegie brand and UI update

Source: [lib/archive/carnegie-brand-update.md](lib/archive/carnegie-brand-update.md)
Shipped: `18f7358` — Carnegie rebrand — library palette, Cormorant wordmark, tighter UI
Follow-ups: `b503b5d`, `11ab3db`, `74c564d`, `9a97fca`, `2676212`, `6fe2354`, `d9a3c56`

- Replaced the Princeton-orange (`#C85A12`) accent system with a library palette: green `#1E3A2F`, brass `#C9A96E`, fern `#2D5A4A`, marble `#F5F2EB`, limestone `#E8E2D4`, mahogany `#8B4513`.
- Header switched to Cormorant Garamond wordmark; library green background with brass active-nav pills; dropped the icon/logo.
- Upload screen: hero line above dropzone; photography hints moved inside the dropzone; batch label/notes moved above the dropzone.
- Review screen: brass-toned stat tiles, mahogany for low-confidence/warning states; floating "Approve remaining" recolored to brass on green.
- Dark mode: green lifted to fern for contrast; limestone text; warm dark surfaces preserved.
- Tag domain colors and the three-screen flow were left untouched — purely a visual pass.

---

## 2026-04-30 — v1.1 feature plan (six features)

Source: [lib/archive/v1.1-feature-plan.md](lib/archive/v1.1-feature-plan.md)
Shipped across `e1c53d9`, `2a5a79d`, `25e0c72`, `b62bc7f`, `9cc50b8`

1. **Add missing book on Review** — draw on the source photo or enter manually; runs through the lookup → tag-inference pipeline.
2. **OCLC Classify as t5** — free LCC/DDC gap-filler when prior tiers miss. Provenance badge "from OCLC". (Subsequently became part of the broader cascade alongside ISBNdb and Wikidata.)
3. **Approved-tag feedback loop** — at export time, `[Proposed]` tags on approved books promote into the vocabulary; the user downloads an updated `tag-vocabulary.json` and a `vocabulary-changelog-additions-*.md` to commit.
4. **Bulk re-tag** — re-run inference on selected/approved/by-domain books without touching other metadata; preserves user-added tags via merge logic. BookCard checkboxes added for selection.
5. **Per-spine model selector** — Sonnet for easy spines (large area, low aspect ratio), Opus for hard ones; auto-retry with Opus when Sonnet returns LOW confidence.
6. **PWA / Add to Home Screen** — `manifest.json`, 192/512 icons, minimal `sw.js`, mobile camera input. Installable from a phone or tablet home screen, launches in standalone mode.

---

## 2026-04-29 — Initial vocabulary baseline

Source: [lib/vocabulary-changelog.md](lib/vocabulary-changelog.md)

- 12 domains, 60 genre tags, 8 form tags built from a 186-book LibraryThing export, a 22-book proof of concept, and a 16-book shelf scan.
- Subsequent vocabulary additions are tracked in [lib/vocabulary-changelog.md](lib/vocabulary-changelog.md), not here.

---

## How this file is maintained

This `CHANGELOG.md` is hand-curated from session-spec documents in [lib/archive/](lib/archive/) and the git history. When a new spec ships, append a section at the top with: source file link, ship commit(s), and a bulleted summary. Vocabulary additions stay in [lib/vocabulary-changelog.md](lib/vocabulary-changelog.md) — they're append-only and don't need to be duplicated here.
