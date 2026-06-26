export interface HeifFileType {
  isHeif: boolean
  majorBrand: string
  compatibleBrands: string[]
  brands: string[]
  isSequence: boolean
}

const HEIF_STILL_BRANDS = new Set(["mif1", "mif2", "heic", "heix", "heim", "heis"])
const HEIF_SEQUENCE_BRANDS = new Set(["msf1", "hevc", "hevx"])
const HEIF_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
])
const HEIF_EXTENSION_PATTERN = /\.(heic|heif|heics|heifs)$/i

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...Array.from(bytes.slice(start, end)))
    .replace(/\0/g, " ")
    .trim()
}

export function getHeifFileType(buffer: ArrayBuffer): HeifFileType {
  const bytes = new Uint8Array(buffer)
  if (bytes.byteLength < 16 || readAscii(bytes, 4, 8) !== "ftyp") {
    return { isHeif: false, majorBrand: "", compatibleBrands: [], brands: [], isSequence: false }
  }

  const declaredBoxSize = new DataView(buffer).getUint32(0)
  const boxSize = declaredBoxSize > 0 ? Math.min(declaredBoxSize, bytes.byteLength) : bytes.byteLength
  const majorBrand = readAscii(bytes, 8, 12)
  const compatibleBrands: string[] = []

  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    const brand = readAscii(bytes, offset, offset + 4)
    if (brand) compatibleBrands.push(brand)
  }

  const brands = Array.from(new Set([majorBrand, ...compatibleBrands].filter(Boolean)))
  const isHeif = brands.some((brand) => HEIF_STILL_BRANDS.has(brand) || HEIF_SEQUENCE_BRANDS.has(brand))
  const isSequence = brands.some((brand) => HEIF_SEQUENCE_BRANDS.has(brand))

  return { isHeif, majorBrand, compatibleBrands, brands, isSequence }
}

export function isHeifBuffer(buffer: ArrayBuffer): boolean {
  return getHeifFileType(buffer).isHeif
}

export function isHeifSequenceBuffer(buffer: ArrayBuffer): boolean {
  return getHeifFileType(buffer).isSequence
}

export function isHeifMimeType(mimeType: string): boolean {
  return HEIF_MIME_TYPES.has(mimeType.split(";")[0].trim().toLowerCase())
}

export function hasHeifExtension(src: string): boolean {
  try {
    return HEIF_EXTENSION_PATTERN.test(new URL(src, location.href).pathname)
  } catch {
    return HEIF_EXTENSION_PATTERN.test(src.split(/[?#]/)[0])
  }
}
