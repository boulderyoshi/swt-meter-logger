# Changelog

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
