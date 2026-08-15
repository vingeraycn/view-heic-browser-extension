import { debounce } from "lodash-es"
import { animate } from "motion"
import viewHeicLogoDataUrl from "../public/icon/32.png?inline"
import { CONFIG, SELECTORS } from "../utils/constants"
import {
  PAGE_STATE_CHANGED_MESSAGE,
  VIEW_HEIC_PROTOCOL_VERSION,
  createInitialPageState,
  isPageStateGetMessage,
  isSiteEnabledSetMessage,
  type PageState,
} from "../utils/extension-messages"
import { hasHeifExtension, isHeifMimeType } from "../utils/heif-format"
import { HEICConverter } from "../utils/heic-converter"
import { ISSUE_URL, STORE_REVIEW_URL } from "../utils/links"
import {
  PageConversionLedger,
  type PageConversionCounts,
  type PageConversionEntry,
} from "../utils/page-conversion-ledger"
import { SerialTaskQueue } from "../utils/serial-task-queue"
import {
  INTERCEPTOR_DISABLE_EVENT,
  INTERCEPTOR_ENABLE_EVENT,
  INTERCEPTOR_READY_EVENT,
  getSiteEnabled,
  getSiteEnabledFromChanges,
  getSiteHost,
  setSiteEnabled,
} from "../utils/site-preferences"
import {
  DROP_REPLAY_EVENT,
  DROP_REQUEST_EVENT,
  FILE_SYSTEM_PICKER_REQUEST_EVENT,
  FILE_SYSTEM_PICKER_RESPONSE_EVENT,
  PASTE_REPLAY_EVENT,
  PASTE_REQUEST_EVENT,
  UPLOAD_REPLAY_ATTRIBUTE,
  UPLOAD_REQUEST_EVENT,
} from "../utils/upload-constants"
import type { UploadDropReplaySource } from "../utils/upload-drop-replay"
import { convertHeifUploadFileToJpegFile } from "../utils/upload-heif-converter"
import { withUploadReplayMarker } from "../utils/upload-input-interception"
import {
  getAggregateAnalyticsErrorType,
  getAnalyticsDurationMs,
  getAnalyticsErrorType,
  getConversionOutcome,
  trackAnalyticsEvent,
  type AnalyticsErrorType,
  type ConversionTrigger,
} from "../utils/analytics"
import type { ConversionError } from "../utils/types"

const RATING_PROMPT_STORAGE_KEY = "viewHeicRatingPrompt"
const MIN_SUCCESSFUL_IMAGES_FOR_PROMPT = 11
const RATING_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000
const mimeOnlyProbeCache = new Map<string, "heif" | "not-heif">()

type ConversionResults = Awaited<ReturnType<HEICConverter["convertAllImages"]>>
type UploadToastType = "loading" | "success" | "error"

interface UploadConversionResult {
  files: File[]
  convertedCount: number
  failedCount: number
  errorTypes: AnalyticsErrorType[]
}

interface ConversionSummary {
  successCount: number
  failureCount: number
}

interface FailedImageObserver {
  prepareInitialBatch: () => void
  flushInitialBatch: () => Promise<void>
  dispose: () => void
}

interface RatingPromptState {
  successCount?: number
  failureCount?: number
  lastPromptedAt?: number
  reviewClicked?: boolean
}

interface ClipboardStringItem {
  type: string
  value: string
}

interface PasteConversionDetail {
  files: File[]
  strings: ClipboardStringItem[]
}

interface DropConversionDetail {
  requestId: string
  files: File[]
  source: UploadDropReplaySource
}

interface FileSystemPickerConversionDetail {
  requestId: string
  file: File
}

