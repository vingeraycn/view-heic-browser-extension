import { beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import {
  ANALYTICS_ACTIVE_DATE_STORAGE_KEY,
  ANALYTICS_CLIENT_ID_STORAGE_KEY,
  ANALYTICS_ENABLED_STORAGE_KEY,
  ANALYTICS_MESSAGE_TYPE,
  ANALYTICS_SESSION_STORAGE_KEY,
  getAnalyticsEnabled,
  getConversionOutcome,
  isAnalyticsMessage,
  setAnalyticsEnabled,
} from "../../utils/analytics"
import {
  createGoogleAnalyticsClientId,
  isGoogleAnalyticsClientId,
} from "../../utils/analytics-transport"

beforeEach(() => {
  fakeBrowser.reset()
})

describe("analytics event contract", () => {
  it("accepts a declared event with only allowlisted parameters", () => {
    expect(
      isAnalyticsMessage({
        type: ANALYTICS_MESSAGE_TYPE,
        name: "conversion_completed",
        params: {
          surface: "web_upload",
          trigger: "paste",
          outcome: "success",
          attempted_count: 1,
          success_count: 1,
          failure_count: 0,
          duration_ms: 42,
        },
      })
    ).toBe(true)
  })

  it("rejects unknown events and identifying page or file fields", () => {
    expect(
      isAnalyticsMessage({ type: ANALYTICS_MESSAGE_TYPE, name: "page_view", params: {} })
    ).toBe(false)
    expect(
      isAnalyticsMessage({
        type: ANALYTICS_MESSAGE_TYPE,
        name: "conversion_completed",
        params: { url: "https://private.example/photo.heic" },
      })
    ).toBe(false)
    expect(
      isAnalyticsMessage({
        type: ANALYTICS_MESSAGE_TYPE,
        name: "conversion_completed",
        params: { file_name: "private.heic" },
      })
    ).toBe(false)
  })
})

describe("Google Analytics client ID", () => {
  it("creates the numeric-dot-numeric format required by GA4", () => {
    const clientId = createGoogleAnalyticsClientId(1_786_716_000_000)

    expect(isGoogleAnalyticsClientId(clientId)).toBe(true)
    expect(clientId).toMatch(/^\d+\.1786716000$/)
  })

  it("rejects the UUID format used by the previous implementation", () => {
    expect(isGoogleAnalyticsClientId("97074dde-18b4-4ad2-8aed-7676d2ed46ac")).toBe(false)
  })
})

describe("analytics preference", () => {
  it("defaults to enabled to preserve the existing product behavior", async () => {
    await expect(getAnalyticsEnabled()).resolves.toBe(true)
  })

  it("deletes pseudonymous identifiers when analytics is disabled", async () => {
    await fakeBrowser.storage.local.set({
      [ANALYTICS_CLIENT_ID_STORAGE_KEY]: "123.456",
      [ANALYTICS_SESSION_STORAGE_KEY]: { id: 123, lastSeenAt: 456 },
      [ANALYTICS_ACTIVE_DATE_STORAGE_KEY]: "2026-08-14",
    })

    await setAnalyticsEnabled(false)

    await expect(fakeBrowser.storage.local.get()).resolves.toEqual({
      [ANALYTICS_ENABLED_STORAGE_KEY]: false,
    })
  })
})

describe("conversion outcome", () => {
  it.each([
    [1, 0, "success"],
    [1, 1, "partial"],
    [0, 1, "failure"],
    [0, 0, "failure"],
  ] as const)("maps %i successes and %i failures to %s", (success, failure, outcome) => {
    expect(getConversionOutcome(success, failure)).toBe(outcome)
  })
})
