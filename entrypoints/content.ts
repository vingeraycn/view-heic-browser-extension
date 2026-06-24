import { debounce } from "lodash-es"
import { CONFIG, SELECTORS } from "../utils/constants"
import { HEICConverter } from "../utils/heic-converter"

const STORE_REVIEW_URL =
  "https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge/reviews"
const ISSUE_URL = "https://github.com/vingeraycn/view-heic-browser-extension/issues/new"
const RATING_PROMPT_STORAGE_KEY = "viewHeicRatingPrompt"
const MIN_SUCCESSFUL_IMAGES_FOR_PROMPT = 5
const RATING_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000

interface RatingPromptState {
  successCount?: number
  lastPromptedAt?: number
  reviewClicked?: boolean
}

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

    .view-heic-rating-prompt {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483647;
      max-width: 360px;
      padding: 14px;
      border: 1px solid rgba(15, 23, 42, 0.12);
      border-radius: 12px;
      background: #ffffff;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.45;
    }

    .view-heic-rating-prompt__text {
      margin: 0 26px 12px 0;
    }

    .view-heic-rating-prompt__actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .view-heic-rating-prompt button {
      border: 0;
      border-radius: 8px;
      padding: 8px 10px;
      font: inherit;
      cursor: pointer;
    }

    .view-heic-rating-prompt__primary {
      background: #2563eb;
      color: #ffffff;
      font-weight: 700;
    }

    .view-heic-rating-prompt__secondary {
      background: #f1f5f9;
      color: #334155;
    }

    .view-heic-rating-prompt__close {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 24px;
      height: 24px;
      padding: 0;
      background: transparent;
      color: #64748b;
      font-size: 18px;
      line-height: 24px;
    }

    @media (max-width: 480px) {
      .view-heic-rating-prompt {
        right: 12px;
        bottom: 12px;
        left: 12px;
        max-width: none;
      }
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

  await maybeShowRatingPrompt(successCount, failureCount)
}

async function maybeShowRatingPrompt(successCount: number, failureCount: number): Promise<void> {
  if (successCount < MIN_SUCCESSFUL_IMAGES_FOR_PROMPT || failureCount > 0) return

  try {
    const stored = await browser.storage.local.get(RATING_PROMPT_STORAGE_KEY)
    const state: RatingPromptState = stored[RATING_PROMPT_STORAGE_KEY] ?? {}
    const now = Date.now()

    if (
      state.reviewClicked ||
      (state.lastPromptedAt && now - state.lastPromptedAt < RATING_PROMPT_COOLDOWN_MS)
    ) {
      return
    }

    const nextState = {
      ...state,
      successCount: (state.successCount ?? 0) + successCount,
      lastPromptedAt: now,
    }

    await browser.storage.local.set({ [RATING_PROMPT_STORAGE_KEY]: nextState })
    showRatingPrompt(successCount)
  } catch (error) {
    console.warn("View HEIC rating prompt skipped:", error)
  }
}

function showRatingPrompt(successCount: number): void {
  if (document.querySelector(".view-heic-rating-prompt")) return
  const copy = getRatingPromptCopy(successCount)

  const prompt = document.createElement("aside")
  prompt.className = "view-heic-rating-prompt"
  prompt.setAttribute("role", "status")

  const text = document.createElement("p")
  text.className = "view-heic-rating-prompt__text"
  text.textContent = copy.text

  const actions = document.createElement("div")
  actions.className = "view-heic-rating-prompt__actions"

  const reviewButton = document.createElement("button")
  reviewButton.className = "view-heic-rating-prompt__primary"
  reviewButton.type = "button"
  reviewButton.textContent = copy.review
  reviewButton.addEventListener("click", async () => {
    await browser.storage.local.set({
      [RATING_PROMPT_STORAGE_KEY]: { reviewClicked: true, lastPromptedAt: Date.now() },
    })
    window.open(STORE_REVIEW_URL, "_blank", "noopener")
    prompt.remove()
  })

  const feedbackButton = document.createElement("button")
  feedbackButton.className = "view-heic-rating-prompt__secondary"
  feedbackButton.type = "button"
  feedbackButton.textContent = copy.feedback
  feedbackButton.addEventListener("click", () => {
    window.open(ISSUE_URL, "_blank", "noopener")
    prompt.remove()
  })

  const closeButton = document.createElement("button")
  closeButton.className = "view-heic-rating-prompt__close"
  closeButton.type = "button"
  closeButton.setAttribute("aria-label", copy.close)
  closeButton.textContent = "×"
  closeButton.addEventListener("click", () => prompt.remove())

  actions.append(reviewButton, feedbackButton)
  prompt.append(closeButton, text, actions)
  document.body.appendChild(prompt)
}

function getRatingPromptCopy(successCount: number): { text: string; review: string; feedback: string; close: string } {
  if (navigator.language.toLowerCase().startsWith("zh")) {
    return {
      text: `View HEIC 插件帮你显示了 ${successCount} 张图片，如果觉得有帮助，请为我们好评，这将帮助更多需要的人。`,
      review: "去商店好评",
      feedback: "反馈问题",
      close: "关闭",
    }
  }

  return {
    text: `View HEIC helped you display ${successCount} images. If it was useful, please leave us a good review so more people who need it can find it.`,
    review: "Review in store",
    feedback: "Report issue",
    close: "Close",
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
