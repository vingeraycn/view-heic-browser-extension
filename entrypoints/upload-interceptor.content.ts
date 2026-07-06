const UPLOAD_REQUEST_EVENT = "view-heic-upload-request"
const UPLOAD_REPLAY_ATTRIBUTE = "data-view-heic-upload-replayed"
const HEIF_EXTENSION_PATTERN = /\.(heic|heif|heics|heifs)$/i
const HEIF_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
])

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    window.addEventListener("change", interceptHeifUpload, true)
  },
})

function interceptHeifUpload(event: Event): void {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "file") return

  const input = event.target
  if (input.hasAttribute(UPLOAD_REPLAY_ATTRIBUTE)) {
    input.removeAttribute(UPLOAD_REPLAY_ATTRIBUTE)
    return
  }

  const files = Array.from(input.files ?? [])
  if (!files.some(isHeifFile)) return

  event.preventDefault()
  event.stopImmediatePropagation()
  input.dispatchEvent(new CustomEvent(UPLOAD_REQUEST_EVENT, { bubbles: true }))
}

function isHeifFile(file: File): boolean {
  return HEIF_EXTENSION_PATTERN.test(file.name) || HEIF_MIME_TYPES.has(file.type.split(";")[0].trim().toLowerCase())
}
