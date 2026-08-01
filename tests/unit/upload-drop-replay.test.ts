import { describe, expect, it, vi } from "vitest"
import {
  replayUploadDrop,
  type UploadDropReplayEnvironment,
  type UploadDropReplaySource,
} from "../../utils/upload-drop-replay"

interface RecordedDragEvent extends Event {
  dataTransfer: DataTransfer
  init: DragEventInit
}

function createTarget(
  name: string,
  events: Array<{ name: string; type: string; event: RecordedDragEvent }>,
  acceptsDragOver = true
) {
  return {
    dispatchEvent(event: Event) {
      events.push({ name, type: event.type, event: event as RecordedDragEvent })
      return event.type === "dragover" && acceptsDragOver ? false : true
    },
  } as EventTarget
}

function createEnvironment(
  targetsAtPoint: Array<EventTarget | null>,
  connectedTargets = new Set<EventTarget>()
): UploadDropReplayEnvironment {
  let targetIndex = 0

  return {
    createDataTransfer: () => {
      const files: File[] = []
      return {
        items: {
          add: (file: File) => {
            files.push(file)
            return null
          },
        },
        files,
        effectAllowed: "none",
        dropEffect: "none",
      } as unknown as DataTransfer
    },
    createDragEvent: (type, init) =>
      ({ type, dataTransfer: init.dataTransfer, init } as unknown as DragEvent),
    getTargetAtPoint: vi.fn(() => targetsAtPoint[targetIndex++] ?? null),
    isConnected: (target) => connectedTargets.has(target),
  }
}

function createSource(): UploadDropReplaySource {
  return {
    clientX: 120,
    clientY: 240,
    screenX: 320,
    screenY: 440,
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    metaKey: true,
    effectAllowed: "all",
  }
}

describe("replayUploadDrop", () => {
  it("replays a complete lifecycle with the converted files and one DataTransfer", () => {
    const events: Array<{ name: string; type: string; event: RecordedDragEvent }> = []
    const target = createTarget("drop-zone", events)
    const environment = createEnvironment([target, target], new Set([target]))
    const files = [{ name: "photo.jpg" } as File]

    replayUploadDrop(
      { originalTarget: target, source: createSource(), files, mode: "full-lifecycle" },
      environment
    )

    expect(events.map(({ type }) => type)).toEqual(["dragenter", "dragover", "drop"])
    expect(events[0].event.dataTransfer).toBe(events[1].event.dataTransfer)
    expect(events[1].event.dataTransfer).toBe(events[2].event.dataTransfer)
    expect(Array.from(events[2].event.dataTransfer.files)).toEqual(files)
    expect(events[2].event.init).toMatchObject({
      clientX: 120,
      clientY: 240,
      screenX: 320,
      screenY: 440,
      ctrlKey: true,
      metaKey: true,
    })
  })

  it("retargets the remaining lifecycle when a live drop overlay replaces the old target", () => {
    const events: Array<{ name: string; type: string; event: RecordedDragEvent }> = []
    const baseTarget = createTarget("base", events)
    const overlayTarget = createTarget("overlay", events)
    const environment = createEnvironment(
      [overlayTarget, overlayTarget],
      new Set([baseTarget, overlayTarget])
    )

    replayUploadDrop(
      {
        originalTarget: baseTarget,
        source: createSource(),
        files: [{ name: "photo.jpg" } as File],
        mode: "full-lifecycle",
      },
      environment
    )

    expect(events.map(({ name, type }) => `${name}:${type}`)).toEqual([
      "base:dragenter",
      "overlay:dragenter",
      "base:dragleave",
      "overlay:dragover",
      "overlay:drop",
    ])
  })

  it("fails closed when the old target is detached and hit testing finds no live target", () => {
    const events: Array<{ name: string; type: string; event: RecordedDragEvent }> = []
    const staleTarget = createTarget("stale", events)
    const environment = createEnvironment([null, null, null])

    const accepted = replayUploadDrop(
      {
        originalTarget: staleTarget,
        source: createSource(),
        files: [{ name: "photo.jpg" } as File],
        mode: "full-lifecycle",
      },
      environment
    )

    expect(accepted).toBe(false)
    expect(events).toEqual([])
  })

  it("keeps the historical single-drop behavior for stable ordinary sites", () => {
    const events: Array<{ name: string; type: string; event: RecordedDragEvent }> = []
    const originalTarget = createTarget("original", events)
    const pointTarget = createTarget("point", events)
    const environment = createEnvironment(
      [pointTarget],
      new Set([originalTarget, pointTarget])
    )

    const accepted = replayUploadDrop(
      {
        originalTarget,
        source: createSource(),
        files: [{ name: "photo.jpg" } as File],
      },
      environment
    )

    expect(accepted).toBe(true)
    expect(events.map(({ name, type }) => `${name}:${type}`)).toEqual(["original:drop"])
  })

  it("does not dispatch drop when the final dynamic target rejects dragover", () => {
    const events: Array<{ name: string; type: string; event: RecordedDragEvent }> = []
    const target = createTarget("drop-zone", events, false)
    const environment = createEnvironment([target, target], new Set([target]))

    const accepted = replayUploadDrop(
      {
        originalTarget: target,
        source: createSource(),
        files: [{ name: "photo.jpg" } as File],
        mode: "full-lifecycle",
      },
      environment
    )

    expect(accepted).toBe(false)
    expect(events.map(({ type }) => type)).toEqual(["dragenter", "dragover", "dragleave"])
  })

  it("stabilizes a target that changes again after the second dragover", () => {
    const events: Array<{ name: string; type: string; event: RecordedDragEvent }> = []
    const base = createTarget("base", events)
    const firstOverlay = createTarget("overlay-1", events)
    const finalOverlay = createTarget("overlay-2", events)
    const environment = createEnvironment(
      [firstOverlay, finalOverlay, finalOverlay],
      new Set([base, firstOverlay, finalOverlay])
    )

    const accepted = replayUploadDrop(
      {
        originalTarget: base,
        source: createSource(),
        files: [{ name: "photo.jpg" } as File],
        mode: "full-lifecycle",
      },
      environment
    )

    expect(accepted).toBe(true)
    expect(events.map(({ name, type }) => `${name}:${type}`)).toEqual([
      "base:dragenter",
      "overlay-1:dragenter",
      "base:dragleave",
      "overlay-1:dragover",
      "overlay-2:dragenter",
      "overlay-1:dragleave",
      "overlay-2:dragover",
      "overlay-2:drop",
    ])
  })

  it("fails closed and clears drag state when the target never stabilizes", () => {
    const events: Array<{ name: string; type: string; event: RecordedDragEvent }> = []
    const targets = Array.from({ length: 10 }, (_, index) => createTarget(`target-${index}`, events))
    const environment = createEnvironment(targets.slice(1), new Set(targets))

    const accepted = replayUploadDrop(
      {
        originalTarget: targets[0],
        source: createSource(),
        files: [{ name: "photo.jpg" } as File],
        mode: "full-lifecycle",
      },
      environment
    )

    expect(accepted).toBe(false)
    expect(events.some(({ type }) => type === "drop")).toBe(false)
    expect(events.at(-1)).toMatchObject({ name: "target-8", type: "dragleave" })
  })
})
