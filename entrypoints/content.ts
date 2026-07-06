import { debounce } from "lodash-es"
import { animate } from "motion"
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
const VIEW_HEIC_TOAST_LOGO_DATA_URL =
  "data:image/png;base64,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"
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

const UPLOAD_TOAST_LAYOUT_SPRING = {
  type: "spring",
  stiffness: 360,
  damping: 34,
  mass: 0.95,
} as const

const UPLOAD_TOAST_ENTER_SPRING = {
  type: "spring",
  stiffness: 320,
  damping: 30,
  mass: 0.9,
} as const

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

    updateUploadToast(loadingToast, "success", getUploadSuccessMessage(heifCount), { durationMs: 3000 })
  } catch (error) {
    input.removeAttribute(UPLOAD_REPLAY_ATTRIBUTE)
    input.value = ""
    console.warn("View HEIC upload conversion failed:", error)
    updateUploadToast(loadingToast, "error", getUploadErrorMessage(heifCount), { durationMs: 5000 })
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

    updateUploadToast(loadingToast, "success", getUploadSuccessMessage(heifCount), { durationMs: 3000 })
  } catch (error) {
    console.warn("View HEIC drag upload conversion failed:", error)
    updateUploadToast(loadingToast, "error", getUploadErrorMessage(heifCount), { durationMs: 5000 })
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
  if (isChineseLocale()) {
    return count > 1 ? `正在将 ${count} 张图片转换为 JPG...` : "正在转换为 JPG..."
  }

  return count > 1 ? `Converting ${count} images to JPG...` : "Converting to JPG..."
}

function getUploadSuccessMessage(count: number): string {
  if (isChineseLocale()) {
    return count > 1 ? `已将 ${count} 张图片转换为 JPG` : "已转换为 JPG"
  }

  return count > 1 ? `Converted ${count} images to JPG` : "Converted to JPG"
}

function getUploadErrorMessage(count: number): string {
  if (isChineseLocale()) {
    return count > 1 ? `未能转换 ${count} 张 HEIC 图片` : "未能转换此 HEIC 图片"
  }

  return count > 1 ? `Couldn't convert ${count} HEIC images` : "Couldn't convert this HEIC image"
}

function isChineseLocale(): boolean {
  return navigator.language.toLowerCase().startsWith("zh")
}

function showUploadToast(
  type: UploadToastType,
  message: string,
  options: { durationMs?: number } = {}
): HTMLElement {
  const container = getUploadToastContainer()
  const previousRects = measureUploadToastRects(container)
  const toast = document.createElement("div")
  toast.className = `view-heic-upload-toast view-heic-upload-toast--${type}`
  toast.setAttribute("role", type === "error" ? "alert" : "status")
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite")

  const icon = document.createElement("span")
  icon.className = "view-heic-upload-toast__icon"
  icon.setAttribute("aria-hidden", "true")
  icon.textContent = type === "success" ? "✓" : type === "error" ? "!" : ""

  const logo = document.createElement("img")
  logo.className = "view-heic-upload-toast__logo"
  logo.src = VIEW_HEIC_TOAST_LOGO_DATA_URL
  logo.alt = ""
  logo.decoding = "async"
  logo.setAttribute("aria-hidden", "true")

  const text = document.createElement("span")
  text.className = "view-heic-upload-toast__text"
  text.textContent = message

  toast.append(logo, text, icon)
  container.appendChild(toast)
  animateUploadToastLayout(container, previousRects)
  animateUploadToastEnter(toast)

  if (options.durationMs) {
    setTimeout(() => dismissUploadToast(toast), options.durationMs)
  }

  return toast
}

function updateUploadToast(
  toast: HTMLElement,
  type: Exclude<UploadToastType, "loading">,
  message: string,
  options: { durationMs?: number } = {}
): void {
  if (!toast.isConnected || toast.classList.contains("view-heic-upload-toast--leaving")) return

  toast.className = `view-heic-upload-toast view-heic-upload-toast--${type}`
  toast.setAttribute("role", type === "error" ? "alert" : "status")
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite")

  const icon = toast.querySelector<HTMLElement>(".view-heic-upload-toast__icon")
  const text = toast.querySelector<HTMLElement>(".view-heic-upload-toast__text")
  if (icon) icon.textContent = type === "success" ? "✓" : "!"
  if (text) text.textContent = message

  if (!prefersReducedMotion()) {
    animate(toast, { scale: [0.98, 1] }, UPLOAD_TOAST_ENTER_SPRING)
  }

  if (options.durationMs) {
    setTimeout(() => dismissUploadToast(toast), options.durationMs)
  }
}

function dismissUploadToast(toast: HTMLElement): void {
  if (!toast.isConnected || toast.classList.contains("view-heic-upload-toast--leaving")) return
  const container = toast.parentElement
  toast.classList.add("view-heic-upload-toast--leaving")

  const removeToast = () => {
    if (!toast.isConnected) return
    const previousRects = container ? measureUploadToastRects(container) : new Map<HTMLElement, DOMRect>()
    toast.remove()
    if (container) animateUploadToastLayout(container, previousRects)
  }

  if (prefersReducedMotion()) {
    removeToast()
    return
  }

  const controls = animate(
    toast,
    { opacity: 0, y: -8, scale: 0.98 },
    { duration: 0.24, ease: "easeIn" }
  )
  controls.finished.then(removeToast, removeToast)
}

function animateUploadToastEnter(toast: HTMLElement): void {
  if (prefersReducedMotion()) return

  animate(
    toast,
    { opacity: [0, 1], y: [-12, 0], scale: [0.96, 1] },
    UPLOAD_TOAST_ENTER_SPRING
  )
}

function animateUploadToastLayout(container: HTMLElement, previousRects: Map<HTMLElement, DOMRect>): void {
  if (prefersReducedMotion()) return

  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement) || child.classList.contains("view-heic-upload-toast--leaving")) continue

    const previousRect = previousRects.get(child)
    if (!previousRect) continue

    const nextRect = child.getBoundingClientRect()
    const deltaY = previousRect.top - nextRect.top
    if (Math.abs(deltaY) < 1) continue

    animate(child, { y: [deltaY, 0] }, UPLOAD_TOAST_LAYOUT_SPRING)
  }
}

function measureUploadToastRects(container: HTMLElement): Map<HTMLElement, DOMRect> {
  return new Map(
    Array.from(container.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((child) => [child, child.getBoundingClientRect()])
  )
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
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
      border-radius: 20px;
      background: #ffffff;
      color: #0f172a;
      box-shadow: 0 16px 45px rgba(15, 23, 42, 0.18);
      font-size: 14px;
      line-height: 1.4;
      pointer-events: auto;
      will-change: opacity, transform;
    }

    .view-heic-upload-toast--leaving {
      pointer-events: none;
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

    .view-heic-upload-toast__logo {
      flex: 0 0 22px;
      width: 22px;
      height: 22px;
      border-radius: 7px;
      object-fit: cover;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.16);
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
