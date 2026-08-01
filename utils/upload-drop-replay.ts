type DropReplayEventType = "dragenter" | "dragover" | "dragleave" | "drop"

const MAX_DYNAMIC_TARGET_CHANGES = 3

export interface UploadDropReplayEnvironment {
  createDataTransfer: () => DataTransfer
  createDragEvent: (type: DropReplayEventType, init: DragEventInit) => DragEvent
  getTargetAtPoint: (x: number, y: number) => EventTarget | null
  isConnected: (target: EventTarget) => boolean
}

export interface UploadDropReplayOptions {
  originalTarget: EventTarget
  source: UploadDropReplaySource
  files: File[]
  mode?: "drop-only" | "full-lifecycle"
}

export interface UploadDropReplaySource {
  clientX: number
  clientY: number
  screenX: number
  screenY: number
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  effectAllowed?: DataTransfer["effectAllowed"]
}

/**
 * Replays converted files after asynchronous HEIF conversion.
 *
 * Stable drop targets keep the historical single-drop behavior. Dynamic sites
 * such as Gemini can request a rebuilt lifecycle because their drop overlay is
 * replaced while decoding and their can-drop state belongs to one DataTransfer.
 */
export function replayUploadDrop(
  options: UploadDropReplayOptions,
  environment: UploadDropReplayEnvironment = createBrowserDropReplayEnvironment()
): boolean {
  const { originalTarget, source, files, mode = "drop-only" } = options
  const dataTransfer = environment.createDataTransfer()
  files.forEach((file) => dataTransfer.items.add(file))

  if (mode === "drop-only") {
    const target = resolveStableTarget(originalTarget, source, environment)
    if (!target) return false
    dispatchDropPhase("drop", target, source, dataTransfer, environment)
    return true
  }

  // The first phase must remain bound to the user's original drop surface.
  // Only a UI created synchronously by that dragenter may become the next target.
  let currentTarget = environment.isConnected(originalTarget) ? originalTarget : null
  if (!currentTarget) return false
  let completed = false

  try {
    dispatchDropPhase("dragenter", currentTarget, source, dataTransfer, environment)

    for (let targetChangeCount = 0; targetChangeCount <= MAX_DYNAMIC_TARGET_CHANGES; targetChangeCount += 1) {
      const targetBeforeDragOver = resolveLiveTarget(currentTarget, source, environment)
      if (!targetBeforeDragOver) return false
      if (targetBeforeDragOver !== currentTarget) {
        const previousTarget = currentTarget
        currentTarget = targetBeforeDragOver
        dispatchDropPhase("dragenter", currentTarget, source, dataTransfer, environment)
        leaveConnectedTarget(previousTarget, source, dataTransfer, environment)
      }

      const accepted = dispatchDropPhase("dragover", currentTarget, source, dataTransfer, environment)
      const targetAfterDragOver = resolveLiveTarget(currentTarget, source, environment)
      if (!targetAfterDragOver) return false
      if (targetAfterDragOver === currentTarget) {
        if (!accepted) return false
        dispatchDropPhase("drop", currentTarget, source, dataTransfer, environment)
        completed = true
        return true
      }

      const previousTarget = currentTarget
      currentTarget = targetAfterDragOver
      dispatchDropPhase("dragenter", currentTarget, source, dataTransfer, environment)
      leaveConnectedTarget(previousTarget, source, dataTransfer, environment)
    }

    return false
  } finally {
    if (!completed) {
      leaveConnectedTarget(currentTarget, source, dataTransfer, environment)
    }
  }
}

function leaveConnectedTarget(
  target: EventTarget,
  source: UploadDropReplaySource,
  dataTransfer: DataTransfer,
  environment: UploadDropReplayEnvironment
): void {
  if (!environment.isConnected(target)) return
  dispatchDropPhase("dragleave", target, source, dataTransfer, environment)
}

function resolveStableTarget(
  candidate: EventTarget,
  source: UploadDropReplaySource,
  environment: UploadDropReplayEnvironment
): EventTarget | null {
  if (environment.isConnected(candidate)) return candidate
  return environment.getTargetAtPoint(source.clientX, source.clientY)
}

function createBrowserDropReplayEnvironment(): UploadDropReplayEnvironment {
  return {
    createDataTransfer: () => new DataTransfer(),
    createDragEvent: (type, init) => new DragEvent(type, init),
    getTargetAtPoint: (x, y) => document.elementFromPoint(x, y),
    isConnected: (target) => target instanceof Node && target.isConnected,
  }
}

function resolveLiveTarget(
  candidate: EventTarget,
  source: UploadDropReplaySource,
  environment: UploadDropReplayEnvironment
): EventTarget | null {
  return environment.getTargetAtPoint(source.clientX, source.clientY) ??
    (environment.isConnected(candidate) ? candidate : null)
}

function dispatchDropPhase(
  type: DropReplayEventType,
  target: EventTarget,
  source: UploadDropReplaySource,
  dataTransfer: DataTransfer,
  environment: UploadDropReplayEnvironment
): boolean {
  return !target.dispatchEvent(
    environment.createDragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer,
      clientX: source.clientX,
      clientY: source.clientY,
      screenX: source.screenX,
      screenY: source.screenY,
      ctrlKey: source.ctrlKey,
      shiftKey: source.shiftKey,
      altKey: source.altKey,
      metaKey: source.metaKey,
    })
  )
}
