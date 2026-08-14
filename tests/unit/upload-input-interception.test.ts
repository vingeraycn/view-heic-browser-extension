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
    const gate = new UploadInputInterceptionGate<object, object>()
    const input = {}
    const heifFile = {}
    const files = [heifFile]

    expect(gate.decide(input, "input", files, true)).toBe("convert")
    expect(gate.decide(input, "change", files, true)).toBe("suppress")
  })

  it("keeps change as a fallback when a browser emits no input event", () => {
    const gate = new UploadInputInterceptionGate<object, object>()

    expect(gate.decide({}, "change", [{}], true)).toBe("convert")
  })

  it("does not suppress a different selection", () => {
    const gate = new UploadInputInterceptionGate<object, object>()
    const input = {}

    expect(gate.decide(input, "input", [{}], true)).toBe("convert")
    expect(gate.decide(input, "change", [{}], true)).toBe("convert")
  })

  it("passes non-HEIF selections through unchanged", () => {
    const gate = new UploadInputInterceptionGate<object, object>()
    const input = {}
    const files = [{}]

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
