import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8")

const content = read("entrypoints/content.ts")
const converter = read("utils/heic-converter.ts")

const resetBody = converter.match(/resetImageProcessed\(img: HTMLImageElement\): void \{([\s\S]*?)\n  \}/)?.[1] ?? ""
const errorBody = converter.match(/handleConversionError\([\s\S]*?\): ConversionResult \{([\s\S]*?)\n  \}/)?.[1] ?? ""

const checks = [
  {
    name: "src mutation observer uses shared image candidates and HEIF extension filtering",
    pass:
      /SELECTORS\.IMAGE_CANDIDATES/.test(content) &&
      /hasHeifExtension\(getImageSrc\(img\)\)/.test(content),
  },
  {
    name: "srcset is not half-supported",
    pass:
      /IMAGE_CANDIDATES:\s*"img\[src\]"/.test(read("utils/constants.ts")) &&
      /attributeFilter:\s*\["src"\]/.test(content) &&
      !/srcset/.test(content),
  },
  {
    name: "MIME-only fallback probes are same-origin and cached",
    pass:
      /mimeOnlyProbeCache\s*=\s*new Map<string,\s*"heif"\s*\|\s*"not-heif">\(\)/.test(content) &&
      /isSameOriginUrl/.test(content) &&
      /mimeOnlyProbeCache\.get\(src\)/.test(content) &&
      /mimeOnlyProbeCache\.set\(src,\s*isHeif\s*\?\s*"heif"\s*:\s*"not-heif"\)/.test(content),
  },
  {
    name: "src mutation observer resets every changed HEIC image in the batch",
    pass: !/attributeName === "src"[\s\S]*?break/.test(content),
  },
  {
    name: "stale conversions are guarded by a per-image generation token",
    pass:
      /conversionGeneration\s*=\s*new WeakMap<HTMLImageElement, number>/.test(converter) &&
      /isCurrentGeneration/.test(converter) &&
      /return \{ success: false/.test(converter),
  },
  {
    name: "reset only clears extension-owned state",
    pass:
      !/style\.removeProperty\("filter"\)/.test(resetBody) &&
      !/style\.removeProperty\("cursor"\)/.test(resetBody) &&
      !/style\.removeProperty\("border"\)/.test(resetBody) &&
      !/img\.title\s*=\s*""/.test(resetBody) &&
      !/img\.onclick\s*=\s*null/.test(resetBody),
  },
  {
    name: "conversion failures preserve the original source without restarting conversion",
    pass:
      !/img\.src\s*=/.test(errorBody) &&
      /mutation\.oldValue === img\.getAttribute\("src"\)/.test(content) &&
      /attributeOldValue:\s*true/.test(content) &&
      /console\.debug/.test(errorBody) &&
      !/classList\.add\("heic-error"\)/.test(errorBody) &&
      !/img\.title\s*=/.test(errorBody) &&
      !/addEventListener\("click"/.test(errorBody) &&
      !/confirm\(/.test(errorBody),
  },
]

const failures = checks.filter((check) => !check.pass)

for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`)
}

if (failures.length > 0) {
  process.exitCode = 1
}
