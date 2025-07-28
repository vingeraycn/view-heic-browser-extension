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
   * 从HEIC文件中提取帧（改进的模拟实现）
   * 创建具有视觉效果的动画帧
   */
  private async extractFrames(src: string): Promise<LivePhotoFrame[]> {
    try {
      const response = await fetch(src)
      const blob = await response.blob()

      // 创建canvas来生成不同的帧效果
      const img = new Image()
      const objectURL = URL.createObjectURL(blob)

      return new Promise((resolve, reject) => {
        img.onload = async () => {
          try {
            const frames: LivePhotoFrame[] = []
            const canvas = document.createElement("canvas")
            const ctx = canvas.getContext("2d")

            if (!ctx) {
              console.warn("无法创建canvas上下文，回退到静态图片")
              resolve([
                {
                  blob: blob,
                  timestamp: 0,
                },
              ])
              return
            }

            canvas.width = img.width
            canvas.height = img.height

            // 生成8帧动画效果
            for (let i = 0; i < 8; i++) {
              ctx.clearRect(0, 0, canvas.width, canvas.height)

              // 添加不同的视觉效果来模拟动画
              const progress = i / 7 // 0 到 1

              // 效果1: 轻微的缩放和透明度变化
              const scale = 1 + Math.sin(progress * Math.PI * 2) * 0.02 // 轻微缩放
              const alpha = 0.95 + Math.sin(progress * Math.PI * 2) * 0.05 // 轻微透明度变化

              ctx.save()
              ctx.globalAlpha = alpha
              ctx.translate(canvas.width / 2, canvas.height / 2)
              ctx.scale(scale, scale)
              ctx.translate(-canvas.width / 2, -canvas.height / 2)

              // 绘制原始图片
              ctx.drawImage(img, 0, 0)

              // 添加轻微的色彩变化
              if (i % 2 === 1) {
                ctx.globalCompositeOperation = "overlay"
                ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + progress * 0.05})`
                ctx.fillRect(0, 0, canvas.width, canvas.height)
              }

              ctx.restore()

              // 将canvas转换为blob
              const frameBlob = await new Promise<Blob>((resolveBlob) => {
                canvas.toBlob(
                  (blob) => {
                    resolveBlob(blob!)
                  },
                  "image/jpeg",
                  0.8
                )
              })

              frames.push({
                blob: frameBlob,
                timestamp: i * 125, // 每帧125ms间隔
              })
            }

            // 清理资源
            URL.revokeObjectURL(objectURL)
            resolve(frames)
          } catch (error) {
            URL.revokeObjectURL(objectURL)
            reject(error)
          }
        }

        img.onerror = () => {
          URL.revokeObjectURL(objectURL)
          reject(new Error("图片加载失败"))
        }

        img.src = objectURL
      })
    } catch (error) {
      console.error("生成Live Photo帧失败:", error)
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
