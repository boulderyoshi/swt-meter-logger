# Project State

## Canonical source

This repository is the source of truth for SWT Logger.

- Repository: `boulderyoshi/swt-meter-logger`
- Canonical branch: `main`
- Public app: https://boulderyoshi.github.io/swt-meter-logger/
- Current public version: **v1.0.5**

Do not treat chat transcripts, downloaded ZIP files, browser caches, or local copies as authoritative if they differ from `main`.

## Current status

The first formal public version is complete and deployed through GitHub Pages.

Core functions currently available:

- iPhone Safari camera input
- Numeric OCR
  - integer
  - configurable decimal digits
  - manual / automatic reading
  - change-triggered / timer-triggered automatic reading
- QR code reading
  - continuous scanning
  - duplicate prevention
  - difficult-code recovery using best-frame selection, local contrast enhancement, and fallback decoders
  - success sound and green flash
- Separate numeric / QR read-area profiles
- Saved settings using browser localStorage
- Automatic settings persistence with current-settings summary and reset-to-default control
- Test mode with no data persistence
- One-column CSV output
- Table-form CSV output
- Automatic row / column numbering
- Optional blank cell / next-row operation
- Shared CSV output engine for numeric OCR and QR
- Recent-record list
- Undo last operation
- iOS share sheet
- CSV file save
- PWA manifest and app icon
- Privacy documentation
- Safari cache-busting for local app assets

## Main files

- `index.html` — UI structure and external library loading
- `styles.css` — mobile UI, camera, menus, test mode, feedback
- `app.js` — camera, OCR, QR, output engine, settings, test mode, CSV
- `manifest.webmanifest` — installable web-app metadata
- `assets/` — app icon assets
- `vendor/` — vendored QR scanner runtime / license
- `README.md` — public overview and usage
- `CHANGELOG.md` — release history
- `PRIVACY.md` — privacy behavior

## Deployment

GitHub Pages deploys the `main` branch.

For user-facing JavaScript / CSS / worker changes, keep cache-busting asset versions in sync so Safari does not combine a new HTML file with stale static assets.

## Data behavior

- Camera frames are processed in the browser.
- The app does not upload camera / OCR / QR images to an application server.
- Saved settings are stored in browser localStorage.
- CSV data is exported only through user-initiated save / share actions.

## Known platform constraints

- Continuous monitoring is not guaranteed after Safari is backgrounded or the iPhone screen is locked.
- Recognition quality depends on focus, lighting, LCD contrast, and QR print quality.
- Some OCR / QR / WASM dependencies are loaded from external CDNs.
- CSV cannot preserve Excel-specific table styling, colors, or borders.
- Direct Google Sheets API output is not currently implemented.

## Development rule

For future work, inspect the current GitHub `main` branch first and make changes from that state. Update `CHANGELOG.md` and the visible version when creating a public release. GitHub remains canonical after this chat is closed.
