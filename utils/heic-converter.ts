import { heicTo } from "heic-to/csp"
import { CONFIG, DATA_ATTRIBUTES, ERROR_MESSAGES } from "./constants"
import { getHeifFileType, isHeifBuffer, isHeifMimeType, isHeifSequenceBuffer } from "./heif-format"
import type { ConversionError, ConversionOptions, ConversionResult } from "./types"

// ─── Types ───────────────────────────────────────────────────────────────────

/** Raw pixel data for a single decoded HEIC frame. */
interface DecodedFrameData {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** An entry in the array returned by `heic-decode.all()`. */
interface HeicDecodeFrame {
  width: number
  height: number
  decode: () => Promise<DecodedFrameData>
}

/** Return type of `heic-decode.all()` – an array that also carries a `dispose()`. */
type HeicDecodeFrameList = HeicDecodeFrame[] & { dispose?: () => void }

function logStageTiming(src: string, stage: string, startTime: number): void {
  const elapsedMs = Math.round(performance.now() - startTime)
  console.debug("[View HEIC] conversion timing", { stage, elapsedMs, src })
}

function shouldRetryConversion(error: any): boolean {
  const message = error?.message ?? ""
  const nonRetryableMessages = [
    ERROR_MESSAGES.INVALID_FORMAT,
    ERROR_MESSAGES.UNSUPPORTED_CODEC,
    ERROR_MESSAGES.FILE_TOO_LARGE,
    ERROR_MESSAGES.CORS_ERROR,
    "HEIF image not found",
    "HEIF processing error",
    "Could not parse HEIF file",
  ]

  return !nonRetryableMessages.some((deterministicError) => message.includes(deterministicError))
}

function getSupportedCodecBrands(brands: string[]): string[] {
  return brands.filter((brand) => ["heic", "heix", "heim", "heis", "hevc", "hevx"].includes(brand))
}

// ─── Converter ──────────────────────────────────────────────────────────────

/**
 * HEIC converter: handles single-frame and animated (sequence) HEIC/HEIF files.
 */
export class HEICConverter {
  private processedImages = new WeakSet<HTMLImageElement>()
  private conversionGeneration = new WeakMap<HTMLImageElement, number>()
  /** Prevents duplicate concurrent conversions of the same element. */
  private processingQueue = new Map<HTMLImageElement, Promise<ConversionResult>>()
  /** Cache: original src → converted blob URL. */
  private urlCache = new Map<string, string>()
  /** Animation interval IDs keyed by the canvas that replaced the img. */
  private animationTimers = new Set<ReturnType<typeof setInterval>>()

  // ── Internal helpers ────────────────────────────────────────────────────

  private isImageProcessed(img: HTMLImageElement): boolean {
    return this.processedImages.has(img) || img.hasAttribute(DATA_ATTRIBUTES.PROCESSED)
  }

  private markImageAsProcessed(img: HTMLImageElement): void {
    this.processedImages.add(img)
    img.setAttribute(DATA_ATTRIBUTES.PROCESSED, "true")
  }

  private nextGeneration(img: HTMLImageElement): number {
    const generation = (this.conversionGeneration.get(img) ?? 0) + 1
    this.conversionGeneration.set(img, generation)
    return generation
  }

  private getGeneration(img: HTMLImageElement): number {
    return this.conversionGeneration.get(img) ?? 0
  }

  private isCurrentGeneration(img: HTMLImageElement, generation: number): boolean {
    return this.getGeneration(img) === generation
  }

  private restoreExtensionErrorState(img: HTMLImageElement): void {
    if (img.hasAttribute(DATA_ATTRIBUTES.PREVIOUS_FILTER)) {
      img.style.setProperty("filter", img.getAttribute(DATA_ATTRIBUTES.PREVIOUS_FILTER) ?? "")
      img.removeAttribute(DATA_ATTRIBUTES.PREVIOUS_FILTER)
    }
    if (img.hasAttribute(DATA_ATTRIBUTES.PREVIOUS_CURSOR)) {
      img.style.setProperty("cursor", img.getAttribute(DATA_ATTRIBUTES.PREVIOUS_CURSOR) ?? "")
      img.removeAttribute(DATA_ATTRIBUTES.PREVIOUS_CURSOR)
    }
    if (img.hasAttribute(DATA_ATTRIBUTES.PREVIOUS_TITLE)) {
      img.title = img.getAttribute(DATA_ATTRIBUTES.PREVIOUS_TITLE) ?? ""
      img.removeAttribute(DATA_ATTRIBUTES.PREVIOUS_TITLE)
    }
  }

