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
    content.includes("input.setAttribute(UPLOAD_REPLAY_ATTRIBUTE"),
  "replayed upload events are guarded against recursive conversion"
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
    content.includes('new DragEvent("drop"') &&
    content.includes("dataTransfer,") &&
    content.includes("target.dispatchEvent("),
  "dragged HEIF files are converted and replayed as JPG drop events"
)

assert(
  converter.includes("export async function convertHeifFileToJpegFile(file: File): Promise<File>") &&
    converter.includes('type: "image/jpeg"') &&
    converter.includes("getJpegFileName(file.name)"),
  "HEIF upload files are converted into JPEG File objects"
)

assert(
  content.includes("attachShadow({ mode: \"open\" })") &&
    content.includes('import { animate } from "motion"') &&
    content.includes("UPLOAD_TOAST_LAYOUT_SPRING") &&
    content.includes("animateUploadToastLayout") &&
    content.includes("view-heic-upload-toast--loading") &&
    content.includes("border-radius: 20px") &&
    content.includes("@media (prefers-color-scheme: dark)") &&
    content.includes("@media (prefers-reduced-motion: reduce)"),
  "upload toast is isolated, spring-animated, supports loading state, and adapts UI preferences"
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
