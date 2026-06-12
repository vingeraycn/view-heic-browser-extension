import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8")

const converter = read("utils/heic-converter.ts")
const constants = read("utils/constants.ts")

const checks = [
  {
    name: "single-frame conversion defaults to JPEG",
    pass: /format\s*=\s*"jpeg"/.test(converter),
  },
  {
    name: "deterministic conversion errors are not retried",
    pass:
      /shouldRetryConversion/.test(converter) &&
      /ERROR_MESSAGES\.INVALID_FORMAT/.test(converter) &&
      /ERROR_MESSAGES\.FILE_TOO_LARGE/.test(converter) &&
      /ERROR_MESSAGES\.CORS_ERROR/.test(converter) &&
      /HEIF image not found/.test(converter),
  },
  {
    name: "animated HEIC eager full-frame playback is disabled by default",
    pass:
      /ANIMATED_HEIC_PLAYBACK_ENABLED:\s*false/.test(constants) &&
      /Promise\.all\(frames\.map/.test(converter) === false,
  },
  {
    name: "conversion stage timings are logged for future diagnosis",
    pass: /logStageTiming/.test(converter) && /performance\.now\(\)/.test(converter),
  },
]

const failures = checks.filter((check) => !check.pass)

for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`)
}

if (failures.length > 0) {
  process.exitCode = 1
}
