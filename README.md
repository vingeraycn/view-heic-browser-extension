# View HEIC Browser Extension

[![Version](https://img.shields.io/badge/version-1.0.12-blue.svg)](https://github.com/vingeraycn/view-heic-browser-extension)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge)

Read this in [Chinese](README.zh-CN.md).

View HEIC helps Chrome display iPhone HEIC/HEIF photos on web pages. It detects likely HEIC/HEIF images, converts them locally, and replaces the original image with a browser-friendly JPEG preview.

## Features

- Automatically detects existing and dynamically inserted HEIC/HEIF images by extension, MIME type, and file signature.
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
pnpm verify:heif-detection
pnpm verify:rating-prompt
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
├── entrypoints/
│   ├── content.ts
│   └── background.ts
├── utils/
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

View HEIC uses the `storage` permission to save local state for the review prompt, such as whether the user has dismissed or clicked it. Image conversion still runs locally in the browser. When extension analytics are enabled for a release, View HEIC sends anonymous product events such as conversion success/failure and review prompt clicks. It does not upload image contents, image URLs, page URLs, file names, browsing history, or converted image data.

## Latest Release

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
