import { hasHeifExtension, isHeifMimeType } from "../utils/heif-format"
import {
  INTERCEPTOR_DISABLE_EVENT,
  INTERCEPTOR_ENABLE_EVENT,
  INTERCEPTOR_READY_EVENT,
} from "../utils/site-preferences"
import {
  DROP_REPLAY_EVENT,
  DROP_REQUEST_EVENT,
  PASTE_REPLAY_EVENT,
  PASTE_REQUEST_EVENT,
  UPLOAD_REPLAY_ATTRIBUTE,
  UPLOAD_REQUEST_EVENT,
} from "../utils/upload-constants"
import {
  replayUploadDrop,
  type UploadDropReplaySource,
} from "../utils/upload-drop-replay"

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

interface DropRequestDetail {
  requestId: string
  files: File[]
  source: UploadDropReplaySource
}

interface DropReplayDetail {
  requestId: string
  files?: File[]
  handledByInput?: boolean
}

interface PendingDropSession {
  target: EventTarget
  documentUrl: string
  source: UploadDropReplaySource
}

let replayingPaste = false
let replayingDrop = false
let interceptionEnabled = false
let nextDropRequestId = 0
const pendingDropSessions = new Map<string, PendingDropSession>()
const MAX_PENDING_DROP_SESSIONS = 16

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
    window.addEventListener("drop", interceptHeifDrop, true)
    window.addEventListener("paste", interceptHeifPaste, true)
    window.addEventListener(DROP_REPLAY_EVENT, replayHeifDrop, true)
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

function interceptHeifDrop(event: DragEvent): void {
  if (!interceptionEnabled || replayingDrop) return

  const files = Array.from(event.dataTransfer?.files ?? [])
  if (!files.some(isHeifFile)) return

  const target = event.target
  if (!(target instanceof EventTarget)) return

  event.preventDefault()
  event.stopImmediatePropagation()

  const requestId = createDropRequestId()
  const source = getDropReplaySource(event)
  rememberDropSession(requestId, {
    target,
    documentUrl: location.href,
    source,
  })

  const detail: DropRequestDetail = {
    requestId,
    files,
    source,
  }
  target.dispatchEvent(
    new CustomEvent(DROP_REQUEST_EVENT, { bubbles: true, composed: true, detail })
  )
}

function createDropRequestId(): string {
  nextDropRequestId += 1
  return `view-heic-drop-${nextDropRequestId}`
}

function rememberDropSession(requestId: string, session: PendingDropSession): void {
  if (pendingDropSessions.size >= MAX_PENDING_DROP_SESSIONS) {
    const oldestRequestId = pendingDropSessions.keys().next().value
    if (typeof oldestRequestId === "string") {
      pendingDropSessions.delete(oldestRequestId)
    }
  }
  pendingDropSessions.set(requestId, session)
}

function getDropReplaySource(event: DragEvent): UploadDropReplaySource {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    effectAllowed: event.dataTransfer?.effectAllowed,
  }
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

function replayHeifDrop(event: Event): void {
  if (!(event instanceof CustomEvent)) return

  const detail = event.detail as DropReplayDetail | undefined
  if (!detail || typeof detail.requestId !== "string") return
  if (!detail.handledByInput && !Array.isArray(detail.files)) return

  event.stopImmediatePropagation()

  const session = pendingDropSessions.get(detail.requestId)
  if (!session) return
  pendingDropSessions.delete(detail.requestId)
  if (session.documentUrl !== location.href || !belongsToCurrentDocument(session.target)) return
  if (detail.handledByInput) {
    event.preventDefault()
    return
  }

  replayingDrop = true
  try {
    const accepted = replayUploadDrop({
      originalTarget: session.target,
      source: session.source,
      files: detail.files ?? [],
      mode: location.hostname.toLowerCase() === "gemini.google.com" ? "full-lifecycle" : "drop-only",
    })
    if (accepted) event.preventDefault()
  } finally {
    replayingDrop = false
  }
}

function belongsToCurrentDocument(target: EventTarget): boolean {
  if (target === window || target === document) return true
  return target instanceof Node && target.ownerDocument === document
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
