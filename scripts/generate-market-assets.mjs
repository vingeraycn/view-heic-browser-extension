import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"

const root = process.cwd()
const docsAssetsDir = join(root, "docs", "assets")
const storeAssetsDir = join(root, "docs", "store-assets")
const publicIconDir = join(root, "public", "icon")
const brandSourcePath = join(root, "assets", "brand", "logo.png")
const marketSourceDir = join(root, "assets", "market")
const logoDataUrl = `data:image/png;base64,${(await readFile(brandSourcePath)).toString("base64")}`

const logoSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">View HEIC Logo</title>
  <desc id="desc">A dark photo tile with layered mountains and a folded corner.</desc>
  <image width="512" height="512" href="${logoDataUrl}" preserveAspectRatio="xMidYMid slice"/>
</svg>
`

const marketScreenshotNames = [
  "01-browser-heic-preview",
  "02-local-private-conversion",
  "03-fast-jpeg-rendering",
]

function smallPromoTileSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="440" height="280" viewBox="0 0 440 280" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="440" y2="280" gradientUnits="userSpaceOnUse">
      <stop stop-color="#EFF6FF"/><stop offset=".55" stop-color="#DBEAFE"/><stop offset="1" stop-color="#CFFAFE"/>
    </linearGradient>
    <linearGradient id="photo" x1="44" y1="116" x2="384" y2="236" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0EA5E9"/><stop offset=".55" stop-color="#2563EB"/><stop offset="1" stop-color="#16A34A"/>
    </linearGradient>
    <style>
      .title{font:800 30px Inter,Arial,sans-serif;fill:#0F172A}
      .body{font:700 15px Inter,Arial,sans-serif;fill:#2563EB}
      .label{font:800 13px Inter,Arial,sans-serif;fill:#0F172A}
      .small{font:800 12px Inter,Arial,sans-serif;fill:#2563EB}
    </style>
  </defs>
  <rect width="440" height="280" fill="url(#bg)"/>
  <rect x="18" y="18" width="404" height="244" rx="24" fill="white" fill-opacity=".62"/>

  <g transform="translate(30 56)">
    <rect width="202" height="154" rx="18" fill="#FFFFFF" stroke="#BFDBFE" stroke-width="2"/>
    <rect width="202" height="30" rx="18" fill="#F8FAFC"/>
    <circle cx="20" cy="16" r="5" fill="#F87171"/>
    <circle cx="37" cy="16" r="5" fill="#FBBF24"/>
    <circle cx="54" cy="16" r="5" fill="#34D399"/>
    <rect x="76" y="9" width="96" height="14" rx="7" fill="#E2E8F0"/>
    <rect x="18" y="44" width="166" height="94" rx="12" fill="url(#photo)"/>
    <path d="M32 127L76 82L116 112L140 92L174 127H32Z" fill="#F8FAFC"/>
    <circle cx="74" cy="74" r="12" fill="#FDE68A"/>
    <rect x="24" y="50" width="48" height="20" rx="10" fill="#DBEAFE"/>
    <text x="34" y="64" class="small">HEIC</text>
  </g>

  <text x="252" y="74" class="title">View HEIC</text>
  <text x="252" y="108" class="title">Photos</text>
  <text x="254" y="140" class="body">Open HEIC/HEIF</text>
  <text x="254" y="162" class="body">images in Chrome</text>

  <g transform="translate(252 188)">
    <rect width="62" height="24" rx="12" fill="#DBEAFE"/><text x="14" y="17" class="label">Local</text>
    <rect x="70" width="70" height="24" rx="12" fill="#DCFCE7"/><text x="86" y="17" class="label">Private</text>
    <rect y="32" width="92" height="24" rx="12" fill="#FCE7F3"/><text x="13" y="49" class="label">No Upload</text>
  </g>
</svg>
`
}

async function writeText(path, content) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

function renderPng(svgPath, pngPath, width, height) {
  execFileSync("rsvg-convert", ["--width", String(width), "--height", String(height), "--output", pngPath, svgPath])
}

await mkdir(docsAssetsDir, { recursive: true })
await mkdir(storeAssetsDir, { recursive: true })
await mkdir(publicIconDir, { recursive: true })

const logoPath = join(docsAssetsDir, "logo.svg")
await writeText(logoPath, logoSvg)

for (const size of [32, 48, 96, 128]) {
  renderPng(logoPath, join(publicIconDir, `${size}.png`), size, size)
}

for (const name of marketScreenshotNames) {
  await copyFile(join(marketSourceDir, `${name}.png`), join(storeAssetsDir, `${name}.png`))
}

const smallPromoSvgPath = join(storeAssetsDir, "00-small-promo-tile.svg")
const smallPromoPngPath = join(storeAssetsDir, "00-small-promo-tile.png")
await writeText(smallPromoSvgPath, smallPromoTileSvg())
renderPng(smallPromoSvgPath, smallPromoPngPath, 440, 280)

console.log("Generated logo, extension icons, promo tile, and Chrome Web Store screenshots.")