let uploadToastContainer: HTMLElement | undefined
let activeUploadToast: HTMLElement | undefined
const uploadToastDismissTimers = new WeakMap<HTMLElement, number>()
const uploadGenerations = new WeakMap<HTMLInputElement, number>()
const pageConversionLedger = new PageConversionLedger<HTMLImageElement>()
const pageWorkQueue = new SerialTaskQueue()
let contentScriptEnabled = false
let currentPageState: PageState
let siteOperationGeneration = 0
let pageConversionController = new AbortController()

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
  world: "ISOLATED",
  async main(ctx) {
    console.log("🖼️ View HEIC Extension Loaded")

    const siteHost = getSiteHost(location.href) ?? location.hostname
    const converter = new HEICConverter()
    pageConversionController.abort()
    pageConversionLedger.reset()
    currentPageState = createInitialPageState(siteHost)
    contentScriptEnabled = false
    notifyPageInterceptor(false)
    const handleInterceptorReady = (): void => notifyPageInterceptor(contentScriptEnabled)
    window.addEventListener(INTERCEPTOR_READY_EVENT, handleInterceptorReady)

    let disposePageObserver: (() => void) | undefined
    let disposeStyles: (() => void) | undefined
    let setupPromise: Promise<void> | undefined
    let disposed = false
    let sitePreferenceInitialized = false
    let preferenceRevision = 0
    const disposeUploadObserver = observeHEICUploads()
    const failedImageObserver = observeFailedImageLoads(
      converter,
      () => siteOperationGeneration
    )

    const ensurePageObservers = async (): Promise<void> => {
      setupPromise ??= (async () => {
        await domReady()
        if (disposed) return
        disposeStyles = injectStyles()
        disposePageObserver = observeHEICImages(converter)
      })()

      await setupPromise
    }

    const applySiteEnabled = async (enabled: boolean): Promise<PageState> => {
      if (disposed) return currentPageState
      if (sitePreferenceInitialized && contentScriptEnabled === enabled) {
        return currentPageState
      }

      sitePreferenceInitialized = true
      const applyGeneration = ++siteOperationGeneration
      if (enabled) failedImageObserver.prepareInitialBatch()
      contentScriptEnabled = enabled
      pageConversionController.abort()
      pageConversionLedger.reset()
      converter.cancelPendingConversions()
      if (enabled) {
        pageConversionController = new AbortController()
      }
      notifyPageInterceptor(enabled)

      if (!enabled) {
        updatePageState({
          siteEnabled: false,
          phase: "disabled",
          detected: 0,
          converted: 0,
          failed: 0,
        })
        return currentPageState
      }

      updatePageState({ siteEnabled: true, phase: "initializing" })
      await ensurePageObservers()
      if (disposed || applyGeneration !== siteOperationGeneration || !contentScriptEnabled) {
        return currentPageState
      }

      await processHEICImages(converter, "initial")
      if (disposed || applyGeneration !== siteOperationGeneration || !contentScriptEnabled) {
        return currentPageState
      }

      await failedImageObserver.flushInitialBatch()
      return currentPageState
    }

    const handleRuntimeMessage: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (
      message,
      _sender,
      sendResponse
    ) => {
      if (isPageStateGetMessage(message)) {
        sendResponse(currentPageState)
        return
      }

      if (!isSiteEnabledSetMessage(message)) return
      if (message.expectedPageInstanceId !== currentPageState.pageInstanceId) {
        sendResponse({
          ok: false,
          error: "stale-document",
          state: currentPageState,
        })
        return
      }

      preferenceRevision += 1
      void setSiteEnabled(siteHost, message.enabled)
        .then(() => {
          void trackAnalyticsEvent("site_preference_changed", { enabled: message.enabled })
          return applySiteEnabled(message.enabled)
        })
        .then((state) => {
          sendResponse({ ok: true, state })
        })
        .catch((error) => {
          console.warn("View HEIC site preference update failed:", error)
          sendResponse({
            ok: false,
            error: "storage-failed",
            state: currentPageState,
          })
        })
      return true
    }

    browser.runtime.onMessage.addListener(handleRuntimeMessage)

    const handleStorageChange: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      areaName
    ) => {
      if (areaName !== "local") return
      const enabled = getSiteEnabledFromChanges(changes, siteHost)
      if (enabled === undefined) return
      preferenceRevision += 1
      void applySiteEnabled(enabled)
    }

    browser.storage.onChanged.addListener(handleStorageChange)

    const cleanup = (): void => {
      if (disposed) return
      disposed = true
      contentScriptEnabled = false
      siteOperationGeneration += 1
      pageConversionLedger.reset()
      pageConversionController.abort()
      notifyPageInterceptor(false)
      disposeUploadObserver()
      failedImageObserver.dispose()
      disposePageObserver?.()
      disposeStyles?.()
      converter.cleanup()
      browser.runtime.onMessage.removeListener(handleRuntimeMessage)
      browser.storage.onChanged.removeListener(handleStorageChange)
      window.removeEventListener(INTERCEPTOR_READY_EVENT, handleInterceptorReady)
    }

    window.addEventListener("beforeunload", cleanup, { once: true })
    ctx.onInvalidated(cleanup)

    const initialPreferenceRevision = preferenceRevision
    const enabled = await getSiteEnabled(siteHost).catch((error) => {
      console.warn("View HEIC site preference read failed:", error)
      return true
    })
    if (!disposed && initialPreferenceRevision === preferenceRevision) {
      await applySiteEnabled(enabled)
    }
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

function updatePageState(next: Partial<Omit<PageState, "protocol" | "extensionVersion" | "pageInstanceId" | "siteHost">>): void {
  currentPageState = {
    ...currentPageState,
    ...next,
  }

  void browser.runtime
    .sendMessage({
      type: PAGE_STATE_CHANGED_MESSAGE,
      protocol: VIEW_HEIC_PROTOCOL_VERSION,
      state: currentPageState,
    })
    .catch(() => {
      // The popup is usually closed; state broadcasts are best effort.
    })
}

function notifyPageInterceptor(enabled: boolean): void {
  window.dispatchEvent(new Event(enabled ? INTERCEPTOR_ENABLE_EVENT : INTERCEPTOR_DISABLE_EVENT))
}

/**
 * 注入样式到页面
 */
function injectStyles(): () => void {
  const style = document.createElement("style")
  style.dataset.viewHeicStyles = "true"
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
  return () => style.remove()
}

/**
 * 处理页面中的所有HEIC图片
 */
