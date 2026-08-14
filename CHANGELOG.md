# 📋 Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [1.4.0] - 2026-08-14 📊 Explainable Product Analytics

### ✨ Added

- Added one daily `extension_active` event so the primary activity metric represents installations that performed real extension work.
- Connected the popup, per-site preference, local file converter, page images, file picker, drag-and-drop, paste, and review prompt to one typed event contract.
- Added a "Share basic usage data" switch to the popup; disabling it stops reporting immediately and deletes the local analytics identifier.
- Added a first-party edge proxy that validates origins, event names, parameters, values, and request size before forwarding events to GA4.

### 🔧 Changed

- Each conversion workflow now sends one aggregate result, preventing DOM retries and repeated failures from inflating event volume.
- Every event now carries extension version, analytics schema version, and session identifiers for attribution by version, surface, and outcome.
- Collection is limited to coarse enums and counts. It excludes image contents, URLs, hostnames, file names, page contents, browsing history, and form data.

### 🔒 Security and Privacy

- Removed the GA4 Measurement Protocol API secret from client code and the extension build environment.
- Added an English privacy policy and analytics specification covering pseudonymous identifiers, data processors, collection exclusions, and user controls.

## [1.3.0] - 2026-08-01 🧭 Popup, Manual Conversion, and Gemini Compatibility

### ✨ Added

- Added a popup that clearly presents detection, conversion, partial-success, and failure states for the current page.
- Added per-site automatic conversion controls and a local HEIC / HEIF file converter with preview and download actions.
- Improved Gemini file-picker and paste uploads while preserving existing picker, paste, and drag-and-drop behavior on ChatGPT.

### 🔧 Changed

- First installation now opens English onboarding by default, while popup help and FAQ links follow the interface language.
- Partial success now displays the number of converted images with a restrained theme-blue status treatment.
- The website demo now settles into a stable failure state instead of repeatedly refreshing through polling.

### 🐛 Fixed

- Limited retries for transient conversion failures and prevented deterministic errors from retrying without purpose.
- Prevented DOM changes from repeatedly restarting failed conversions for the same image, including MIME-only paths.
- Fixed loading states that did not end after failure, cancellation, or image-source changes, and stopped stale tasks from being counted as real failures.
- Fixed upload loading and error toasts appearing at the same time.

## [1.2.0] - 2026-07-12 📋 Paste Conversion and Brand Refresh

### ✨ Added

- Added direct HEIC / HEIF paste support that converts images to JPEG locally before delivering them to the page.
- Added paste conversion compatibility for standard inputs, rich-text editors, and custom upload targets.

### 🔧 Changed

- Preserved text, HTML, and ordinary files from the same paste operation, even when one image fails to convert.
- Updated the extension icon, website logo, upload-prompt logo, and store promotional assets.
- Consolidated brand and store asset sources so future generated extension and promotional assets remain consistent.

## [1.0.15] - 2026-07-04 📈 Review Funnel Analytics

### ✨ Added

- Added anonymous GA4 Measurement Protocol events for HEIC detection, conversion success and failure, review-prompt views, review actions, dismissals, and feedback actions.
- Added release environment examples controlled by `WXT_ENABLE_EXTENSION_ANALYTICS`.
- Added an analytics-contract verification script to prevent event parameters from including image URLs, page URLs, or file names.

### 🔧 Changed

- Preserved the existing review-prompt flow while adding cumulative success and failure state.
- Included MIME-only HEIF fallback paths in conversion statistics and review-prompt counts.
- Centralized analytics requests in the background worker and added event-name, parameter-type, and parameter allowlists.
- Review, feedback, and dismissal actions no longer wait for analytics requests, so network activity cannot delay prompt closure.
- Updated the README and website privacy copy to clarify that images remain local and that image contents, image URLs, page URLs, file names, browsing history, and converted images are not uploaded.

## [1.0.12] - 2026-06-24 ⭐ Review Prompt Experience

### ✨ Added

- Added a store review entry point after more than ten successful image conversions.
- Added localized review-prompt copy that includes the actual successful conversion count.
- Added eased enter and exit animations for the prompt.

### 🔧 Changed

- Recorded local state after the review action to prevent repeated interruptions.
- Disabled the Chrome Web Store review entry point in Firefox builds.
- Opened review links synchronously from the click path to reduce browser blocking.

## [1.0.11] - 2026-06-15 ⚡ Performance and Stability

### 🔧 Changed

- Switched the default HEIC preview output to JPEG to reduce large-image output size and browser rendering cost.
- Added stage-level conversion timing logs for performance diagnosis.
- Defaulted HEIC sequences to first-frame previews to avoid expensive multi-frame decoding.

### 🐛 Fixed

- Prevented an old conversion result from overwriting a newer image when a page reuses an `<img>` element and changes its `src`.
- Fixed reprocessing of HEIC URLs with query parameters through the `src` mutation path.
- Fixed mutation batches where only the first of several changed HEIC images was reset.
- Stopped reset logic from removing page-owned styles, titles, and click handlers.
- Fixed TypeScript 6 compatibility for animated-frame `ImageData` construction.

## [1.0.8] - 2025-01-28 🚀 Major Refactor

### ✨ Added

- **Modern test environment:** introduced a new Node.js test server.
  - Opens the browser automatically.
  - Supports multiple platforms.
  - Handles server errors cleanly.
- **Tailwind CSS integration:** introduced a modern UI foundation.
  - Responsive layout.
  - Refined component styling.
  - Smaller CSS output.

