# 📖 Documentation

This directory contains the View HEIC website and media samples. GitHub Pages is configured to deploy from `/docs`.

## 📁 Structure

```text
docs/
├── assets/
│   └── logo.svg        # Website logo generated from the canonical brand asset
├── store-assets/       # Store screenshots rendered as 1280 × 800 PNG files
├── index.html          # GitHub Pages landing page
├── README.md           # This document
└── samples/            # HEIC / HEIF sample matrix
```

## 🌐 GitHub Pages Setup

1. Open the repository's **Settings → Pages** page.
2. Set Source to **Deploy from a branch**.
3. Select the `main` branch and `/docs` directory, then choose **Save**.
4. Wait approximately one minute, then open `https://vingeraycn.github.io/view-heic-browser-extension/`.

## 🏠 Landing Page (`index.html`)

The landing page is a complete bilingual product page. English is the default, and the language switch in the upper-right corner changes between English and Chinese.

- 🎯 Hero: headline, calls to action, and trust statement
- 📊 Product facts: 50 MB limit, HEIC/HEIF brand coverage, JPEG preview default, and zero image uploads
- ✨ Core features: six feature cards
- 🚀 How it works: three-step flow and an internal conversion diagram
- 🎬 Live demo: four real HEIC files, dynamic injection, and conversion statistics
- 📦 Installation: Chrome Web Store and manual installation paths
- 🔧 Technology stack and project structure
- ❓ Collapsible FAQ
- 📣 Closing call to action and full footer

SEO metadata includes description, Open Graph, Twitter Card, and `hreflang`. Language URLs are:

- English: `https://vingeraycn.github.io/view-heic-browser-extension/?lang=en`
- Chinese: `https://vingeraycn.github.io/view-heic-browser-extension/?lang=zh`

## 🛍️ Store Assets

The project generates store assets through one script so the logo, extension icon, and screenshot styles stay aligned:

```bash
pnpm assets:market
```

The canonical brand and store source files live in `assets/brand/` and `assets/market/`. The generation script updates the website logo, extension icons, store screenshots, and promotional tile from those sources so generated artifacts do not drift from the originals.

Generated files:

- `docs/assets/logo.svg`
- `public/icon/32.png`
- `public/icon/48.png`
- `public/icon/96.png`
- `public/icon/128.png`
- `docs/store-assets/01-browser-heic-preview.png`
- `docs/store-assets/02-local-private-conversion.png`
- `docs/store-assets/03-fast-jpeg-rendering.png`

## 🖼️ Fixtures

| File | Coverage |
| --- | --- |
| `samples/heic-still.heic` | major `heic` |
| `samples/mif1-still.heic` | major `mif1` |
| `samples/msf1-sequence.heic` | major `msf1` |
| `samples/heix-compatible.heic` | compatible `heix` |
| `samples/hevx-compatible-sequence.heic` | compatible `hevx` |
| `samples/heis-multilayer.heic` | major `heis` |
| `samples/corrupted.heic` | error handling and invalid input |

See `samples/README.md` for complete provenance and coverage gaps.
