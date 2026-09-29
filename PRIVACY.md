# Privacy

Last updated: 2026-09-29

SWT Logger is a static web application intended to read numeric displays and QR codes with the device camera and export the results as CSV.

## Camera and scanned data

- Camera images are processed in the browser.
- SWT Logger does not provide an application server that receives or stores camera frames, OCR images, QR images, or scanned values.
- Scanned data remains in the browser until the user explicitly exports or shares a CSV file.

## Local settings

Application settings are stored in the browser using localStorage.

Examples include:

- read target
- read area
- read method
- output format

These settings remain on the device/browser unless the user clears browser data.

## Network access

The application is hosted on GitHub Pages.

Some OCR/QR libraries, language data, or WebAssembly components may be loaded from external CDN services. Camera frames and scanned values are not intentionally sent to those CDN services by SWT Logger.

## Export and sharing

CSV files are created in the browser.

When the user selects Share or Save, the file is handed to the browser/operating-system feature selected by the user. Any subsequent handling is governed by the destination application or service.

## Analytics

SWT Logger currently does not include application analytics or advertising trackers.

## Contact

For issues relating to this project, use the GitHub repository:

https://github.com/boulderyoshi/swt-meter-logger
