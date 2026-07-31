import { describe, expect, it } from "vitest"
import { PageConversionLedger } from "../../utils/page-conversion-ledger"

describe("PageConversionLedger", () => {
  it("combines independent detection paths without losing prior results", () => {
    const ledger = new PageConversionLedger<object>()
    const extensionImage = {}
    const mimeOnlyImage = {}
    const extensionEntry = { item: extensionImage, version: "extension.heic" }
    const mimeOnlyEntry = { item: mimeOnlyImage, version: "/opaque-image" }

    expect(ledger.begin([extensionEntry])).toEqual({
      detected: 1,
      converted: 0,
      failed: 0,
      pending: 1,
    })
    ledger.settle([extensionEntry], [true])
    ledger.begin([mimeOnlyEntry])

    expect(ledger.settle([mimeOnlyEntry], [true])).toEqual({
      detected: 2,
      converted: 2,
      failed: 0,
      pending: 0,
    })
  })

  it("retries a failed image without counting it twice", () => {
    const ledger = new PageConversionLedger<object>()
    const image = {}
    const entry = { item: image, version: "photo.heic" }

    ledger.begin([entry])
    ledger.settle([entry], [false])
    expect(ledger.begin([entry])).toEqual({
      detected: 1,
      converted: 0,
      failed: 0,
      pending: 1,
    })
    expect(ledger.settle([entry], [true])).toEqual({
      detected: 1,
      converted: 1,
      failed: 0,
      pending: 0,
    })
  })

  it("starts a clean page session after reset", () => {
    const ledger = new PageConversionLedger<object>()
    const image = {}
    const entry = { item: image, version: "photo.heic" }

    ledger.begin([entry])
    ledger.settle([entry], [true])
    ledger.reset()

    expect(ledger.snapshot()).toEqual({
      detected: 0,
      converted: 0,
      failed: 0,
      pending: 0,
    })
    expect(ledger.begin([entry]).detected).toBe(1)
  })

  it("replaces the old result when one element receives a new source", () => {
    const ledger = new PageConversionLedger<object>()
    const image = {}
    const first = { item: image, version: "first.heic" }
    const second = { item: image, version: "second.heic" }

    ledger.begin([first])
    ledger.settle([first], [true])

    expect(ledger.begin([second])).toEqual({
      detected: 1,
      converted: 0,
      failed: 0,
      pending: 1,
    })
    expect(ledger.settle([second], [false])).toEqual({
      detected: 1,
      converted: 0,
      failed: 1,
      pending: 0,
    })
  })
})
