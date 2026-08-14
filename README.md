# View HEIC Browser Extension

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](https://github.com/vingeraycn/view-heic-browser-extension)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge)

View HEIC helps Chrome display and upload iPhone HEIC/HEIF photos on web pages. It detects likely HEIC/HEIF images, converts them locally, and replaces the original image or upload file with a browser-friendly JPEG.

## Features

- Automatically detects existing and dynamically inserted HEIC/HEIF images by extension, MIME type, and file signature.
- Converts HEIC/HEIF files selected in upload inputs to JPEG before the page receives them.
- Converts images locally in the browser with `heic-to` and libheif.
- Uses JPEG previews by default for faster rendering and smaller output.
- Handles source changes, retries, size limits, unsupported variants, and common error states.
- Keeps converted image data in the current tab only; image contents and image URLs are not uploaded.
- Shows a lightweight review prompt after repeated successful conversions.

## Install

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge).

For local development:

```bash
git clone https://github.com/vingeraycn/view-heic-browser-extension.git
cd view-heic-browser-extension
pnpm install
pnpm build
```

Then open `chrome://extensions/`, enable Developer mode, choose "Load unpacked", and select `.output/chrome-mv3`.

## Development

```bash
pnpm compile
pnpm test
pnpm verify:heif-detection
pnpm verify:rating-prompt
pnpm verify:analytics-events
pnpm verify:upload-conversion
pnpm verify:performance
pnpm verify:src-change
pnpm build
pnpm zip
```

Run the local demo server:

```bash
pnpm test:server
```

Open `http://127.0.0.1:8080/test-improved.html` to test conversion behavior with local HEIC fixtures.

## Project Structure

```text
view-heic-browser-extension/
├── analytics-worker/        # First-party GA4 event proxy
├── entrypoints/
│   ├── background.ts
│   ├── content.ts
│   ├── converter/
│   └── popup/
├── utils/
│   ├── analytics.ts
│   ├── analytics-transport.ts
│   ├── constants.ts
│   ├── heic-converter.ts
│   └── types.ts
├── docs/
│   ├── index.html
│   ├── test-improved.html
│   └── samples/
├── scripts/
└── wxt.config.ts
```

## Permissions

View HEIC uses the `storage` permission for per-site preferences, review-prompt state, and the analytics preference. Image conversion always runs locally in the browser. By default, the extension sends coarse product events with a randomly generated pseudonymous installation ID through a first-party validation proxy to Google Analytics. These events cover extension activity, feature entry points, aggregate conversion outcomes, and review-prompt actions. They never include image contents, image or page URLs, hostnames, file names, browsing history, form contents, or converted image data. Users can turn this off at any time from the popup; disabling it also deletes the local analytics identifier. See the [Privacy Policy](docs/privacy.html) and [analytics specification](docs/analytics.md).

## Latest Release

### v1.4.0

- Rebuilt product analytics around daily active installations and one event per completed conversion workflow.
- Added version, surface, trigger, outcome, duration, and aggregate-result dimensions without collecting page or file identity.
- Added a visible usage-data switch that deletes the local pseudonymous identifier when disabled.
- Removed the Google Analytics secret from the extension bundle and introduced a strict first-party edge proxy.

### v1.3.0

- Added a polished popup with live page status, per-site controls, help, and a local file converter.
- Improved HEIC / HEIF uploads on Gemini while preserving the existing ChatGPT workflow.
- Made conversion failures settle cleanly without repeated loading or retry loops.
- Opened first-install onboarding in English and kept help links aligned with the popup language.

### v1.0.12

- Added a localized Chrome Web Store review prompt after repeated successful conversions.
- Added local prompt frequency control so users are not repeatedly interrupted.
- Added enter and exit animations for the prompt.
- Disabled the Chrome Web Store review prompt in Firefox builds.

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

## Troubleshooting

If an image does not display:

- Make sure the extension is enabled.
- Refresh the page after installation.
- Check whether the file is a valid HEIC/HEIF image.
- Confirm the image is under the configured 50 MB limit.
- Some websites block extensions from reading image bytes; in that case View HEIC cannot convert the file in place.
- Open the browser console for View HEIC logs.

## License

MIT. See [LICENSE](LICENSE).

## Credits

- [libheif](https://github.com/strukturag/libheif)
- [heic-to](https://github.com/hoppergee/heic-to)
- [WXT](https://wxt.dev/)
- [Nokia HEIF](https://github.com/nokiatech/heif)