  /**
   * Reset all in-memory and DOM markers for a specific image element.
   * This is used when the src changes so the same node can be re-processed
   * against the new source.
   */
  resetImageProcessed(img: HTMLImageElement): void {
    this.nextGeneration(img)
    this.processingQueue.delete(img)
    this.processedImages.delete(img)
    img.removeAttribute(DATA_ATTRIBUTES.PROCESSED)
    img.removeAttribute(DATA_ATTRIBUTES.ORIGINAL_SRC)
    img.removeAttribute("data-error-type")
    img.removeAttribute("data-error-message")
    img.classList.remove("heic-processing", "heic-converted", "heic-error")
    this.restoreExtensionErrorState(img)
  }

  /**
   * Fetches raw image bytes.  Validates size and HEIC magic bytes.
   * If the server returns a correct HEIC MIME type but the URL has no .heic
   * extension, we still accept the blob.
   */
  private async fetchImageData(src: string): Promise<ArrayBuffer> {
    const fetchStart = performance.now()
    let response: Response
    try {
      response = await fetch(src)
    } catch (error: any) {
      if (error.name === "TypeError") {
        // TypeError from fetch can mean CORS blocked or a generic network failure
        // (DNS, offline, etc.).  Use origin comparison as a best-effort heuristic:
        // a cross-origin request failing with TypeError is most likely CORS;
        // a same-origin TypeError is a plain network failure.
        let isCrossOrigin = false
        try { isCrossOrigin = new URL(src).origin !== location.origin } catch { /* ignore */ }
        throw new Error(isCrossOrigin ? ERROR_MESSAGES.CORS_ERROR : ERROR_MESSAGES.NETWORK_ERROR)
      }
      throw new Error(ERROR_MESSAGES.NETWORK_ERROR)
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    logStageTiming(src, "fetch", fetchStart)

    const blobStart = performance.now()
    const blob = await response.blob()

    if (blob.size > CONFIG.MAX_FILE_SIZE) {
      throw new Error(ERROR_MESSAGES.FILE_TOO_LARGE)
    }

    const buffer = await blob.arrayBuffer()
    logStageTiming(src, "read-blob", blobStart)

    // Accept if magic bytes confirm HEIC, or if the MIME type is heic/heif.
    const mimeOk = isHeifMimeType(blob.type)

    if (!isHeifBuffer(buffer) && !mimeOk) {
      throw new Error(ERROR_MESSAGES.INVALID_FORMAT)
    }

    return buffer
  }

  // ── Single-frame conversion ─────────────────────────────────────────────

  private async convertSingleFrame(
    buffer: ArrayBuffer,
    src: string,
    options: ConversionOptions = {}
  ): Promise<string> {
    const { quality = CONFIG.CONVERSION_QUALITY, format = "jpeg" } = options
    const blob = new Blob([buffer])
    const convertStart = performance.now()
    try {
      const result = await heicTo({ blob, type: `image/${format}`, quality })
      logStageTiming(src, `convert-${format}`, convertStart)
      return URL.createObjectURL(result)
    } catch (error) {
      const fileType = getHeifFileType(buffer)
      if (fileType.isHeif && getSupportedCodecBrands(fileType.brands).length === 0) {
        const unsupportedError = new Error(`${ERROR_MESSAGES.UNSUPPORTED_CODEC}: ${fileType.brands.join(", ")}`)
        ;(unsupportedError as any).fileType = fileType
        throw unsupportedError
      }

      ;(error as any).fileType = fileType
      throw error
    }
  }

  // ── Animated (sequence) conversion ──────────────────────────────────────

  /**
   * Decodes all frames via `heic-decode` and replaces the <img> with an
   * animated <canvas>.  Falls back to single-frame on any error.
   */
  private async convertAnimatedToCanvas(
    img: HTMLImageElement,
    buffer: ArrayBuffer,
    generation: number,
    options: ConversionOptions = {}
  ): Promise<string | null> {
    try {
      if (!CONFIG.ANIMATED_HEIC_PLAYBACK_ENABLED) {
        return null
      }

      // heic-decode is a Node-style CJS module; dynamic import lets Vite
      // bundle it and gives a clean fallback path if unavailable.
      const heicDecode = await import("heic-decode")
      const decodeAll: (opts: { buffer: ArrayBuffer }) => Promise<HeicDecodeFrameList> =
        (heicDecode as any).default?.all ?? (heicDecode as any).all

      if (typeof decodeAll !== "function") {
        throw new Error("heic-decode.all not available")
      }

      const frames: HeicDecodeFrameList = await decodeAll({ buffer })

      if (!frames || frames.length === 0) {
        throw new Error("No frames decoded")
      }

      if (frames.length === 1) {
        // Only one frame – just use the standard path
        frames.dispose?.()
        return null
      }

      const rawFrames: DecodedFrameData[] = []
      for (const frame of frames) {
        rawFrames.push(await frame.decode())
      }
      frames.dispose?.()

      const { width, height } = rawFrames[0]

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height

      // Mirror relevant attributes from the original <img>
      if (img.id) canvas.id = img.id
      if (img.className) canvas.className = img.className
      canvas.setAttribute("role", "img")
      if (img.alt) canvas.setAttribute("aria-label", img.alt)
      if (img.title) canvas.title = img.title

      // Mirror inline styles and sizing attributes
      canvas.style.cssText = img.style.cssText
      if (img.width) canvas.style.width = `${img.width}px`
      if (img.height) canvas.style.height = `${img.height}px`
      canvas.setAttribute(DATA_ATTRIBUTES.PROCESSED, "true")

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        frames.dispose?.()
        throw new Error("无法获取canvas 2D上下文")
      }
      let frameIndex = 0

      const drawFrame = () => {
        const f = rawFrames[frameIndex]
        ctx.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.width, f.height), 0, 0)
        frameIndex = (frameIndex + 1) % rawFrames.length
      }

