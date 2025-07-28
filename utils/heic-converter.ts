import { heicTo } from "heic-to"
import { CONFIG, DATA_ATTRIBUTES, ERROR_MESSAGES } from "./constants"
import { LivePhotoHandler } from "./live-photo-handler"
import type { ConversionError, ConversionOptions, ConversionResult } from "./types"

/**
 * 改进的HEIC转换器类
 */
export class HEICConverter {
  private processedImages = new WeakSet<HTMLImageElement>()
  private processingQueue = new Map<HTMLImageElement, Promise<void>>()
  private urlCache = new Map<string, string>()
  private livePhotoHandler = new LivePhotoHandler()
  private livePhotoCache = new Map<string, boolean>() // 缓存Live Photo检测结果

  /**
   * 检查图片是否已处理
   */
  private isImageProcessed(img: HTMLImageElement): boolean {
    return this.processedImages.has(img) || img.hasAttribute(DATA_ATTRIBUTES.PROCESSED)
  }

  /**
   * 标记图片为已处理
   */
  private markImageAsProcessed(img: HTMLImageElement): void {
    this.processedImages.add(img)
    img.setAttribute(DATA_ATTRIBUTES.PROCESSED, "true")
  }

  /**
   * 专业的Live Photo检测 - 通过检测HEIC文件中的图像数量
   * 如果包含多个图像，则为Live Photo
   */
  private async isLivePhoto(originalSrc: string): Promise<boolean> {
    try {
      // 检查缓存
      if (this.livePhotoCache.has(originalSrc)) {
        return this.livePhotoCache.get(originalSrc)!
      }

      // 动态导入heic-decode库（因为它可能不总是被使用）
      const heicDecode = await import("heic-decode").catch(() => null)

      if (!heicDecode) {
        // 如果没有heic-decode库，回退到基本检测
        console.warn("heic-decode 库未安装，无法准确检测 Live Photo")
        this.livePhotoCache.set(originalSrc, false)
        return false
      }

      // 获取HEIC文件数据
      const response = await fetch(originalSrc)
      const buffer = await response.arrayBuffer()

      // 检测文件中的所有图像
      const images = (await heicDecode.all({ buffer })) as any

      // 如果包含多个图像，则为Live Photo
      const isLive = images.length > 1

      // 清理资源（dispose方法存在但类型声明中可能缺失）
      if (typeof images.dispose === "function") {
        images.dispose()
      }

      // 缓存结果
      this.livePhotoCache.set(originalSrc, isLive)

      if (isLive) {
        console.log(`🎬 检测到 Live Photo: ${originalSrc}，包含 ${images.length} 个图像`)
      }

      return isLive
    } catch (error) {
      console.warn("Live Photo 检测失败，视为静态图片:", error)
      this.livePhotoCache.set(originalSrc, false)
      return false
    }
  }

  /**
   * 验证和获取图片数据
   */
  private async fetchImageData(src: string): Promise<Blob> {
    try {
      const response = await fetch(src)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const blob = await response.blob()

      // 检查文件大小
      if (blob.size > CONFIG.MAX_FILE_SIZE) {
        throw new Error(ERROR_MESSAGES.FILE_TOO_LARGE)
      }

      // 验证HEIC格式（简单检查，因为isHeic需要File类型）
      if (!this.isValidHeicBlob(blob)) {
        throw new Error(ERROR_MESSAGES.INVALID_FORMAT)
      }

      return blob
    } catch (error: any) {
      if (error.name === "TypeError" && error.message.includes("Failed to fetch")) {
        throw new Error(ERROR_MESSAGES.CORS_ERROR)
      }
      throw error
    }
  }

  /**
   * 转换HEIC到目标格式
   */
  private async convertHeicBlob(blob: Blob, options: ConversionOptions = {}): Promise<Blob> {
    const { quality = CONFIG.CONVERSION_QUALITY, format = "png" } = options

    try {
      const result = await heicTo({
        blob,
        type: `image/${format}`,
        quality,
      })

      return result
    } catch (error) {
      throw new Error(`${ERROR_MESSAGES.CONVERSION_FAILED}: ${error}`)
    }
  }

