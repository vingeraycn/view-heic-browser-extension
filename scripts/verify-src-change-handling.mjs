import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8")

const content = read("entrypoints/content.ts")
const converter = read("utils/heic-converter.ts")

const resetBody = converter.match(/resetImageProcessed\(img: HTMLImageElement\): void \{([\s\S]*?)\n  \}/)?.[1] ?? ""

const checks = [
  {
    name: "src mutation observer uses shared image candidates and HEIF extension filtering",
    pass:
      /SELECTORS\.IMAGE_CANDIDATES/.test(content) &&
      /hasHeifExtension\(getImageSrc\(img\)\)/.test(content),
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
]

const failures = checks.filter((check) => !check.pass)

for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`)
}

if (failures.length > 0) {
  process.exitCode = 1
}
