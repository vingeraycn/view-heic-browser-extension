/**
 * 多图HEIC处理器
 * 支持点击展开/折叠显示HEIC文件中的所有图片
 */

export interface MultiImageFrame {
  blob: Blob
  index: number
}

export interface MultiImageOptions {
  showIndicator: boolean
  expandOnClick: boolean
  maxImagesPerRow: number
}

export class MultiImageHandler {
  private expandedImages = new WeakSet<HTMLImageElement>()
  private originalContainers = new WeakMap<HTMLImageElement, HTMLElement>()
  private imageFrames = new WeakMap<HTMLImageElement, MultiImageFrame[]>()

  /**
   * 为多图HEIC添加展开功能
   */
  async addMultiImageSupport(
    img: HTMLImageElement,
    originalSrc: string,
    options: Partial<MultiImageOptions> = {}
  ): Promise<void> {
    const config: MultiImageOptions = {
      showIndicator: true,
      expandOnClick: true,
      maxImagesPerRow: 4,
      ...options,
    }

    try {
      // 获取所有图像帧
      const frames = await this.extractAllFrames(originalSrc)
      if (frames.length <= 1) {
        console.log("🖼️ 单图HEIC，跳过多图处理")
        return
      }

      // 缓存图像帧
      this.imageFrames.set(img, frames)

      // 添加多图指示器
      if (config.showIndicator) {
        this.addMultiImageIndicator(img, frames.length)
      }

      // 添加点击展开功能
      if (config.expandOnClick) {
        this.addClickToExpand(img, frames, config)
      }

      console.log(`📸 多图HEIC处理完成: ${frames.length} 张图片`)
    } catch (error) {
      console.warn("多图HEIC处理失败:", error)
    }
  }

  /**
   * 添加多图指示器
   */
  private addMultiImageIndicator(img: HTMLImageElement, count: number): void {
    // 为图片添加多图样式类
    img.classList.add("multi-image")

    // 创建多图标识
    const indicator = document.createElement("div")
    indicator.className = "multi-image-indicator"
    indicator.innerHTML = `📸 ${count}张`
    indicator.title = `包含 ${count} 张图片，点击展开查看`

    // 将指示器添加到图片容器中
    const container = img.parentElement
    if (container) {
      container.style.position = "relative"
      container.appendChild(indicator)
    }
  }

  /**
   * 添加点击展开功能
   */
  private addClickToExpand(img: HTMLImageElement, frames: MultiImageFrame[], options: MultiImageOptions): void {
    img.style.cursor = "pointer"

    const clickHandler = () => {
      if (this.expandedImages.has(img)) {
        this.collapseImages(img)
      } else {
        this.expandImages(img, frames, options)
      }
    }

    img.addEventListener("click", clickHandler)
  }

  /**
   * 展开显示所有图片
   */
  private expandImages(originalImg: HTMLImageElement, frames: MultiImageFrame[], options: MultiImageOptions): void {
    const container = originalImg.parentElement
    if (!container) return

    // 保存原始容器状态
    this.originalContainers.set(originalImg, container)

    // 隐藏原始图片
    originalImg.style.display = "none"

    // 创建展开容器
    const expandedContainer = document.createElement("div")
    expandedContainer.className = "multi-image-expanded"
    expandedContainer.style.cssText = `
      display: grid;
      grid-template-columns: repeat(${Math.min(options.maxImagesPerRow, frames.length)}, 1fr);
      gap: 8px;
      margin: 8px 0;
      border: 2px solid #3b82f6;
      border-radius: 8px;
      padding: 8px;
      background: #f8fafc;
    `

    // 添加标题
    const header = document.createElement("div")
    header.style.cssText = `
      grid-column: 1 / -1;
      text-align: center;
      font-size: 14px;
      color: #475569;
      margin-bottom: 4px;
      cursor: pointer;
    `
    header.innerHTML = `📸 共 ${frames.length} 张图片 (点击任意图片收起)`
    expandedContainer.appendChild(header)

    // 创建并添加所有图片
    frames.forEach((frame, index) => {
      const imgElement = document.createElement("img")
      const objectURL = URL.createObjectURL(frame.blob)

      imgElement.src = objectURL
      imgElement.alt = `图片 ${index + 1}`
      imgElement.style.cssText = `
        width: 100%;
        height: auto;
        border-radius: 4px;
        cursor: pointer;
        transition: transform 0.2s ease;
      `

      // 添加悬浮效果
      imgElement.addEventListener("mouseenter", () => {
        imgElement.style.transform = "scale(1.05)"
      })
      imgElement.addEventListener("mouseleave", () => {
        imgElement.style.transform = "scale(1)"
      })

      // 点击任意图片都能收起
      imgElement.addEventListener("click", (e) => {
        e.stopPropagation()
        this.collapseImages(originalImg)
      })

      expandedContainer.appendChild(imgElement)

      // 定时清理URL对象
      setTimeout(() => URL.revokeObjectURL(objectURL), 30000)
    })

    // 插入到容器中
    container.appendChild(expandedContainer)

    // 标记为已展开
    this.expandedImages.add(originalImg)

    // 添加点击收起功能
    header.addEventListener("click", () => {
      this.collapseImages(originalImg)
    })
  }