async function processHEICImages(converter: HEICConverter, trigger: ConversionTrigger): Promise<void> {
  const signal = pageConversionController.signal
  await pageWorkQueue.run(async () => {
    if (signal.aborted || !contentScriptEnabled) return

    const images = findHEICImages(document).filter((image) =>
      !pageConversionLedger.hasFailed({ item: image, version: getImageSrc(image) })
    )
    if (images.length === 0) {
      if (trigger === "initial" || currentPageState.phase === "initializing") {
        updatePageState({
          siteEnabled: true,
          phase: "idle",
          detected: 0,
          converted: 0,
          failed: 0,
        })
      }
      return
    }

    console.log(`📷 发现 ${images.length} 张HEIC图片，开始转换...`)
    const conversionStartedAt = performance.now()
    const entries = images.map((image) => ({ item: image, version: getImageSrc(image) }))
    const started = pageConversionLedger.begin(entries)
    updatePageState({
      siteEnabled: true,
      phase: "converting",
      detected: started.detected,
      converted: started.converted,
      failed: started.failed,
    })

    const results = await converter.convertAllImages(images, { signal })
    if (signal.aborted || !contentScriptEnabled) return

    const completedEntries: PageConversionEntry<HTMLImageElement>[] = []
    const completedResults: ConversionResults = []
    const discardedEntries: PageConversionEntry<HTMLImageElement>[] = []
    entries.forEach((entry, index) => {
      const result = results[index]
      if (result && isCurrentPageConversionResult(converter, entry, result)) {
        completedEntries.push(entry)
        completedResults.push(result)
      } else {
        discardedEntries.push(entry)
      }
    })
    pageConversionLedger.discard(discardedEntries)

    await recordConversionResults(completedResults, trigger, conversionStartedAt)
    if (signal.aborted || !contentScriptEnabled) return

    const settled = pageConversionLedger.settle(
      completedEntries,
      completedResults.map((result) => result.success)
    )
    updatePageState({
      siteEnabled: true,
      phase: getSettledPagePhase(settled),
      detected: settled.detected,
      converted: settled.converted,
      failed: settled.failed,
    })
  })
}

async function recordConversionResults(
  results: ConversionResults,
  trigger: ConversionTrigger,
  startedAt: number
): Promise<ConversionSummary> {
  if (results.length === 0) {
    return { successCount: 0, failureCount: 0 }
  }

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
  void trackAnalyticsEvent("conversion_completed", {
    surface: "page_image",
    trigger,
    outcome: getConversionOutcome(successCount, failureCount),
    attempted_count: results.length,
    success_count: successCount,
    failure_count: failureCount,
    duration_ms: getAnalyticsDurationMs(performance.now() - startedAt),
    error_type: errorType ?? (failureCount > 0 ? "unknown" : undefined),
  })

  if (failureCount > 0) {
    console.warn("⚠️ 部分图片转换失败，可能是由于CORS限制或格式问题")
  }

  await maybeShowRatingPrompt(successCount, failureCount)
  return { successCount, failureCount }
}

function getImageSrc(img: HTMLImageElement): string {
  return img.src
}

function getSettledPagePhase(counts: PageConversionCounts): PageState["phase"] {
  if (counts.pending > 0) return "converting"
  if (counts.failed > 0) return "error"
  if (counts.converted > 0) return "complete"
  return "idle"
}

function isCurrentPageConversionResult(
  converter: HEICConverter,
  entry: PageConversionEntry<HTMLImageElement>,
  result: ConversionResults[number]
): boolean {
  if (result.cancelled) return false
  if (result.success) return converter.isCurrentConversionResult(entry.item)
  return result.error !== undefined
}

function isHEICImageCandidate(img: HTMLImageElement): boolean {
  return hasHeifExtension(getImageSrc(img))
}

function findHEICImages(root: ParentNode): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>(SELECTORS.IMAGE_CANDIDATES)).filter(isHEICImageCandidate)
}

function observeHEICUploads(): () => void {
  window.addEventListener("change", rememberFileInputSelection, true)
  window.addEventListener(UPLOAD_REQUEST_EVENT, handleUploadChange, true)
  window.addEventListener(DROP_REQUEST_EVENT, handleUploadDrop, true)
  window.addEventListener(PASTE_REQUEST_EVENT, handleUploadPaste, true)
  window.addEventListener(
    FILE_SYSTEM_PICKER_REQUEST_EVENT,
    handleFileSystemPickerConversion,
    true
  )

  return () => {
    window.removeEventListener("change", rememberFileInputSelection, true)
    window.removeEventListener(UPLOAD_REQUEST_EVENT, handleUploadChange, true)
    window.removeEventListener(DROP_REQUEST_EVENT, handleUploadDrop, true)
    window.removeEventListener(PASTE_REQUEST_EVENT, handleUploadPaste, true)
    window.removeEventListener(
      FILE_SYSTEM_PICKER_REQUEST_EVENT,
      handleFileSystemPickerConversion,
      true
    )
  }
}

