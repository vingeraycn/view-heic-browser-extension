export interface GeminiDecoderService {
  convert: (file: File) => Promise<File>
}

const GEMINI_DECODER_GLOBAL_KEY = "__viewHeicGeminiDecoderV1"

type GeminiDecoderGlobal = typeof globalThis & {
  [GEMINI_DECODER_GLOBAL_KEY]?: GeminiDecoderService
}

export function registerGeminiDecoderService(service: GeminiDecoderService): void {
  ;(globalThis as GeminiDecoderGlobal)[GEMINI_DECODER_GLOBAL_KEY] = service
}

export function unregisterGeminiDecoderService(service: GeminiDecoderService): void {
  const extensionGlobal = globalThis as GeminiDecoderGlobal
  if (extensionGlobal[GEMINI_DECODER_GLOBAL_KEY] === service) {
    delete extensionGlobal[GEMINI_DECODER_GLOBAL_KEY]
  }
}

export function getGeminiDecoderService(): GeminiDecoderService | undefined {
  return (globalThis as GeminiDecoderGlobal)[GEMINI_DECODER_GLOBAL_KEY]
}
