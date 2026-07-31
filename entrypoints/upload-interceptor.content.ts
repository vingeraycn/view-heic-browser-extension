import { hasHeifExtension, isHeifMimeType } from "../utils/heif-format"
import {
  INTERCEPTOR_DISABLE_EVENT,
  INTERCEPTOR_ENABLE_EVENT,
  INTERCEPTOR_READY_EVENT,
} from "../utils/site-preferences"
import {
  PASTE_REPLAY_EVENT,
  PASTE_REQUEST_EVENT,
  UPLOAD_REPLAY_ATTRIBUTE,
  UPLOAD_REQUEST_EVENT,
} from "../utils/upload-constants"

interface ClipboardStringItem {
  type: string
  value: string
}

interface PasteRequestDetail {
  files: File[]
  strings: ClipboardStringItem[]
}

interface PasteReplayDetail extends PasteRequestDetail {
  files: File[]
}

let replayingPaste = false
let interceptionEnabled = false

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    const enableInterception = (): void => {
      interceptionEnabled = true
    }
    const disableInterception = (): void => {
      interceptionEnabled = false
    }

    window.addEventListener(INTERCEPTOR_ENABLE_EVENT, enableInterception)
    window.addEventListener(INTERCEPTOR_DISABLE_EVENT, disableInterception)
    window.addEventListener("change", interceptHeifUpload, true)
    window.addEventListener("paste", interceptHeifPaste, true)
    window.addEventListener(PASTE_REPLAY_EVENT, replayHeifPaste, true)
    window.dispatchEvent(new Event(INTERCEPTOR_READY_EVENT))
  },
})

function interceptHeifUpload(event: Event): void {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "file") return

  const input = event.target
  if (input.hasAttribute(UPLOAD_REPLAY_ATTRIBUTE)) {
    input.removeAttribute(UPLOAD_REPLAY_ATTRIBUTE)
    return
  }
  if (!interceptionEnabled) return

  const files = Array.from(input.files ?? [])
  if (!files.some(isHeifFile)) return

  event.preventDefault()
  event.stopImmediatePropagation()
  input.dispatchEvent(new CustomEvent(UPLOAD_REQUEST_EVENT, { bubbles: true }))
}

function isHeifFile(file: File): boolean {
  return hasHeifExtension(file.name) || isHeifMimeType(file.type)
}

function interceptHeifPaste(event: ClipboardEvent): void {
  if (!interceptionEnabled || replayingPaste) return

  const clipboardData = event.clipboardData
  const files = Array.from(clipboardData?.files ?? [])
  if (!files.some(isHeifFile)) return

  const target = event.target
  if (!(target instanceof EventTarget)) return

  event.preventDefault()
  event.stopImmediatePropagation()

  void readClipboardStrings(clipboardData).then((strings) => {
    const detail: PasteRequestDetail = {
      files,
      strings,
    }
    target.dispatchEvent(new CustomEvent(PASTE_REQUEST_EVENT, { bubbles: true, composed: true, detail }))
  })
}

async function readClipboardStrings(clipboardData: DataTransfer | null): Promise<ClipboardStringItem[]> {
  const items = Array.from(clipboardData?.items ?? []).filter((item) => item.kind === "string")
  return Promise.all(
    items.map(
      (item) =>
        new Promise<ClipboardStringItem>((resolve) => {
          item.getAsString((value) => resolve({ type: item.type, value }))
        })
    )
  )
}

function replayHeifPaste(event: Event): void {
  if (!(event instanceof CustomEvent)) return

  const detail = event.detail as PasteReplayDetail | undefined
  if (!detail || !Array.isArray(detail.files) || !Array.isArray(detail.strings)) return

  event.stopImmediatePropagation()

  const dataTransfer = new DataTransfer()
  detail.strings.forEach(({ type, value }) => dataTransfer.items.add(value, type))
  detail.files.forEach((file) => dataTransfer.items.add(file))

  replayingPaste = true
  try {
    event.target?.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: dataTransfer,
      })
    )
  } finally {
    replayingPaste = false
  }
}
