export type UploadInputInterceptionAction = "pass" | "convert" | "suppress"

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

export class UploadInputInterceptionGate<TInput extends object, TFile extends object> {
  private readonly pendingNativeInputSelections = new WeakMap<TInput, readonly TFile[]>()

  decide(
    input: TInput,
    eventType: string,
    files: readonly TFile[],
    containsHeif: boolean
  ): UploadInputInterceptionAction {
    if (eventType === "change") {
      const pendingSelection = this.pendingNativeInputSelections.get(input)
      this.pendingNativeInputSelections.delete(input)
      if (pendingSelection && isSameFileSelection(pendingSelection, files)) {
        return "suppress"
      }
    }

    if (!containsHeif) return "pass"
    if (eventType === "input") {
      this.pendingNativeInputSelections.set(input, files)
    }
    return "convert"
  }
}

function isSameFileSelection<TFile>(left: readonly TFile[], right: readonly TFile[]): boolean {
  return left.length === right.length && left.every((file, index) => file === right[index])
}
