import { mkdir, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"

const root = process.cwd()
const docsAssetsDir = join(root, "docs", "assets")
const storeAssetsDir = join(root, "docs", "store-assets")
const publicIconDir = join(root, "public", "icon")

const logoSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">View HEIC Logo</title>
  <desc id="desc">A folded HEIC photo tile with a clear viewing lens.</desc>
  <defs>
    <linearGradient id="tile" x1="92" y1="78" x2="424" y2="436" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0EA5E9"/>
      <stop offset="0.48" stop-color="#2563EB"/>
      <stop offset="1" stop-color="#7C3AED"/>
    </linearGradient>
    <linearGradient id="fold" x1="330" y1="86" x2="430" y2="188" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F8FAFC" stop-opacity="0.94"/>
      <stop offset="1" stop-color="#BAE6FD" stop-opacity="0.72"/>
    </linearGradient>
    <filter id="shadow" x="44" y="48" width="424" height="424" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#0F172A" flood-opacity="0.20"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="#F8FAFC"/>
  <g filter="url(#shadow)">
    <path d="M112 84H326L420 178V428H112V84Z" fill="url(#tile)"/>
    <path d="M326 84V178H420L326 84Z" fill="url(#fold)"/>
    <path d="M326 84V178H420" stroke="white" stroke-opacity="0.68" stroke-width="10" stroke-linejoin="round"/>
    <path d="M162 356L232 270L286 326L322 284L372 356H162Z" fill="white" fill-opacity="0.96"/>
    <circle cx="212" cy="182" r="28" fill="#FDE68A"/>
    <circle cx="270" cy="244" r="78" fill="#F8FAFC" fill-opacity="0.16" stroke="white" stroke-width="28"/>
    <path d="M326 300L374 348" stroke="white" stroke-width="28" stroke-linecap="round"/>
    <path d="M178 116H270" stroke="white" stroke-opacity="0.42" stroke-width="14" stroke-linecap="round"/>
    <path d="M178 400H354" stroke="white" stroke-opacity="0.28" stroke-width="12" stroke-linecap="round"/>
  </g>
</svg>
`

const screenshotStyle = `
  .bg{fill:#F8FAFC}.ink{fill:#0F172A}.muted{fill:#64748B}.blue{fill:#2563EB}.cyan{fill:#0EA5E9}.violet{fill:#7C3AED}
  .panel{fill:white;stroke:#E2E8F0;stroke-width:2}.soft{fill:#EFF6FF}.dark{fill:#111827}.good{fill:#16A34A}.warn{fill:#F59E0B}
  .small{font:600 22px Inter,Arial,sans-serif}.body{font:500 26px Inter,Arial,sans-serif}.h1{font:800 58px Inter,Arial,sans-serif;letter-spacing:-1px}.h2{font:800 44px Inter,Arial,sans-serif;letter-spacing:-0.4px}.label{font:700 18px Inter,Arial,sans-serif;text-transform:uppercase;letter-spacing:2px}
`

const logoMark = (x, y, size = 72) => `
  <g transform="translate(${x} ${y}) scale(${size / 512})">
    <rect width="512" height="512" rx="112" fill="#F8FAFC"/>
    <path d="M112 84H326L420 178V428H112V84Z" fill="url(#tile)"/>
    <path d="M326 84V178H420L326 84Z" fill="#DBEAFE"/>
    <path d="M162 356L232 270L286 326L322 284L372 356H162Z" fill="white"/>
    <circle cx="212" cy="182" r="28" fill="#FDE68A"/>
    <circle cx="270" cy="244" r="78" fill="#F8FAFC" fill-opacity="0.16" stroke="white" stroke-width="28"/>
    <path d="M326 300L374 348" stroke="white" stroke-width="28" stroke-linecap="round"/>
  </g>`

function screenshotSvg({ titleLines, subtitle, tag, variant }) {
  const demoCards = `
    <g transform="translate(760 150)">
      <rect width="430" height="458" rx="34" class="panel"/>
      <rect x="34" y="34" width="362" height="210" rx="24" fill="#DBEAFE"/>
      <path d="M72 213L148 132L213 192L257 148L356 213H72Z" fill="#2563EB" opacity=".78"/>
      <circle cx="142" cy="96" r="24" fill="#FDE68A"/>
      <rect x="58" y="278" width="150" height="24" rx="12" fill="#CBD5E1"/>
      <rect x="58" y="320" width="310" height="20" rx="10" fill="#E2E8F0"/>
      <rect x="58" y="354" width="230" height="20" rx="10" fill="#E2E8F0"/>
      <rect x="58" y="394" width="168" height="38" rx="19" fill="#DCFCE7"/>
      <text x="86" y="420" class="small good">Converted</text>
    </g>`

  const browser = `
    <g transform="translate(704 132)">
      <rect width="520" height="390" rx="30" class="panel"/>
      <rect width="520" height="58" rx="30" fill="#F1F5F9"/>
      <circle cx="34" cy="30" r="8" fill="#F87171"/><circle cx="60" cy="30" r="8" fill="#FBBF24"/><circle cx="86" cy="30" r="8" fill="#34D399"/>
      <rect x="116" y="18" width="330" height="24" rx="12" fill="white"/>
      <rect x="36" y="96" width="210" height="130" rx="22" fill="#DBEAFE"/>
      <path d="M60 204L110 150L152 188L184 162L226 204H60Z" fill="#2563EB" opacity=".82"/>
      <rect x="278" y="96" width="210" height="130" rx="22" fill="#EDE9FE"/>
      <circle cx="354" cy="154" r="42" fill="#7C3AED" opacity=".38"/>
      <rect x="36" y="266" width="452" height="46" rx="23" fill="#EFF6FF"/>
      <text x="62" y="297" class="small blue">HEIC Images Render In Place</text>
    </g>`

  const privacy = `
    <g transform="translate(740 155)">
      <rect width="430" height="390" rx="34" class="panel"/>
      <path d="M215 64L330 112V194C330 267 283 326 215 350C147 326 100 267 100 194V112L215 64Z" fill="#DCFCE7"/>
      <path d="M168 203L203 238L270 160" stroke="#16A34A" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="82" y="292" width="266" height="22" rx="11" fill="#CBD5E1"/>
      <rect x="132" y="328" width="166" height="22" rx="11" fill="#E2E8F0"/>
    </g>`

  const visual = variant === "privacy" ? privacy : variant === "browser" ? browser : demoCards

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1280" height="800" viewBox="0 0 1280 800" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tile" x1="92" y1="78" x2="424" y2="436" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0EA5E9"/><stop offset=".48" stop-color="#2563EB"/><stop offset="1" stop-color="#7C3AED"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1030 90) rotate(135) scale(580 360)">
      <stop stop-color="#DBEAFE"/><stop offset="1" stop-color="#F8FAFC" stop-opacity="0"/>
    </radialGradient>
    <style>${screenshotStyle}</style>
  </defs>
  <rect width="1280" height="800" class="bg"/>
  <rect width="1280" height="800" fill="url(#glow)"/>
  ${logoMark(92, 78, 82)}
  <text x="194" y="126" class="body ink">View HEIC</text>
  <text x="96" y="232" class="label blue">${tag}</text>
  ${titleLines.map((line, index) => `<text x="96" y="${300 + index * 62}" class="h1 ink">${line}</text>`).join('')}
  <text x="98" y="${titleLines.length > 1 ? 434 : 374}" class="body muted">${subtitle}</text>
  <rect x="96" y="466" width="236" height="62" rx="31" class="blue"/>
  <text x="141" y="506" class="small" fill="white">Install For Free</text>
  <rect x="358" y="466" width="220" height="62" rx="31" fill="white" stroke="#CBD5E1" stroke-width="2"/>
  <text x="410" y="506" class="small ink">Open Source</text>
  <g transform="translate(96 612)">
    <rect width="146" height="58" rx="18" fill="#EFF6FF"/><text x="34" y="38" class="small blue">50MB</text>
    <rect x="164" width="176" height="58" rx="18" fill="#F0FDF4"/><text x="197" y="38" class="small good">Local Only</text>
    <rect x="358" width="150" height="58" rx="18" fill="#F5F3FF"/><text x="397" y="38" class="small violet">JPEG</text>
  </g>
  ${visual}
</svg>
`
}

const screenshotSpecs = [
  {
    file: "01-browser-heic-preview",
    tag: "HEIC PREVIEW",
    titleLines: ["View HEIC", "Images"],
    subtitle: "HEIC And HEIF Files Render In Chrome.",
    variant: "browser",
  },
  {
    file: "02-local-private-conversion",
    tag: "PRIVATE BY DESIGN",
    titleLines: ["Local", "Conversion"],
    subtitle: "Images Stay On Your Device. No Uploads.",
    variant: "privacy",
  },
  {
    file: "03-fast-jpeg-rendering",
    tag: "FAST DEFAULTS",
    titleLines: ["Fast JPEG", "Previews"],
    subtitle: "Caching Keeps Pages Responsive.",
    variant: "cards",
  },
]

function smallPromoTileSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="440" height="280" viewBox="0 0 440 280" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tile" x1="92" y1="78" x2="424" y2="436" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0EA5E9"/><stop offset=".48" stop-color="#2563EB"/><stop offset="1" stop-color="#7C3AED"/>
    </linearGradient>
    <linearGradient id="bg" x1="24" y1="24" x2="410" y2="270" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0F172A"/><stop offset=".52" stop-color="#1D4ED8"/><stop offset="1" stop-color="#06B6D4"/>
    </linearGradient>
    <radialGradient id="shine" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(338 36) rotate(128) scale(250 170)">
      <stop stop-color="#BAE6FD" stop-opacity=".78"/><stop offset="1" stop-color="#BAE6FD" stop-opacity="0"/>
    </radialGradient>
    <style>
      .title{font:800 42px Inter,Arial,sans-serif;fill:white}
      .body{font:700 20px Inter,Arial,sans-serif;fill:#DBEAFE}
      .chip{font:800 16px Inter,Arial,sans-serif;fill:#0F172A}
    </style>
  </defs>
  <rect width="440" height="280" fill="url(#bg)"/>
  <rect width="440" height="280" fill="url(#shine)"/>
  <path d="M310 42L420 96V280H246L310 42Z" fill="#0F172A" fill-opacity=".18"/>
  <path d="M26 224C100 186 151 196 205 224C255 250 313 250 410 198" stroke="#E0F2FE" stroke-opacity=".20" stroke-width="24" stroke-linecap="round"/>

  ${logoMark(34, 38, 84)}
  <text x="136" y="78" class="title">View HEIC</text>
  <text x="138" y="112" class="body">iPhone photos open in Chrome</text>

  <g transform="translate(42 154)">
    <rect width="116" height="72" rx="18" fill="white" fill-opacity=".18" stroke="#BFDBFE" stroke-opacity=".48"/>
    <path d="M20 55L42 31L62 48L76 35L98 55H20Z" fill="#E0F2FE"/>
    <circle cx="46" cy="26" r="9" fill="#FDE68A"/>
    <rect x="22" y="82" width="72" height="28" rx="14" fill="white"/>
    <text x="37" y="102" class="chip">HEIC</text>
  </g>

  <g transform="translate(180 154)">
    <rect width="116" height="72" rx="18" fill="white" fill-opacity=".92"/>
    <path d="M20 55L42 31L62 48L76 35L98 55H20Z" fill="#2563EB" opacity=".82"/>
    <circle cx="46" cy="26" r="9" fill="#FDE68A"/>
    <path d="M134 36H160" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round"/>
    <path d="M152 24L164 36L152 48" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="21" y="82" width="76" height="28" rx="14" fill="#DCFCE7"/>
    <text x="35" y="102" class="chip">JPEG</text>
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

for (const spec of screenshotSpecs) {
  const svgPath = join(storeAssetsDir, `${spec.file}.svg`)
  const pngPath = join(storeAssetsDir, `${spec.file}.png`)
  await writeText(svgPath, screenshotSvg(spec))
  renderPng(svgPath, pngPath, 1280, 800)
}

const smallPromoSvgPath = join(storeAssetsDir, "00-small-promo-tile.svg")
const smallPromoPngPath = join(storeAssetsDir, "00-small-promo-tile.png")
await writeText(smallPromoSvgPath, smallPromoTileSvg())
renderPng(smallPromoSvgPath, smallPromoPngPath, 440, 280)

console.log("Generated logo, extension icons, and Chrome Web Store screenshots.")