  /**
   * 处理单张图片
   */
  async convertImage(img: HTMLImageElement, options: ConversionOptions = {}): Promise<ConversionResult> {
    // 检查是否已处理
    if (this.isImageProcessed(img)) {
      return { success: true }
    }

    // 检查并发限制
    if (this.processingQueue.size >= CONFIG.MAX_CONCURRENT) {
      return {
        success: false,
        error: {
          type: "unknown",
          message: "处理队列已满，请稍后重试",
        },
      }
    }

    const originalSrc = img.src
    const { maxRetries = CONFIG.RETRY_ATTEMPTS } = options

    // 保存原始链接
    if (!img.hasAttribute(DATA_ATTRIBUTES.ORIGINAL_SRC)) {
      img.setAttribute(DATA_ATTRIBUTES.ORIGINAL_SRC, originalSrc)
    }

    // 添加处理中样式
    img.classList.add("heic-processing")

    let attempts = 0
    while (attempts < maxRetries) {
      try {
        // 获取图片数据
        const imageBlob = await this.fetchImageData(originalSrc)

        // 转换格式
        const convertedBlob = await this.convertHeicBlob(imageBlob, options)

        // 清理旧的blob URL
        if (img.src.startsWith("blob:")) {
          URL.revokeObjectURL(img.src)
        }

        // 创建新的blob URL
        const objectURL = URL.createObjectURL(convertedBlob)
        this.urlCache.set(originalSrc, objectURL)

        // 更新图片源
        img.src = objectURL
        img.classList.remove("heic-processing")
        img.classList.add("heic-converted")

        // 检查是否为Live Photo并添加支持
        if (await this.isLivePhoto(originalSrc)) {
          this.livePhotoHandler.addLivePhotoSupport(img, originalSrc, {
            hoverToPlay: true,
            loop: true,
            frameRate: 10, // 提高帧率，从8fps改为10fps
          })
        }

        // 标记为已处理
        this.markImageAsProcessed(img)

        return { success: true, blob: convertedBlob }
      } catch (error: any) {
        attempts++
        console.warn(`HEIC转换尝试 ${attempts}/${maxRetries} 失败:`, error.message)

        if (attempts >= maxRetries) {
          return this.handleConversionError(img, error, originalSrc)
        }

        // 短暂延迟后重试
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempts))
      }
    }

    return {
      success: false,
      error: {
        type: "unknown",
        message: "未知错误",
      },
    }
  }

  /**
   * 处理转换错误
   */
  private handleConversionError(img: HTMLImageElement, error: any, originalSrc: string): ConversionResult {
    img.classList.remove("heic-processing")
    img.classList.add("heic-error")

    // 确定错误类型
    let errorType: ConversionError["type"] = "unknown"
    let errorMessage = error.message || ERROR_MESSAGES.CONVERSION_FAILED
    let displayMessage = errorMessage

    if (
      errorMessage.includes("CORS") ||
      errorMessage.includes("cross-origin") ||
      errorMessage.includes("Access-Control-Allow-Origin")
    ) {
      errorType = "cors"
      errorMessage = ERROR_MESSAGES.CORS_ERROR
      displayMessage = "跨域访问被拒绝"
    } else if (errorMessage.includes("Failed to fetch")) {
      errorType = "network"
      errorMessage = ERROR_MESSAGES.NETWORK_ERROR
      displayMessage = "网络请求失败"
    } else if (errorMessage.includes("50MB")) {
      errorType = "size"
      displayMessage = "文件过大"
    } else if (errorMessage.includes("格式")) {
      errorType = "format"
      displayMessage = "格式不支持"
    } else if (errorMessage.includes("转换")) {
      errorType = "conversion"
      displayMessage = "转换失败"
    } else if (error.name === "AbortError") {
      errorType = "network"
      displayMessage = "请求超时"
    }

    // 添加详细的视觉提示
    img.title = `${displayMessage} - 点击查看原图`
    img.style.filter = "grayscale(50%) opacity(0.8)"
    img.style.cursor = "pointer"
    img.style.border = "2px dashed #ff6b6b"

    // 添加错误信息到图片上
    img.setAttribute("data-error-type", errorType)
    img.setAttribute("data-error-message", displayMessage)

    // 添加点击查看原图功能
    const clickHandler = (e: Event) => {
      e.preventDefault()
      if (errorType === "cors") {
        // 对于CORS错误，尝试在新窗口打开
        const confirmed = confirm(`图片因跨域限制无法转换。\n\n错误详情: ${displayMessage}\n\n是否在新窗口中查看原图？`)
        if (confirmed) {
          window.open(originalSrc, "_blank")
        }
      } else {
        window.open(originalSrc, "_blank")
      }
    }

    img.removeEventListener("click", clickHandler) // 防止重复绑定
    img.addEventListener("click", clickHandler)

    // 控制台输出详细错误信息
    console.warn(`🔴 HEIC转换失败:`, {
      src: originalSrc,
      type: errorType,
      message: errorMessage,
      originalError: error,
    })

    const conversionError: ConversionError = {
      type: errorType,
      message: errorMessage,
      originalError: error,
    }

    return { success: false, error: conversionError }
  }

  /**
   * 简单的HEIC格式验证
   */
  private isValidHeicBlob(blob: Blob): boolean {
    // 检查MIME类型
    return (
      blob.type === "image/heic" ||
      blob.type === "image/heif" ||
      blob.type === "" || // 有时服务器不返回正确的MIME类型
      blob.size > 0
    ) // 基本的文件存在检查
  }

  /**
   * 批量处理图片
   */
  async convertAllImages(
    images: NodeListOf<HTMLImageElement> | HTMLImageElement[],
    options: ConversionOptions = {}
  ): Promise<ConversionResult[]> {
    const results: ConversionResult[] = []
    const imageArray = Array.from(images)

    // 分批处理，避免过载
    for (let i = 0; i < imageArray.length; i += CONFIG.MAX_CONCURRENT) {
      const batch = imageArray.slice(i, i + CONFIG.MAX_CONCURRENT)
      const batchPromises = batch.map((img) => this.convertImage(img, options))
      const batchResults = await Promise.allSettled(batchPromises)

      batchResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          results.push(result.value)
        } else {
          results.push({
            success: false,
            error: {
              type: "unknown",
              message: result.reason?.message || "Promise rejected",
            },
          })
        }
      })
    }

    return results
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 清理所有blob URLs
    this.urlCache.forEach((url) => {
      URL.revokeObjectURL(url)
    })
    this.urlCache.clear()
    this.processingQueue.clear()

    // 清理Live Photo缓存
    this.livePhotoCache.clear()

    // 清理Live Photo处理器
    this.livePhotoHandler.cleanup()
  }
}
