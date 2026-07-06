import { debounce } from "lodash-es"
import { CONFIG, SELECTORS } from "../utils/constants"
import { hasHeifExtension, isHeifMimeType } from "../utils/heif-format"
import { HEICConverter, convertHeifFileToJpegFile } from "../utils/heic-converter"
import type { AnalyticsEventName, AnalyticsParams } from "../utils/analytics"
import type { ConversionError } from "../utils/types"

const STORE_REVIEW_URL =
  "https://chromewebstore.google.com/detail/view-heic/kpbcokcekojhfifjkbglcbaiffegecge/reviews"
const ISSUE_URL = "https://github.com/vingeraycn/view-heic-browser-extension/issues/new"
const RATING_PROMPT_STORAGE_KEY = "viewHeicRatingPrompt"
const MIN_SUCCESSFUL_IMAGES_FOR_PROMPT = 11
const RATING_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000
const UPLOAD_REQUEST_EVENT = "view-heic-upload-request"
const UPLOAD_REPLAY_ATTRIBUTE = "data-view-heic-upload-replayed"
const mimeOnlyProbeCache = new Set<string>()

type ConversionTrigger = "initial" | "mutation"
type ConversionErrorType = ConversionError["type"] | "mixed"
type ConversionResults = Awaited<ReturnType<HEICConverter["convertAllImages"]>>
type UploadToastType = "loading" | "success" | "error"

interface RatingPromptState {
  successCount?: number
  failureCount?: number
  lastPromptedAt?: number
  reviewClicked?: boolean
}

let uploadToastContainer: HTMLElement | undefined

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  async main() {
    console.log("🖼️ View HEIC Extension Loaded")

    const converter = new HEICConverter()
    observeHEICUploads()
    observeFailedImageLoads(converter)

    await domReady()
    injectStyles()
    await processHEICImages(converter, "initial")
    observeHEICImages(converter)

    // 页面卸载时清理资源
    window.addEventListener("beforeunload", () => {
      converter.cleanup()
    })
  },
})

function domReady(): Promise<void> {
  if (document.readyState !== "loading") {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true })
  })
}

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
  await recordConversionResults(results, trigger)
}

async function recordConversionResults(results: ConversionResults, trigger: ConversionTrigger): Promise<void> {
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

function observeHEICUploads(): void {
  window.addEventListener(UPLOAD_REQUEST_EVENT, handleUploadChange, true)
  window.addEventListener("drop", handleUploadDrop, true)
}

async function handleUploadChange(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "file") return

  const input = event.target
  const files = Array.from(input.files ?? [])
  const heifCount = files.filter(isHEIFUploadCandidate).length
  if (heifCount === 0) return

  event.preventDefault()
  event.stopImmediatePropagation()

  const loadingToast = showUploadToast("loading", getUploadLoadingMessage(heifCount))

  try {
    const convertedFiles = await convertUploadFiles(files)
    const dataTransfer = new DataTransfer()
    convertedFiles.forEach((file) => dataTransfer.items.add(file))
    input.files = dataTransfer.files

    input.setAttribute(UPLOAD_REPLAY_ATTRIBUTE, "true")
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))

    dismissUploadToast(loadingToast)
    showUploadToast("success", getUploadSuccessMessage(heifCount), { durationMs: 3000 })
  } catch (error) {
    dismissUploadToast(loadingToast)
    input.removeAttribute(UPLOAD_REPLAY_ATTRIBUTE)
    input.value = ""
    console.warn("View HEIC upload conversion failed:", error)
    showUploadToast("error", getUploadErrorMessage(heifCount), { durationMs: 5000 })
  }
}

