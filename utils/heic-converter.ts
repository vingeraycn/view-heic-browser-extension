import { heicTo } from "heic-to/csp"
import { CONFIG, DATA_ATTRIBUTES, ERROR_MESSAGES } from "./constants"
import type { ConversionError, ConversionOptions, ConversionResult } from "./types"

// ─── Magic-bytes helpers ────────────────────────────────────────────────────

const HEIC_BRANDS_SINGLE = new Set(["mif1", "heic", "heix"])
const HEIC_BRANDS_SEQUENCE = new Set(["msf1", "hevc", "hevx"])

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

function getHeicBrand(buffer: ArrayBuffer): string {
  if (buffer.byteLength < 12) return ""
  const bytes = new Uint8Array(buffer, 8, 4)
  return String.fromCharCode(...Array.from(bytes))
    .replace(/\0/g, " ")
    .trim()
}

function isHeicBuffer(buffer: ArrayBuffer): boolean {
  const brand = getHeicBrand(buffer)
  return HEIC_BRANDS_SINGLE.has(brand) || HEIC_BRANDS_SEQUENCE.has(brand)
}

function isAnimatedHeicBuffer(buffer: ArrayBuffer): boolean {
  return HEIC_BRANDS_SEQUENCE.has(getHeicBrand(buffer))
}

// ─── Converter ──────────────────────────────────────────────────────────────

/**
 * HEIC converter: handles single-frame and animated (sequence) HEIC/HEIF files.
 */
export class HEICConverter {
  private processedImages = new WeakSet<HTMLImageElement>()
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

  /**
   * Reset all in-memory and DOM markers for a specific image element.
   * This is used when the src changes so the same node can be re-processed
   * against the new source.
   */
  resetImageProcessed(img: HTMLImageElement): void {
    this.processingQueue.delete(img)
    this.processedImages.delete(img)
    img.removeAttribute(DATA_ATTRIBUTES.PROCESSED)
    img.removeAttribute(DATA_ATTRIBUTES.ORIGINAL_SRC)
    img.removeAttribute("data-error-type")
    img.removeAttribute("data-error-message")
    img.classList.remove("heic-processing", "heic-converted", "heic-error")
    img.style.removeProperty("filter")
    img.style.removeProperty("cursor")
    img.style.removeProperty("border")
    img.title = ""
    img.onclick = null
  }

  /**
   * Fetches raw image bytes.  Validates size and HEIC magic bytes.
   * If the server returns a correct HEIC MIME type but the URL has no .heic
   * extension, we still accept the blob.
   */
  private async fetchImageData(src: string): Promise<ArrayBuffer> {
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

    const blob = await response.blob()

    if (blob.size > CONFIG.MAX_FILE_SIZE) {
      throw new Error(ERROR_MESSAGES.FILE_TOO_LARGE)
    }

    const buffer = await blob.arrayBuffer()

    // Accept if magic bytes confirm HEIC, or if the MIME type is heic/heif.
    const mimeOk =
      blob.type === "image/heic" ||
      blob.type === "image/heif" ||
      blob.type === "image/heic-sequence" ||
      blob.type === "image/heif-sequence"

    if (!isHeicBuffer(buffer) && !mimeOk) {
      throw new Error(ERROR_MESSAGES.INVALID_FORMAT)
    }

    return buffer
  }

  // ── Single-frame conversion ─────────────────────────────────────────────

  private async convertSingleFrame(
    buffer: ArrayBuffer,
    options: ConversionOptions = {}
  ): Promise<string> {
    const { quality = CONFIG.CONVERSION_QUALITY, format = "png" } = options
    const blob = new Blob([buffer])
    const result = await heicTo({ blob, type: `image/${format}`, quality })
    return URL.createObjectURL(result)
  }

  // ── Animated (sequence) conversion ──────────────────────────────────────

  /**
   * Decodes all frames via `heic-decode` and replaces the <img> with an
   * animated <canvas>.  Falls back to single-frame on any error.
   */
  private async convertAnimatedToCanvas(
    img: HTMLImageElement,
    buffer: ArrayBuffer,
    options: ConversionOptions = {}
  ): Promise<string | null> {
    try {
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

      // Decode all frames eagerly (keeps frames alive until we've drawn them)
      const rawFrames = await Promise.all(frames.map((f) => f.decode()))
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
        ctx.putImageData(new ImageData(f.data, f.width, f.height), 0, 0)
        frameIndex = (frameIndex + 1) % rawFrames.length
      }

      drawFrame()

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

    // Persist original src for error-recovery click handlers
    if (!img.hasAttribute(DATA_ATTRIBUTES.ORIGINAL_SRC)) {
      img.setAttribute(DATA_ATTRIBUTES.ORIGINAL_SRC, originalSrc)
    }

    // Reuse an already-converted blob URL for this src
    if (this.urlCache.has(originalSrc)) {
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
        if (isAnimatedHeicBuffer(buffer)) {
          const canvasResult = await this.convertAnimatedToCanvas(img, buffer, options)
          if (canvasResult !== null) {
            // "animated-canvas" → canvas replaced the img; or null means fallback
            img.classList.remove("heic-processing")
            return { success: true }
          }
          // Fall through to single-frame below
        }

        // ── Single-frame path ──────────────────────────────────────────
        const objectURL = await this.convertSingleFrame(buffer, options)

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

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
        }
      }
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
    img.classList.add("heic-error")

    let errorType: ConversionError["type"] = "unknown"
    let errorMessage: string = error?.message ?? ERROR_MESSAGES.CONVERSION_FAILED
    let displayMessage = errorMessage

    if (
      errorMessage.includes("CORS") ||
      errorMessage.includes("cross-origin") ||
      errorMessage.includes("Access-Control-Allow-Origin")
    ) {
      errorType = "cors"
      errorMessage = ERROR_MESSAGES.CORS_ERROR
      displayMessage = "跨域访问被拒绝"
    } else if (errorMessage.includes("Failed to fetch") || errorMessage.includes("网络")) {
      errorType = "network"
      errorMessage = ERROR_MESSAGES.NETWORK_ERROR
      displayMessage = "网络请求失败"
    } else if (errorMessage.includes("50MB")) {
      errorType = "size"
      displayMessage = "文件过大"
    } else if (errorMessage.includes("格式") || errorMessage.includes("HEIC")) {
      errorType = "format"
      displayMessage = "格式不支持"
    } else if (errorMessage.includes("转换")) {
      errorType = "conversion"
      displayMessage = "转换失败"
    } else if (error?.name === "AbortError") {
      errorType = "network"
      displayMessage = "请求超时"
    }

    img.title = `${displayMessage} - 点击查看原图`
    img.style.filter = "grayscale(50%) opacity(0.8)"
    img.style.cursor = "pointer"
    img.setAttribute("data-error-type", errorType)
    img.setAttribute("data-error-message", displayMessage)

    img.onclick = (e: MouseEvent) => {
      e.preventDefault()
      if (errorType === "cors") {
        const confirmed = confirm(
          `图片因跨域限制无法转换。\n\n错误详情: ${displayMessage}\n\n是否在新窗口中查看原图？`
        )
        if (confirmed) window.open(originalSrc, "_blank")
      } else {
        window.open(originalSrc, "_blank")
      }
    }

    console.warn("🔴 HEIC转换失败:", {
      src: originalSrc,
      type: errorType,
      message: errorMessage,
      originalError: error,
    })

    return { success: false, error: { type: errorType, message: errorMessage, originalError: error } }
  }
}
