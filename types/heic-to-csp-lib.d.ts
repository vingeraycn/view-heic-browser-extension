declare module "@heic-to-csp-lib" {
  interface LibheifImage {
    get_width(): number
    get_height(): number
    display(
      target: ImageData,
      callback: (result: ImageData | null | undefined) => void
    ): void
    free(): void
  }

  interface LibheifDecoder {
    decoder?: unknown
    decode(buffer: ArrayBuffer | Uint8Array): LibheifImage[]
  }

  interface LibheifModule {
    ready?: Promise<unknown>
    HeifDecoder: new () => LibheifDecoder
    heif_context_free(context: unknown): void
  }

  export default function buildLibheif(): LibheifModule
}