async function handleUploadDrop(event: DragEvent): Promise<void> {
  const files = Array.from(event.dataTransfer?.files ?? [])
  const heifCount = files.filter(isHEIFUploadCandidate).length
  if (heifCount === 0) return

  const target = event.target
  if (!(target instanceof EventTarget)) return

  event.preventDefault()
  event.stopImmediatePropagation()

  const loadingToast = showUploadToast("loading", getUploadLoadingMessage(heifCount))

  try {
    const convertedFiles = await convertUploadFiles(files)
    const dataTransfer = new DataTransfer()
    convertedFiles.forEach((file) => dataTransfer.items.add(file))

    target.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      })
    )

    dismissUploadToast(loadingToast)
    showUploadToast("success", getUploadSuccessMessage(heifCount), { durationMs: 3000 })
  } catch (error) {
    dismissUploadToast(loadingToast)
    console.warn("View HEIC drag upload conversion failed:", error)
    showUploadToast("error", getUploadErrorMessage(heifCount), { durationMs: 5000 })
  }
}

async function convertUploadFiles(files: File[]): Promise<File[]> {
  const convertedFiles: File[] = []

  for (const file of files) {
    convertedFiles.push(isHEIFUploadCandidate(file) ? await convertHeifFileToJpegFile(file) : file)
  }

  return convertedFiles
}

function isHEIFUploadCandidate(file: File): boolean {
  return hasHeifExtension(file.name) || isHeifMimeType(file.type)
}

function getUploadLoadingMessage(count: number): string {
  return count > 1 ? `View HEIC 正在将 ${count} 张 HEIC 转为 JPG...` : "View HEIC 正在将 HEIC 转为 JPG..."
}

function getUploadSuccessMessage(count: number): string {
  return count > 1 ? `View HEIC 已将 ${count} 张图片转为 JPG 格式` : "View HEIC 已将此图转为 JPG 格式"
}

function getUploadErrorMessage(count: number): string {
  return count > 1 ? `View HEIC 未能转换 ${count} 张 HEIC 图片` : "View HEIC 未能转换此 HEIC 图片"
}

function showUploadToast(
  type: UploadToastType,
  message: string,
  options: { durationMs?: number } = {}
): HTMLElement {
  const container = getUploadToastContainer()
  const toast = document.createElement("div")
  toast.className = `view-heic-upload-toast view-heic-upload-toast--${type}`
  toast.setAttribute("role", type === "error" ? "alert" : "status")
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite")

  const icon = document.createElement("span")
  icon.className = "view-heic-upload-toast__icon"
  icon.setAttribute("aria-hidden", "true")
  icon.textContent = type === "success" ? "✓" : type === "error" ? "!" : ""

  const text = document.createElement("span")
  text.className = "view-heic-upload-toast__text"
  text.textContent = message

  toast.append(icon, text)
  container.appendChild(toast)

  if (options.durationMs) {
    setTimeout(() => dismissUploadToast(toast), options.durationMs)
  }

  return toast
}

function dismissUploadToast(toast: HTMLElement): void {
  if (!toast.isConnected || toast.classList.contains("view-heic-upload-toast--leaving")) return
  toast.classList.add("view-heic-upload-toast--leaving")
  toast.addEventListener("animationend", () => toast.remove(), { once: true })
  setTimeout(() => toast.remove(), 220)
}