      drawFrame()

      if (!this.isCurrentGeneration(img, generation)) {
        return null
      }

      const timerId = setInterval(drawFrame, Math.round(1000 / CONFIG.ANIMATION_FPS))
      this.animationTimers.add(timerId)

      // Replace <img> with <canvas> in-place
      img.parentNode?.replaceChild(canvas, img)
      this.markImageAsProcessed(img)

      return "animated-canvas" // Signal that canvas path was taken
    } catch (err) {
      console.warn("⚠️ 动画HEIC帧解码失败，回退到静态首帧:", err)
      return null // Caller will fall through to single-frame
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Converts a single <img> element from HEIC/HEIF to a displayable format.
   * De-duplicates concurrent calls for the same element via processingQueue.
   */
  async convertImage(
    img: HTMLImageElement,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    if (this.isImageProcessed(img)) {
      return { success: true }
    }

    // De-duplicate: if already in-flight, reuse the same promise
    if (this.processingQueue.has(img)) {
      return this.processingQueue.get(img)!
    }

    const task = this._doConvert(img, options)
    this.processingQueue.set(img, task)
    try {
      return await task
    } finally {
      this.processingQueue.delete(img)
    }
  }

  private async _doConvert(
    img: HTMLImageElement,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    const originalSrc = img.src
    const { maxRetries = CONFIG.RETRY_ATTEMPTS } = options
    const generation = this.nextGeneration(img)

    // Persist original src so failure paths can restore the page state silently.
    if (!img.hasAttribute(DATA_ATTRIBUTES.ORIGINAL_SRC)) {
      img.setAttribute(DATA_ATTRIBUTES.ORIGINAL_SRC, originalSrc)
    }

    // Reuse an already-converted blob URL for this src
    if (this.urlCache.has(originalSrc)) {
      if (!this.isCurrentGeneration(img, generation) || img.src !== originalSrc) {
        return { success: false }
      }
      img.src = this.urlCache.get(originalSrc)!
      img.classList.add("heic-converted")
      this.markImageAsProcessed(img)
      return { success: true }
    }

    img.classList.add("heic-processing")

    let lastError: any
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const buffer = await this.fetchImageData(originalSrc)

        // ── Animated path ──────────────────────────────────────────────
        if (isHeifSequenceBuffer(buffer)) {
          const canvasResult = await this.convertAnimatedToCanvas(img, buffer, generation, options)
          if (canvasResult !== null) {
            if (!this.isCurrentGeneration(img, generation)) {
              return { success: false }
            }
            // "animated-canvas" → canvas replaced the img; or null means fallback
            img.classList.remove("heic-processing")
            return { success: true }
          }
          // Fall through to single-frame below
        }

        // ── Single-frame path ──────────────────────────────────────────
        const objectURL = await this.convertSingleFrame(buffer, originalSrc, options)

        if (!this.isCurrentGeneration(img, generation) || img.src !== originalSrc) {
          URL.revokeObjectURL(objectURL)
          return { success: false }
        }

        // Revoke any previous blob URL we set on this img
        if (img.src.startsWith("blob:") && img.src !== objectURL) {
          URL.revokeObjectURL(img.src)
        }

        this.urlCache.set(originalSrc, objectURL)
        img.src = objectURL
        img.classList.remove("heic-processing")
        img.classList.add("heic-converted")
        this.markImageAsProcessed(img)

        return { success: true }
      } catch (error: any) {
        lastError = error
        console.warn(`HEIC转换尝试 ${attempt + 1}/${maxRetries} 失败:`, error.message)

        if (!shouldRetryConversion(error)) {
          break
        }

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
        }
      }
    }

    if (!this.isCurrentGeneration(img, generation) || img.src !== originalSrc) {
      return { success: false }
    }

    if (options.ignoreInvalidFormat && lastError?.message?.includes(ERROR_MESSAGES.INVALID_FORMAT)) {
      img.classList.remove("heic-processing")
      img.removeAttribute(DATA_ATTRIBUTES.ORIGINAL_SRC)
      return { success: false, error: { type: "format", message: ERROR_MESSAGES.INVALID_FORMAT } }
    }

    return this.handleConversionError(img, lastError, originalSrc)
  }

  /**
   * Batch-processes a list of images with concurrency throttling.
   */
  async convertAllImages(
    images: NodeListOf<HTMLImageElement> | HTMLImageElement[],
    options: ConversionOptions = {}
  ): Promise<ConversionResult[]> {
    const results: ConversionResult[] = []
    const imageArray = Array.from(images)

    for (let i = 0; i < imageArray.length; i += CONFIG.MAX_CONCURRENT) {
      const batch = imageArray.slice(i, i + CONFIG.MAX_CONCURRENT)
      const settled = await Promise.allSettled(batch.map((img) => this.convertImage(img, options)))

      settled.forEach((result) => {
        if (result.status === "fulfilled") {
          results.push(result.value)
        } else {
          results.push({
            success: false,
            error: {
              type: "unknown",
              message: result.reason?.message ?? "Promise rejected",
            },
          })
        }
      })
    }

    return results
  }

  /**
   * Releases all blob URLs and stops animation timers.
   */
  cleanup(): void {
    this.urlCache.forEach((url) => URL.revokeObjectURL(url))
    this.urlCache.clear()
    this.processingQueue.clear()
    this.animationTimers.forEach((id) => clearInterval(id))
    this.animationTimers.clear()
  }

  // ── Error handling ──────────────────────────────────────────────────────

  private handleConversionError(
    img: HTMLImageElement,
    error: any,
    originalSrc: string
  ): ConversionResult {
    img.classList.remove("heic-processing")
    img.classList.remove("heic-error")
    img.src = originalSrc
    this.restoreExtensionErrorState(img)

    let errorType: ConversionError["type"] = "unknown"
    let errorMessage: string = error?.message ?? ERROR_MESSAGES.CONVERSION_FAILED

    if (
      errorMessage.includes("CORS") ||
      errorMessage.includes("cross-origin") ||
      errorMessage.includes("Access-Control-Allow-Origin")
    ) {
      errorType = "cors"
      errorMessage = ERROR_MESSAGES.CORS_ERROR
    } else if (errorMessage.includes("Failed to fetch") || errorMessage.includes("网络")) {
      errorType = "network"
      errorMessage = ERROR_MESSAGES.NETWORK_ERROR
    } else if (errorMessage.includes("50MB")) {
      errorType = "size"
    } else if (errorMessage.includes(ERROR_MESSAGES.UNSUPPORTED_CODEC) || errorMessage.includes("unsupported")) {
      errorType = "unsupported"
    } else if (errorMessage.includes("格式") || errorMessage.includes("HEIC")) {
      errorType = "format"
    } else if (errorMessage.includes("转换")) {
      errorType = "conversion"
    } else if (error?.name === "AbortError") {
      errorType = "network"
    }

    console.debug("[View HEIC] conversion skipped", {
      src: originalSrc,
      type: errorType,
      message: errorMessage,
      fileType: error?.fileType,
      originalError: error,
    })

    return { success: false, error: { type: errorType, message: errorMessage, originalError: error } }
  }
}