function rememberFileInputSelection(event: Event): void {
  if (!contentScriptEnabled) return
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "file") return
  if (event.target.hasAttribute(UPLOAD_REPLAY_ATTRIBUTE)) return
  if (Array.from(event.target.files ?? []).some(isHEIFUploadCandidate)) return

  nextUploadGeneration(event.target)
}

async function handleUploadChange(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "file") return

  const input = event.target
  const files = Array.from(input.files ?? [])
  const heifCount = files.filter(isHEIFUploadCandidate).length
  if (heifCount === 0) return

  if (!contentScriptEnabled) {
    replayInputFiles(input, files)
    return
  }

  event.preventDefault()
  event.stopImmediatePropagation()

  const generation = nextUploadGeneration(input)
  const operationGeneration = siteOperationGeneration
  const loadingToast = showUploadToast("loading", getUploadLoadingMessage(heifCount))
  const conversionStartedAt = performance.now()

  try {
    const result = await convertUploadFiles(files, operationGeneration)
    if (!isCurrentUploadGeneration(input, generation)) {
      dismissUploadToast(loadingToast)
      return
    }
    if (!contentScriptEnabled || operationGeneration !== siteOperationGeneration) {
      replayInputFilesSafely(input, files)
      dismissUploadToast(loadingToast)
      return
    }

    const replayed = replayInputFilesSafely(input, result.files)
    trackUploadConversion(result, "file_picker", conversionStartedAt, replayed)
    if (replayed) {
      updateUploadToastForResult(loadingToast, result)
    } else {
      updateUploadToast(loadingToast, "error", getUploadErrorMessage(heifCount), { durationMs: 5000 })
    }
  } catch (error) {
    if (!isCurrentUploadGeneration(input, generation)) {
      dismissUploadToast(loadingToast)
      return
    }

    console.warn("View HEIC upload conversion failed:", error)
    replayInputFilesSafely(input, files)
    trackUploadFailure(heifCount, "file_picker", conversionStartedAt)
    updateUploadToast(loadingToast, "error", getUploadErrorMessage(heifCount), { durationMs: 5000 })
  }
}

async function handleFileSystemPickerConversion(event: Event): Promise<void> {
  if (!(event instanceof CustomEvent)) return

  const detail = event.detail as FileSystemPickerConversionDetail | undefined
  if (
    !detail ||
    typeof detail.requestId !== "string" ||
    !(detail.file instanceof File)
  ) {
    return
  }

  event.stopImmediatePropagation()
  const file = detail.file
  if (!contentScriptEnabled || !isHEIFUploadCandidate(file)) {
    respondToFileSystemPicker(detail.requestId, file)
    return
  }

  const operationGeneration = siteOperationGeneration
  const loadingToast = showUploadToast("loading", getUploadLoadingMessage(1))
  const conversionStartedAt = performance.now()

  try {
    const result = await convertUploadFiles([file], operationGeneration)
    if (!contentScriptEnabled || operationGeneration !== siteOperationGeneration) {
      respondToFileSystemPicker(detail.requestId, file)
      dismissUploadToast(loadingToast)
      return
    }

    const convertedFile = result.files[0] ?? file
    const delivered = respondToFileSystemPicker(detail.requestId, convertedFile)
    trackUploadConversion(result, "file_picker", conversionStartedAt, delivered)
    if (delivered) {
      updateUploadToastForResult(loadingToast, result)
    } else {
      updateUploadToast(loadingToast, "error", getUploadErrorMessage(1), {
        durationMs: 5000,
      })
    }
  } catch (error) {
    console.warn("View HEIC file picker conversion failed:", error)
    respondToFileSystemPicker(detail.requestId, file)
    trackUploadFailure(1, "file_picker", conversionStartedAt)
    updateUploadToast(loadingToast, "error", getUploadErrorMessage(1), {
      durationMs: 5000,
    })
  }
}

function respondToFileSystemPicker(requestId: string, file: File): boolean {
  try {
    const responseEvent = new CustomEvent(FILE_SYSTEM_PICKER_RESPONSE_EVENT, {
      cancelable: true,
      composed: true,
      detail: { requestId, file },
    })
    window.dispatchEvent(responseEvent)
    return responseEvent.defaultPrevented
  } catch (error) {
    console.warn("View HEIC file picker response failed:", error)
    return false
  }
}

