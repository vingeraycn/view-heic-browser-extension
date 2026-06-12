import { debounce } from "lodash-es"
import { CONFIG, SELECTORS } from "../utils/constants"
import { HEICConverter } from "../utils/heic-converter"

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_end",
  async main() {
    console.log("🖼️ View HEIC Extension Loaded")

    // 注入样式
    injectStyles()

    const converter = new HEICConverter()

    // 初始处理页面中的HEIC图片
    await processHEICImages(converter)

    // 监听动态加载的图片
    observeHEICImages(converter)

    // 页面卸载时清理资源
    window.addEventListener("beforeunload", () => {
      converter.cleanup()
    })
  },
})

/**
 * 注入样式到页面
 */
function injectStyles(): void {
  const style = document.createElement("style")
  style.textContent = `
    /* HEIC图片处理状态样式 */
    .heic-processing {
      position: relative;
      opacity: 0.7;
      transition: opacity 0.3s ease;
    }

    .heic-processing::after {
      content: "🔄 转换中...";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 1000;
      pointer-events: none;
    }

    .heic-converted {
      opacity: 1;
      transition: opacity 0.3s ease;
    }

    .heic-error {
      position: relative;
      opacity: 0.8;
      filter: grayscale(50%);
      cursor: pointer;
    }

    .heic-error::after {
      content: "❌ 转换失败 - 点击查看原图";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 107, 107, 0.9);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 1000;
      pointer-events: none;
    }

    .heic-error:hover {
      opacity: 1;
      filter: grayscale(0%);
    }
  `
  document.head.appendChild(style)
}

/**
 * 处理页面中的所有HEIC图片
 */
async function processHEICImages(converter: HEICConverter): Promise<void> {
  const images = document.querySelectorAll<HTMLImageElement>(SELECTORS.HEIC_IMAGES)

  if (images.length === 0) {
    return
  }

  console.log(`📷 发现 ${images.length} 张HEIC图片，开始转换...`)

  const results = await converter.convertAllImages(images)

  // 统计转换结果
  const successCount = results.filter((r) => r.success).length
  const failureCount = results.length - successCount

  console.log(`✅ 转换完成: ${successCount} 成功, ${failureCount} 失败`)

  if (failureCount > 0) {
    console.warn("⚠️ 部分图片转换失败，可能是由于CORS限制或格式问题")
  }
}

/**
 * 监听DOM变化，处理动态添加的HEIC图片
 */
function observeHEICImages(converter: HEICConverter): void {
  const debouncedProcess = debounce(
    () => {
      processHEICImages(converter)
    },
    CONFIG.DEBOUNCE_DELAY,
    {
      trailing: true,
      leading: false,
    }
  )

  const observer = new MutationObserver((mutations) => {
    let hasNewImages = false

    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        // 检查新增的节点是否包含img元素
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element

            // 检查节点本身或其子元素是否为HEIC图片
            if (element.tagName === "IMG") {
              const img = element as HTMLImageElement
              if (img.matches(SELECTORS.HEIC_IMAGES)) {
                hasNewImages = true
                break
              }
            } else if (element.querySelector && element.querySelector(SELECTORS.HEIC_IMAGES)) {
              hasNewImages = true
              break
            }
          }
        }
      }

      if (hasNewImages) break

      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "src" &&
        mutation.target instanceof HTMLImageElement
      ) {
        const img = mutation.target
        if (img.matches(SELECTORS.HEIC_IMAGES)) {
          converter.resetImageProcessed(img)
          hasNewImages = true
        }
      }
    }

    if (hasNewImages) {
      console.log("🔄 检测到新的HEIC图片，准备处理...")
      debouncedProcess()
    }
  })

  observer.observe(document.body, {
    childList: true,
    attributes: true,
    attributeFilter: ["src"],
    subtree: true,
  })
}