function getUploadToastContainer(): HTMLElement {
  if (uploadToastContainer?.isConnected) return uploadToastContainer

  const host = document.createElement("div")
  host.id = "view-heic-upload-toast-root"

  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = `
    :host {
      all: initial;
    }

    .view-heic-upload-toast-list {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      width: max-content;
      max-width: calc(100vw - 32px);
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .view-heic-upload-toast {
      display: flex;
      align-items: center;
      gap: 10px;
      box-sizing: border-box;
      min-height: 44px;
      padding: 10px 12px;
      border: 1px solid rgba(15, 23, 42, 0.1);
      border-radius: 16px;
      background: #ffffff;
      color: #0f172a;
      box-shadow: 0 16px 45px rgba(15, 23, 42, 0.18);
      font-size: 14px;
      line-height: 1.4;
      pointer-events: auto;
      animation: view-heic-upload-toast-enter 180ms cubic-bezier(0.16, 1, 0.3, 1);
      will-change: opacity, transform;
    }

    .view-heic-upload-toast--leaving {
      animation: view-heic-upload-toast-exit 140ms cubic-bezier(0.4, 0, 1, 1) forwards;
    }

    .view-heic-upload-toast__icon {
      display: grid;
      flex: 0 0 20px;
      width: 20px;
      height: 20px;
      place-items: center;
      border-radius: 999px;
      color: #ffffff;
      font-size: 14px;
      font-weight: 800;
      line-height: 1;
    }

    .view-heic-upload-toast__text {
      min-width: 0;
      overflow-wrap: anywhere;
      font-weight: 500;
    }

    .view-heic-upload-toast--success .view-heic-upload-toast__icon {
      background: #16a34a;
    }

    .view-heic-upload-toast--error .view-heic-upload-toast__icon {
      background: #dc2626;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }

    .view-heic-upload-toast--loading .view-heic-upload-toast__icon {
      box-sizing: border-box;
      border: 2px solid #d1d5db;
      border-top-color: #2563eb;
      animation: view-heic-upload-toast-spin 800ms linear infinite;
    }

    @keyframes view-heic-upload-toast-enter {
      from {
        opacity: 0;
        transform: translateY(-8px) scale(0.96);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes view-heic-upload-toast-exit {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      to {
        opacity: 0;
        transform: translateY(-6px) scale(0.98);
      }
    }

    @keyframes view-heic-upload-toast-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-color-scheme: dark) {
      .view-heic-upload-toast {
        border-color: rgba(148, 163, 184, 0.22);
        background: #18181b;
        color: #f8fafc;
        box-shadow: 0 14px 35px rgba(0, 0, 0, 0.42);
      }

      .view-heic-upload-toast--loading .view-heic-upload-toast__icon {
        border-color: #3f3f46;
        border-top-color: #60a5fa;
      }
    }

    @media (max-width: 480px) {
      .view-heic-upload-toast-list {
        top: 12px;
        width: calc(100vw - 24px);
      }

      .view-heic-upload-toast {
        width: 100%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .view-heic-upload-toast,
      .view-heic-upload-toast--leaving,
      .view-heic-upload-toast--loading .view-heic-upload-toast__icon {
        animation: none;
      }
    }
  `

  const container = document.createElement("div")
  container.className = "view-heic-upload-toast-list"
  shadow.append(style, container)
  document.documentElement.appendChild(host)
  uploadToastContainer = container

  return container
}

async function maybeShowRatingPrompt(successCount: number, failureCount: number): Promise<void> {
  if (import.meta.env.FIREFOX) return

  try {
    const stored = await browser.storage.local.get(RATING_PROMPT_STORAGE_KEY)
    const state: RatingPromptState = stored[RATING_PROMPT_STORAGE_KEY] ?? {}
    const now = Date.now()
    const nextSuccessCount = (state.successCount ?? 0) + successCount
    const nextFailureCount = (state.failureCount ?? 0) + failureCount

    if (successCount === 0) {
      if (failureCount > 0) {
        await browser.storage.local.set({
          [RATING_PROMPT_STORAGE_KEY]: {
            ...state,
            failureCount: nextFailureCount,
          },
        })
      }
      return
    }

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
    sendAnalyticsEvent("review_prompt_clicked", { success_total: successCount })
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
    sendAnalyticsEvent("feedback_clicked", { failure_total: failureCount })
    dismissRatingPrompt(prompt)
  })

  const closeButton = document.createElement("button")
  closeButton.className = "view-heic-rating-prompt__close"
  closeButton.type = "button"
  closeButton.setAttribute("aria-label", copy.close)
  closeButton.textContent = "×"
  closeButton.addEventListener("click", async () => {
    sendAnalyticsEvent("review_prompt_dismissed", { success_total: successCount })
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
  setTimeout(() => prompt.remove(), 250)
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
  const normalized = errorTypes.map((type) => (type === "unsupported" ? "conversion" : type))
  const first = normalized[0]
  return normalized.every((type) => type === first) ? first : "mixed"
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

        sendAnalyticsEvent("heic_detected", { image_count: 1 })
        const result = await converter.convertImage(img, { ignoreInvalidFormat: true })
        await recordConversionResults([result], "mutation")
      } catch {
        // Ignore ordinary broken images and cross-origin probes we cannot classify.
      }
    },
    true
  )
}