  /**
   * 折叠收起图片
   */
  private collapseImages(originalImg: HTMLImageElement): void {
    const container = this.originalContainers.get(originalImg)
    if (!container) return

    // 移除展开容器
    const expandedContainer = container.querySelector(".multi-image-expanded")
    if (expandedContainer) {
      expandedContainer.remove()
    }

    // 显示原始图片
    originalImg.style.display = ""

    // 移除展开标记
    this.expandedImages.delete(originalImg)
  }

  /**
   * 从HEIC文件中提取所有图像帧
   */
  private async extractAllFrames(src: string): Promise<MultiImageFrame[]> {
    try {
      // 动态导入heic-decode库
      const heicDecode = await import("heic-decode").catch(() => null)

      if (!heicDecode) {
        console.warn("heic-decode 库未安装，无法提取多图")
        return []
      }

      // 获取HEIC文件数据和所有图像
      const response = await fetch(src)
      const buffer = await response.arrayBuffer()
      const images = (await heicDecode.all({ buffer })) as any

      // 确保images是一个有效的数组
      if (!images || !Array.isArray(images)) {
        console.warn("heic-decode返回的不是有效数组:", images)
        return []
      }

      if (images.length <= 1) {
        if (typeof (images as any).dispose === "function") {
          ;(images as any).dispose()
        }
        return []
      }

      // 转换每个图像为blob
      const frames: MultiImageFrame[] = []
      for (let i = 0; i < images.length; i++) {
        try {
          const imageData = await images[i].decode()

          // 创建canvas并绘制图像数据
          const canvas = document.createElement("canvas")
          const ctx = canvas.getContext("2d")

          if (ctx && imageData.data) {
            canvas.width = imageData.width
            canvas.height = imageData.height

            const imgData = ctx.createImageData(imageData.width, imageData.height)
            // 确保imageData.data是Uint8ClampedArray类型
            if (imageData.data instanceof Uint8ClampedArray) {
              imgData.data.set(imageData.data)
            } else {
              console.warn("图像数据格式不正确:", typeof imageData.data)
              continue
            }
            ctx.putImageData(imgData, 0, 0)

            // 转换为blob
            const blob = await new Promise<Blob>((resolve) => {
              canvas.toBlob(
                (blob) => {
                  resolve(blob!)
                },
                "image/jpeg",
                0.9
              )
            })

            frames.push({
              blob,
              index: i,
            })
          }
        } catch (error) {
          console.warn(`提取第 ${i + 1} 张图片失败:`, error)
        }
      }

      // 清理资源
      if (typeof (images as any).dispose === "function") {
        ;(images as any).dispose()
      }

      return frames
    } catch (error) {
      console.error("提取多图帧失败:", error)
      return []
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // WeakMap和WeakSet会自动处理垃圾回收，无需手动清理
    // 如果有特殊清理需求，可以在这里添加
    console.log("🧹 多图处理器资源已清理")
  }
}
