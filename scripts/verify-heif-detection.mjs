import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const source = fs.readFileSync(path.join(root, "utils/heif-format.ts"), "utf8")

const STILL_BRANDS = new Set(["mif1", "mif2", "heic", "heix", "heim", "heis"])
const SEQUENCE_BRANDS = new Set(["msf1", "hevc", "hevx"])
const MIME_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"])
const EXTENSION_PATTERN = /\.(heic|heif|heics|heifs)$/i

function readAscii(bytes, start, end) {
  return String.fromCharCode(...Array.from(bytes.slice(start, end))).replace(/\0/g, " ").trim()
}

function getFileType(relativePath) {
  const buffer = fs.readFileSync(path.join(root, relativePath))
  if (buffer.byteLength < 16 || readAscii(buffer, 4, 8) !== "ftyp") {
    return { isHeif: false, majorBrand: "", compatibleBrands: [], brands: [], isSequence: false }
  }

  const boxSize = Math.min(buffer.readUInt32BE(0), buffer.byteLength)
  const majorBrand = readAscii(buffer, 8, 12)
  const compatibleBrands = []
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    const brand = readAscii(buffer, offset, offset + 4)
    if (brand) compatibleBrands.push(brand)
  }
  const brands = Array.from(new Set([majorBrand, ...compatibleBrands].filter(Boolean)))
  const isHeif = brands.some((brand) => STILL_BRANDS.has(brand) || SEQUENCE_BRANDS.has(brand))
  const isSequence = brands.some((brand) => SEQUENCE_BRANDS.has(brand))
  return { isHeif, majorBrand, compatibleBrands, brands, isSequence }
}

function hasHeifExtension(src) {
  return EXTENSION_PATTERN.test(new URL(src, "https://example.com/page/").pathname)
}

function isHeifMimeType(mimeType) {
  return MIME_TYPES.has(mimeType.split(";")[0].trim().toLowerCase())
}

const checks = [
  {
    name: "detects heic still sample",
    pass: () => {
      const type = getFileType("docs/samples/heic-still.heic")
      return type.isHeif && type.majorBrand === "heic" && !type.isSequence
    },
  },
  {
    name: "detects mif1 still sample",
    pass: () => {
      const type = getFileType("docs/samples/mif1-still.heic")
      return type.isHeif && type.majorBrand === "mif1" && type.brands.includes("heic")
    },
  },
  {
    name: "detects msf1 sequence sample",
    pass: () => {
      const type = getFileType("docs/samples/msf1-sequence.heic")
      return type.isHeif && type.majorBrand === "msf1" && type.isSequence
    },
  },
  {
    name: "detects heix compatibility brand",
    pass: () => {
      const type = getFileType("docs/samples/heix-compatible.heic")
      return type.isHeif && type.brands.includes("heix")
    },
  },
  {
    name: "detects hevx sequence compatibility brand",
    pass: () => {
      const type = getFileType("docs/samples/hevx-compatible-sequence.heic")
      return type.isHeif && type.isSequence && type.brands.includes("hevx")
    },
  },
  {
    name: "detects heis brand",
    pass: () => {
      const type = getFileType("docs/samples/heis-multilayer.heic")
      return type.isHeif && type.majorBrand === "heis"
    },
  },
  {
    name: "rejects corrupted sample",
    pass: () => !getFileType("docs/samples/corrupted-test.heic").isHeif,
  },
  {
    name: "detects extensions with case, query, and hash",
    pass: () =>
      hasHeifExtension("https://example.com/photo.HEICS?download=1#preview") &&
      hasHeifExtension("/asset/image.heif?v=2") &&
      !hasHeifExtension("/asset/image.jpg?format=heic"),
  },
  {
    name: "detects HEIF MIME types with parameters",
    pass: () =>
      isHeifMimeType("image/heic") &&
      isHeifMimeType("image/heif-sequence; charset=binary") &&
      !isHeifMimeType("image/jpeg"),
  },
  {
    name: "source HEIF brand list includes current supported brands",
    pass: () => ["mif1", "mif2", "heic", "heix", "heim", "heis", "msf1", "hevc", "hevx"].every((brand) => source.includes(`"${brand}"`)),
  },
  {
    name: "source extension list includes still and sequence extensions",
    pass: () => /heic\|heif\|heics\|heifs/.test(source),
  },
]

const failures = checks.filter((check) => !check.pass())

for (const check of checks) {
  console.log(`${failures.includes(check) ? "FAIL" : "PASS"} ${check.name}`)
}

if (failures.length > 0) {
  process.exitCode = 1
}
