export type UploadInputInterceptionAction = "pass" | "convert" | "suppress"

interface UploadSelectionFile {
  readonly name: string
  readonly size: number
  readonly lastModified: number
  readonly webkitRelativePath?: string
}

interface UploadSelectionFileSnapshot {
  readonly name: string
  readonly size: number
  readonly lastModified: number
  readonly webkitRelativePath: string
}

interface UploadReplayMarkerTarget {
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

export function isUploadReplayEvent(
  input: UploadReplayMarkerTarget,
  attributeName: string
): boolean {
  return input.hasAttribute(attributeName)
}

export function withUploadReplayMarker<T>(
  input: UploadReplayMarkerTarget,
  attributeName: string,
  replay: () => T
): T {
  input.setAttribute(attributeName, "true")
  try {
    return replay()
  } finally {
    input.removeAttribute(attributeName)
  }
}

export class UploadInputInterceptionGate<TInput extends object> {
  private readonly pendingNativeInputSelections = new WeakMap<
    TInput,
    readonly UploadSelectionFileSnapshot[]
  >()

  decide(
    input: TInput,
    eventType: string,
    files: readonly UploadSelectionFile[],
    containsHeif: boolean
  ): UploadInputInterceptionAction {
    if (eventType === "change") {
      const pendingSelection = this.pendingNativeInputSelections.get(input)
      this.pendingNativeInputSelections.delete(input)
      if (pendingSelection && isSameFileSelection(pendingSelection, snapshotSelection(files))) {
        return "suppress"
      }
    }

    if (!containsHeif) return "pass"
    if (eventType === "input") {
      this.pendingNativeInputSelections.set(input, snapshotSelection(files))
    }
    return "convert"
  }
}

function snapshotSelection(
  files: readonly UploadSelectionFile[]
): readonly UploadSelectionFileSnapshot[] {
  return files.map((file) => ({
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    webkitRelativePath: file.webkitRelativePath ?? "",
  }))
}

function isSameFileSelection(
  left: readonly UploadSelectionFileSnapshot[],
  right: readonly UploadSelectionFileSnapshot[]
): boolean {
  return (
    left.length === right.length &&
    left.every((file, index) => {
      const candidate = right[index]
      return (
        candidate !== undefined &&
        file.name === candidate.name &&
        file.size === candidate.size &&
        file.lastModified === candidate.lastModified &&
        file.webkitRelativePath === candidate.webkitRelativePath
      )
    })
  )
}