async function handleUploadDrop(event: Event): Promise<void> {
  if (!(event instanceof CustomEvent)) return

  const detail = event.detail as DropConversionDetail | undefined
  if (!isDropConversionDetail(detail)) return
  if (!contentScriptEnabled) return
  const files = detail.files
  const heifCount = files.filter(isHEIFUploadCandidate).length
  if (heifCount === 0) return

  const target = event.target
  if (!(target instanceof EventTarget)) return

  event.preventDefault()
  event.stopImmediatePropagation()

  const input = getFileInputDropTarget(event)
  if (input) acknowledgeInputDrop(detail)
  const generation = input ? nextUploadGeneration(input) : undefined
  const operationGeneration = siteOperationGeneration
  const loadingToast = showUploadToast("loading", getUploadLoadingMessage(heifCount))
  const conversionStartedAt = performance.now()

  try {
    const result = await convertUploadFiles(files, operationGeneration)
    if (!contentScriptEnabled || operationGeneration !== siteOperationGeneration) {
      if (input) {
        if (!isCurrentUploadGeneration(input, generation)) {
          dismissUploadToast(loadingToast)
          return
        }
        replayInputFilesSafely(input, files)
      } else {
        replayDropEventSafely(detail, files)
      }
      dismissUploadToast(loadingToast)
      return
    }

    let replayed: boolean
    if (input) {
      if (!isCurrentUploadGeneration(input, generation)) {
        dismissUploadToast(loadingToast)
        return
      }

      replayed = replayInputFilesSafely(input, result.files)
      if (!replayed) {
        trackUploadConversion(result, "drop", conversionStartedAt, false)
        updateUploadToast(loadingToast, "error", getUploadErrorMessage(heifCount), { durationMs: 5000 })
        return
      }
    } else {
      replayed = replayDropEventSafely(detail, result.files)
      if (!replayed) {
        trackUploadConversion(result, "drop", conversionStartedAt, false)
        updateUploadToast(loadingToast, "error", getUploadErrorMessage(heifCount), { durationMs: 5000 })
        return
      }
    }

    trackUploadConversion(result, "drop", conversionStartedAt, replayed)
    updateUploadToastForResult(loadingToast, result)
  } catch (error) {
    if (input && !isCurrentUploadGeneration(input, generation)) {
      dismissUploadToast(loadingToast)
      return
    }

    console.warn("View HEIC drag upload conversion failed:", error)
    if (input) {
      replayInputFilesSafely(input, files)
    } else {
      replayDropEventSafely(detail, files)
    }
    trackUploadFailure(heifCount, "drop", conversionStartedAt)
    updateUploadToast(loadingToast, "error", getUploadErrorMessage(heifCount), { durationMs: 5000 })
  }
}

function acknowledgeInputDrop(detail: DropConversionDetail): void {
  window.dispatchEvent(
    new CustomEvent(DROP_REPLAY_EVENT, {
      cancelable: true,
      detail: { requestId: detail.requestId, handledByInput: true },
    })
  )
}

function isDropConversionDetail(detail: DropConversionDetail | undefined): detail is DropConversionDetail {
  if (
    !detail ||
    typeof detail.requestId !== "string" ||
    !Array.isArray(detail.files) ||
    !detail.source
  ) {
    return false
  }
  const { source } = detail
  return (
    Number.isFinite(source.clientX) &&
    Number.isFinite(source.clientY) &&
    Number.isFinite(source.screenX) &&
    Number.isFinite(source.screenY) &&
    typeof source.ctrlKey === "boolean" &&
    typeof source.shiftKey === "boolean" &&
    typeof source.altKey === "boolean" &&
    typeof source.metaKey === "boolean"
  )
}

async function handleUploadPaste(event: Event): Promise<void> {
  if (!(event instanceof CustomEvent)) return

  const detail = event.detail as PasteConversionDetail | undefined
  if (!detail || !Array.isArray(detail.files) || !Array.isArray(detail.strings)) return

  const heifCount = detail.files.filter(isHEIFUploadCandidate).length
  if (heifCount === 0) return

  const target = event.target
  if (!(target instanceof EventTarget)) return

  if (!contentScriptEnabled) {
    replayPasteEvent(target, detail, detail.files)
    return
  }

  event.preventDefault()
  event.stopImmediatePropagation()

  const loadingToast = showUploadToast("loading", getUploadLoadingMessage(heifCount))
  const operationGeneration = siteOperationGeneration
  const conversionStartedAt = performance.now()

  try {
    const result = await convertUploadFiles(detail.files, operationGeneration)
    if (!contentScriptEnabled || operationGeneration !== siteOperationGeneration) {
      replayPasteEventSafely(target, detail, detail.files)
      dismissUploadToast(loadingToast)
      return
    }
    const replayed = replayPasteEventSafely(target, detail, result.files)
    trackUploadConversion(result, "paste", conversionStartedAt, replayed)
    if (replayed) {
      updateUploadToastForResult(loadingToast, result)
    } else {
      updateUploadToast(loadingToast, "error", getUploadErrorMessage(heifCount), { durationMs: 5000 })
    }
  } catch (error) {
    console.warn("View HEIC paste conversion failed:", error)
    replayPasteEventSafely(target, detail, detail.files)
    trackUploadFailure(heifCount, "paste", conversionStartedAt)
    updateUploadToast(loadingToast, "error", getUploadErrorMessage(heifCount), { durationMs: 5000 })
  }
}

