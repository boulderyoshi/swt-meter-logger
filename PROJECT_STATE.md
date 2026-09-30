# Project State

## Canonical source

This repository is the source of truth for SWT Logger.

- Repository: `boulderyoshi/swt-meter-logger`
- Canonical branch: `main`
- Public app: https://boulderyoshi.github.io/swt-meter-logger/
- Current public version: **v1.0.6**
- UI redesign preview: https://boulderyoshi.github.io/swt-meter-logger/ui-next/
- UI redesign preview version: **0.1.3**

Do not treat chat transcripts, downloaded ZIP files, browser caches, or local copies as authoritative if they differ from `main`.

## Current status

The first formal public version is complete and deployed through GitHub Pages.

The camera-first UI redesign is being developed separately under `/ui-next/`. The root public app remains the approved v1.0.6 UI until explicit approval to replace it.

The first `ui-next` implementation keeps the existing v1.0.6 reading logic and adds a separate presentation shell:

- full-screen camera-first layout
- floating OCR / QR mode switch
- four-corner ROI treatment
- floating recognition-result display
- compact / mid / full bottom-sheet states
- swipe / tap bottom-sheet expansion
- history, clear, undo, share, save, and preview moved into the bottom sheet
- settings moved into a separate overlay panel
- test mode and diagnostics moved under advanced settings
- iPhone safe-area-aware layout
- camera-visible ROI adjustment tray opened from settings; the full settings overlay closes while adjusting
- live ROI sliders auto-save while the camera and yellow frame remain visible
- default OCR ROI: x 50%, y 30%, width 70%, height 25%
- default QR ROI: x 50%, y 27%, width 60%, height 35%
- `ui-next/app.js` is a snapshot of the v1.0.6 runtime with only preview-isolation changes; OCR / QR / monitoring / CSV behavior is intentionally preserved
- preview settings use a separate localStorage key, so changing `/ui-next/` settings does not alter the root public app
- ui-next does not force AF / AE / white-balance modes through `applyConstraints`; Safari camera defaults are preserved to avoid capture interruption and recognition instability

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
- Shared output engine for numeric OCR and QR
- Recent-record list
- Undo last operation
- Confirmed clear-all reset for recorded readings
- iOS share sheet
- CSV file save
- PWA manifest and app icon
- Privacy documentation
- Safari cache-busting for local app assets

## Main files

- `index.html` — current public UI structure and external library loading
- `styles.css` — current public mobile UI
- `app.js` — current public camera, OCR, QR, output engine, settings, test mode, CSV logic
- `ui-next/index.html` — isolated camera-first UI preview
- `ui-next/app.js` — isolated snapshot of the v1.0.6 runtime for the preview
- `ui-next/styles.css` — UI redesign presentation layer
- `ui-next/ui-shell.js` — redesign-only mode switching, settings overlay, result pulse, and bottom-sheet interaction
- `manifest.webmanifest` — installable web-app metadata
- `assets/` — app icon assets
- `vendor/` — vendored QR scanner runtime / license
- `README.md` — public overview and usage
- `CHANGELOG.md` — public release history
- `PRIVACY.md` — privacy behavior

## Deployment

GitHub Pages deploys the `main` branch.

The root URL and `/ui-next/` are intentionally separate. UI redesign work must remain isolated under `/ui-next/` until the user explicitly approves replacing the root UI.

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
