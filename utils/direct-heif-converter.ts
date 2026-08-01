import { CONFIG, ERROR_MESSAGES } from "./constants"
import { isHeifBuffer, isHeifMimeType } from "./heif-format"

interface DecodedImage {
  width: number
  height: number
  data: Uint8ClampedArray<ArrayBuffer>
}

interface DirectDecoderImage {
  get_width(): number
  get_height(): number
  display(target: ImageData, callback: (result: ImageData | null | undefined) => void): void
  free(): void
}

interface DirectDecoder {
  decoder?: unknown
  decode(buffer: ArrayBuffer | Uint8Array): DirectDecoderImage[]
}

interface DirectDecoderModule {
  ready?: Promise<unknown>
  HeifDecoder: new () => DirectDecoder
  heif_context_free(context: unknown): void
}

let directDecoderModulePromise: Promise<DirectDecoderModule> | undefined

export async function convertHeifFileDirectly(file: File): Promise<File> {
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    throw new Error(ERROR_MESSAGES.FILE_TOO_LARGE)
  }

  const buffer = await file.arrayBuffer()
  if (!isHeifBuffer(buffer) && !isHeifMimeType(file.type)) {
    throw new Error(ERROR_MESSAGES.INVALID_FORMAT)
  }

  const decoded = await decodePrimaryImage(buffer)
  const blob = await encodeDecodedImage(decoded)

  return new File([blob], getJpegFileName(file.name), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  })
}

async function decodePrimaryImage(buffer: ArrayBuffer): Promise<DecodedImage> {
  const libheif = await getDirectDecoderModule()
  let decoder: DirectDecoder | undefined
  let images: DirectDecoderImage[] | undefined

  try {
    decoder = new libheif.HeifDecoder()
    images = decoder.decode(buffer)
    const image = images[0]
    if (!image) {
      throw new Error("HEIF image not found")
    }

    const width = image.get_width()
    const height = image.get_height()
    validateImageDimensions(width, height)

    const target = new ImageData(width, height)
    for (let offset = 3; offset < target.data.length; offset += 4) {
      target.data[offset] = 255
    }

    const decoded = await new Promise<ImageData>((resolve, reject) => {
      image.display(target, (result) => {
        if (result) {
          resolve(result)
        } else {
          reject(new Error("HEIF processing error"))
        }
      })
    })

    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
    }
  } finally {
    images?.forEach((image) => image.free())
    if (decoder?.decoder) {
      libheif.heif_context_free(decoder.decoder)
    }
  }
}

async function getDirectDecoderModule(): Promise<DirectDecoderModule> {
  directDecoderModulePromise ??= import("@heic-to-csp-lib").then(async ({ default: buildLibheif }) => {
    const libheif = buildLibheif()
    await libheif.ready
    return libheif
  })
  return directDecoderModulePromise
}

function validateImageDimensions(width: number, height: number): void {
  const pixels = width * height
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > CONFIG.MAX_IMAGE_DIMENSION ||
    height > CONFIG.MAX_IMAGE_DIMENSION ||
    !Number.isSafeInteger(pixels) ||
    pixels > CONFIG.MAX_IMAGE_PIXELS
  ) {
    throw new Error("HEIF image dimensions exceed decoder limits")
  }
}

function encodeDecodedImage(image: DecodedImage): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = image.width
  canvas.height = image.height

  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Canvas 2D context is unavailable")
  }

  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 1
        canvas.height = 1
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error("Canvas could not encode the converted image"))
        }
      },
      "image/jpeg",
      CONFIG.CONVERSION_QUALITY
    )
  })
}

function getJpegFileName(fileName: string): string {
  const withoutHeifExtension = fileName.replace(/\.(heic|heif|heics|heifs)$/i, "")
  if (withoutHeifExtension !== fileName) {
    return `${withoutHeifExtension || "converted"}.jpg`
  }

  return `${fileName.replace(/\.[^/.]+$/, "") || "converted"}.jpg`
}