async function convertUploadFiles(
  files: File[],
  operationGeneration: number
): Promise<UploadConversionResult> {
  const convertedFiles: File[] = []
  let convertedCount = 0
  let failedCount = 0
  const errorTypes: AnalyticsErrorType[] = []

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    if (!contentScriptEnabled || operationGeneration !== siteOperationGeneration) {
      convertedFiles.push(...files.slice(index))
      break
    }

    if (!isHEIFUploadCandidate(file)) {
      convertedFiles.push(file)
      continue
    }

    try {
      convertedFiles.push(await convertHeifUploadFileToJpegFile(file))
      convertedCount += 1
    } catch (error) {
      failedCount += 1
      errorTypes.push(getAnalyticsErrorType(error))
      convertedFiles.push(file)
      console.warn("View HEIC upload file conversion failed:", file.name, error)
    }
  }

  return { files: convertedFiles, convertedCount, failedCount, errorTypes }
}

function trackUploadConversion(
  result: UploadConversionResult,
  trigger: Extract<ConversionTrigger, "file_picker" | "drop" | "paste">,
  startedAt: number,
  replayed: boolean
): void {
  const attemptedCount = result.convertedCount + result.failedCount
  const successCount = replayed ? result.convertedCount : 0
  const failureCount = replayed ? result.failedCount : attemptedCount
  void trackAnalyticsEvent("conversion_completed", {
    surface: "web_upload",
    trigger,
    outcome: getConversionOutcome(successCount, failureCount),
    attempted_count: attemptedCount,
    success_count: successCount,
    failure_count: failureCount,
    duration_ms: getAnalyticsDurationMs(performance.now() - startedAt),
    error_type: replayed
      ? getAggregateAnalyticsErrorType(result.errorTypes)
      : "replay",
  })
}

function trackUploadFailure(
  attemptedCount: number,
  trigger: Extract<ConversionTrigger, "file_picker" | "drop" | "paste">,
  startedAt: number
): void {
  void trackAnalyticsEvent("conversion_completed", {
    surface: "web_upload",
    trigger,
    outcome: "failure",
    attempted_count: attemptedCount,
    success_count: 0,
    failure_count: attemptedCount,
    duration_ms: getAnalyticsDurationMs(performance.now() - startedAt),
    error_type: "unknown",
  })
}

