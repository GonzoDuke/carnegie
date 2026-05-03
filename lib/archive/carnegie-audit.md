# Carnegie — feature audit

Don't build anything. This is an audit. Go through each item below, check whether it exists and works, and report back with a status for each: WORKING, PARTIALLY WORKING (explain what's broken), NOT BUILT, or REMOVED (if it existed and was lost during a refactor). Test locally with `npm run dev` where needed.

---

## 1. "Add missing book" on Review screen

The user should be able to add a book that Pass A failed to detect. Two paths were spec'd:

**Path A:** A button on the Review screen that opens the source photo. The user draws a rectangle around a missed spine. The crop goes through Pass B → lookup → tag inference and appears as a new BookRecord.

**Path B:** A manual entry form — type title, author, optional ISBN. Runs lookup → tag inference without any photo processing.

**Check:** Does the "Add missing book" button exist on the Review screen? Do both paths work?

---

## 2. Bulk re-tag

A feature that re-runs tag inference on selected books using the current vocabulary. Used when new tags have been added to the vocabulary and the user wants to propagate them to previously cataloged books.

**Check:** Is there a bulk re-tag button or dropdown on the Review screen? Can you select multiple books and re-tag them? Does it preserve user-edited tags while adding new inferred ones?

---

## 3. OCLC Classify as a lookup tier

OCLC Classify (http://classify.oclc.org/classify2/Classify) was spec'd as a free, no-key LCC gap-filler. It should fire after all other lookup tiers when LCC is still missing.

**Check:** Is `lookupOclcClassify` or equivalent function in `lib/book-lookup.ts`? Is it being called in the lookup cascade? Does it actually return LCC data for books where other tiers missed?

---

## 4. Tag correction feedback loop

When the user removes a tag the system suggested or adds one it missed, that correction should be stored as a training example. The most recent corrections should be appended to the tag inference system prompt as additional few-shot examples, so the model learns from editorial judgment over time.

**Check:** Is there a corrections log being stored anywhere? Are corrections being fed back into the `/api/infer-tags` prompt? If not, report NOT BUILT.

---

## 5. Form tags in tag inference

The tag vocabulary includes form tags: First edition, Signed, Reference, Anthology, Penguin Classics, Portable Library, How-to/guide, Primary source. These should be inferred alongside genre tags during the tag inference step.

**Check:** Process a book that should get a form tag (e.g., a Penguin Classics edition, or a reference book like a dictionary). Does the tag inference return form tags? Are form tags visually distinct from genre tags on the BookCard (outlined style vs filled)?

---

## 6. ISBNdb fallback behavior

The user has a paid ISBNdb subscription with the key stored in `ISBNDB_API_KEY`. What happens when the key is missing, expired, or the subscription lapses?

**Check:** Remove `ISBNDB_API_KEY` from `.env.local`. Run a lookup. Confirm the app doesn't crash — it should skip the ISBNdb tier silently and log a console warning. Then restore the key.

---

## 7. Export ledger cross-device sync

The export ledger should sync across devices via GitHub. When books are exported on one device, they should appear in the ledger on another device. Duplicate detection should work cross-device.

**Check:** 
- Is the ledger being written to GitHub on export? Check for a file like `lib/export-ledger.json` or `data/export-ledger.json` in the repo.
- On app load, is the ledger being fetched from GitHub? 
- If you export a batch, then open the app in an incognito window (simulating a different device), does the ledger contain the exported books?
- If you then process a photo containing a book that was already exported, does it get flagged as a duplicate?

---

## Deliverable

For each of the 7 items, give me:
- **Status:** WORKING / PARTIALLY WORKING / NOT BUILT / REMOVED
- **Evidence:** What you checked and what you found (file names, function names, test results)
- **If not working:** What would need to be built or fixed, estimated effort (small/medium/large)
