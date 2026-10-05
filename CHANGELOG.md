# Changelog

## v1.0.9 — 2026-10-05

- Changed camera connection UI to use the actual video track state instead of only checking whether a MediaStream object exists.
- Added track `ended`, `mute`, `unmute`, and stream `inactive` handling so stale camera sessions no longer appear connected.
- After `全削除`, the camera state is rechecked; if Safari dropped the camera during confirmation, the UI returns to the disconnected state.
- Added `touch-action: manipulation` to suppress Safari double-tap zoom during rapid control taps while preserving normal scrolling and pinch zoom.
- Applied the same camera-state and rapid-tap behavior to `/ui-next/`.

## v1.0.8 — 2026-10-05

- Fixed change-triggered automatic reading becoming too insensitive after the v1.0.7 vibration filter.
- Removed the overly strict frame-to-frame stability gate that could continuously reset valid changes.
- A change now triggers after it remains different from the baseline for about 0.3 seconds.
- Kept small positional-shift tolerance and consecutive duplicate-value suppression to prevent vibration spam.
- Reduced the post-read cooldown from 1 second to 0.6 seconds.

## v1.0.7 — 2026-10-05

- Removed test mode from both the public UI and `/ui-next/`.
- Added shift-tolerant frame comparison so small camera/display vibration is not treated as a content change.
- Increased change confirmation from roughly 240 ms to about 640 ms of stable frames.
- Added a 1-second change-detection cooldown after an accepted change.
- Suppressed consecutive duplicate numeric records in change-triggered automatic mode.

## v1.0.6 — 2026-09-30

- Added a `全削除` action for recorded readings.
- Clearing records requires confirmation, stops active reading, resets row/column position, QR duplicate state, preview, and export state while preserving app settings.

## v1.0.5 — 2026-09-30

- Corrected `1列` mode to store each reading in the next row of a single column.
- Changed the preview from horizontal cells to a vertical single-column list.
- Changed CSV output for this mode from comma-separated horizontal values to one value per line.
- Updated row/column position display and recent-record coordinates accordingly.

## v1.0.4 — 2026-09-30

- Renamed the single-output-mode UI label from `1行` to `1列`.

## v1.0.3 — 2026-09-30

- Moved expanded settings panels above the camera preview.
- Replaced manual settings-save buttons with automatic persistence.
- Added a compact current-settings summary and a confirmed reset-to-default action.
- Increased UI text sizes while preserving the mobile layout.
- Added a subtle background to the operation/control area to distinguish it from settings.
- Kept routine setting changes silent; no save-complete message is shown.

## v1.0.2 — 2026-09-29

- Replaced the malformed touch/PWA icon assets with the approved cropped artwork.
- Regenerated 180px, 192px, 512px, and 1024px icon sizes from the corrected source.
- Bumped icon/cache URLs to force Safari to fetch the corrected icon.

## v1.0.1 — 2026-09-29

- Replaced the official app icon with the user-trimmed artwork.
- Refreshed iPhone touch icon and PWA icon assets.
- Bumped icon/cache asset URLs so Safari does not reuse the previous icon.

## v1.0.0 — 2026-09-29

First formal public release.

### Reading

- Numeric OCR for integer and configurable decimal values
- QR-code scanning with duplicate prevention
- Manual and automatic reading
- Change-triggered and timer-triggered automatic reading
- Separate saved read-area profiles for numeric OCR and QR
- Difficult-QR recovery using best-frame selection, local contrast enhancement, and fallback decoders

### Output

- One-line CSV
- Table-form CSV
- Automatic row/column numbering
- Optional blank cells and manual next-row operation
- Shared output engine for numeric OCR and QR
- iOS share sheet and file save

### Operation

- Saved settings
- Test mode with no data persistence
- Recent-record list
- Undo last operation
- QR success sound and green flash
- Cache-busting asset versions for reliable Safari updates

### Distribution

- GitHub Pages public release
- Web app manifest
- Official app icon
- Privacy documentation
