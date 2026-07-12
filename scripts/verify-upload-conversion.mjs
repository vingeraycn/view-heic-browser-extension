#!/usr/bin/env node

import fs from "fs"

const content = fs.readFileSync("entrypoints/content.ts", "utf8")
const interceptor = fs.readFileSync("entrypoints/upload-interceptor.content.ts", "utf8")
const converter = fs.readFileSync("utils/heic-converter.ts", "utf8")
const testPage = fs.readFileSync("docs/test-improved.html", "utf8")

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
  content.includes('window.addEventListener("drop", handleUploadDrop, true)') &&
    content.includes("event.stopImmediatePropagation()") &&
    content.includes("getFileInputDropTarget(event)") &&
    content.includes("replayInputFiles(input, result.files)") &&
    content.includes('new DragEvent("drop"') &&
    content.includes("dataTransfer,") &&
    content.includes("target.dispatchEvent("),
  "dragged HEIF files are converted and replayed for native inputs and drop targets"
)

assert(
  interceptor.includes('window.addEventListener("paste", interceptHeifPaste, true)') &&
    interceptor.includes("event.clipboardData") &&
    interceptor.includes("readClipboardStrings(clipboardData)") &&
    interceptor.includes("event.stopImmediatePropagation()") &&
    content.includes("PASTE_REQUEST_EVENT") &&
    content.includes("handleUploadPaste") &&
    content.includes("convertUploadFiles(detail.files)"),
  "pasted HEIF files are intercepted early and converted through the shared upload pipeline"
)

assert(
  interceptor.includes("PASTE_REPLAY_EVENT") &&
    interceptor.includes("replayingPaste") &&
    interceptor.includes('new ClipboardEvent("paste"') &&
    interceptor.includes("detail.strings.forEach") &&
    interceptor.includes("detail.files.forEach") &&
    content.includes("replayPasteEvent(target, detail, result.files)") &&
    content.includes("replayPasteEvent(target, detail, detail.files)"),
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
    content.includes("replayInputFiles(input, files)"),
  "stale async upload conversion results do not overwrite a newer file selection"
)

assert(
  content.includes("attachShadow({ mode: \"open\" })") &&
    content.includes('import { animate } from "motion"') &&
    content.includes("UPLOAD_TOAST_LAYOUT_SPRING") &&
    content.includes("animateUploadToastLayout") &&
    content.includes("function updateUploadToast(") &&
    content.includes("VIEW_HEIC_TOAST_LOGO_DATA_URL") &&
    content.includes("data:image/png;base64,") &&
    content.includes("view-heic-upload-toast__logo") &&
    content.includes("view-heic-upload-toast--loading") &&
    content.includes("border-radius: 20px") &&
    content.includes("@media (prefers-color-scheme: dark)") &&
    content.includes("@media (prefers-reduced-motion: reduce)"),
  "upload toast is isolated, spring-animated, supports loading state, and adapts UI preferences"
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
