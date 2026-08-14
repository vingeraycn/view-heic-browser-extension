import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import {
  ANALYTICS_ACTIVE_DATE_STORAGE_KEY,
  ANALYTICS_CLIENT_ID_STORAGE_KEY,
  ANALYTICS_ENABLED_STORAGE_KEY,
  ANALYTICS_MESSAGE_TYPE,
  ANALYTICS_SESSION_STORAGE_KEY,
  getAnalyticsDurationMs,
  getAnalyticsErrorType,
  getAggregateAnalyticsErrorType,
  getAnalyticsEnabled,
  getConversionOutcome,
  isAnalyticsMessage,
  isAnalyticsPreferenceMessage,
  setAnalyticsEnabled,
} from "../../utils/analytics"
import { ERROR_MESSAGES } from "../../utils/constants"
import {
  createGoogleAnalyticsClientId,
  isGoogleAnalyticsClientId,
  sendAnalyticsEvent,
  updateAnalyticsPreference,
} from "../../utils/analytics-transport"

beforeEach(() => {
  fakeBrowser.reset()
  vi.spyOn(fakeBrowser.runtime, "getManifest").mockReturnValue({
    manifest_version: 3,
    name: "View HEIC",
    version: "1.4.0",
  })
  fakeBrowser.runtime.onMessage.addListener((message) => {
    if (isAnalyticsPreferenceMessage(message)) {
      return updateAnalyticsPreference(message.enabled)
    }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
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

  it("clears stale identifiers before re-enabling after a failed opt-out cleanup", async () => {
    await fakeBrowser.storage.local.set({
      [ANALYTICS_CLIENT_ID_STORAGE_KEY]: "123.456",
      [ANALYTICS_SESSION_STORAGE_KEY]: { id: 123, lastSeenAt: 456 },
      [ANALYTICS_ACTIVE_DATE_STORAGE_KEY]: "2026-08-14",
    })
    const originalRemove = fakeBrowser.storage.local.remove.bind(fakeBrowser.storage.local)
    vi.spyOn(fakeBrowser.storage.local, "remove")
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockImplementation(originalRemove)

    await expect(setAnalyticsEnabled(false)).rejects.toThrow("storage unavailable")
    await expect(fakeBrowser.storage.local.get()).resolves.toMatchObject({
      [ANALYTICS_ENABLED_STORAGE_KEY]: false,
      [ANALYTICS_CLIENT_ID_STORAGE_KEY]: "123.456",
    })

    await setAnalyticsEnabled(true)

    await expect(fakeBrowser.storage.local.get()).resolves.toEqual({
      [ANALYTICS_ENABLED_STORAGE_KEY]: true,
    })
  })

  it("aborts in-flight delivery and does not recreate identifiers after opt-out", async () => {
    vi.stubEnv("WXT_ENABLE_EXTENSION_ANALYTICS", "true")
    vi.stubEnv("WXT_ANALYTICS_ENDPOINT", "https://analytics.example.workers.dev")
    let resolveFetchStarted: (() => void) | undefined
    const fetchStarted = new Promise<void>((resolve) => {
      resolveFetchStarted = resolve
    })
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        resolveFetchStarted?.()
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
        })
      })
    )

    const delivery = sendAnalyticsEvent("popup_opened", {
      connection_state: "connected",
      page_phase: "idle",
      site_enabled: true,
    })
    await fetchStarted
    await setAnalyticsEnabled(false)

    await expect(delivery).resolves.toBe(false)
    await expect(fakeBrowser.storage.local.get()).resolves.toEqual({
      [ANALYTICS_ENABLED_STORAGE_KEY]: false,
    })
  })

  it("removes identifiers when opt-out overtakes their initial storage write", async () => {
    vi.stubEnv("WXT_ENABLE_EXTENSION_ANALYTICS", "true")
    vi.stubEnv("WXT_ANALYTICS_ENDPOINT", "https://analytics.example.workers.dev")
    const originalSet = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local)
    let releaseIdentityWrite: (() => void) | undefined
    let notifyIdentityWriteStarted: (() => void) | undefined
    const identityWriteStarted = new Promise<void>((resolve) => {
      notifyIdentityWriteStarted = resolve
    })
    const identityWriteBlocked = new Promise<void>((resolve) => {
      releaseIdentityWrite = resolve
    })
    vi.spyOn(fakeBrowser.storage.local, "set").mockImplementation(async (items) => {
      if (ANALYTICS_CLIENT_ID_STORAGE_KEY in items) {
        notifyIdentityWriteStarted?.()
        await identityWriteBlocked
      }
      await originalSet(items)
    })
    vi.stubGlobal("fetch", vi.fn())

    const delivery = sendAnalyticsEvent("popup_opened", {
      connection_state: "connected",
      page_phase: "idle",
      site_enabled: true,
    })
    await identityWriteStarted
    await setAnalyticsEnabled(false)
    releaseIdentityWrite?.()

    await expect(delivery).resolves.toBe(false)
    await expect(fakeBrowser.storage.local.get()).resolves.toEqual({
      [ANALYTICS_ENABLED_STORAGE_KEY]: false,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("does not classify automatic updates as daily activity", async () => {
    vi.stubEnv("WXT_ENABLE_EXTENSION_ANALYTICS", "true")
    vi.stubEnv("WXT_ANALYTICS_ENDPOINT", "https://analytics.example.workers.dev")
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 })
    )
    vi.stubGlobal("fetch", fetchMock)

    await sendAnalyticsEvent("extension_updated", { previous_version: "1.3.0" })

    const [, init] = fetchMock.mock.calls[0]
    const payload = JSON.parse(String(init?.body)) as { events: Array<{ name: string }> }
    expect(payload.events.map((event) => event.name)).toEqual(["extension_updated"])
  })

  it("preserves the event occurrence time when delivery starts later", async () => {
    vi.stubEnv("WXT_ENABLE_EXTENSION_ANALYTICS", "true")
    vi.stubEnv("WXT_ANALYTICS_ENDPOINT", "https://analytics.example.workers.dev")
    const occurredAt = Date.now() - 60_000
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 })
    )
    vi.stubGlobal("fetch", fetchMock)

    await sendAnalyticsEvent(
      "popup_opened",
      {
        connection_state: "connected",
        page_phase: "idle",
        site_enabled: true,
      },
      occurredAt
    )

    const [, init] = fetchMock.mock.calls[0]
    const payload = JSON.parse(String(init?.body)) as {
      timestamp_micros: number
      events: Array<{ params: { session_id: number } }>
    }
    expect(payload.timestamp_micros).toBe(occurredAt * 1000)
    expect(payload.events[0].params.session_id).toBe(Math.floor(occurredAt / 1000))
  })

  it("expires queued events before they can shift a later activity day", async () => {
    vi.stubEnv("WXT_ENABLE_EXTENSION_ANALYTICS", "true")
    vi.stubEnv("WXT_ANALYTICS_ENDPOINT", "https://analytics.example.workers.dev")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      sendAnalyticsEvent("popup_opened", {}, Date.now() - 6 * 60 * 1000)
    ).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(fakeBrowser.storage.local.get()).resolves.toEqual({})
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

describe("analytics duration", () => {
  it("preserves slow conversions while capping suspended workflows at 24 hours", () => {
    expect(getAnalyticsDurationMs(700_000)).toBe(700_000)
    expect(getAnalyticsDurationMs(100_000_000)).toBe(86_400_000)
  })
})

describe("analytics error categories", () => {
  it("preserves file validation categories for upload failures", () => {
    expect(getAnalyticsErrorType(new Error(ERROR_MESSAGES.FILE_TOO_LARGE))).toBe("size")
    expect(getAnalyticsErrorType(new Error(ERROR_MESSAGES.INVALID_FORMAT))).toBe("format")
  })

  it("reports mixed categories when upload failures have different causes", () => {
    expect(getAggregateAnalyticsErrorType(["size", "format"])).toBe("mixed")
    expect(getAggregateAnalyticsErrorType(["format", "format"])).toBe("format")
  })
})
