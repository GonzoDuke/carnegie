# Carnegie — tablet camera capture

## Summary

Add a "Take photos" button to the Upload screen that opens the device camera. The user takes multiple photos in sequence — each one lands in the upload queue. When done, they close the camera and process the batch exactly like desktop uploads. This feature requires the PWA (Feature 6) to be implemented first.

## User flow

1. User opens Carnegie on their tablet (as installed PWA or in browser)
2. On the Upload screen, next to "Choose photos" there's a "Take photos" button with a camera icon
3. User taps "Take photos"
4. Device rear camera opens
5. User takes a photo
6. Photo immediately appears in the upload queue (thumbnail, filename auto-generated as `shelf-capture-001.jpg`, file size shown)
7. Camera automatically reopens for the next shot — no manual tap needed to reopen
8. User takes as many photos as needed, each one queuing up
9. User taps "Done" to exit the camera loop
10. User is back on the Upload screen with all captured photos in the queue
11. From here, everything is identical to desktop: label the batch, add notes, hit "Process all"

## Implementation

### Camera button

In `components/PhotoUploader.tsx`:

- Add a "Take photos" button next to the existing "Choose photos" button
- Only show this button on devices with a camera (detect via `navigator.mediaDevices` or simply show on all devices — desktop users without cameras will just get a file picker, which is fine)
- Style: same as "Choose photos" but with a camera icon (use a simple SVG camera icon, not emoji)

### Multi-capture loop

The standard `<input type="file" capture="environment">` closes after one photo. To enable multi-capture:

```typescript
const cameraInputRef = useRef<HTMLInputElement>(null);
const [isCapturing, setIsCapturing] = useState(false);

function startCapture() {
  setIsCapturing(true);
  openCamera();
}

function openCamera() {
  if (cameraInputRef.current) {
    cameraInputRef.current.value = '';  // reset so same-file works
    cameraInputRef.current.click();
  }
}

function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (file) {
    // Add to queue with auto-generated name
    const captureCount = /* increment counter */;
    const renamedFile = new File([file], `shelf-capture-${String(captureCount).padStart(3, '0')}.jpg`, { type: file.type });
    addToQueue(renamedFile);
    
    // Auto-reopen camera for next shot
    if (isCapturing) {
      setTimeout(() => openCamera(), 300);  // small delay so user sees the queue update
    }
  } else {
    // User cancelled the camera — they're done
    setIsCapturing(false);
  }
}

function stopCapture() {
  setIsCapturing(false);
}
```

The hidden input element:
```html
<input
  ref={cameraInputRef}
  type="file"
  accept="image/*"
  capture="environment"
  onChange={handleCapture}
  style={{ display: 'none' }}
/>
```

### "Done" button

When `isCapturing` is true, show a floating "Done taking photos" button at the bottom of the screen. Tapping it sets `isCapturing` to false and stops the camera loop. Also, if the user cancels the camera natively (back button, swipe away), the `handleCapture` function receives no file — this also exits the loop.

### Visual feedback during capture

While capturing:
- The upload queue should be visible behind/below the camera
- Each new photo slides into the queue with a brief animation
- Show a capture counter: "3 photos taken" updating in real time
- The batch label and notes fields remain accessible — user can set these before, during, or after capturing

### Auto-generated filenames

Camera captures don't have meaningful filenames. Auto-name them:
- Pattern: `shelf-capture-001.jpg`, `shelf-capture-002.jpg`, etc.
- Counter resets per session, not per batch
- If the user also uploads files from gallery in the same batch, those keep their original filenames

### Photo quality

- Do NOT resize or compress camera captures before adding to queue. The device camera produces full-resolution images — we want those pixels for spine reading.
- The existing client-side downscale for Pass A (1800px long edge) happens later in the pipeline, not at capture time.
- HEIC files from iOS cameras should be accepted — the pipeline already handles these.

### Landscape reminder

When the user taps "Take photos", show a brief toast notification (2 seconds, then auto-dismiss):
"Hold your tablet in landscape for best results"

Don't block or enforce — just remind. Portrait photos will still process, just with lower accuracy on edge spines.

## PWA prerequisite

This feature works in a regular browser tab, but the experience is much better as an installed PWA:
- No address bar taking up space
- No accidental "back" navigation closing the app
- Camera permissions persist without re-prompting

Implement Feature 6 (PWA) before this feature. If Feature 6 isn't done yet, do it first, then come back to this.

## Files to change

- `components/PhotoUploader.tsx` — add camera button, multi-capture loop, "Done" button, landscape toast
- `app/globals.css` — toast animation if not already available
- No new API routes needed — camera photos enter the same pipeline as uploaded photos
- No changes to pipeline, review, or export

## Files NOT to change

- Pipeline, lookup, tag inference — completely untouched
- Review and Export screens — completely untouched
- Desktop upload flow — completely untouched, camera button is additive

## Test

1. Open Carnegie on a tablet (or phone)
2. Tap "Take photos"
3. Confirm rear camera opens
4. Take a photo — confirm it appears in the queue
5. Confirm camera reopens automatically
6. Take 3 more photos — confirm all 4 are in the queue with sequential filenames
7. Tap "Done" — confirm camera stops and you're back on Upload screen
8. Set a batch label, tap "Process all"
9. Confirm all 4 photos process normally through the pipeline
10. Confirm results appear on Review screen, identical to desktop-uploaded photos
11. Test: cancel the camera (back button) instead of tapping Done — confirm it exits cleanly
12. Test: take a photo in portrait orientation — confirm it still processes (may be lower accuracy, but shouldn't crash)
