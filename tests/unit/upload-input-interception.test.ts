import { describe, expect, it } from "vitest"
import {
  isUploadReplayEvent,
  UploadInputInterceptionGate,
  withUploadReplayMarker,
} from "../../utils/upload-input-interception"

class FakeInput {
  private readonly attributes = new Map<string, string>()

  hasAttribute(name: string): boolean {
    return this.attributes.has(name)
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }
}

describe("upload input interception", () => {
  it("converts on input and suppresses the paired native change", () => {
    const gate = new UploadInputInterceptionGate<object>()
    const input = {}
    const heifFile = createFile("photo.heic")
    const files = [heifFile]

    expect(gate.decide(input, "input", files, true)).toBe("convert")
    expect(gate.decide(input, "change", files, true)).toBe("suppress")
  })

  it("suppresses the paired change when the browser returns new File wrappers", () => {
    const gate = new UploadInputInterceptionGate<object>()
    const input = {}

    expect(gate.decide(input, "input", [createFile("photo.heic")], true)).toBe(
      "convert"
    )
    expect(gate.decide(input, "change", [createFile("photo.heic")], true)).toBe(
      "suppress"
    )
  })

  it("keeps change as a fallback when a browser emits no input event", () => {
    const gate = new UploadInputInterceptionGate<object>()

    expect(gate.decide({}, "change", [createFile("photo.heic")], true)).toBe("convert")
  })

  it("does not suppress a different selection", () => {
    const gate = new UploadInputInterceptionGate<object>()
    const input = {}

    expect(gate.decide(input, "input", [createFile("first.heic")], true)).toBe("convert")
    expect(gate.decide(input, "change", [createFile("second.heic")], true)).toBe("convert")
  })

  it("passes non-HEIF selections through unchanged", () => {
    const gate = new UploadInputInterceptionGate<object>()
    const input = {}
    const files = [createFile("photo.jpg")]

    expect(gate.decide(input, "input", files, false)).toBe("pass")
    expect(gate.decide(input, "change", files, false)).toBe("pass")
  })

  it("guards both replayed input and change events before clearing the marker", () => {
    const input = new FakeInput()
    const replayEvents: string[] = []

    withUploadReplayMarker(input, "data-replay", () => {
      for (const eventType of ["input", "change"]) {
        if (isUploadReplayEvent(input, "data-replay")) replayEvents.push(eventType)
      }
    })

    expect(replayEvents).toEqual(["input", "change"])
    expect(isUploadReplayEvent(input, "data-replay")).toBe(false)
  })

  it("clears the replay marker when event dispatch fails", () => {
    const input = new FakeInput()

    expect(() =>
      withUploadReplayMarker(input, "data-replay", () => {
        throw new Error("dispatch failed")
      })
    ).toThrow("dispatch failed")
    expect(isUploadReplayEvent(input, "data-replay")).toBe(false)
  })
})

function createFile(name: string) {
  return {
    name,
    size: 1024,
    lastModified: 1_786_716_000_000,
    webkitRelativePath: "",
  }
}