### 🔧 Changed

- **Dependency upgrade:** moved from `heic2any@0.0.4` to `heic-to@1.2.1`.
  - Based on libheif 1.20.1.
  - Improved performance and stability.
  - Uses an actively maintained dependency.
- **Architecture:** rewrote the extension as typed TypeScript modules.
  - `utils/heic-converter.ts` — conversion engine.
  - `utils/types.ts` — shared type definitions.
  - `utils/constants.ts` — configuration and limits.
- **Memory management:**
  - Cleans up blob URLs automatically.
  - Avoids processing the same image more than once.
  - Reclaims temporary resources deliberately.
- **Error handling:**
  - Classifies CORS, format, network, and related errors.
  - Presents user-friendly failure states.
  - Provides an action to open the original image.
- **Performance:**
  - Limits concurrent processing to three images.
  - Debounces DOM observation.
  - Uses targeted caching.

### 🧪 Testing

- **Local fixtures:** added four HEIC files covering different paths.
  - `example.heic` (1.1 MB) — large-file performance.
  - `small-test.heic` (873 KB) — Nokia standard fixture.
  - `medium-test.heic` (219 KB) — small, fast conversion.
  - `corrupted-test.heic` (78 B) — error handling.
- **No CORS dependency:** test cases run entirely from local fixtures.
- **Live statistics:** displays conversion success and failure counts.

### 🗑️ Removed

- Removed unused React dependencies and configuration.
- Removed obsolete test code and comments.
- Removed duplicated documentation files.

### 🐛 Fixed

- Fixed memory leaks.
- Fixed repeated processing of the same image.
- Fixed BrokenPipe errors in the Python server.
- Improved CORS error handling.

### 📚 Documentation

- Reworked `README.md`.
- Added a complete changelog.
- Updated installation and development instructions.
- Added a troubleshooting guide.

---

## [1.0.7] - 2024-07-10 🔄 Stability Improvements

### 🔧 Changed

- Improved compatibility with affected websites.
- Improved image-loading performance.
- Improved error logging.

### 🐛 Fixed

- Fixed observation of dynamically loaded images.
- Fixed style conflicts on some websites.

---

## [1.0.6] - 2024-06-15 🎨 UI Improvements

### ✨ Added

- Added visual conversion status indicators.
- Added an improved in-progress animation.

### 🔧 Changed

- Refined the extension icon.
- Improved interface interactions.

---

## [1.0.5] - 2024-05-20 🚀 Performance Improvements

### 🔧 Changed

- Improved conversion speed for large files.
- Reduced memory use.
- Improved concurrent processing.

### 🐛 Fixed

- Fixed detection failures for some HEIC files.
- Fixed Firefox compatibility issues.

---

## [1.0.4] - 2024-04-10 🔧 Foundation Improvements

### 🔧 Changed

- Improved HEIC detection.
- Refined conversion quality settings.
- Improved startup performance.

### 🐛 Fixed

- Fixed JavaScript errors on affected websites.
- Fixed image-cache handling.

---

## [1.0.3] - 2024-03-05 🛠️ Stability Fixes

### 🐛 Fixed

- Fixed extension behavior after a page refresh.
- Fixed conflicts with other extensions.
- Fixed memory leaks.

---

## [1.0.2] - 2024-02-01 📱 Compatibility Improvements

### 🔧 Changed

- Improved support for different HEIC file variants.
- Improved behavior on mobile devices.
- Improved conversion success rates.

### 🐛 Fixed

- Fixed CSS conflicts on affected websites.
- Fixed timeouts when converting large files.

---

## [1.0.1] - 2024-01-15 🐛 Initial Fixes

### 🐛 Fixed

- Fixed first-run behavior after installation.
- Fixed compatibility with affected browser versions.
- Fixed conversion failure handling.

---

## [1.0.0] - 2024-01-01 🎉 Initial Release

### ✨ Core Features

- **HEIC conversion:** automatically converts HEIC images to PNG.
- **Automatic detection:** identifies HEIC images on pages.
- **Dynamic observation:** handles images loaded after the initial page render.
- **Cross-origin support:** handles common CORS constraints.

### 🏗️ Technology

- Built with WXT.
- Used `heic2any` for conversion.
- Written in TypeScript.
- Supported Chrome and Firefox.

### 📦 Distribution

- Chrome Web Store.
- Manual installation from GitHub Releases.

---

## 🔮 Historical Roadmap

### v1.1.0

- [ ] Support additional dynamic HEIC variants.
- [ ] Add batch conversion.
- [ ] Add configurable conversion quality.
- [ ] Add additional output formats such as JPEG and WebP.

### v1.2.0

- [ ] Explore an optional cloud conversion service.
- [ ] Add offline mode.
- [ ] Add an advanced settings panel.
- [ ] Add conversion history.

---

## 🤝 Contributors

Thank you to everyone who has contributed to this project:

- [@vingeray](https://github.com/vingeray) — creator and primary maintainer.

---

## 📞 Support

If you encounter a problem or have a feature request:

1. Read the [troubleshooting guide](README.md#troubleshooting).
2. Search [existing issues](https://github.com/vingeraycn/view-heic-browser-extension/issues).
3. Create a [new issue](https://github.com/vingeraycn/view-heic-browser-extension/issues/new).

---

<div align="center">

**Project links:** [GitHub](https://github.com/vingeraycn/view-heic-browser-extension) • [Chrome Web Store](https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge)

</div>
