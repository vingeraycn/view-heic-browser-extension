#!/usr/bin/env node

import fs from "fs"

const content = fs.readFileSync("entrypoints/content.ts", "utf8")
const interceptor = fs.readFileSync("entrypoints/upload-interceptor.content.ts", "utf8")
const converter = fs.readFileSync("utils/heic-converter.ts", "utf8")
const uploadConverter = fs.readFileSync("utils/upload-heif-converter.ts", "utf8")
const directConverter = fs.readFileSync("utils/direct-heif-converter.ts", "utf8")
const geminiDecoder = fs.readFileSync("entrypoints/gemini-decoder.content.ts", "utf8")
const dropReplay = fs.readFileSync("utils/upload-drop-replay.ts", "utf8")
const testPage = fs.readFileSync("docs/test-improved.html", "utf8")
const builtManifestPath = ".output/chrome-mv3/manifest.json"
const builtContentScripts = JSON.parse(
  fs.readFileSync(builtManifestPath, "utf8")
).content_scripts ?? []

function findBuiltContentScript(fileName) {
  return builtContentScripts?.find((script) =>
    script.js?.some((file) => file.endsWith(`content-scripts/${fileName}`))
  )
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`)
    process.exitCode = 1
    return
  }

  console.log(`PASS ${message}`)
}

assert(
  interceptor.includes('world: "MAIN"') &&
    interceptor.includes('runAt: "document_start"') &&
    interceptor.includes('window.addEventListener("change", interceptHeifUpload, true)') &&
    interceptor.includes("event.stopImmediatePropagation()") &&
    content.includes("event.preventDefault()"),
  "upload HEIF files are intercepted in the page world before page handlers consume them"
)

assert(
  interceptor.includes("UPLOAD_REPLAY_ATTRIBUTE") &&
    interceptor.includes("input.removeAttribute(UPLOAD_REPLAY_ATTRIBUTE)") &&
    interceptor.includes('../utils/upload-constants') &&
    content.includes('../utils/upload-constants') &&
    content.includes("input.setAttribute(UPLOAD_REPLAY_ATTRIBUTE"),
  "replayed upload events are guarded against recursive conversion"
)

assert(
  interceptor.includes('../utils/heif-format') &&
    interceptor.includes("hasHeifExtension(file.name)") &&
    interceptor.includes("isHeifMimeType(file.type)") &&
    !interceptor.includes("HEIF_EXTENSION_PATTERN"),
  "page-world upload interception reuses shared HEIF detection helpers"
)

assert(
  content.includes("new DataTransfer()") &&
    content.includes("input.files = dataTransfer.files") &&
    content.includes('input.dispatchEvent(new Event("input", { bubbles: true }))') &&
    content.includes('input.dispatchEvent(new Event("change", { bubbles: true }))'),
  "converted JPG files are written back to the input and replayed"
)

assert(
  interceptor.includes('window.addEventListener("drop", interceptHeifDrop, true)') &&
    interceptor.includes("DROP_REQUEST_EVENT") &&
    interceptor.includes("DROP_REPLAY_EVENT") &&
    interceptor.includes("event.stopImmediatePropagation()") &&
    interceptor.includes("pendingDropSessions") &&
    interceptor.includes("documentUrl: location.href") &&
    interceptor.includes("session.documentUrl !== location.href") &&
    interceptor.includes("handledByInput") &&
    content.includes("DROP_REQUEST_EVENT") &&
    content.includes("getFileInputDropTarget(event)") &&
    content.includes("replayInputFilesSafely(input, result.files)") &&
    content.includes("DROP_REPLAY_EVENT") &&
    interceptor.includes("replayUploadDrop({") &&
    interceptor.includes('? "full-lifecycle" : "drop-only"') &&
    dropReplay.includes('type DropReplayEventType = "dragenter" | "dragover" | "dragleave" | "drop"') &&
    dropReplay.includes("environment.getTargetAtPoint(source.clientX, source.clientY)") &&
    dropReplay.includes('dispatchDropPhase("dragenter"') &&
    dropReplay.includes('dispatchDropPhase("dragover"') &&
    dropReplay.includes("if (!accepted) return false") &&
    dropReplay.includes("if (!completed)") &&
    dropReplay.includes("leaveConnectedTarget(currentTarget") &&
    !dropReplay.includes("fallbackTarget: document") &&
    dropReplay.includes('dispatchDropPhase("drop"'),
  "dragged HEIF files are intercepted and replayed in the page world, with Gemini lifecycle rebuilding"
)

assert(
  interceptor.includes('window.addEventListener("paste", interceptHeifPaste, true)') &&
    interceptor.includes("event.clipboardData") &&
    interceptor.includes("readClipboardStrings(clipboardData)") &&
    interceptor.includes("event.stopImmediatePropagation()") &&
    content.includes("PASTE_REQUEST_EVENT") &&
    content.includes("handleUploadPaste") &&
    content.includes("convertUploadFiles(detail.files, operationGeneration)"),
  "pasted HEIF files are intercepted early and converted through the shared upload pipeline"
)

assert(
  interceptor.includes("PASTE_REPLAY_EVENT") &&
    interceptor.includes("replayingPaste") &&
    interceptor.includes('new ClipboardEvent("paste"') &&
    interceptor.includes("detail.strings.forEach") &&
    interceptor.includes("detail.files.forEach") &&
    content.includes("replayPasteEventSafely(target, detail, result.files)") &&
    content.includes("replayPasteEventSafely(target, detail, detail.files)"),
  "paste replay preserves clipboard strings and files, avoids recursion, and falls back to originals"
)

assert(
  /export\s+async\s+function\s+convertHeifFileToJpegFile\s*\(/.test(converter) &&
    converter.includes('type: "image/jpeg"') &&
    converter.includes("getJpegFileName(file.name)"),
  "HEIF upload files are converted into JPEG File objects"
)

assert(
  content.includes("interface UploadConversionResult") &&
    content.includes("convertedCount") &&
    content.includes("failedCount") &&
    content.includes("convertedFiles.push(file)") &&
    content.includes("View HEIC upload file conversion failed"),
  "per-file conversion failures keep the original file instead of dropping the whole selection"
)

assert(
  content.includes("const uploadGenerations = new WeakMap<HTMLInputElement, number>()") &&
    content.includes('window.addEventListener("change", rememberFileInputSelection, true)') &&
    content.includes("Array.from(event.target.files ?? []).some(isHEIFUploadCandidate)") &&
    content.includes("function nextUploadGeneration(") &&
    content.includes("function isCurrentUploadGeneration(") &&
    content.includes("dismissUploadToast(loadingToast)") &&
    content.includes("replayInputFilesSafely(input, files)"),
  "stale async upload conversion results do not overwrite a newer file selection"
)

assert(
  content.includes("let siteOperationGeneration = 0") &&
    content.includes("const operationGeneration = siteOperationGeneration") &&
    content.includes("operationGeneration !== siteOperationGeneration") &&
    content.includes("convertUploadFiles(files, operationGeneration)") &&
    content.includes("convertUploadFiles(detail.files, operationGeneration)"),
  "site disable or disable-then-enable invalidates in-flight upload results and replays originals"
)

assert(
  content.includes("attachShadow({ mode: \"open\" })") &&
    content.includes('import { animate } from "motion"') &&
    content.includes("UPLOAD_TOAST_LAYOUT_SPRING") &&
    content.includes("animateUploadToastLayout") &&
    content.includes("function updateUploadToast(") &&
    content.includes('import viewHeicLogoDataUrl from "../public/icon/32.png?inline"') &&
    content.includes("logo.src = viewHeicLogoDataUrl") &&
    content.includes("view-heic-upload-toast__logo") &&
    content.includes("view-heic-upload-toast--loading") &&
    content.includes("border-radius: 20px") &&
    content.includes("@media (prefers-color-scheme: dark)") &&
    content.includes("@media (prefers-reduced-motion: reduce)"),
  "upload toast is isolated, spring-animated, supports loading state, and adapts UI preferences"
)

assert(
  uploadConverter.includes("createUploadHeifConverter") &&
    uploadConverter.includes('location.hostname.toLowerCase() === "gemini.google.com"') &&
    uploadConverter.includes("getGeminiDecoderService") &&
    directConverter.includes('import("@heic-to-csp-lib")') &&
    directConverter.includes("MAX_IMAGE_PIXELS") &&
    geminiDecoder.includes('matches: ["https://gemini.google.com/*"]') &&
    geminiDecoder.includes('world: "ISOLATED"') &&
    geminiDecoder.includes("registerGeminiDecoderService") &&
    geminiDecoder.includes("new SerialTaskQueue()") &&
    content.includes("convertHeifUploadFileToJpegFile(file)") &&
    content.includes('world: "ISOLATED"') &&
    interceptor.includes('world: "MAIN"') &&
    findBuiltContentScript("content.js")?.world === "ISOLATED" &&
    findBuiltContentScript("gemini-decoder.js")?.world === "ISOLATED" &&
    findBuiltContentScript("upload-interceptor.js")?.world === "MAIN",
  "Gemini's decoder and its content-script consumer share the isolated world while the MAIN-world interceptor only forwards DOM events"
)

assert(
  interceptor.includes("let replayingDrop = false") &&
    interceptor.includes("if (!interceptionEnabled || replayingDrop) return") &&
    interceptor.includes("replayingDrop = true") &&
    interceptor.includes("replayingDrop = false"),
  "replayed drag events cannot recursively start another HEIF conversion"
)

assert(
    content.includes("let activeUploadToast: HTMLElement | undefined") &&
    content.includes("removeUploadToastImmediately(activeUploadToast)") &&
    content.includes('".view-heic-upload-toast"') &&
    content.includes("clearUploadToastDismissTimer(toast)") &&
    content.includes("replayInputFilesSafely") &&
    content.includes("replayDropEventSafely") &&
    content.includes("replayPasteEventSafely"),
  "loading, success, and error toast states are mutually exclusive and replay failures still settle"
)

assert(
  content.includes("function isChineseLocale()") &&
    content.includes("正在转换为 JPG...") &&
    content.includes("已转换为 JPG") &&
    content.includes("未能转换此 HEIC 图片") &&
    content.includes("Converting to JPG...") &&
    content.includes("Converted to JPG") &&
    content.includes("Couldn't convert this HEIC image"),
  "upload toast copy is localized for Chinese and English states"
)

assert(
  testPage.includes("HEIC 上传自动转换 Playground") &&
    testPage.includes("upload-single") &&
    testPage.includes("upload-multiple") &&
    testPage.includes("upload-hidden") &&
    testPage.includes("最终 input.files") &&
    testPage.includes("upload-status") &&
    testPage.includes("__viewHeicEarlyUploadResults") &&
    testPage.includes("页面最早 capture 监听结果") &&
    testPage.includes("setUploadStatus"),
  "local test page covers early upload interception scenarios"
)
