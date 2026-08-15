import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import ts from "typescript"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

async function loadHeifFormatModule() {
  const sourcePath = path.join(root, "utils/heif-format.ts")
  const source = fs.readFileSync(sourcePath, "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  })
  const outputPath = path.join(os.tmpdir(), `view-heic-format-${process.pid}.mjs`)
  fs.writeFileSync(outputPath, outputText)
  return import(pathToFileURL(outputPath).href)
}

const {
  getHeifFileType,
  hasHeifExtension,
  isHeifMimeType,
} = await loadHeifFormatModule()

function readSample(relativePath) {
  const buffer = fs.readFileSync(path.join(root, relativePath))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

const checks = [
  {
    name: "detects heic still sample",
    pass: () => {
      const type = getHeifFileType(readSample("docs/samples/heic-still.heic"))
      return type.isHeif && type.majorBrand === "heic" && !type.isSequence
    },
  },
  {
    name: "detects mif1 still sample",
    pass: () => {
      const type = getHeifFileType(readSample("docs/samples/mif1-still.heic"))
      return type.isHeif && type.majorBrand === "mif1" && type.brands.includes("heic")
    },
  },
  {
    name: "detects msf1 sequence sample",
    pass: () => {
      const type = getHeifFileType(readSample("docs/samples/msf1-sequence.heic"))
      return type.isHeif && type.majorBrand === "msf1" && type.isSequence
    },
  },
  {
    name: "detects heix compatibility brand",
    pass: () => {
      const type = getHeifFileType(readSample("docs/samples/heix-compatible.heic"))
      return type.isHeif && type.brands.includes("heix")
    },
  },
  {
    name: "detects hevx sequence compatibility brand",
    pass: () => {
      const type = getHeifFileType(readSample("docs/samples/hevx-compatible-sequence.heic"))
      return type.isHeif && type.isSequence && type.brands.includes("hevx")
    },
  },
  {
    name: "detects heis brand",
    pass: () => {
      const type = getHeifFileType(readSample("docs/samples/heis-multilayer.heic"))
      return type.isHeif && type.majorBrand === "heis"
    },
  },
  {
    name: "rejects corrupted sample",
    pass: () => !getHeifFileType(readSample("docs/samples/corrupted.heic")).isHeif,
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
]

const failures = checks.filter((check) => !check.pass())

for (const check of checks) {
  console.log(`${failures.includes(check) ? "FAIL" : "PASS"} ${check.name}`)
}

if (failures.length > 0) {
  process.exitCode = 1
}
