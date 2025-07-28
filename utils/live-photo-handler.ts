/**
 * Live Photo (动态HEIC) 处理器
 * 支持鼠标悬浮播放动态HEIC图片
 */

export interface LivePhotoFrame {
  blob: Blob
  timestamp: number
}

export interface LivePhotoOptions {
  autoPlay: boolean
  loop: boolean
  frameRate: number // frames per second
  hoverToPlay: boolean
}

export class LivePhotoHandler {
  private frames: Map<string, LivePhotoFrame[]> = new Map()
  private animationFrames: Map<HTMLImageElement, number> = new Map()
  private isAnimating: Map<HTMLImageElement, boolean> = new Map()

  /**
   * 检测是否为Live Photo格式的HEIC
   */
  async isLivePhoto(blob: Blob): Promise<boolean> {
    try {
      // 简单的启发式检测：Live Photo通常文件较大且包含多帧
      // 实际项目中可能需要更复杂的格式检测
      return blob.size > 500 * 1024 // 大于500KB的HEIC文件可能是Live Photo
    } catch (error) {
      return false
    }
  }

  /**
   * 为图片元素添加Live Photo悬浮播放功能
   */
  addLivePhotoSupport(img: HTMLImageElement, originalSrc: string, options: Partial<LivePhotoOptions> = {}): void {
    const config: LivePhotoOptions = {
      autoPlay: false,
      loop: true,
      frameRate: 12,
      hoverToPlay: true,
      ...options,
    }

    // 添加Live Photo指示器
    this.addLivePhotoIndicator(img)

    if (config.hoverToPlay) {
      // 鼠标悬浮开始播放
      img.addEventListener("mouseenter", () => {
        this.startAnimation(img, originalSrc, config)
      })

      // 鼠标离开停止播放
      img.addEventListener("mouseleave", () => {
        this.stopAnimation(img)
      })
    }

    if (config.autoPlay) {
      // 页面加载后自动播放
      setTimeout(() => {
        this.startAnimation(img, originalSrc, config)
      }, 1000)
    }
  }

  /**
   * 添加Live Photo视觉指示器
   */
  private addLivePhotoIndicator(img: HTMLImageElement): void {
    // 为图片添加Live Photo样式类
    img.classList.add("live-photo")

    // 创建Live Photo标识
    const indicator = document.createElement("div")
    indicator.className = "live-photo-indicator"
    indicator.innerHTML = "📹 LIVE"

    // 将指示器添加到图片容器中
    const container = img.parentElement
    if (container) {
      container.style.position = "relative"
      container.appendChild(indicator)
    }
  }

  /**
   * 开始播放动画
   */
  private async startAnimation(img: HTMLImageElement, originalSrc: string, options: LivePhotoOptions): Promise<void> {
    if (this.isAnimating.get(img)) {
      return
    }

    this.isAnimating.set(img, true)
    img.classList.add("live-photo-playing")

    try {
      // 模拟从Live Photo中提取帧（实际应用中需要使用专门的库）
      const frames = await this.extractFrames(originalSrc)

      if (frames.length > 1) {
        await this.playFrames(img, frames, options)
      }
    } catch (error) {
      console.warn("Live Photo播放失败:", error)
    }
  }

  /**
   * 停止播放动画
   */
  private stopAnimation(img: HTMLImageElement): void {
    this.isAnimating.set(img, false)
    img.classList.remove("live-photo-playing")

    const animationId = this.animationFrames.get(img)
    if (animationId) {
      cancelAnimationFrame(animationId)
      this.animationFrames.delete(img)
    }
  }

  /**
   * 播放帧序列
   */
  private async playFrames(img: HTMLImageElement, frames: LivePhotoFrame[], options: LivePhotoOptions): Promise<void> {
    let currentFrame = 0
    const frameInterval = 1000 / options.frameRate

    const playNextFrame = () => {
      if (!this.isAnimating.get(img)) {
        return
      }

      const frame = frames[currentFrame]
      if (frame) {
        const objectURL = URL.createObjectURL(frame.blob)
        img.src = objectURL

        // 清理之前的URL
        setTimeout(() => URL.revokeObjectURL(objectURL), frameInterval * 2)
      }

      currentFrame++

      if (currentFrame >= frames.length) {
        if (options.loop) {
          currentFrame = 0
        } else {
          this.stopAnimation(img)
          return
        }
      }

      const animationId = requestAnimationFrame(() => {
        setTimeout(playNextFrame, frameInterval)
      })

      this.animationFrames.set(img, animationId)
    }

    playNextFrame()
  }

  /**
   * 从HEIC文件中提取帧（模拟实现）
   * 实际项目中需要使用支持Live Photo的库
   */
  private async extractFrames(src: string): Promise<LivePhotoFrame[]> {
    try {
      // TODO: 这里应该使用真正的Live Photo解析库
      // 现在只是模拟多帧效果
      const response = await fetch(src)
      const blob = await response.blob()

      // 模拟生成多个帧（实际应该从HEIC中提取）
      const frames: LivePhotoFrame[] = []
      for (let i = 0; i < 6; i++) {
        frames.push({
          blob: blob, // 实际应该是不同的帧
          timestamp: i * 166, // 模拟时间戳
        })
      }

      return frames
    } catch (error) {
      console.error("提取Live Photo帧失败:", error)
      return []
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 停止所有动画
    for (const [img] of this.isAnimating) {
      this.stopAnimation(img)
    }

    // 清理缓存
    this.frames.clear()
    this.animationFrames.clear()
    this.isAnimating.clear()
  }
}
