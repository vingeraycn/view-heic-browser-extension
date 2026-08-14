# View HEIC Popup Design QA

## Review Scope

- Reference: the directional concept approved during the product-design session (local review asset, not committed)
- Reference dimensions: 1221 × 1288 pixels
- Implementation entry point: run `pnpm preview:ui`, then open `/popup.html?state=idle`
- Chinese implementation entry point: run `pnpm preview:ui`, then open `/popup.html?state=idle&lang=zh`
- Final full-view comparison: `view-heic-popup-comparison-v2.png` (local review asset)
- Chinese browser capture: `view-heic-popup-final-zh.png` (local review asset)

The reference is a directional concept rather than an annotated pixel specification. The comparison places both the reference and implementation inside a 360 × 392 CSS-pixel frame to evaluate hierarchy, density, spacing, and visual language. The browser connection scaled the Chrome captures to 1388 × 731 for the comparison and 1388 × 777 for the Chinese page. Because that connection does not expose a stable `deviceScaleFactor`, size conclusions use CSS-pixel measurements from the browser DOM rather than inferring DPR from exported images.

## Dimensions and Hierarchy

Final DOM measurements in Chrome:

| Area | Position and dimensions |
| --- | --- |
| Popup | 360 × 392 |
| Outer padding | 24 |
| Header | 312 × 56 |
| Primary status | 312 × 32, 24 below the header |
| Action list | 312 × 168, with three 56-pixel rows |
| Privacy note | 312 × 24 |
| Help button | 44 × 44 |
| Switch | 42 × 26 |
| Primary title | 22 / 28, weight 600 |
| Row label | 15 / 20, weight 500 |
| Row status | 14 / 20, weight 400 |

The page has no horizontal or vertical overflow. English and Chinese copy for idle, disabled, and error states preserves the hierarchy and row heights.

## Full-View and Detail Comparison

The final comparison contains both the reference and implementation in one full view rather than relying on separate screenshots. The implementation preserves the five-level hierarchy from the reference: brand, operating status, current page, per-site control, and manual conversion. Privacy information remains at the lowest visible level.

No separate detail capture is required. Titles, labels, icons, dividers, switches, and privacy copy remain legible inside the complete 360 × 392 frame, and the critical dimensions were also verified through DOM measurement.

## Iteration Record

1. The first comparison found that the manual-conversion icon did not match the semantics of the broader icon system.
2. The icon was replaced with a Phosphor Regular icon, and the conversion entry point was fixed to the third row so it would not compete with automatic conversion.
3. The second comparison found no P0, P1, or P2 visual differences. The remaining minor differences reflect the production implementation: the real application icon, actual system-font rendering, and shorter privacy copy.
4. Final review added accessibility changes that do not alter the visual design: the help button has a stable accessible name, the site switch remains disabled until state resolution completes, and keyboard focus moves to the result when conversion finishes.

## Interaction and State Verification

- Popup: idle, converting, complete, partial error, disabled, and disconnected/refresh states.
- Per-site switch: disabling shows "Disabled on this site / Not checked"; re-enabling returns to "Working automatically / No HEIC found."
- Error entry point: partial success shows "Displayed 1 of 2," and the current-page row opens troubleshooting.
- Manual conversion: the real `heic-still.heic` fixture produces a JPEG file name, preview, and download action.
- Converter: file selection was verified in a real browser. Drag-and-drop, reselection, invalid format, oversized file, and in-progress states were checked through interaction logic and production builds.
- Accessibility: 44-pixel help target, semantic switch, continuous keyboard focus, status live region, error alert, and reduced-motion support.
- Privacy: file conversion remains on-device; inspection found no file contents, file names, or page URLs sent to the analytics endpoint.
- Console: the real-file conversion path produced no console errors, and the inspected popup state snapshots showed no visible runtime errors.

## Engineering Verification

- TypeScript type checking passed.
- Six test files and 78 unit tests passed at the time of this review.
- Chrome MV3 and Firefox MV2 production builds passed.
- Dedicated checks passed for HEIF detection, upload conversion, review prompts, analytics events, performance defaults, and `src` changes.
- `git diff --check` passed.

## Known Non-Blocking Items

- Chrome's internal extension-management page does not permit the current browser connection to operate it, so the local unpacked package was not installed automatically. The popup, converter, and manifest from the production build were inspected, and browser review used the same `.output/chrome-mv3` artifact.
- A future CI workflow could load the unpacked MV3 package for end-to-end testing and add decode-pixel, frame-count, and memory budgets for extreme HEIC files. Neither item blocks this interface or primary-flow delivery.

Final result: passed.
