import { describe, expect, it } from "vitest"
import { UploadInputInterceptionGate } from "../../utils/upload-input-interception"

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
})
