import { hasHeifExtension, isHeifMimeType } from "../utils/heif-format"
import { UPLOAD_REPLAY_ATTRIBUTE, UPLOAD_REQUEST_EVENT } from "../utils/upload-constants"

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
  return hasHeifExtension(file.name) || isHeifMimeType(file.type)
}
