import { describe, expect, it } from "vitest"
import {
  SITE_ENABLED_SET_MESSAGE,
  VIEW_HEIC_PROTOCOL_VERSION,
  isSiteEnabledSetMessage,
  isSiteEnabledSetResponse,
  type PageState,
} from "../../utils/extension-messages"

const pageState: PageState = {
  protocol: VIEW_HEIC_PROTOCOL_VERSION,
  extensionVersion: "1.2.0",
  pageInstanceId: "page-a",
  siteHost: "example.com",
  siteEnabled: true,
  phase: "idle",
  detected: 0,
  converted: 0,
  failed: 0,
}

describe("site-enabled message contract", () => {
  it("requires the popup to bind a toggle request to the current document", () => {
    expect(
      isSiteEnabledSetMessage({
        type: SITE_ENABLED_SET_MESSAGE,
        protocol: VIEW_HEIC_PROTOCOL_VERSION,
        enabled: false,
        expectedPageInstanceId: "page-a",
      })
    ).toBe(true)

    expect(
      isSiteEnabledSetMessage({
        type: SITE_ENABLED_SET_MESSAGE,
        protocol: VIEW_HEIC_PROTOCOL_VERSION,
        enabled: false,
      })
    ).toBe(false)
  })

  it.each([
    { ok: true, state: pageState },
    { ok: false, error: "stale-document", state: pageState },
    { ok: false, error: "storage-failed", state: pageState },
  ])("accepts an explicit success or failure response", (response) => {
    expect(isSiteEnabledSetResponse(response)).toBe(true)
  })

  it("rejects an unknown failure response", () => {
    expect(
      isSiteEnabledSetResponse({
        ok: false,
        error: "unknown",
        state: pageState,
      })
    ).toBe(false)
  })
})
