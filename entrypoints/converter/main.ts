import "../../assets/phosphor-icons.css"
import "./style.css"
import { CONFIG, ERROR_MESSAGES } from "../../utils/constants"
import { hasHeifExtension, isHeifMimeType } from "../../utils/heif-format"
import { convertHeifFileToJpegFile } from "../../utils/heic-converter"
import { HELP_URL } from "../../utils/links"
import { getPopupLocale } from "../../utils/popup-view"

const locale = getPopupLocale(navigator.language)
const copy =
  locale === "zh"
    ? {
        title: "将 HEIC 转为 JPEG",
        subtitle: "选择文件，转换只在本机完成。",
        choose: "选择 HEIC 或 HEIF 文件",
        hint: "或拖到这里 · 最大 50 MB",
        help: "帮助",
        working: "正在转换…",
        ready: "可以下载了",
        another: "选择其他文件",
        download: "下载 JPEG",
        privacy: "仅在本机转换",
        invalid: "请选择 HEIC 或 HEIF 文件。",
        tooLarge: "文件超过 50 MB。",
        failed: "暂时无法转换这个文件。",
        drop: "松开即可转换",
      }
    : {
        title: "Convert HEIC to JPEG",
        subtitle: "Choose a file. It stays on this device.",
        choose: "Choose a HEIC or HEIF file",
        hint: "or drop it here · up to 50 MB",
        help: "Help",
        working: "Converting…",
        ready: "Ready to download",
        another: "Choose another",
        download: "Download JPEG",
        privacy: "Converted on this device",
        invalid: "Choose a HEIC or HEIF file.",
        tooLarge: "This file is larger than 50 MB.",
        failed: "This file couldn’t be converted.",
        drop: "Drop to convert",
      }

const fileInput = getElement<HTMLInputElement>("file-input")
const dropZone = getElement<HTMLButtonElement>("drop-zone")
const dropTitle = getElement<HTMLElement>("drop-title")
const result = getElement<HTMLElement>("result")
const resultIcon = getElement<HTMLElement>("result-icon")
const resultTitle = getElement<HTMLElement>("result-title")
const resultDetail = getElement<HTMLElement>("result-detail")
const chooseAnother = getElement<HTMLButtonElement>("choose-another")
const preview = getElement<HTMLElement>("preview")
const previewImage = getElement<HTMLImageElement>("preview-image")
const downloadButton = getElement<HTMLAnchorElement>("download-button")
const liveStatus = getElement<HTMLElement>("live-status")

let previewUrl: string | undefined
let dragDepth = 0
let conversionGeneration = 0

localizePage()

dropZone.addEventListener("click", () => fileInput.click())
chooseAnother.addEventListener("click", resetConverter)
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0]
  if (file) void convertFile(file)
})

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    if (eventName === "dragenter") dragDepth += 1
    dropZone.classList.add("is-dragging")
    dropTitle.textContent = copy.drop
  })
}

for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    if (eventName === "dragleave") dragDepth = Math.max(0, dragDepth - 1)
    if (eventName === "drop" || dragDepth === 0) {
      dragDepth = 0
      dropZone.classList.remove("is-dragging")
      dropTitle.textContent = copy.choose
    }
  })
}

dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files[0]
  if (file) void convertFile(file)
})

window.addEventListener("beforeunload", revokePreviewUrl, { once: true })

async function convertFile(file: File): Promise<void> {
  const generation = ++conversionGeneration

  if (!isHeifCandidate(file)) {
    showError(copy.invalid, file.name)
    return
  }

  if (file.size > CONFIG.MAX_FILE_SIZE) {
    showError(copy.tooLarge, file.name)
    return
  }

  revokePreviewUrl()
  dropZone.hidden = true
  result.hidden = false
  result.focus({ preventScroll: true })
  result.dataset.state = "working"
  resultIcon.className = "ph ph-circle-notch result-icon"
  resultTitle.textContent = copy.working
  resultDetail.textContent = formatFileDetail(file)
  chooseAnother.textContent = copy.another
  chooseAnother.disabled = true
  preview.hidden = true
  downloadButton.hidden = true
  setLiveStatus(`${copy.working} ${file.name}`)

  try {
    const converted = await convertHeifFileToJpegFile(file)
    if (generation !== conversionGeneration) return

    previewUrl = URL.createObjectURL(converted)
    previewImage.src = previewUrl
    previewImage.alt = converted.name
    preview.hidden = false

    downloadButton.href = previewUrl
    downloadButton.download = converted.name
    downloadButton.hidden = false
    downloadButton.querySelector("span")!.textContent = copy.download

    result.dataset.state = "success"
    resultIcon.className = "ph ph-check-circle result-icon"
    resultTitle.textContent = copy.ready
    resultDetail.textContent = `${converted.name} · ${formatBytes(converted.size)}`
    setLiveStatus(`${copy.ready}: ${converted.name}`)
  } catch (error) {
    if (generation !== conversionGeneration) return
    showError(getErrorCopy(error), file.name)
  } finally {
    if (generation === conversionGeneration) chooseAnother.disabled = false
  }
}

function showError(message: string, fileName: string): void {
  revokePreviewUrl()
  dropZone.hidden = true
  result.hidden = false
  result.focus({ preventScroll: true })
  result.dataset.state = "error"
  resultIcon.className = "ph ph-warning-circle result-icon"
  resultTitle.textContent = message
  resultDetail.textContent = fileName
  chooseAnother.textContent = copy.another
  chooseAnother.disabled = false
  preview.hidden = true
  downloadButton.hidden = true
  setLiveStatus(message, true)
}

function resetConverter(): void {
  conversionGeneration += 1
  revokePreviewUrl()
  fileInput.value = ""
  result.hidden = true
  dropZone.hidden = false
  dropZone.focus()
}

function localizePage(): void {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
  document.title = `${copy.title} · View HEIC`
  getElement<HTMLElement>("page-title").textContent = copy.title
  getElement<HTMLElement>("page-subtitle").textContent = copy.subtitle
  dropTitle.textContent = copy.choose
  getElement<HTMLElement>("drop-hint").textContent = copy.hint
  getElement<HTMLElement>("help-label").textContent = copy.help
  getElement<HTMLAnchorElement>("help-link").href = HELP_URL
  getElement<HTMLElement>("choose-another").textContent = copy.another
  getElement<HTMLElement>("download-label").textContent = copy.download
  getElement<HTMLElement>("privacy-label").textContent = copy.privacy
}

function isHeifCandidate(file: File): boolean {
  return hasHeifExtension(file.name) || isHeifMimeType(file.type)
}

function getErrorCopy(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  if (message.includes(ERROR_MESSAGES.FILE_TOO_LARGE)) return copy.tooLarge
  if (message.includes(ERROR_MESSAGES.INVALID_FORMAT)) return copy.invalid
  return copy.failed
}

function formatFileDetail(file: File): string {
  return `${file.name} · ${formatBytes(file.size)}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function revokePreviewUrl(): void {
  if (!previewUrl) return
  URL.revokeObjectURL(previewUrl)
  previewUrl = undefined
  previewImage.removeAttribute("src")
}

function setLiveStatus(message: string, assertive = false): void {
  liveStatus.setAttribute("role", assertive ? "alert" : "status")
  liveStatus.setAttribute("aria-live", assertive ? "assertive" : "polite")
  liveStatus.textContent = message
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing converter element: ${id}`)
  return element as T
}
