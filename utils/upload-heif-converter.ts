import { convertHeifFileToJpegFile } from "./heic-converter"
import { getGeminiDecoderService } from "./gemini-decoder-registry"

type FileConverter = (file: File) => Promise<File>

export interface UploadHeifConversionBackends {
  worker: FileConverter
  getDirectDecoder: () => FileConverter | undefined
}

export interface UploadHeifConversionPolicy {
  requiresDirectDecoder: () => boolean
}

const DEFAULT_BACKENDS: UploadHeifConversionBackends = {
  worker: convertHeifFileToJpegFile,
  getDirectDecoder: () => getGeminiDecoderService()?.convert,
}

const DEFAULT_POLICY: UploadHeifConversionPolicy = {
  requiresDirectDecoder: () =>
    typeof location !== "undefined" && location.hostname.toLowerCase() === "gemini.google.com",
}

/**
 * Keeps the existing Worker path everywhere except Gemini. Gemini's CSP blocks
 * Blob Workers, so its separately matched extension content script provides a
 * direct decoder backed by the same current libheif version as heic-to.
 */
export function createUploadHeifConverter(
  backends: UploadHeifConversionBackends = DEFAULT_BACKENDS,
  policy: UploadHeifConversionPolicy = DEFAULT_POLICY
): FileConverter {
  return (file) => {
    if (!policy.requiresDirectDecoder()) {
      return backends.worker(file)
    }

    const directDecoder = backends.getDirectDecoder()
    if (!directDecoder) {
      return Promise.reject(new Error("Gemini HEIC decoder is unavailable"))
    }

    return directDecoder(file)
  }
}

export const convertHeifUploadFileToJpegFile = createUploadHeifConverter()
