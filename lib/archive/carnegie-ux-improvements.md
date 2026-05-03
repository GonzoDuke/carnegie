# Carnegie — UX improvements

14 small improvements across the app. Each one is independent — commit after each, test between each. No new features, no structural changes. Just polish.

---

## Upload screen

**1. Processing time estimate.** After the user taps "Process all," show an estimated time below the button based on the number of photos in the queue. Use ~45 seconds per photo as the baseline. "Estimated time: ~2 minutes for 3 photos." Update it as photos complete.

**2. Batch label memory.** The batch label input should show a dropdown of previously used batch labels when focused — pulled from the export ledger. The user can select a past label or type a new one. No autocomplete on the notes field, just the label.

---

## Processing flow

**3. Error summary after processing.** When all photos in a batch finish processing, show a brief toast or inline summary: "14 books identified · 2 spines unreadable — see Review for details." Don't just silently finish. The summary stays visible for 5 seconds or until dismissed.

**4. Notification when processing finishes.** If the user has switched browser tabs or the app is in the background, fire a browser notification: "Carnegie: Processing complete — 14 books ready for review." Use the Notification API — request permission on first use. Also play a subtle chime sound (short, not annoying — find a royalty-free one or generate a simple tone). On phone, trigger a vibration pulse alongside the notification.

---

## Review screen

**5. "Approve all and export" shortcut.** Add a button at the bottom of the Review screen (next to "Approve remaining"): "Approve all & export." Clicking it approves every pending book, navigates to the Export screen, and auto-triggers the CSV download. One click instead of three steps. Show a confirmation first: "Approve all 14 books and download CSV?" This is for batches where everything looks good and the user just wants to ship it.

**6. Tag picker — frequently used tags first.** When the user clicks "+ add tag," the tag picker dropdown should show the 10 most frequently used tags at the top in a "Frequently used" section, before the alphabetical domain-grouped list. Frequency is calculated from the export ledger — tags that appear on the most books rank highest. If the ledger is empty, skip the section and show the full list.

**7. Sortable review table.** The column headers in the review table (Book, Confidence, Tags) should be clickable to sort. Clicking "Book" sorts alphabetically by title. Clicking "Confidence" sorts HIGH first, then MED, then LOW (or reverse on second click). Clicking "Tags" sorts by number of tags. Show a small arrow indicator on the active sort column. Default sort remains position order (order spines were read).

---

## Export screen

**8. LibraryThing import link.** After the CSV downloads, show a link below the download button: "Upload this file to LibraryThing → librarything.com/import" — opens in a new tab. Small, muted, helpful. Always visible on the export screen, not just after download.

---

## Vocabulary screen

**9. Tag search.** Add a search input at the top of the tag list (right column). Typing filters the visible tags across all domains in real time. Searching "exist" shows "Existentialism." Clearing the search restores the full list. The domain filter in the left column works independently — if a domain is selected and search is active, both filters apply.

**10. Tag rename.** Add a rename action to each tag row — a small pencil icon or "Rename" button. Clicking it turns the tag name into an editable text input. On save, update the tag name in `tag-vocabulary.json` AND update every BookRecord in the ledger that uses the old tag name to use the new one. Commit both the vocabulary file and the ledger to GitHub in one operation. Show confirmation: "Rename 'Behavioral psychology' to 'Behavioral psych'? This will update 8 books."

---

## Phone experience

**11. Haptic feedback on barcode scan.** When the barcode scanner locks onto an ISBN and pauses, trigger a short vibration: `navigator.vibrate(100)`. This gives tactile confirmation that the scan registered — standard for scanner apps. Only fire once per scan, not continuously.

**12. Touch target sizes.** Audit the bottom tab bar — each tab must be at least 44px tall with the tap target extending to the full width of its section. If the labels are making the buttons too narrow, consider using icons only on the tab bar (no labels) when the screen is under 360px wide.

---

## General

**13. Undo toast for destructive actions.** When the user deletes a batch, clears a session, or rejects a book, show a toast notification at the bottom of the screen: "[Action] completed. Undo?" with a 5-second countdown. Clicking "Undo" reverses the action. After 5 seconds the toast disappears and the action is permanent. This applies to: batch deletion, session clear, book rejection. It does NOT apply to approvals (those are easy to undo by clicking the button again).

**14. Loading states on sidebar stats.** The sidebar footer ("73 books cataloged · 5 batches exported") currently flashes "0 books cataloged" before the ledger loads from GitHub. Replace the numbers with a subtle shimmer/skeleton placeholder until the ledger data arrives. Once loaded, the real numbers fade in.

---

## Implementation order

Go in the order listed — 1 through 14. Each one is a small, isolated change. Commit after each. Don't bundle.
