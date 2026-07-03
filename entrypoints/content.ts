import { debounce } from "lodash-es"
import { CONFIG, SELECTORS } from "../utils/constants"
import { hasHeifExtension, isHeifMimeType } from "../utils/heif-format"
import { HEICConverter } from "../utils/heic-converter"
import type { AnalyticsEventName, AnalyticsParams } from "../utils/analytics"
import type { ConversionError } from "../utils/types"

const STORE_REVIEW_URL =
  "https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge/reviews"
const ISSUE_URL = "https://github.com/vingeraycn/view-heic-browser-extension/issues/new"
const RATING_PROMPT_STORAGE_KEY = "viewHeicRatingPrompt"
const MIN_SUCCESSFUL_IMAGES_FOR_PROMPT = 11
const RATING_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000
const mimeOnlyProbeCache = new Set<string>()

type ConversionTrigger = "initial" | "mutation"
type ConversionErrorType = ConversionError["type"] | "mixed"

interface RatingPromptState {
  successCount?: number
  failureCount?: number
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
    await processHEICImages(converter, "initial")

    // 监听动态加载的图片
    observeHEICImages(converter)
    observeFailedImageLoads(converter)

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
      transform-origin: right bottom;
      animation: view-heic-rating-prompt-enter 180ms cubic-bezier(0.16, 1, 0.3, 1);
      will-change: opacity, transform;
    }

    .view-heic-rating-prompt--leaving {
      pointer-events: none;
      animation: view-heic-rating-prompt-exit 140ms cubic-bezier(0.4, 0, 1, 1) forwards;
    }

    @keyframes view-heic-rating-prompt-enter {
      from {
        opacity: 0;
        transform: translateY(18px) scale(0.96);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes view-heic-rating-prompt-exit {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      to {
        opacity: 0;
        transform: translateY(10px) scale(0.98);
      }
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

    @media (prefers-reduced-motion: reduce) {
      .view-heic-rating-prompt,
      .view-heic-rating-prompt--leaving {
        animation: none;
      }
    }
  `
  document.head.appendChild(style)
}

/**
 * 处理页面中的所有HEIC图片
 */
async function processHEICImages(converter: HEICConverter, trigger: ConversionTrigger): Promise<void> {
  const images = findHEICImages(document)

  if (images.length === 0) {
    return
  }

  console.log(`📷 发现 ${images.length} 张HEIC图片，开始转换...`)
  sendAnalyticsEvent("heic_detected", { image_count: images.length })

  const results = await converter.convertAllImages(images)

  // 统计转换结果
  const successCount = results.filter((r) => r.success).length
  const failureCount = results.length - successCount
  const errorType = getAggregateErrorType(
    results
      .filter((r) => !r.success)
      .map((r) => r.error?.type)
      .filter(Boolean) as ConversionError["type"][]
  )

  console.log(`✅ 转换完成: ${successCount} 成功, ${failureCount} 失败`)

  if (successCount > 0) {
    sendAnalyticsEvent("conversion_success", { success_count: successCount, trigger })
  }

  if (failureCount > 0) {
    sendAnalyticsEvent("conversion_failed", {
      failure_count: failureCount,
      error_type: errorType ?? "unknown",
      trigger,
    })
    console.warn("⚠️ 部分图片转换失败，可能是由于CORS限制或格式问题")
  }

  await maybeShowRatingPrompt(successCount, failureCount)
}

function getImageSrc(img: HTMLImageElement): string {
  return img.src
}

function isHEICImageCandidate(img: HTMLImageElement): boolean {
  return hasHeifExtension(getImageSrc(img))
}

function findHEICImages(root: ParentNode): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>(SELECTORS.IMAGE_CANDIDATES)).filter(isHEICImageCandidate)
}

async function maybeShowRatingPrompt(successCount: number, failureCount: number): Promise<void> {
  if (import.meta.env.FIREFOX || successCount === 0) return

  try {
    const stored = await browser.storage.local.get(RATING_PROMPT_STORAGE_KEY)
    const state: RatingPromptState = stored[RATING_PROMPT_STORAGE_KEY] ?? {}
    const now = Date.now()
    const nextSuccessCount = (state.successCount ?? 0) + successCount
    const nextFailureCount = (state.failureCount ?? 0) + failureCount

    if (
      state.reviewClicked ||
      (state.lastPromptedAt && now - state.lastPromptedAt < RATING_PROMPT_COOLDOWN_MS)
    ) {
      return
    }

    if (nextSuccessCount < MIN_SUCCESSFUL_IMAGES_FOR_PROMPT) {
      await browser.storage.local.set({
        [RATING_PROMPT_STORAGE_KEY]: {
          ...state,
          successCount: nextSuccessCount,
          failureCount: nextFailureCount,
        },
      })
      return
    }

    await browser.storage.local.set({
      [RATING_PROMPT_STORAGE_KEY]: {
        ...state,
        successCount: nextSuccessCount,
        failureCount: nextFailureCount,
        lastPromptedAt: now,
      },
    })
    sendAnalyticsEvent("review_prompt_shown", { success_total: nextSuccessCount })
    showRatingPrompt(nextSuccessCount, nextFailureCount)
  } catch (error) {
    console.warn("View HEIC rating prompt skipped:", error)
  }
}

function showRatingPrompt(successCount: number, failureCount: number): void {
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
    window.open(STORE_REVIEW_URL, "_blank", "noopener")
    await sendAnalyticsEvent("review_prompt_clicked", { success_total: successCount })
    await browser.storage.local.set({
      [RATING_PROMPT_STORAGE_KEY]: {
        successCount,
        failureCount,
        reviewClicked: true,
        lastPromptedAt: Date.now(),
      },
    })
    dismissRatingPrompt(prompt)
  })

  const feedbackButton = document.createElement("button")
  feedbackButton.className = "view-heic-rating-prompt__secondary"
  feedbackButton.type = "button"
  feedbackButton.textContent = copy.feedback
  feedbackButton.addEventListener("click", async () => {
    window.open(ISSUE_URL, "_blank", "noopener")
    await sendAnalyticsEvent("feedback_clicked", { failure_total: failureCount })
    dismissRatingPrompt(prompt)
  })

  const closeButton = document.createElement("button")
  closeButton.className = "view-heic-rating-prompt__close"
  closeButton.type = "button"
  closeButton.setAttribute("aria-label", copy.close)
  closeButton.textContent = "×"
  closeButton.addEventListener("click", async () => {
    await sendAnalyticsEvent("review_prompt_dismissed", { success_total: successCount })
    dismissRatingPrompt(prompt)
  })

  actions.append(reviewButton, feedbackButton)
  prompt.append(closeButton, text, actions)
  document.body.appendChild(prompt)
}

function dismissRatingPrompt(prompt: HTMLElement): void {
  if (prompt.classList.contains("view-heic-rating-prompt--leaving")) return
  prompt.classList.add("view-heic-rating-prompt--leaving")
  prompt.addEventListener("animationend", () => prompt.remove(), { once: true })
}

function getRatingPromptCopy(successCount: number): { text: string; review: string; feedback: string; close: string } {
  if (navigator.language.toLowerCase().startsWith("zh")) {
    return {
      text: `View HEIC 插件帮你显示了 ${successCount} 张图片，如果觉得有帮助，请为我们评价，这将帮助更多需要的人。`,
      review: "去商店评价",
      feedback: "反馈问题",
      close: "关闭",
    }
  }

  return {
    text: `View HEIC helped you display ${successCount} images. If it was useful, please leave us a review so more people who need it can find it.`,
    review: "Review in store",
    feedback: "Report issue",
    close: "Close",
  }
}

function getAggregateErrorType(errorTypes: ConversionError["type"][]): ConversionErrorType | undefined {
  if (errorTypes.length === 0) return undefined
  const first = errorTypes[0]
  return errorTypes.every((type) => type === first) ? first : "mixed"
}

async function sendAnalyticsEvent(name: AnalyticsEventName, params: AnalyticsParams = {}): Promise<boolean> {
  try {
    return Boolean(await browser.runtime.sendMessage({ type: "analytics:event", name, params }))
  } catch (error) {
    console.warn("View HEIC analytics message failed:", error)
    return false
  }
}

/**
 * 监听DOM变化，处理动态添加的HEIC图片
 */
function observeHEICImages(converter: HEICConverter): void {
  const debouncedProcess = debounce(
    () => {
      processHEICImages(converter, "mutation")
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
              if (isHEICImageCandidate(img)) {
                hasNewImages = true
                break
              }
            } else if (findHEICImages(element).length > 0) {
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
        if (isHEICImageCandidate(img)) {
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

function isSameOriginUrl(src: string): boolean {
  try {
    return new URL(src, location.href).origin === location.origin
  } catch {
    return false
  }
}

function observeFailedImageLoads(converter: HEICConverter): void {
  document.addEventListener(
    "error",
    async (event) => {
      if (!(event.target instanceof HTMLImageElement)) return

      const img = event.target
      const src = getImageSrc(img)
      if (!src || hasHeifExtension(src) || !isSameOriginUrl(src) || mimeOnlyProbeCache.has(src)) return
      mimeOnlyProbeCache.add(src)

      try {
        const response = await fetch(src, { method: "HEAD" })
        if (!response.ok || !isHeifMimeType(response.headers.get("content-type") ?? "")) return

        await converter.convertImage(img, { ignoreInvalidFormat: true })
      } catch {
        // Ignore ordinary broken images and cross-origin probes we cannot classify.
      }
    },
    true
  )
}