function replayInputFiles(input: HTMLInputElement, files: File[]): void {
  const dataTransfer = new DataTransfer()
  files.forEach((file) => dataTransfer.items.add(file))
  input.files = dataTransfer.files

  withUploadReplayMarker(input, UPLOAD_REPLAY_ATTRIBUTE, () => {
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

function replayInputFilesSafely(input: HTMLInputElement, files: File[]): boolean {
  try {
    replayInputFiles(input, files)
    return true
  } catch (error) {
    console.warn("View HEIC upload replay failed:", error)
    return false
  }
}

function replayDropEvent(detail: DropConversionDetail, files: File[]): boolean {
  const replayEvent = new CustomEvent(DROP_REPLAY_EVENT, {
    bubbles: true,
    cancelable: true,
    composed: true,
    detail: { requestId: detail.requestId, files },
  })
  window.dispatchEvent(replayEvent)
  return replayEvent.defaultPrevented
}

function replayDropEventSafely(
  detail: DropConversionDetail,
  files: File[]
): boolean {
  try {
    return replayDropEvent(detail, files)
  } catch (error) {
    console.warn("View HEIC drag replay failed:", error)
    return false
  }
}

function replayPasteEvent(target: EventTarget, detail: PasteConversionDetail, files: File[]): void {
  target.dispatchEvent(
    new CustomEvent(PASTE_REPLAY_EVENT, {
      bubbles: true,
      composed: true,
      detail: { ...detail, files },
    })
  )
}

function replayPasteEventSafely(
  target: EventTarget,
  detail: PasteConversionDetail,
  files: File[]
): boolean {
  try {
    replayPasteEvent(target, detail, files)
    return true
  } catch (error) {
    console.warn("View HEIC paste replay failed:", error)
    return false
  }
}

function getFileInputDropTarget(event: Event): HTMLInputElement | undefined {
  return event
    .composedPath()
    .find((target): target is HTMLInputElement => target instanceof HTMLInputElement && target.type === "file")
}

function nextUploadGeneration(input: HTMLInputElement): number {
  const generation = (uploadGenerations.get(input) ?? 0) + 1
  uploadGenerations.set(input, generation)
  return generation
}

function isCurrentUploadGeneration(input: HTMLInputElement, generation: number | undefined): boolean {
  return generation !== undefined && uploadGenerations.get(input) === generation
}

function updateUploadToastForResult(toast: HTMLElement, result: UploadConversionResult): void {
  if (result.failedCount > 0) {
    updateUploadToast(toast, "error", getUploadErrorMessage(result.failedCount), { durationMs: 5000 })
    return
  }

  updateUploadToast(toast, "success", getUploadSuccessMessage(result.convertedCount), { durationMs: 3000 })
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
  if (type === "loading") {
    if (activeUploadToast?.isConnected) {
      removeUploadToastImmediately(activeUploadToast)
    }
    for (const existingToast of container.querySelectorAll<HTMLElement>(
      ".view-heic-upload-toast"
    )) {
      removeUploadToastImmediately(existingToast)
    }
  }
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
  logo.src = viewHeicLogoDataUrl
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

  if (type === "loading") {
    activeUploadToast = toast
  }

  if (options.durationMs) {
    scheduleUploadToastDismiss(toast, options.durationMs)
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
  if (activeUploadToast && activeUploadToast !== toast) {
    removeUploadToastImmediately(toast)
    return
  }

  clearUploadToastDismissTimer(toast)

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
    scheduleUploadToastDismiss(toast, options.durationMs)
  }
}

function dismissUploadToast(toast: HTMLElement): void {
  if (!toast.isConnected || toast.classList.contains("view-heic-upload-toast--leaving")) return
  clearUploadToastDismissTimer(toast)
  if (activeUploadToast === toast) {
    activeUploadToast = undefined
  }
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

function scheduleUploadToastDismiss(toast: HTMLElement, durationMs: number): void {
  clearUploadToastDismissTimer(toast)
  uploadToastDismissTimers.set(
    toast,
    window.setTimeout(() => {
      uploadToastDismissTimers.delete(toast)
      dismissUploadToast(toast)
    }, durationMs)
  )
}

function clearUploadToastDismissTimer(toast: HTMLElement): void {
  const timer = uploadToastDismissTimers.get(toast)
  if (timer === undefined) return
  window.clearTimeout(timer)
  uploadToastDismissTimers.delete(toast)
}

function removeUploadToastImmediately(toast: HTMLElement): void {
  clearUploadToastDismissTimer(toast)
  if (activeUploadToast === toast) {
    activeUploadToast = undefined
  }
  toast.remove()
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
    void trackAnalyticsEvent("review_prompt_shown", { success_total: nextSuccessCount })
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
    void trackAnalyticsEvent("review_prompt_action", {
      action: "review",
      success_total: successCount,
      failure_total: failureCount,
    })
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
    void trackAnalyticsEvent("review_prompt_action", {
      action: "feedback",
      success_total: successCount,
      failure_total: failureCount,
    })
    dismissRatingPrompt(prompt)
  })

  const closeButton = document.createElement("button")
  closeButton.className = "view-heic-rating-prompt__close"
  closeButton.type = "button"
  closeButton.setAttribute("aria-label", copy.close)
  closeButton.textContent = "×"
  closeButton.addEventListener("click", async () => {
    void trackAnalyticsEvent("review_prompt_action", {
      action: "dismissed",
      success_total: successCount,
      failure_total: failureCount,
    })
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

function getAggregateErrorType(errorTypes: ConversionError["type"][]): AnalyticsErrorType | undefined {
  return getAggregateAnalyticsErrorType(
    errorTypes.map((type) => (type === "unsupported" ? "conversion" : type))
  )
}

/**
 * 监听DOM变化，处理动态添加的HEIC图片
 */
function observeHEICImages(converter: HEICConverter): () => void {
  const debouncedProcess = debounce(
    () => {
      if (!contentScriptEnabled) return
      processHEICImages(converter, "mutation")
    },
    CONFIG.DEBOUNCE_DELAY,
    {
      trailing: true,
      leading: false,
    }
  )

  const observer = new MutationObserver((mutations) => {
    if (!contentScriptEnabled) return
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
        if (mutation.oldValue === img.getAttribute("src")) continue
        if (converter.isCurrentConversionResult(img)) continue

        converter.resetImageProcessed(img)
        if (isHEICImageCandidate(img)) {
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
    attributeOldValue: true,
    subtree: true,
  })

  return () => {
    debouncedProcess.cancel()
    observer.disconnect()
  }
}

function isSameOriginUrl(src: string): boolean {
  try {
    return new URL(src, location.href).origin === location.origin
  } catch {
    return false
  }
}

function observeFailedImageLoads(
  converter: HEICConverter,
  getOperationGeneration: () => number
): FailedImageObserver {
  const pendingImages = new Set<HTMLImageElement>()
  let observerDisposed = false
  let drainPromise: Promise<void> | undefined
  let initialBatchPending = true
  let initialBatchGeneration = 0

  const queueImage = (img: HTMLImageElement): void => {
    if (observerDisposed || !img.isConnected || pendingImages.size >= 50) return
    pendingImages.add(img)
    if (contentScriptEnabled && !initialBatchPending) {
      void drainPendingImages()
    }
  }

  const convertProbedImage = async (
    img: HTMLImageElement,
    src: string,
    operationGeneration: number,
    signal: AbortSignal,
    reportImmediately: boolean
  ): Promise<ConversionResults[number] | undefined> => {
    if (
      signal.aborted ||
      observerDisposed ||
      !contentScriptEnabled ||
      !img.isConnected ||
      getImageSrc(img) !== src ||
      operationGeneration !== getOperationGeneration()
    ) {
      mimeOnlyProbeCache.delete(src)
      queueImage(img)
      return
    }

    const entry = { item: img, version: src }
    if (pageConversionLedger.hasFailed(entry)) return

    const conversionStartedAt = performance.now()
    const started = pageConversionLedger.begin([entry])
    updatePageState({
      siteEnabled: true,
      phase: "converting",
      detected: started.detected,
      converted: started.converted,
      failed: started.failed,
    })
    const result = await converter.convertImage(img, {
      ignoreInvalidFormat: true,
      signal,
    })
    if (
      signal.aborted ||
      !contentScriptEnabled ||
      operationGeneration !== getOperationGeneration()
    ) {
      if (!result.success) {
        mimeOnlyProbeCache.delete(src)
        queueImage(img)
      }
      return
    }

    if (!isCurrentPageConversionResult(converter, entry, result)) {
      const discarded = pageConversionLedger.discard([entry])
      updatePageState({
        siteEnabled: true,
        phase: getSettledPagePhase(discarded),
        detected: discarded.detected,
        converted: discarded.converted,
        failed: discarded.failed,
      })
      return
    }

    if (reportImmediately) {
      await recordConversionResults([result], "mutation", conversionStartedAt)
    }
    if (
      signal.aborted ||
      !contentScriptEnabled ||
      operationGeneration !== getOperationGeneration()
    ) {
      return
    }

    const settled = pageConversionLedger.settle([entry], [result.success])
    updatePageState({
      siteEnabled: true,
      phase: getSettledPagePhase(settled),
      detected: settled.detected,
      converted: settled.converted,
      failed: settled.failed,
    })
    return result
  }

  const probeImage = async (
    img: HTMLImageElement,
    reportImmediately: boolean
  ): Promise<ConversionResults[number] | undefined> => {
    if (observerDisposed || !img.isConnected) return
    if (!contentScriptEnabled) {
      pendingImages.add(img)
      return
    }

    const src = getImageSrc(img)
    if (!src || hasHeifExtension(src) || !isSameOriginUrl(src)) return
    if (pageConversionLedger.hasFailed({ item: img, version: src })) return

    const operationGeneration = getOperationGeneration()
    const signal = pageConversionController.signal
    const cachedMime = mimeOnlyProbeCache.get(src)
    if (cachedMime === "not-heif") return

    try {
      if (cachedMime !== "heif") {
        const response = await fetch(src, { method: "HEAD", signal })
        if (
          signal.aborted ||
          !contentScriptEnabled ||
          operationGeneration !== getOperationGeneration()
        ) {
          mimeOnlyProbeCache.delete(src)
          queueImage(img)
          return
        }

        const isHeif = response.ok && isHeifMimeType(response.headers.get("content-type") ?? "")
        mimeOnlyProbeCache.set(src, isHeif ? "heif" : "not-heif")
        if (!isHeif) return
      }

      return await pageWorkQueue.run(() =>
        convertProbedImage(img, src, operationGeneration, signal, reportImmediately)
      )
    } catch {
      if (signal.aborted) {
        mimeOnlyProbeCache.delete(src)
        queueImage(img)
      } else {
        mimeOnlyProbeCache.set(src, "not-heif")
      }
      // Ignore ordinary broken images and cross-origin probes we cannot classify.
    }
  }

  const drainPendingImages = (): Promise<void> => {
    if (drainPromise) return drainPromise

    drainPromise = (async () => {
      while (contentScriptEnabled && pendingImages.size > 0) {
        const image = pendingImages.values().next().value as HTMLImageElement | undefined
        if (!image) return
        pendingImages.delete(image)
        await probeImage(image, true)
      }
    })().finally(() => {
      drainPromise = undefined
      if (contentScriptEnabled && !initialBatchPending && pendingImages.size > 0) {
        void drainPendingImages()
      }
    })

    return drainPromise
  }

  const handleImageError = (event: Event): void => {
    if (!(event.target instanceof HTMLImageElement)) return
    queueImage(event.target)
  }

  document.addEventListener("error", handleImageError, true)
  return {
    prepareInitialBatch() {
      initialBatchPending = true
      initialBatchGeneration += 1
    },
    async flushInitialBatch() {
      await drainPromise
      const batchGeneration = initialBatchGeneration
      const startedAt = performance.now()
      const results: ConversionResults = []
      const initialImages = Array.from(pendingImages)
      initialImages.forEach((image) => pendingImages.delete(image))
      let nextImageIndex = 0
      const initialDrain = (async () => {
        while (
          contentScriptEnabled &&
          batchGeneration === initialBatchGeneration &&
          nextImageIndex < initialImages.length
        ) {
          const image = initialImages[nextImageIndex]
          nextImageIndex += 1
          const result = await probeImage(image, false)
          if (result) results.push(result)
        }
        if (contentScriptEnabled && batchGeneration === initialBatchGeneration) {
          await recordConversionResults(results, "initial", startedAt)
        }
      })()
      drainPromise = initialDrain.finally(() => {
        drainPromise = undefined
      })
      try {
        await drainPromise
      } finally {
        initialImages.slice(nextImageIndex).forEach(queueImage)
        if (batchGeneration === initialBatchGeneration) {
          initialBatchPending = false
          if (contentScriptEnabled && pendingImages.size > 0) {
            void drainPendingImages()
          }
        }
      }
    },
    dispose() {
      observerDisposed = true
      pendingImages.clear()
      document.removeEventListener("error", handleImageError, true)
    },
  }
}
